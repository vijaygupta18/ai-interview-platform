// Wrapper: loads the standard Next.js standalone server.js + adds WebSocket STT proxy
// In dev mode: uses next() directly
// In production: monkey-patches http.createServer to capture the server, then loads server.js

const path = require("path");
const fs = require("fs");

// Load .env.local
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.substring(0, eq).trim();
    let v = t.substring(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const { parse } = require("url");
const { WebSocket, WebSocketServer } = require("ws");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform",
  max: 3,
});

function getSTTConfig() {
  const provider = process.env.STT_PROVIDER || "deepgram";
  const language = process.env.STT_LANGUAGE || "en-IN";
  if (provider === "sarvam") {
    const k = process.env.SARVAM_API_KEY || "";
    return { provider: "sarvam", wsUrl: `wss://api.sarvam.ai/speech-to-text-streaming/transcribe/ws?api_subscription_key=${k}&language_code=${language}&model=saaras:v3`, headers: { "Api-Subscription-Key": k } };
  }
  const k = process.env.DEEPGRAM_API_KEY || "";
  return { provider: "deepgram", wsUrl: `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&punctuate=true&interim_results=true&endpointing=800&vad_events=true&diarize=true&utterance_end_ms=3000`, protocols: ["token", k] };
}

function addWSProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);
    if (pathname !== "/api/stt-ws") return;

    if (!query.token) { socket.write("HTTP/1.1 401\r\n\r\n"); socket.destroy(); return; }
    try {
      const { rows } = await pool.query("SELECT id FROM interviews WHERE token=$1 AND status IN ('in_progress','waiting')", [query.token]);
      if (!rows.length) { socket.write("HTTP/1.1 403\r\n\r\n"); socket.destroy(); return; }
    } catch { socket.write("HTTP/1.1 500\r\n\r\n"); socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (clientWs) => {
    const cfg = getSTTConfig();
    console.log(`[STT-WS] Proxying to ${cfg.provider}`);

    let upstream;
    try {
      upstream = cfg.protocols ? new WebSocket(cfg.wsUrl, cfg.protocols) : new WebSocket(cfg.wsUrl, { headers: cfg.headers });
    } catch (e) { clientWs.close(1011, "STT error"); return; }

    upstream.on("unexpected-response", (_, res) => {
      let b = ""; res.on("data", c => b += c);
      res.on("end", () => { console.error(`[STT-WS] Rejected: ${res.statusCode}`); clientWs.close(1011); });
    });

    const buf = []; let ready = false;
    upstream.on("open", () => {
      ready = true; console.log(`[STT-WS] Connected to ${cfg.provider}`);
      if (buf.length) { buf.forEach(c => upstream.send(c.isBinary ? c.data : c.data.toString())); buf.length = 0; }
    });

    // #10: buffer text frames too (CloseStream could arrive before upstream ready)
    clientWs.on("message", (d, isBinary) => {
      if (ready && upstream.readyState === WebSocket.OPEN) {
        // CRITICAL: preserve text/binary framing — text (KeepAlive) as text, audio as binary
        upstream.send(isBinary ? d : d.toString());
      } else if (buf.length < 20) {
        buf.push({ data: d, isBinary });
      }
    });
    upstream.on("message", (d, bin) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(bin ? d : d.toString());
    });

    const ping = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.ping();
        if (cfg.provider === "deepgram") upstream.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 5000);

    const cleanup = () => { clearInterval(ping); };
    clientWs.on("close", () => { cleanup(); if (upstream.readyState <= 1) upstream.terminate(); });
    // #11: clear ping on upstream error too
    upstream.on("close", () => { cleanup(); if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); });
    clientWs.on("error", e => console.error("[STT-WS]", e.message));
    upstream.on("error", e => { cleanup(); console.error("[STT-WS]", e.message); if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011); });
  });

  const shutdown = () => { wss.clients.forEach(ws => ws.close(1001)); wss.close(); pool.end(); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log(`> STT WebSocket proxy active on /api/stt-ws (${getSTTConfig().provider})`);
}

// === START ===
if (process.env.NODE_ENV !== "production") {
  // DEV MODE
  const { createServer } = require("http");
  const next = require("next");
  const port = parseInt(process.env.PORT || "3000", 10);
  const app = next({ dev: true, hostname: "0.0.0.0", port });
  app.prepare().then(() => {
    const handle = app.getRequestHandler();
    const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
    addWSProxy(server);
    server.listen(port, "0.0.0.0", () => console.log(`> Ready on http://0.0.0.0:${port}`));
  });
} else {
  // PRODUCTION: intercept the HTTP server that startServer creates, then add WS proxy
  const http = require("http");
  const origCreate = http.createServer;
  http.createServer = function (...args) {
    const server = origCreate.apply(this, args);
    http.createServer = origCreate; // restore immediately
    // Add WS proxy once server starts listening
    const origListen = server.listen;
    server.listen = function (...listenArgs) {
      const result = origListen.apply(this, listenArgs);
      addWSProxy(server);
      return result;
    };
    return server;
  };
  // Now load the standard standalone server.js which calls startServer → http.createServer → listen
  require("./server.js");
}
