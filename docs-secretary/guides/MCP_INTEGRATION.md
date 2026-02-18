# MCP (Model Context Protocol) Integration

**Datum:** 2026-02-15
**Status:** Planning

---

## 🔌 Was ist MCP?

**Model Context Protocol** (MCP) ist Anthropic's offener Standard für:

- **Tool Integration** in AI-Anwendungen
- **Standardisierte Schnittstellen** für LLM-Tools
- **Server-basiertes Tool-Management**

**Dokumentation:** https://modelcontextprotocol.io/

---

## ✅ Warum MCP für OpenClaw?

| Benefit                    | Wie es hilft                                          |
| -------------------------- | ----------------------------------------------------- |
| **Standardisierung**       | Kompatibel mit Claude Desktop, anderen MCP Clients    |
| **Tool Ecosystem**         | Nutze existierende MCP-Server (Filesystem, Git, etc.) |
| **Separation of Concerns** | Tools als separate Prozesse (nicht im Agent)          |
| **Security**               | Tools laufen in eigenen Sandboxes                     |
| **Cloud-Ready**            | MCP-Server können remote laufen                       |

---

## 🏗️ MCP Architecture in OpenClaw

### Aktuelle Architektur (ohne MCP)

```
┌─────────────────────────────────────┐
│     OpenClaw Monolith               │
│  ┌──────────┐      ┌─────────────┐ │
│  │  Agent   │─────▶│Tool Executor│ │
│  │ Runtime  │      │  (Docker)   │ │
│  └──────────┘      └─────────────┘ │
│       │                   │         │
│       │                   ▼         │
│       │           ┌─────────────┐  │
│       │           │ bash, read, │  │
│       │           │ write, http │  │
│       └───────────┴─────────────┘  │
└─────────────────────────────────────┘
```

### Mit MCP Integration

```
┌─────────────────────────────────────────────────────────┐
│              OpenClaw Monolith                          │
│  ┌──────────────┐                                       │
│  │    Agent     │                                       │
│  │   Runtime    │                                       │
│  └──────┬───────┘                                       │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────────────────┐│
│  │          MCP Client (OpenClaw)                     ││
│  └──────┬──────────────┬──────────────┬───────────────┘│
└─────────┼──────────────┼──────────────┼────────────────┘
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │   MCP    │   │   MCP    │   │   MCP    │
    │Filesystem│   │   Git    │   │  GitHub  │
    │  Server  │   │  Server  │   │  Server  │
    └──────────┘   └──────────┘   └──────────┘
          │              │              │
          ▼              ▼              ▼
    File Ops         Git Ops        GitHub API

    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  Custom  │   │  Custom  │   │  Custom  │
    │  MCP     │   │  MCP     │   │  MCP     │
    │  Docker  │   │Browser   │   │Calendar  │
    └──────────┘   └──────────┘   └──────────┘
```

---

## 📦 MCP Server Types

### 1. Standard MCP Servers (Anthropic)

```bash
# Installiere offizielle MCP Servers
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-git
npm install -g @modelcontextprotocol/server-github
```

**Features:**

- `filesystem`: Read/Write files (mit Permissions)
- `git`: Git operations (commit, push, pull, diff)
- `github`: GitHub API (issues, PRs, repos)

### 2. Community MCP Servers

```bash
# Beispiele aus MCP Ecosystem
npm install -g mcp-server-brave-search
npm install -g mcp-server-puppeteer
npm install -g mcp-server-postgres
```

### 3. Custom MCP Servers (OpenClaw-specific)

```typescript
// Custom: Docker Execution Server
// src/mcp-servers/docker-executor/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "openclaw-docker-executor",
  version: "1.0.0",
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_bash",
      description: "Execute bash command in sandboxed Docker container",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Bash command to execute",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds",
            default: 30000,
          },
        },
        required: ["command"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "execute_bash") {
    const { command, timeout } = request.params.arguments;

    // Execute in Docker (hardened)
    const result = await dockerExecutor.execute(command, {
      timeout,
      securityPolicy: "restricted",
    });

    return {
      content: [
        {
          type: "text",
          text: result.stdout,
        },
      ],
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 🔧 MCP Client Integration

### OpenClaw MCP Client

```typescript
// src/agent/mcp-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private clients = new Map<string, Client>();

  async connectToServer(serverConfig: MCPServerConfig) {
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
    });

    const client = new Client({
      name: "openclaw",
      version: "1.0.0",
    });

    await client.connect(transport);

    // List available tools
    const tools = await client.listTools();
    console.log(`Connected to ${serverConfig.name}:`, tools);

    this.clients.set(serverConfig.name, client);

    return client;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, any>) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server ${serverName} not connected`);

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result;
  }

  async getAllTools() {
    const allTools = [];

    for (const [serverName, client] of this.clients) {
      const { tools } = await client.listTools();

      allTools.push(
        ...tools.map((tool) => ({
          ...tool,
          serverName,
          // Prefix tool name with server for uniqueness
          name: `${serverName}__${tool.name}`,
        })),
      );
    }

    return allTools;
  }
}
```

---

## ⚙️ Configuration

```typescript
// config/mcp-servers.ts
export const mcpServers: MCPServerConfig[] = [
  // Standard Servers
  {
    name: "filesystem",
    command: "node",
    args: [
      "/usr/local/lib/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js",
      "/workspace", // Root directory
    ],
    env: {
      ALLOWED_DIRECTORIES: "/workspace,/tmp",
    },
  },
  {
    name: "git",
    command: "node",
    args: ["/usr/local/lib/node_modules/@modelcontextprotocol/server-git/dist/index.js"],
  },
  {
    name: "github",
    command: "node",
    args: ["/usr/local/lib/node_modules/@modelcontextprotocol/server-github/dist/index.js"],
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    },
  },

  // Custom OpenClaw Servers
  {
    name: "docker",
    command: "node",
    args: ["./mcp-servers/docker-executor/dist/index.js"],
    env: {
      DOCKER_HOST: process.env.DOCKER_HOST,
    },
  },
  {
    name: "browser",
    command: "node",
    args: ["./mcp-servers/browser/dist/index.js"],
  },
];
```

---

## 🔄 Integration in Agent Runtime

```typescript
// src/agent/runtime.ts
import { MCPClient } from "./mcp-client";

export class AgentRuntime {
  private mcpClient: MCPClient;

  async initialize() {
    this.mcpClient = new MCPClient();

    // Connect to all configured MCP servers
    for (const serverConfig of mcpServers) {
      await this.mcpClient.connectToServer(serverConfig);
    }
  }

  async processMessage(message: Message) {
    // Get all available tools from MCP servers
    const mcpTools = await this.mcpClient.getAllTools();

    // Convert to Claude API format
    const claudeTools = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    // Send to Claude with tools
    const response = await anthropic.messages.create({
      model: "claude-4-6-opus-20250514",
      messages: [{ role: "user", content: message.content }],
      tools: claudeTools,
      max_tokens: 4096,
    });

    // Handle tool calls
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const [serverName, toolName] = block.name.split("__");

        // Execute via MCP
        const result = await this.mcpClient.callTool(serverName, toolName, block.input);

        // Send result back to Claude
        // ... (standard tool use loop)
      }
    }

    return response;
  }
}
```

---

## 🛡️ Security with MCP

### Permission Management

```typescript
// src/mcp/security-wrapper.ts
export class SecureMCPClient extends MCPClient {
  private allowedTools = new Set<string>([
    "filesystem__read_file",
    "filesystem__write_file",
    "git__git_diff",
    "git__git_commit",
    // NOT: filesystem__delete_file (restricted)
  ]);

  async callTool(serverName: string, toolName: string, args: any) {
    const fullName = `${serverName}__${toolName}`;

    if (!this.allowedTools.has(fullName)) {
      throw new Error(`Tool ${fullName} not allowed`);
    }

    // Additional validation
    if (toolName === "write_file") {
      this.validatePath(args.path);
    }

    return super.callTool(serverName, toolName, args);
  }

  private validatePath(path: string) {
    const deniedPaths = [/^\/home\/[^/]+\/\.ssh\//, /^\/etc\/(passwd|shadow)/];

    if (deniedPaths.some((pattern) => pattern.test(path))) {
      throw new Error(`Access to ${path} denied`);
    }
  }
}
```

---

## 📊 MCP vs. Native Tools

| Aspect              | MCP Tools                  | Native Tools (Current) |
| ------------------- | -------------------------- | ---------------------- |
| **Isolation**       | ✅ Separate processes      | 🟡 In Tool Executor    |
| **Standardization** | ✅ MCP Protocol            | ❌ Custom per tool     |
| **Ecosystem**       | ✅ Use existing servers    | ❌ Build everything    |
| **Debugging**       | ✅ Separate logs           | 🟡 Mixed logs          |
| **Permissions**     | ✅ Per-server config       | 🟡 Global config       |
| **Cloud-Ready**     | ✅ Remote servers possible | ❌ Local only          |
| **Latency**         | 🟡 IPC overhead            | ✅ In-process          |

---

## 🚀 Migration Strategy: Native → MCP

### Phase 1: Hybrid (beide parallel)

```typescript
// src/agent/tool-router.ts
export class ToolRouter {
  constructor(
    private nativeTools: NativeToolExecutor,
    private mcpClient: MCPClient,
  ) {}

  async executeTool(toolName: string, args: any) {
    // Check if MCP tool
    if (toolName.includes("__")) {
      const [server, tool] = toolName.split("__");
      return this.mcpClient.callTool(server, tool, args);
    }

    // Fallback to native
    return this.nativeTools.execute(toolName, args);
  }
}
```

### Phase 2: Gradual Migration

```typescript
// Migrate tools one by one
const toolMigrationMap = {
  bash: "docker__execute_bash", // MCP
  read_file: "filesystem__read_file", // MCP
  write_file: "filesystem__write_file", // MCP
  http_request: "native", // Keep native
  browser: "browser__navigate", // MCP
};
```

### Phase 3: Full MCP

```typescript
// All tools via MCP
const allTools = await mcpClient.getAllTools();
// No native tools
```

---

## 📦 Custom MCP Servers for OpenClaw

### 1. Docker Executor Server

```typescript
// mcp-servers/docker-executor/
├── src/
│   └── index.ts
├── package.json
└── tsconfig.json

// Provides: execute_bash, execute_python, etc.
```

### 2. Browser Automation Server

```typescript
// mcp-servers/browser/

// Provides:
// - navigate(url)
// - screenshot()
// - extract_text()
// - fill_form(selector, data)
```

### 3. Avatar Control Server

```typescript
// mcp-servers/avatar/

// Provides:
// - switch_character(id)
// - get_characters()
// - create_character(config)
```

### 4. Kill Switch Server

```typescript
// mcp-servers/kill-switch/

// Provides:
// - emergency_shutdown(reason)
// - get_status()
// - restart_safe_mode()
```

---

## 🎯 Benefits für OpenClaw

| Feature              | Benefit                            |
| -------------------- | ---------------------------------- |
| **Tool Ecosystem**   | Nutze 50+ existierende MCP servers |
| **Better Isolation** | Tools in separaten Prozessen       |
| **Cloud-Ready**      | MCP Server remote deploybar        |
| **Compatibility**    | Gleiche Tools wie Claude Desktop   |
| **Standardization**  | Industry-Standard Protocol         |
| **Debugging**        | Separate Logs pro Server           |

---

## ⚙️ Deployment

### Local (DGX Spark)

```yaml
# docker-compose.yml
services:
  openclaw:
    build: .
    volumes:
      - ./mcp-servers:/mcp-servers

  # Optional: MCP Servers als separate Containers
  mcp-filesystem:
    image: mcp/filesystem-server
    volumes:
      - ./workspace:/workspace

  mcp-git:
    image: mcp/git-server
    volumes:
      - ./repos:/repos
```

### Cloud (später)

```
OpenClaw (Cloud Run) → MCP Servers (Separate Services)
                     ├─ Filesystem (Cloud Storage)
                     ├─ Git (GitHub Actions)
                     └─ Docker (Cloud Build)
```

---

## 📋 Implementation Roadmap

| Phase       | Task                        | Aufwand        |
| ----------- | --------------------------- | -------------- |
| **Phase 1** | MCP Client Integration      | 2-3 Tage       |
| **Phase 2** | Connect to Standard Servers | 1 Tag          |
| **Phase 3** | Build Custom Docker Server  | 3-4 Tage       |
| **Phase 4** | Build Browser Server        | 3-4 Tage       |
| **Phase 5** | Migrate Native Tools        | 1 Woche        |
| **Total**   |                             | **3-4 Wochen** |

---

## ✅ Empfehlung

**JA, MCP Integration ist SEHR sinnvoll!**

**Warum:**

- ✅ Passt perfekt zu modularer Architektur
- ✅ Nutzt Anthropic's Standardprotokoll
- ✅ Bessere Isolation als native Tools
- ✅ Zugriff auf Tool-Ecosystem
- ✅ Cloud-Migration einfacher

**Wann:**

- Start: Nach Core-System (Woche 8-10)
- Parallel zu Frontend-Entwicklung
- Nicht blocking für MVP

**Priority:**

- High (aber nicht kritisch für MVP)
- Kann inkrementell migriert werden

---

**Status:** ✅ Designed und empfohlen
**Integration:** Hybrid-Ansatz (Native + MCP parallel)
**Timeline:** Woche 8-12
