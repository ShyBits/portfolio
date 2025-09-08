import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" })); // ggf. auf deine Domain einschränken

// GraphQL proxy (heatmap)
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

// REST proxy (user events for tooltips)
app.get("/events/:login", async (req, res) => {
  const { login } = req.params;
  const { page = 1, per_page = 100 } = req.query;
  const r = await fetch(
    `https://api.github.com/users/${encodeURIComponent(login)}/events?page=${page}&per_page=${per_page}`,
    { headers: { Authorization: "Bearer " + process.env.GH_TOKEN } }
  );
  res.status(r.status).json(await r.json());
});

app.listen(3000, () => console.log("Proxy on http://localhost:3000"));