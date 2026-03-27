// Custom server wrapper that adds WebSocket proxy for STT
// In production (standalone), wraps the Next.js standalone handler
// In dev, uses next() directly

// Load .env.local before anything else
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const { createServer } = require("http");
const { parse } = require("url");
const { WebSocket, WebSocketServer } = require("ws");
const { Pool } = require("pg");

const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

// DB pool for token validation
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform",
  max: 3,
});

// STT provider config
function getSTTProviderConfig() {
  const provider = process.env.STT_PROVIDER || "deepgram";
  const language = process.env.STT_LANGUAGE || "en-IN";

  if (provider === "sarvam") {
    const apiKey = process.env.SARVAM_API_KEY || "";
    return {
      provider: "sarvam",
      wsUrl: `wss://api.sarvam.ai/speech-to-text-streaming/transcribe/ws?api_subscription_key=${apiKey}&language_code=${language}&model=saaras:v3`,
      headers: { "Api-Subscription-Key": apiKey },
      params: {},
    };
  }

  const apiKey = process.env.DEEPGRAM_API_KEY || "";
  return {
    provider: "deepgram",
    wsUrl: `wss://api.deepgram.com/v1/listen?model=nova-2&language=${language}&punctuate=true&interim_results=true&endpointing=800&vad_events=true`,
    protocols: ["token", apiKey],
    headers: {},
    params: {},
  };
}

// Setup WebSocket proxy on an HTTP server
function setupWSProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);

    if (pathname !== "/api/stt-ws") {
      socket.destroy();
      return;
    }

    const token = query.token;
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const { rows } = await pool.query(
        "SELECT id FROM interviews WHERE token = $1 AND status = 'in_progress'",
        [token]
      );
      if (rows.length === 0) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch (err) {
      console.error("[STT-WS] DB error:", err);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit("connection", clientWs, req);
    });
  });

  wss.on("connection", (clientWs) => {
    const config = getSTTProviderConfig();
    console.log(`[STT-WS] Client connected, proxying to ${config.provider}`);

    let upstreamWs;
    try {
      if (config.protocols) {
        upstreamWs = new WebSocket(config.wsUrl, config.protocols);
      } else {
        upstreamWs = new WebSocket(config.wsUrl, { headers: config.headers });
      }
    } catch (err) {
      console.error("[STT-WS] Failed to connect to upstream:", err);
      clientWs.close(1011, "Failed to connect to STT provider");
      return;
    }

    upstreamWs.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        console.error(`[STT-WS] Upstream rejected: ${res.statusCode} ${body.substring(0, 200)}`);
        clientWs.close(1011, "STT provider unavailable");
      });
    });

    // Buffer audio until upstream is ready
    const pendingAudio = [];
    let upstreamReady = false;

    upstreamWs.on("open", () => {
      upstreamReady = true;
      console.log(`[STT-WS] Connected to ${config.provider}`);
      if (pendingAudio.length > 0) {
        console.log(`[STT-WS] Flushing ${pendingAudio.length} buffered audio chunks`);
        for (const chunk of pendingAudio) upstreamWs.send(chunk);
        pendingAudio.length = 0;
      }
    });

    clientWs.on("message", (data) => {
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data);
      } else if (pendingAudio.length < 50) {
        pendingAudio.push(data);
      }
    });

    upstreamWs.on("message", (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(isBinary ? data : data.toString());
      }
    });

    // Keep-alive pings
    const pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) upstreamWs.ping();
    }, 25000);

    clientWs.on("close", () => {
      clearInterval(pingInterval);
      console.log("[STT-WS] Client disconnected");
      if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.terminate();
      }
    });

    upstreamWs.on("close", (code, reason) => {
      console.log(`[STT-WS] Upstream disconnected code=${code} reason=${reason?.toString()?.substring(0, 100)}`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on("error", (err) => console.error("[STT-WS] Client error:", err));
    upstreamWs.on("error", (err) => {
      console.error("[STT-WS] Upstream error:", err);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011, "STT provider error");
    });
  });

  // Graceful shutdown
  function shutdown() {
    console.log("[Server] Shutting down...");
    wss.clients.forEach((ws) => ws.close(1001, "Server shutting down"));
    wss.close();
    pool.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return wss;
}

// Start server
async function main() {
  let server;

  if (dev) {
    // Dev mode: use next() directly
    const next = require("next");
    const app = next({ dev, hostname, port });
    const handle = app.getRequestHandler();
    await app.prepare();

    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Error:", err);
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });
  } else {
    // Production: use the standalone Next.js server handler
    const nextServer = require("./server.js");
    // The standalone server.js sets up its own HTTP server
    // We need to intercept and add WS proxy before it starts listening
    // Approach: override the server creation
    const NextNodeServer = require("next/dist/server/next-server").default;
    const conf = require("./.next/required-server-files.json");

    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf.config);

    const nextApp = new NextNodeServer({
      hostname,
      port,
      dir: __dirname,
      dev: false,
      customServer: true,
      conf: conf.config,
    });

    const handler = nextApp.getRequestHandler();
    await nextApp.prepare();

    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        console.error("Error:", err);
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });
  }

  setupWSProxy(server);

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> STT WebSocket proxy on ws://${hostname}:${port}/api/stt-ws`);
    console.log(`> STT Provider: ${getSTTProviderConfig().provider}`);
    console.log(`> Mode: ${dev ? "development" : "production"}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
