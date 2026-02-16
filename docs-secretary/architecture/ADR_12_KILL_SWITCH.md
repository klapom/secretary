# ADR-12: Kill Switch & Emergency Shutdown System

**Status:** ✅ Entschieden
**Datum:** 2026-02-15
**Kontext:** Notfall-Abschaltung des gesamten Agenten-Systems

---

## Problem Statement

Das System muss in Notfällen **sofort und vollständig abschaltbar** sein:

- **Security Incident:** Kompromittiertes LLM oder Tool Execution
- **Runaway Agent:** Unendliche Schleifen, excessive API calls
- **Privacy Breach:** Verdacht auf Datenleck
- **User Safety:** Agent verhält sich unerwartet

**Anforderungen:**

1. ✅ Alle eingehenden Nachrichten blockieren
2. ✅ Alle ausgehenden Nachrichten blockieren
3. ✅ LLM komplett trennen (keine API Calls)
4. ✅ Tool Execution stoppen
5. ✅ System in < 1 Sekunde in Safe State
6. ✅ Persistenter State (überlebt Restart)
7. ✅ Multiple Trigger-Mechanismen (API, CLI, UI, Hardware)

---

## Architektur

### Kill Switch State Machine

```
┌─────────────┐
│   RUNNING   │  ← Normalbetrieb
└──────┬──────┘
       │ KILL SWITCH ACTIVATED
       ▼
┌─────────────┐
│  SHUTDOWN   │  ← Alle Operationen gestoppt
└──────┬──────┘
       │ MANUAL RESTART
       ▼
┌─────────────┐
│   SAFE MODE │  ← Nur Admin-Zugriff, kein LLM
└──────┬──────┘
       │ CLEAR & RESTART
       ▼
┌─────────────┐
│   RUNNING   │
└─────────────┘
```

### Implementation (Modularer Monolith)

```typescript
// src/core/kill-switch.ts
import EventEmitter from "events";

export enum SystemState {
  RUNNING = "running",
  SHUTDOWN = "shutdown",
  SAFE_MODE = "safe_mode",
  STARTING = "starting",
}

export enum ShutdownReason {
  MANUAL = "manual",
  SECURITY_INCIDENT = "security_incident",
  RUNAWAY_AGENT = "runaway_agent",
  API_QUOTA_EXCEEDED = "api_quota_exceeded",
  EMERGENCY = "emergency",
}

export class KillSwitch extends EventEmitter {
  private state: SystemState = SystemState.STARTING;
  private shutdownReason?: ShutdownReason;
  private persistentStorage: PersistentStorage;

  constructor() {
    super();
    this.loadPersistedState();
  }

  /**
   * Primary kill switch - immediate shutdown
   */
  async activate(reason: ShutdownReason, metadata?: any) {
    console.error("🚨 KILL SWITCH ACTIVATED", { reason, metadata });

    // 1. Set state FIRST (atomic operation)
    await this.setState(SystemState.SHUTDOWN, reason);

    // 2. Emit shutdown event (all modules listen)
    this.emit("shutdown", { reason, metadata });

    // 3. Execute shutdown sequence
    await this.executeShutdownSequence();

    // 4. Persist state (survives restart)
    await this.persistState();

    console.error("✅ System shutdown complete");
  }

  /**
   * Check if system is operational
   */
  isOperational(): boolean {
    return this.state === SystemState.RUNNING;
  }

  /**
   * Check if LLM calls are allowed
   */
  isLLMEnabled(): boolean {
    return this.state === SystemState.RUNNING;
  }

  /**
   * Check if messaging is allowed
   */
  isMessagingEnabled(): boolean {
    return this.state === SystemState.RUNNING;
  }

  /**
   * Restart system (requires manual confirmation)
   */
  async restart(adminToken: string) {
    if (!(await this.validateAdminToken(adminToken))) {
      throw new Error("Invalid admin token");
    }

    console.log("🔄 Restarting system...");

    await this.setState(SystemState.SAFE_MODE);
    this.emit("restart");

    // Wait for manual clearance
    console.log("⚠️  System in SAFE MODE. Run clearAndStart() to resume.");
  }

  /**
   * Clear shutdown and resume operations
   */
  async clearAndStart(adminToken: string) {
    if (!(await this.validateAdminToken(adminToken))) {
      throw new Error("Invalid admin token");
    }

    console.log("✅ Clearing shutdown state...");

    this.shutdownReason = undefined;
    await this.setState(SystemState.RUNNING);
    this.emit("running");

    console.log("✅ System operational");
  }

  /**
   * Shutdown sequence
   */
  private async executeShutdownSequence() {
    const timeout = 5000; // 5 second max

    try {
      await Promise.race([this.shutdownModules(), this.timeoutPromise(timeout)]);
    } catch (err) {
      console.error("Shutdown sequence error (continuing anyway)", err);
    }
  }

  private async shutdownModules() {
    // Modules self-shutdown when they receive 'shutdown' event
    // We just wait for confirmations

    const promises = [
      this.waitForEvent("gateway:shutdown"),
      this.waitForEvent("agent:shutdown"),
      this.waitForEvent("tools:shutdown"),
      this.waitForEvent("avatar:shutdown"),
    ];

    await Promise.all(promises);
  }

  private async setState(state: SystemState, reason?: ShutdownReason) {
    this.state = state;
    if (reason) this.shutdownReason = reason;

    // Atomic write to file
    await this.persistentStorage.write("system-state", {
      state,
      reason: this.shutdownReason,
      timestamp: new Date().toISOString(),
    });
  }

  private async persistState() {
    // Already done in setState()
  }

  private async loadPersistedState() {
    const persisted = await this.persistentStorage.read("system-state");

    if (persisted) {
      this.state = persisted.state;
      this.shutdownReason = persisted.reason;

      if (this.state === SystemState.SHUTDOWN) {
        console.warn("⚠️  System was shut down:", this.shutdownReason);
        console.warn("⚠️  Run restart() to enter SAFE MODE");
      }
    } else {
      this.state = SystemState.RUNNING;
    }
  }

  private async validateAdminToken(token: string): Promise<boolean> {
    // Compare with stored admin token (hashed)
    const adminTokenHash = await this.persistentStorage.read("admin-token-hash");
    const tokenHash = await this.hashToken(token);
    return tokenHash === adminTokenHash;
  }

  private waitForEvent(event: string): Promise<void> {
    return new Promise((resolve) => {
      this.once(event, resolve);
    });
  }

  private timeoutPromise(ms: number): Promise<void> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("Shutdown timeout")), ms));
  }

  private async hashToken(token: string): Promise<string> {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

// Singleton instance
export const killSwitch = new KillSwitch();
```

---

## Integration in Module

### Gateway Module

```typescript
// src/gateway/index.ts
import { killSwitch } from "../core/kill-switch";

export class Gateway {
  private channels: Map<string, Channel> = new Map();

  constructor() {
    // Listen to kill switch
    killSwitch.on("shutdown", () => this.shutdown());
  }

  async handleInboundMessage(message: InboundMessage) {
    // CHECK KILL SWITCH FIRST
    if (!killSwitch.isMessagingEnabled()) {
      console.warn("⛔ Message rejected: System shutdown");
      return { status: "rejected", reason: "system_shutdown" };
    }

    // Normal processing
    return this.processMessage(message);
  }

  async sendOutboundMessage(message: OutboundMessage) {
    // CHECK KILL SWITCH
    if (!killSwitch.isMessagingEnabled()) {
      console.warn("⛔ Outbound message blocked: System shutdown");
      return { status: "blocked", reason: "system_shutdown" };
    }

    // Send
    return this.deliverMessage(message);
  }

  private async shutdown() {
    console.log("🛑 Gateway shutting down...");

    // 1. Stop accepting new connections
    await this.websocketServer?.close();

    // 2. Disconnect all channels
    for (const [name, channel] of this.channels) {
      await channel.disconnect();
    }

    // 3. Confirm shutdown
    killSwitch.emit("gateway:shutdown");
  }
}
```

---

### Agent Runtime Module

```typescript
// src/agent/runtime.ts
import { killSwitch } from "../core/kill-switch";

export class AgentRuntime {
  private llmClient: LLMClient;

  constructor() {
    killSwitch.on("shutdown", () => this.shutdown());
  }

  async processMessage(message: Message) {
    // CHECK KILL SWITCH
    if (!killSwitch.isOperational()) {
      throw new Error("Agent runtime is shut down");
    }

    // CHECK LLM ACCESS
    if (!killSwitch.isLLMEnabled()) {
      throw new Error("LLM access is disabled");
    }

    // Normal LLM call
    return this.llmClient.complete(message);
  }

  private async shutdown() {
    console.log("🛑 Agent Runtime shutting down...");

    // 1. Cancel all pending LLM requests
    await this.llmClient.cancelAllRequests();

    // 2. Clear context queues
    this.contextQueue.clear();

    // 3. Confirm shutdown
    killSwitch.emit("agent:shutdown");
  }
}
```

---

### LLM Client with Circuit Breaker

```typescript
// src/agent/llm-client.ts
import { killSwitch } from "../core/kill-switch";

export class LLMClient {
  private pendingRequests = new Map<string, AbortController>();

  async complete(prompt: string): Promise<string> {
    // Double-check kill switch
    if (!killSwitch.isLLMEnabled()) {
      throw new Error("LLM is disabled by kill switch");
    }

    const requestId = generateId();
    const abortController = new AbortController();
    this.pendingRequests.set(requestId, abortController);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: abortController.signal,
        headers: {
          /* ... */
        },
        body: JSON.stringify({
          /* ... */
        }),
      });

      return await response.json();
    } finally {
      this.pendingRequests.delete(requestId);
    }
  }

  async cancelAllRequests() {
    console.log(`Cancelling ${this.pendingRequests.size} pending LLM requests...`);

    for (const [id, controller] of this.pendingRequests) {
      controller.abort();
    }

    this.pendingRequests.clear();
  }
}
```

---

### Tool Executor Module

```typescript
// src/tools/executor.ts
import { killSwitch } from "../core/kill-switch";

export class ToolExecutor {
  private runningTools = new Map<string, Process>();

  constructor() {
    killSwitch.on("shutdown", () => this.shutdown());
  }

  async executeTool(tool: string, params: any) {
    if (!killSwitch.isOperational()) {
      throw new Error("Tool execution disabled by kill switch");
    }

    const process = spawn(tool, params);
    this.runningTools.set(process.pid, process);

    try {
      return await this.waitForProcess(process);
    } finally {
      this.runningTools.delete(process.pid);
    }
  }

  private async shutdown() {
    console.log("🛑 Tool Executor shutting down...");

    // Kill all running tools
    for (const [pid, process] of this.runningTools) {
      console.log(`Killing tool process ${pid}...`);
      process.kill("SIGTERM");
    }

    // Wait max 2 seconds, then force kill
    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (const [pid, process] of this.runningTools) {
      if (!process.killed) {
        process.kill("SIGKILL");
      }
    }

    this.runningTools.clear();

    killSwitch.emit("tools:shutdown");
  }
}
```

---

## Trigger Mechanisms

### 1. API Endpoint

```typescript
// src/api/kill-switch.ts
import { Router } from "express";
import { killSwitch, ShutdownReason } from "../core/kill-switch";

const router = Router();

/**
 * POST /api/emergency/kill
 * Activate kill switch
 */
router.post("/emergency/kill", async (req, res) => {
  const { adminToken, reason, metadata } = req.body;

  // Validate admin (basic auth or token)
  if (!validateAdmin(req, adminToken)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  await killSwitch.activate(reason || ShutdownReason.MANUAL, metadata);

  res.json({
    status: "shutdown",
    message: "System shut down successfully",
  });
});

/**
 * POST /api/emergency/restart
 * Restart to safe mode
 */
router.post("/emergency/restart", async (req, res) => {
  const { adminToken } = req.body;

  await killSwitch.restart(adminToken);

  res.json({
    status: "safe_mode",
    message: "System in safe mode. Run /clear to resume.",
  });
});

/**
 * POST /api/emergency/clear
 * Clear shutdown and resume
 */
router.post("/emergency/clear", async (req, res) => {
  const { adminToken } = req.body;

  await killSwitch.clearAndStart(adminToken);

  res.json({
    status: "running",
    message: "System operational",
  });
});

/**
 * GET /api/emergency/status
 * Get current kill switch status
 */
router.get("/emergency/status", (req, res) => {
  res.json({
    state: killSwitch.state,
    reason: killSwitch.shutdownReason,
    operational: killSwitch.isOperational(),
    llmEnabled: killSwitch.isLLMEnabled(),
    messagingEnabled: killSwitch.isMessagingEnabled(),
  });
});

export default router;
```

---

### 2. CLI Command

```bash
# Kill switch via CLI
openclaw emergency kill --reason security_incident

# Restart to safe mode
openclaw emergency restart --admin-token <token>

# Clear and resume
openclaw emergency clear --admin-token <token>

# Check status
openclaw emergency status
```

**Implementation:**

```typescript
// src/cli/emergency.ts
import { killSwitch, ShutdownReason } from "../core/kill-switch";

export async function handleEmergencyKill(args: any) {
  const reason = args.reason || ShutdownReason.MANUAL;

  console.log("🚨 Activating kill switch...");
  await killSwitch.activate(reason, {
    source: "cli",
    user: process.env.USER,
  });

  console.log("✅ System shut down");
  process.exit(0);
}
```

---

### 3. Physical Hardware Button (Optional)

```typescript
// src/hardware/kill-button.ts
import { Gpio } from "onoff"; // Raspberry Pi GPIO
import { killSwitch, ShutdownReason } from "../core/kill-switch";

/**
 * Physical kill switch via GPIO pin
 * Wire a button between GPIO pin and GND
 */
export class HardwareKillSwitch {
  private button: Gpio;

  constructor(gpioPin: number = 17) {
    this.button = new Gpio(gpioPin, "in", "falling", { debounceTimeout: 100 });

    this.button.watch((err, value) => {
      if (err) {
        console.error("Hardware kill switch error", err);
        return;
      }

      if (value === 0) {
        // Button pressed
        console.log("🚨 PHYSICAL KILL SWITCH PRESSED");
        killSwitch.activate(ShutdownReason.EMERGENCY, {
          source: "hardware_button",
          pin: gpioPin,
        });
      }
    });
  }

  destroy() {
    this.button.unexport();
  }
}
```

---

### 4. Watchdog Timer

```typescript
// src/core/watchdog.ts
import { killSwitch, ShutdownReason } from "./kill-switch";

/**
 * Watchdog that kills system if criteria met
 */
export class Watchdog {
  private apiCallCount = 0;
  private resetInterval = 60000; // 1 minute

  constructor() {
    this.startWatching();
  }

  private startWatching() {
    // Reset counter every minute
    setInterval(() => {
      this.apiCallCount = 0;
    }, this.resetInterval);

    // Monitor API calls
    eventBus.on("llm:api_call", () => {
      this.apiCallCount++;

      // Kill if >100 API calls per minute (runaway agent)
      if (this.apiCallCount > 100) {
        console.error("🚨 Runaway agent detected!");
        killSwitch.activate(ShutdownReason.RUNAWAY_AGENT, {
          apiCallCount: this.apiCallCount,
          timeWindow: this.resetInterval,
        });
      }
    });
  }
}
```

---

## LLM Separation (Complete Disconnect)

### Environment-based LLM Toggle

```typescript
// src/agent/llm-factory.ts
import { killSwitch } from "../core/kill-switch";

export function createLLMClient(): LLMClient {
  // If kill switch disabled LLM, return dummy client
  if (!killSwitch.isLLMEnabled()) {
    return new DummyLLMClient(); // Returns canned responses
  }

  // Check environment variable
  if (process.env.LLM_ENABLED === "false") {
    return new DummyLLMClient();
  }

  // Normal client
  return new AnthropicLLMClient();
}

class DummyLLMClient implements LLMClient {
  async complete(prompt: string): Promise<string> {
    return "System is in safe mode. LLM is disabled.";
  }
}
```

---

## Persistent State Storage

```typescript
// src/storage/persistent-storage.ts
import fs from "fs/promises";
import path from "path";

export class PersistentStorage {
  private basePath = path.join(process.env.HOME, ".openclaw", "state");

  constructor() {
    this.ensureDir();
  }

  async write(key: string, value: any) {
    const filePath = path.join(this.basePath, `${key}.json`);

    // Atomic write (write to temp, then rename)
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
    await fs.rename(tempPath, filePath);
  }

  async read(key: string): Promise<any> {
    const filePath = path.join(this.basePath, `${key}.json`);

    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  private async ensureDir() {
    await fs.mkdir(this.basePath, { recursive: true });
  }
}
```

---

## Testing

### Manual Test Scenarios

```typescript
describe("Kill Switch", () => {
  it("should block all messages when activated", async () => {
    await killSwitch.activate(ShutdownReason.MANUAL);

    const result = await gateway.handleInboundMessage({
      channel: "whatsapp",
      text: "Hello",
    });

    expect(result.status).toBe("rejected");
  });

  it("should cancel pending LLM requests", async () => {
    const promise = llmClient.complete("test prompt");

    await killSwitch.activate(ShutdownReason.MANUAL);

    await expect(promise).rejects.toThrow();
  });

  it("should persist state across restarts", async () => {
    await killSwitch.activate(ShutdownReason.SECURITY_INCIDENT);

    // Simulate restart
    const newKillSwitch = new KillSwitch();
    await newKillSwitch.loadPersistedState();

    expect(newKillSwitch.state).toBe(SystemState.SHUTDOWN);
    expect(newKillSwitch.shutdownReason).toBe(ShutdownReason.SECURITY_INCIDENT);
  });
});
```

---

## Zusammenfassung

### Was der Kill Switch tut:

✅ **Sofort (<1s):**

- Alle eingehenden Nachrichten blockieren
- Alle ausgehenden Nachrichten blockieren
- Laufende LLM-Requests abbrechen
- Tool Execution stoppen

✅ **Persistenz:**

- State überlebt Neustart
- Muss manuell cleared werden

✅ **Granularität:**

- Gesamtsystem aus
- Nur LLM aus
- Nur Messaging aus

✅ **Trigger:**

- API (via cURL/Postman)
- CLI (via Terminal)
- Hardware Button (optional)
- Watchdog (automatisch)

---

**Nächster Schritt:** Weiter zu ADR-02? 🚀
