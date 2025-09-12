import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws"; // nur diese Zeile
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.post("/github", async (req, res) => {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.GH_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

// REST Proxy (User Events)
app.get("/events/:login", async (req, res) => {
  const { login } = req.params;
  const { page = 1, per_page = 100 } = req.query;
  const r = await fetch(
    `https://api.github.com/users/${encodeURIComponent(login)}/events?page=${page}&per_page=${per_page}`,
    {
      headers: { Authorization: "Bearer " + process.env.GH_TOKEN },
    }
  );
  res.status(r.status).json(await r.json());
});
// (optional) statische Files – passe "public" an, falls dein Build woanders liegt
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://me.makawejew.com");
  res.setHeader("Vary", "Origin");
  next();
});
// einfache Health-Route
app.get("/", (req, res) => {
  res.type("text/plain").send("Presence server up. Try /online.json");
});

// HTTP-Endpoint für dein Frontend
app.get("/online.json", (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({ online: onlineCount() });
});

// ---- WSS aufsetzen (NACH dem app, VOR listen) ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/presence" });

// Heartbeat
function heartbeat() { this.isAlive = true; }

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // beim Connect aktuellen Count schicken + allen broadcasten
  sendCount(ws);
  broadcastCount();

  ws.on("close", () => {
    broadcastCount();
  });
});

// Ping/Pong zum Aufräumen
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} return; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 10000);

process.on("SIGTERM", () => clearInterval(interval));
process.on("SIGINT", () => clearInterval(interval));

function onlineCount() {
  return [...wss.clients].filter((client) => client.readyState === WebSocket.OPEN).length;
}
function sendCount(ws) {
  try { ws.send(JSON.stringify({ type: "online", online: onlineCount() })); } catch {}
}
function broadcastCount() {
  const msg = JSON.stringify({ type: "online", online: onlineCount() });
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); } catch {}
    }
  });
}

// ---- Start ----
const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Presence server on http://0.0.0.0:${PORT}`);
});