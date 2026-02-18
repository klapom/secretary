import { describe, expect, it } from "vitest";
import {
  parseAgentSessionKey,
  isCronRunSessionKey,
  isCronSessionKey,
  isSubagentSessionKey,
  getSubagentDepth,
  isAcpSessionKey,
  resolveThreadParentSessionKey,
} from "./session-key-utils.js";

describe("parseAgentSessionKey", () => {
  it("returns null for empty/undefined", () => {
    expect(parseAgentSessionKey(undefined)).toBeNull();
    expect(parseAgentSessionKey(null)).toBeNull();
    expect(parseAgentSessionKey("")).toBeNull();
    expect(parseAgentSessionKey("  ")).toBeNull();
  });

  it("returns null for too few parts", () => {
    expect(parseAgentSessionKey("agent:id")).toBeNull();
    expect(parseAgentSessionKey("onlyOne")).toBeNull();
  });

  it("returns null when prefix is not agent", () => {
    expect(parseAgentSessionKey("user:id:rest")).toBeNull();
  });

  it("parses valid agent session key", () => {
    expect(parseAgentSessionKey("agent:myAgent:discord:group:dev")).toEqual({
      agentId: "myAgent",
      rest: "discord:group:dev",
    });
  });

  it("handles multiple colons in rest", () => {
    expect(parseAgentSessionKey("agent:a:b:c:d")).toEqual({
      agentId: "a",
      rest: "b:c:d",
    });
  });
});

describe("isCronRunSessionKey", () => {
  it("returns true for cron run keys", () => {
    expect(isCronRunSessionKey("agent:a:cron:job1:run:123")).toBe(true);
  });

  it("returns false for plain cron keys", () => {
    expect(isCronRunSessionKey("agent:a:cron:job1")).toBe(false);
  });

  it("returns false for non-agent keys", () => {
    expect(isCronRunSessionKey(null)).toBe(false);
  });
});

describe("isCronSessionKey", () => {
  it("returns true for cron keys", () => {
    expect(isCronSessionKey("agent:a:cron:job1")).toBe(true);
  });

  it("returns false for non-cron keys", () => {
    expect(isCronSessionKey("agent:a:discord:group:dev")).toBe(false);
  });

  it("returns false for empty", () => {
    expect(isCronSessionKey("")).toBe(false);
  });
});

describe("isSubagentSessionKey", () => {
  it("returns true for subagent: prefix", () => {
    expect(isSubagentSessionKey("subagent:child")).toBe(true);
  });

  it("returns true for agent key with subagent rest", () => {
    expect(isSubagentSessionKey("agent:a:subagent:child")).toBe(true);
  });

  it("returns false for non-subagent", () => {
    expect(isSubagentSessionKey("agent:a:discord:group")).toBe(false);
  });

  it("returns false for empty", () => {
    expect(isSubagentSessionKey("")).toBe(false);
    expect(isSubagentSessionKey(null)).toBe(false);
  });
});

describe("getSubagentDepth", () => {
  it("returns 0 for empty", () => {
    expect(getSubagentDepth("")).toBe(0);
    expect(getSubagentDepth(null)).toBe(0);
  });

  it("returns 0 for no subagent markers", () => {
    expect(getSubagentDepth("agent:a:discord")).toBe(0);
  });

  it("counts subagent depth", () => {
    expect(getSubagentDepth("a:subagent:b")).toBe(1);
    expect(getSubagentDepth("a:subagent:b:subagent:c")).toBe(2);
  });
});

describe("isAcpSessionKey", () => {
  it("returns true for acp: prefix", () => {
    expect(isAcpSessionKey("acp:session1")).toBe(true);
  });

  it("returns true for agent key with acp rest", () => {
    expect(isAcpSessionKey("agent:a:acp:session1")).toBe(true);
  });

  it("returns false for non-acp", () => {
    expect(isAcpSessionKey("agent:a:discord")).toBe(false);
  });

  it("returns false for empty", () => {
    expect(isAcpSessionKey("")).toBe(false);
  });
});

describe("resolveThreadParentSessionKey", () => {
  it("returns null for empty", () => {
    expect(resolveThreadParentSessionKey("")).toBeNull();
    expect(resolveThreadParentSessionKey(null)).toBeNull();
  });

  it("returns null when no thread marker", () => {
    expect(resolveThreadParentSessionKey("agent:a:discord:group:dev")).toBeNull();
  });

  it("extracts parent from :thread: marker", () => {
    expect(resolveThreadParentSessionKey("discord:group:dev:thread:123")).toBe("discord:group:dev");
  });

  it("extracts parent from :topic: marker", () => {
    expect(resolveThreadParentSessionKey("slack:channel:gen:topic:abc")).toBe("slack:channel:gen");
  });

  it("uses last marker when multiple exist", () => {
    expect(resolveThreadParentSessionKey("a:thread:b:thread:c")).toBe("a:thread:b");
  });
});
