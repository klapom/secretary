#!/usr/bin/env node
/**
 * Simple HTTP server for Avatar Test UI
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    // Parse URL
    let filePath = req.url === '/' ? '/index.html' : req.url;

    // Remove query string
    filePath = filePath.split('?')[0];

    // Construct full path
    const fullPath = join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Read file
    const content = await readFile(fullPath);

    // Determine content type
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Send response
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - 200`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - 404`);
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
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
║   Server:  http://${HOST}:${PORT}          ║
║   Status:  Running                         ║
║                                            ║
║   Dependencies:                            ║
║   - Character API:    :3000                ║
║   - LivePortrait:     :8001                ║
║   - Voice Pipeline:   :8765                ║
║   - WebRTC Signaling: :3000                ║
║                                            ║
║   Press Ctrl+C to stop                     ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
