import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { MemoryCitationsMode } from "../../config/types.memory.js";
import type { MemorySearchResult } from "../../memory/types.js";
import type { AnyAgentTool } from "./common.js";
import { resolveMemoryBackendConfig } from "../../memory/backend-config.js";
import { getMemorySearchManager } from "../../memory/index.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { PathTraversalValidator } from "../../security/path-traversal.js";
import { resolveAgentWorkspaceDir } from "../agent-scope.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { resolveMemorySearchConfig } from "../memory-search.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const MemorySearchSchema = Type.Object({
  query: Type.String(),
  maxResults: Type.Optional(Type.Number()),
  minScore: Type.Optional(Type.Number()),
});

const MemoryGetSchema = Type.Object({
  path: Type.String(),
  from: Type.Optional(Type.Number()),
  lines: Type.Optional(Type.Number()),
});

function resolveMemoryToolContext(options: { config?: OpenClawConfig; agentSessionKey?: string }) {
  const cfg = options.config;
  if (!cfg) {
    return null;
  }
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  if (!resolveMemorySearchConfig(cfg, agentId)) {
    return null;
  }
  return { cfg, agentId };
}

export function createMemorySearchTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const ctx = resolveMemoryToolContext(options);
  if (!ctx) {
    return null;
  }
  const { cfg, agentId } = ctx;
  return {
    label: "Memory Search",
    name: "memory_search",
    description:
      "Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering questions about prior work, decisions, dates, people, preferences, or todos; returns top snippets with path + lines.",
    parameters: MemorySearchSchema,
    execute: async (_toolCallId, params) => {
      const query = readStringParam(params, "query", { required: true });
      const maxResults = readNumberParam(params, "maxResults");
      const minScore = readNumberParam(params, "minScore");
      const { manager, error } = await getMemorySearchManager({
        cfg,
        agentId,
      });
      if (!manager) {
        return jsonResult({ results: [], disabled: true, error });
      }
      try {
        const citationsMode = resolveMemoryCitationsMode(cfg);
        const includeCitations = shouldIncludeCitations({
          mode: citationsMode,
          sessionKey: options.agentSessionKey,
        });
        const rawResults = await manager.search(query, {
          maxResults,
          minScore,
          sessionKey: options.agentSessionKey,
        });
        const status = manager.status();
        const decorated = decorateCitations(rawResults, includeCitations);
        const resolved = resolveMemoryBackendConfig({ cfg, agentId });
        const results =
          status.backend === "qmd"
            ? clampResultsByInjectedChars(decorated, resolved.qmd?.limits.maxInjectedChars)
            : decorated;
        return jsonResult({
          results,
          provider: status.provider,
          model: status.model,
          fallback: status.fallback,
          citations: citationsMode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ results: [], disabled: true, error: message });
      }
    },
  };
}

export function createMemoryGetTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const ctx = resolveMemoryToolContext(options);
  if (!ctx) {
    return null;
  }
  const { cfg, agentId } = ctx;

  // SECURITY: Create path validator for memory directory
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const pathValidator = new PathTraversalValidator({
    allowedBasePaths: [workspaceDir],
    resolveSymlinks: true,
    allowNonExistent: true, // Allow validation of paths that don't exist yet (manager will handle existence check)
  });

  return {
    label: "Memory Get",
    name: "memory_get",
    description:
      "Safe snippet read from MEMORY.md or memory/*.md with optional from/lines; use after memory_search to pull only the needed lines and keep context small.",
    parameters: MemoryGetSchema,
    execute: async (_toolCallId, params) => {
      try {
        const relPath = readStringParam(params, "path", { required: true, allowEmpty: true });
        const from = readNumberParam(params, "from", { integer: true });
        const lines = readNumberParam(params, "lines", { integer: true });

        // SECURITY: Validate path before access
        const { manager, error: managerError } = await getMemorySearchManager({
          cfg,
          agentId,
        });
        if (!manager) {
          return jsonResult({ path: relPath, text: "", disabled: true, error: managerError });
        }

        // Handle empty path early
        if (!relPath || relPath.trim() === "") {
          return jsonResult({
            path: relPath || "",
            text: "",
            disabled: true,
            error: "Security: Path access denied - Path validation failed: Empty path not allowed",
          });
        }

        // Resolve path to absolute if needed
        const absPath = relPath.startsWith("/") ? relPath : `${workspaceDir}/${relPath}`;

        // Validate the absolute path
        const safePath = pathValidator.validateOrThrow(absPath);

        // Convert back to relative path for the manager
        const validatedRelPath = safePath.replace(workspaceDir, "").replace(/^\//, "");

        const result = await manager.readFile({
          relPath: validatedRelPath,
          from: from ?? undefined,
          lines: lines ?? undefined,
        });
        return jsonResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Log security violation
        if (
          message.includes("Path validation failed") ||
          message.includes("outside allowed directories") ||
          message.includes("null byte") ||
          message.includes("encoded traversal")
        ) {
          return jsonResult({
            path: params.path as string,
            text: "",
            disabled: true,
            error: `Security: Path access denied - ${message}`,
          });
        }
        return jsonResult({ path: params.path as string, text: "", disabled: true, error: message });
      }
    },
  };
}

function resolveMemoryCitationsMode(cfg: OpenClawConfig): MemoryCitationsMode {
  const mode = cfg.memory?.citations;
  if (mode === "on" || mode === "off" || mode === "auto") {
    return mode;
  }
  return "auto";
}

function decorateCitations(results: MemorySearchResult[], include: boolean): MemorySearchResult[] {
  if (!include) {
    return results.map((entry) => ({ ...entry, citation: undefined }));
  }
  return results.map((entry) => {
    const citation = formatCitation(entry);
    const snippet = `${entry.snippet.trim()}\n\nSource: ${citation}`;
    return { ...entry, citation, snippet };
  });
}

function formatCitation(entry: MemorySearchResult): string {
  const lineRange =
    entry.startLine === entry.endLine
      ? `#L${entry.startLine}`
      : `#L${entry.startLine}-L${entry.endLine}`;
  return `${entry.path}${lineRange}`;
}

function clampResultsByInjectedChars(
  results: MemorySearchResult[],
  budget?: number,
): MemorySearchResult[] {
  if (!budget || budget <= 0) {
    return results;
  }
  let remaining = budget;
  const clamped: MemorySearchResult[] = [];
  for (const entry of results) {
    if (remaining <= 0) {
      break;
    }
    const snippet = entry.snippet ?? "";
    if (snippet.length <= remaining) {
      clamped.push(entry);
      remaining -= snippet.length;
    } else {
      const trimmed = snippet.slice(0, Math.max(0, remaining));
      clamped.push({ ...entry, snippet: trimmed });
      break;
    }
  }
  return clamped;
}

function shouldIncludeCitations(params: {
  mode: MemoryCitationsMode;
  sessionKey?: string;
}): boolean {
  if (params.mode === "on") {
    return true;
  }
  if (params.mode === "off") {
    return false;
  }
  // auto: show citations in direct chats; suppress in groups/channels by default.
  const chatType = deriveChatTypeFromSessionKey(params.sessionKey);
  return chatType === "direct";
}

function deriveChatTypeFromSessionKey(sessionKey?: string): "direct" | "group" | "channel" {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.rest) {
    return "direct";
  }
  const tokens = new Set(parsed.rest.toLowerCase().split(":").filter(Boolean));
  if (tokens.has("channel")) {
    return "channel";
  }
  if (tokens.has("group")) {
    return "group";
  }
  return "direct";
}
