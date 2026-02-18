#!/usr/bin/env node
/**
 * Simple HTTP server for Avatar Test UI
 * Includes reverse proxy for backend services to avoid CORS issues.
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Backend service URLs (server-side — no CORS restrictions)
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:18789";
const TTS_URL = process.env.TTS_URL || "http://localhost:8082";
const STT_URL = process.env.STT_URL || "http://localhost:8083";
const LIVEPORTRAIT_URL = process.env.LIVEPORTRAIT_URL || "http://localhost:8081";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Forward an incoming request to a backend service */
async function proxyRequest(req, res, targetBase, targetPath) {
  const url = `${targetBase}${targetPath}`;

  // Collect request body
  const bodyChunks = [];
  for await (const chunk of req) {
    bodyChunks.push(chunk);
  }
  const body = Buffer.concat(bodyChunks);

  // Forward headers (drop host/connection)
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!["host", "connection", "transfer-encoding"].includes(k.toLowerCase())) {
      headers[k] = v;
    }
  }

  try {
    // Detect streaming endpoints (MJPEG) — no timeout, abort on client disconnect
    const isStreamRequest = url.includes("/api/stream") && !url.includes("set-");
    const abortController = isStreamRequest ? new AbortController() : null;
    if (abortController) {
      req.on("close", () => abortController.abort());
    }
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
      signal: isStreamRequest ? abortController.signal : AbortSignal.timeout(60_000),
      // Node 18+: disable automatic body handling for binary responses
      duplex: "half",
    });

    // Copy response headers
    const respHeaders = { "Cache-Control": "no-cache" };
    const isStreaming = (upstream.headers.get("content-type") || "").includes(
      "multipart/x-mixed-replace",
    );
    for (const [k, v] of upstream.headers.entries()) {
      if (!["transfer-encoding", "connection"].includes(k.toLowerCase())) {
        respHeaders[k] = v;
      }
    }

    res.writeHead(upstream.status, respHeaders);

    // Stream body
    if (upstream.body) {
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!res.write(value) && !isStreaming) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
    }
    if (!isStreaming) {
      res.end();
    }
    console.log(
      `[${new Date().toISOString()}] PROXY ${req.method} ${req.url} → ${url} - ${upstream.status}`,
    );
  } catch (err) {
    // Abort errors from client disconnect on streaming are expected
    if (err.name === "AbortError") {
      console.log(`[${new Date().toISOString()}] PROXY STREAM ENDED ${url} (client disconnected)`);
      res.end();
      return;
    }
    console.error(`[${new Date().toISOString()}] PROXY ERROR ${url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end(JSON.stringify({ error: "Bad Gateway", detail: err.message }));
  }
}

const server = createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  // ── Proxy routes ─────────────────────────────────────────────────────────
  if (path.startsWith("/proxy/tts/")) {
    return proxyRequest(req, res, TTS_URL, path.replace("/proxy/tts", "") + query);
  }
  if (path.startsWith("/proxy/stt/")) {
    return proxyRequest(req, res, STT_URL, path.replace("/proxy/stt", "") + query);
  }
  if (path.startsWith("/proxy/liveportrait/")) {
    return proxyRequest(
      req,
      res,
      LIVEPORTRAIT_URL,
      path.replace("/proxy/liveportrait", "") + query,
    );
  }
  if (path.startsWith("/proxy/gateway/")) {
    return proxyRequest(req, res, GATEWAY_URL, path.replace("/proxy/gateway", "") + query);
  }

  // ── Static file serving ───────────────────────────────────────────────────
  try {
    let filePath = path === "/" ? "/index.html" : path;
    const fullPath = join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const content = await readFile(fullPath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
    res.end(content);

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - 200`);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found");
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - 404`);
    } else {
      res.writeHead(500);
      res.end("Internal Server Error");
      console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} - 500`, error);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Avatar System Test UI Server            ║
╠════════════════════════════════════════════╣
║                                            ║
║   UI:       http://${HOST}:${PORT}         ║
║   Status:   Running                        ║
║                                            ║
║   Proxy routes:                            ║
║   /proxy/tts/       → ${TTS_URL}
║   /proxy/stt/       → ${STT_URL}
║   /proxy/liveportrait/ → ${LIVEPORTRAIT_URL}
║   /proxy/gateway/   → ${GATEWAY_URL}
║                                            ║
╚════════════════════════════════════════════╝
  `);
});

process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down...");
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
});
