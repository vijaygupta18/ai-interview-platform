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
  if (provider === "soniox") {
    const k = process.env.SONIOX_API_KEY || "";
    // Soniox auth is sent as first JSON message after WS connect, not in URL/headers
    return {
      provider: "soniox",
      wsUrl: "wss://stt-rt.soniox.com/transcribe-websocket",
      // Config sent on connect — language_hints uses ISO 639-1 (en, hi, etc.)
      initConfig: {
        api_key: k,
        model: "stt-rt-v4",
        audio_format: "auto", // auto-detects webm/opus from MediaRecorder
        num_channels: 1,
        language_hints: [language.split("-")[0]], // "en-IN" → "en"
        language_hints_strict: false,
        enable_endpoint_detection: true,
        max_endpoint_delay_ms: 4000, // matches our 4s silence preference
        enable_speaker_diarization: true,
      },
    };
  }
  if (provider === "sarvam") {
    const k = process.env.SARVAM_API_KEY || "";
    return { provider: "sarvam", wsUrl: `wss://api.sarvam.ai/speech-to-text-streaming/transcribe/ws?api_subscription_key=${k}&language_code=${language}&model=saaras:v3`, headers: { "Api-Subscription-Key": k } };
  }
  const k = process.env.DEEPGRAM_API_KEY || "";
  return { provider: "deepgram", wsUrl: `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&punctuate=true&interim_results=true&endpointing=800&vad_events=true&diarize=true&utterance_end_ms=4000`, protocols: ["token", k] };
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

  // ─── Soniox response normalizer ─────────────────────────────────────
  // Translates Soniox token-based responses to Deepgram-compatible format
  // so the client code doesn't need to know which provider is being used.
  function normalizeSoniox(raw) {
    try {
      const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (msg.error_code) {
        console.error(`[STT-WS:soniox] Error ${msg.error_code}: ${msg.error_message}`);
        return null;
      }
      if (!msg.tokens || msg.tokens.length === 0) return null;

      // Check for <end> token (utterance end signal)
      const hasEnd = msg.tokens.some(t => t.text === "<end>" && t.is_final);
      if (hasEnd) {
        return JSON.stringify({ type: "UtteranceEnd" });
      }

      // Build transcript from tokens (skip special tokens)
      const realTokens = msg.tokens.filter(t => !t.text.startsWith("<"));
      if (realTokens.length === 0) return null;

      const transcript = realTokens.map(t => t.text).join("");
      const isFinal = realTokens.every(t => t.is_final);
      const avgConfidence = realTokens.reduce((s, t) => s + (t.confidence || 0), 0) / realTokens.length;

      // Emit Deepgram-compatible Results format
      return JSON.stringify({
        type: "Results",
        is_final: isFinal,
        speech_final: isFinal && hasEnd,
        channel: {
          alternatives: [{
            transcript: transcript.trim(),
            confidence: avgConfidence,
            words: realTokens.map(t => ({
              word: t.text.trim(),
              start: (t.start_ms || 0) / 1000,
              end: (t.end_ms || 0) / 1000,
              confidence: t.confidence || 0,
              speaker: t.speaker !== undefined ? parseInt(t.speaker) : undefined,
            })).filter(w => w.word),
          }],
        },
      });
    } catch (e) {
      console.error("[STT-WS:soniox] Parse error:", e.message);
      return null;
    }
  }

  wss.on("connection", (clientWs) => {
    const cfg = getSTTConfig();
    console.log(`[STT-WS] Proxying to ${cfg.provider}`);

    let upstream;
    try {
      if (cfg.protocols) {
        upstream = new WebSocket(cfg.wsUrl, cfg.protocols);
      } else if (cfg.headers) {
        upstream = new WebSocket(cfg.wsUrl, { headers: cfg.headers });
      } else {
        // Soniox and others: plain WebSocket, auth in first message
        upstream = new WebSocket(cfg.wsUrl);
      }
    } catch (e) { clientWs.close(1011, "STT error"); return; }

    upstream.on("unexpected-response", (_, res) => {
      let b = ""; res.on("data", c => b += c);
      res.on("end", () => { console.error(`[STT-WS] Rejected: ${res.statusCode}`); clientWs.close(1011); });
    });

    const buf = []; let ready = false;
    upstream.on("open", () => {
      ready = true; console.log(`[STT-WS] Connected to ${cfg.provider}`);
      // Soniox: send config JSON as first message
      if (cfg.initConfig) {
        upstream.send(JSON.stringify(cfg.initConfig));
        console.log(`[STT-WS:soniox] Sent init config (model=${cfg.initConfig.model}, lang=${cfg.initConfig.language_hints})`);
      }
      if (buf.length) { buf.forEach(c => upstream.send(c.isBinary ? c.data : c.data.toString())); buf.length = 0; }
    });

    clientWs.on("message", (d, isBinary) => {
      if (ready && upstream.readyState === WebSocket.OPEN) {
        if (isBinary) {
          // Audio data — forward as-is
          upstream.send(d);
        } else {
          // Text frame from client (KeepAlive, CloseStream, etc.)
          const text = d.toString();
          if (cfg.provider === "soniox") {
            // Translate client keepalive/close to Soniox format
            try {
              const parsed = JSON.parse(text);
              if (parsed.type === "KeepAlive") {
                upstream.send(JSON.stringify({ type: "keepalive" }));
              } else if (parsed.type === "CloseStream") {
                upstream.send(""); // Soniox: empty string = end of audio
              } else {
                upstream.send(text);
              }
            } catch {
              upstream.send(text);
            }
          } else {
            upstream.send(text);
          }
        }
      } else if (buf.length < 20) {
        buf.push({ data: d, isBinary });
      }
    });

    upstream.on("message", (d, bin) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (cfg.provider === "soniox") {
        // Normalize Soniox tokens → Deepgram-compatible format
        const normalized = normalizeSoniox(bin ? d.toString() : d);
        if (normalized) clientWs.send(normalized);
      } else {
        clientWs.send(bin ? d : d.toString());
      }
    });

    const ping = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.ping();
        if (cfg.provider === "deepgram") upstream.send(JSON.stringify({ type: "KeepAlive" }));
        if (cfg.provider === "soniox") upstream.send(JSON.stringify({ type: "keepalive" }));
      }
    }, 5000);

    const cleanup = () => { clearInterval(ping); };
    clientWs.on("close", () => { cleanup(); if (upstream.readyState <= 1) upstream.terminate(); });
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
