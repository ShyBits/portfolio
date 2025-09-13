import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- CORS (vor allen Routen) ---
const ALLOW = [
  "https://makawejew.com",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
  "http://localhost:4000"
];

app.use(
  cors({
    origin: (origin, cb) => (!origin || ALLOW.includes(origin) ? cb(null, true) : cb(null, false)),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

// Body-Parser
app.use(express.json());

// --- Health ---
app.get("/", (req, res) => {
  res.type("text/plain").send("Presence server up. Try /online.json");
});

// --- GitHub GraphQL Proxy ---
app.post("/github", async (req, res) => {
  try {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.GH_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    res.status(500).json({ error: "proxy_error", detail: String(err) });
  }
});

// --- GitHub User Events Proxy (REST) ---
app.get("/events/:login", async (req, res) => {
  try {
    const { login } = req.params;
    const { page = 1, per_page = 100 } = req.query;

    const r = await fetch(
      `https://api.github.com/users/${encodeURIComponent(login)}/events?page=${page}&per_page=${per_page}`,
      { headers: { Authorization: "Bearer " + process.env.GH_TOKEN } }
    );
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    res.status(500).json({ error: "proxy_error", detail: String(err) });
  }
});

// --- Presence Counter (HTTP) ---
app.get("/online.json", (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({ online: onlineCount() });
});

// ---- WebSocket Presence (/presence) ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/presence" });

// Heartbeat
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // aktuellen Count an neuen Client + Broadcast
  sendCount(ws);
  broadcastCount();

  ws.on("close", () => {
    broadcastCount();
  });
});

// Ping/Pong zum Aufräumen
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 10000);

process.on("SIGTERM", () => clearInterval(interval));
process.on("SIGINT", () => clearInterval(interval));

function onlineCount() {
  return [...wss.clients].filter((c) => c.readyState === WebSocket.OPEN).length;
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

// ---- Start ----
const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Presence server on http://0.0.0.0:${PORT}`);
  if (!process.env.GH_TOKEN) {
    console.warn("⚠️  GH_TOKEN fehlt – GitHub-Proxy wird 401/403 liefern.");
  }
});