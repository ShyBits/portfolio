import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve your static site (adjust "public" to your dist folder)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res) {
    // Prevent caching of presence JSON in aggressive CDNs
    res.setHeader("Cache-Control", "no-store, max-age=0");
  }
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/presence" });

// Simple heartbeat to clean up dead sockets behind proxies
function heartbeat() { this.isAlive = true; }

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // On connect, send current count and notify all
  sendCount(ws);
  broadcastCount();

  ws.on("close", () => {
    broadcastCount();
  });
});

// Ping/pong every 30s to detect dead clients
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);

process.on("SIGTERM", () => clearInterval(interval));
process.on("SIGINT", () => clearInterval(interval));

function onlineCount() {
  // Number of connected tabs
  return [...wss.clients].filter(ws => ws.readyState === ws.OPEN).length;
}

function sendCount(ws) {
  try {
    ws.send(JSON.stringify({ type: "online", online: onlineCount() }));
  } catch {}
}

function broadcastCount() {
  const msg = JSON.stringify({ type: "online", online: onlineCount() });
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); } catch {}
    }
  });
}

// HTTP endpoint used by your existing frontend poller
app.get("/online.json", (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({ online: onlineCount() });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Presence server on http://localhost:${PORT}`);
});
