"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTProviderName = "deepgram" | "browser";

interface UseSTTOptions {
  providers: STTProviderName[];
  interviewId: string;
  token: string;
  isAISpeaking: React.MutableRefObject<boolean>;
  isStarted: boolean;
  isEnding: React.MutableRefObject<boolean>;
  mediaStream: React.MutableRefObject<MediaStream | null>;
  onInterim: (text: string) => void;
  onComplete: (text: string) => void;
}

interface UseSTTReturn {
  connected: boolean;
  everConnected: boolean;
  provider: STTProviderName | null;
  start: () => void;
  stop: () => void;
}

export function useSTT(options: UseSTTOptions): UseSTTReturn {
  const { providers, interviewId, token, isAISpeaking, isStarted, isEnding, mediaStream, onInterim, onComplete } = options;

  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [activeProvider, setActiveProvider] = useState<STTProviderName | null>(null);

  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const browserRecRef = useRef<any>(null);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stoppedRef = useRef(false);
  const finalBufferRef = useRef("");
  const reconnectCountRef = useRef(0);
  const reconnectingRef = useRef(false); // #6: prevent health monitor racing with reconnect

  const onInterimRef = useRef(onInterim);
  const onCompleteRef = useRef(onComplete);
  onInterimRef.current = onInterim;
  onCompleteRef.current = onComplete;

  // ─── Buffer + Trigger Logic ───────────────────────────────────────────

  const clearBuffer = useCallback(() => {
    // #1, #20: clear buffer on stop/restart to prevent stale speech leaking
    finalBufferRef.current = "";
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const handleFinalText = useCallback((text: string, speechFinal = false) => {
    if (!text.trim() || stoppedRef.current) return;
    finalBufferRef.current += (finalBufferRef.current ? " " : "") + text;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    // 3s of silence before triggering AI response — gives candidates time to think
    const delay = 3000;
    silenceTimerRef.current = setTimeout(() => {
      if (stoppedRef.current || isEnding.current) return;
      const full = finalBufferRef.current.trim();
      if (!full) return;
      finalBufferRef.current = "";
      onCompleteRef.current(full);
    }, delay);
  }, [isEnding]);

  const handleInterimText = useCallback((text: string) => {
    onInterimRef.current(text);
  }, []);

  // ─── Deepgram: single connection for entire session ──────────────────

  const startDeepgram = useCallback(async () => {
    if (!mediaStream.current) {
      console.error("[STT:deepgram] No media stream available");
      return false;
    }
    if (stoppedRef.current) return false;

    // Cleanup previous
    if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch {} }
    if (mediaRecorderRef.current?.state === "recording") { try { mediaRecorderRef.current.stop(); } catch {} }
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/stt-ws?token=${token}`;

    try {
      const dgSocket = new WebSocket(wsUrl);
      dgSocketRef.current = dgSocket;

      dgSocket.onopen = () => {
        // #5: don't reset reconnectCount to 0 — let it only reset on explicit start()
        reconnectingRef.current = false;
        setConnected(true);
        setEverConnected(true);
        setActiveProvider("deepgram");
        console.log("[STT:deepgram] Connected");

        const audioTracks = mediaStream.current!.getAudioTracks();
        if (audioTracks.length === 0) return;
        const audioStream = new MediaStream(audioTracks);
        const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        const mimeType = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m));

        let recorder: MediaRecorder;
        try {
          recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
        } catch {
          recorder = new MediaRecorder(audioStream);
        }
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (dgSocket.readyState === WebSocket.OPEN && e.data.size > 0) dgSocket.send(e.data);
        };
        recorder.start(250);

        // KeepAlive every 3s — must be TEXT frame
        keepAliveRef.current = setInterval(() => {
          if (dgSocket.readyState === WebSocket.OPEN) {
            dgSocket.send(JSON.stringify({ type: "KeepAlive" }));
          } else {
            if (keepAliveRef.current) clearInterval(keepAliveRef.current);
          }
        }, 3000);
      };

      dgSocket.onmessage = async (msg) => {
        let raw: string;
        if (msg.data instanceof Blob) raw = await msg.data.text();
        else raw = msg.data;

        let data: any;
        try { data = JSON.parse(raw); } catch { return; }

        // Skip during AI speech (echo prevention)
        if (isAISpeaking.current) return;

        // UtteranceEnd — reliable turn-end signal
        if (data.type === "UtteranceEnd") {
          if (finalBufferRef.current.trim() && !stoppedRef.current) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            const full = finalBufferRef.current.trim();
            finalBufferRef.current = "";
            onCompleteRef.current(full);
          }
          return;
        }

        if (data.type !== "Results") return;
        const alt = data.channel?.alternatives?.[0];
        if (!alt) return;

        const text = alt.transcript || "";
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        if (isFinal && text) {
          handleFinalText(text, speechFinal);
          handleInterimText("");
        } else if (!isFinal && text) {
          handleInterimText(text);
          // #9: only cancel silence timer if we have interim speech (prevents indefinite delay)
          if (text.trim() && silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
        }
      };

      dgSocket.onerror = () => console.error("[STT:deepgram] WebSocket error");

      dgSocket.onclose = (e) => {
        console.log(`[STT:deepgram] Disconnected code=${e.code}`);
        setConnected(false);
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }

        // #5: check stoppedRef + reconnecting guard to prevent overlapping chains
        if (!stoppedRef.current && !isEnding.current && !reconnectingRef.current && reconnectCountRef.current < 5) {
          reconnectingRef.current = true;
          reconnectCountRef.current++;
          const delay = Math.min(2000 * reconnectCountRef.current, 10000);
          setTimeout(() => {
            reconnectingRef.current = false;
            if (!stoppedRef.current) startDeepgram();
          }, delay);
        } else if (reconnectCountRef.current >= 5) {
          // #8: startBrowser in deps
          console.warn("[STT:deepgram] Max retries — falling back to browser");
          startBrowser();
        }
      };

      return true;
    } catch {
      return false;
    }
  }, [token, isAISpeaking, isEnding, mediaStream, handleFinalText, handleInterimText, clearBuffer]);

  // ─── Browser Speech API (fallback only) ───────────────────────────────

  const startBrowser = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setConnected(true);
        setEverConnected(true);
        setActiveProvider("browser");
      };

      recognition.onresult = (event: any) => {
        if (isAISpeaking.current) return;
        const result = event.results[event.results.length - 1];
        const text = result[0].transcript;
        if (!result.isFinal) { handleInterimText(text); return; }
        handleInterimText("");
        handleFinalText(text);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "aborted") return;
        if (event.error === "not-allowed" || event.error === "service-not-available") {
          console.error("[STT:browser] Fatal:", event.error);
        }
      };

      recognition.onend = () => {
        setConnected(false);
        if (stoppedRef.current || isAISpeaking.current) return;
        setTimeout(() => {
          if (stoppedRef.current || isAISpeaking.current) return;
          try { recognition.start(); } catch {}
        }, 300);
      };

      recognition.start();
      browserRecRef.current = recognition; // #3: store ref for cleanup

      let wasAISpeaking = false;
      const echoGuard = setInterval(() => {
        if (stoppedRef.current) { clearInterval(echoGuard); return; }
        if (isAISpeaking.current && !wasAISpeaking) {
          wasAISpeaking = true;
          try { recognition.abort(); } catch {}
        } else if (!isAISpeaking.current && wasAISpeaking) {
          wasAISpeaking = false;
          setTimeout(() => {
            if (isAISpeaking.current || stoppedRef.current) return;
            try { recognition.start(); } catch {}
          }, 500);
        }
      }, 500);

      recognition._echoGuard = echoGuard;
      return true;
    } catch {
      return false;
    }
  }, [isAISpeaking, isEnding, handleFinalText, handleInterimText]);

  // ─── Public API ───────────────────────────────────────────────────────

  const start = useCallback(() => {
    stoppedRef.current = false;
    reconnectCountRef.current = 0; // #5: only reset here, not in onopen
    reconnectingRef.current = false;
    clearBuffer(); // #1: clear stale buffer on start
    const first = providers[0] || "deepgram";
    console.log(`[STT] Starting with provider: ${first}`);
    if (first === "deepgram") startDeepgram();
    else startBrowser();
  }, [providers, startDeepgram, startBrowser, clearBuffer]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearBuffer(); // #1, #2: clear buffer + cancel silence timer

    // Deepgram cleanup
    if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
      try { dgSocketRef.current.send(JSON.stringify({ type: "CloseStream" })); } catch {}
      setTimeout(() => { try { dgSocketRef.current?.close(); } catch {} dgSocketRef.current = null; }, 500);
    } else {
      try { dgSocketRef.current?.close(); } catch {}
      dgSocketRef.current = null;
    }
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    if (mediaRecorderRef.current?.state !== "inactive") { try { mediaRecorderRef.current?.stop(); } catch {} }

    // #3: Browser fallback cleanup
    if (browserRecRef.current) {
      if (browserRecRef.current._echoGuard) clearInterval(browserRecRef.current._echoGuard);
      try { browserRecRef.current.abort(); } catch {}
      browserRecRef.current = null;
    }

    setConnected(false);
    setActiveProvider(null);
  }, [clearBuffer]);

  // ─── Health Monitor ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStarted) return;
    const monitor = setInterval(() => {
      if (stoppedRef.current || isEnding.current) return;
      // #6: skip if reconnect is already in progress
      if (reconnectingRef.current) return;
      if (activeProvider === "deepgram" && dgSocketRef.current?.readyState !== WebSocket.OPEN && !connected) {
        console.log("[STT] Health check — reconnecting...");
        reconnectingRef.current = true;
        startDeepgram();
      }
    }, 15000);
    return () => clearInterval(monitor);
  }, [isStarted, connected, activeProvider, isEnding, startDeepgram]);

  // ─── beforeunload: graceful close ─────────────────────────────────────
  // #22: send CloseStream on tab close/navigate

  useEffect(() => {
    const handleUnload = () => {
      if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
        try { dgSocketRef.current.send(JSON.stringify({ type: "CloseStream" })); } catch {}
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => { stoppedRef.current = true; stop(); };
  }, [stop]);

  return { connected, everConnected, provider: activeProvider, start, stop };
}
