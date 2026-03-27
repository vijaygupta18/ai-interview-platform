"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTProviderName = "deepgram" | "browser";

interface UseSTTOptions {
  providers: STTProviderName[];        // fallback order
  interviewId: string;
  token: string;
  isAISpeaking: React.MutableRefObject<boolean>;  // gate: skip during AI speech
  isStarted: boolean;
  isEnding: React.MutableRefObject<boolean>;
  onInterim: (text: string) => void;   // candidate is speaking (live text)
  onComplete: (text: string) => void;  // silence detected — full buffered text, trigger AI
}

interface UseSTTReturn {
  connected: boolean;
  everConnected: boolean;
  provider: STTProviderName | null;
  start: () => void;
  stop: () => void;
}

export function useSTT(options: UseSTTOptions): UseSTTReturn {
  const { providers, interviewId, token, isAISpeaking, isStarted, isEnding, onInterim, onComplete } = options;

  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [activeProvider, setActiveProvider] = useState<STTProviderName | null>(null);

  const providerIdxRef = useRef(0);
  const dgSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const browserRecRef = useRef<any>(null);
  const reconnectCountRef = useRef(0);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stoppedRef = useRef(false); // prevents ghost restarts after stop()
  const finalBufferRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Store latest callbacks in refs (avoid stale closures)
  const onInterimRef = useRef(onInterim);
  const onCompleteRef = useRef(onComplete);
  onInterimRef.current = onInterim;
  onCompleteRef.current = onComplete;

  // ─── Buffer + Trigger Logic (shared by all providers) ───────────────────

  const handleFinalText = useCallback((text: string) => {
    if (!text.trim()) return;
    finalBufferRef.current += (finalBufferRef.current ? " " : "") + text;

    // Reset silence timer — wait 2s of idle then send to AI
    // (gives candidate time to pause and continue without being cut off)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const full = finalBufferRef.current.trim();
      if (!full) return;
      finalBufferRef.current = "";
      onCompleteRef.current(full);
    }, 1500);
  }, []);

  const handleInterimText = useCallback((text: string) => {
    onInterimRef.current(text);
  }, []);

  // ─── Deepgram Provider ──────────────────────────────────────────────────

  const startDeepgram = useCallback(async () => {
    // Get media stream
    if (!mediaStreamRef.current) {
      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return false;
      }
    }

    // Cleanup previous
    if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch {} }
    if (mediaRecorderRef.current?.state === "recording") { try { mediaRecorderRef.current.stop(); } catch {} }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/stt-ws?token=${token}`;

    try {
      const dgSocket = new WebSocket(wsUrl);
      dgSocketRef.current = dgSocket;

      dgSocket.onopen = () => {
        reconnectCountRef.current = 0;
        setConnected(true);
        setEverConnected(true);
        setActiveProvider("deepgram");
        console.log("[STT:deepgram] Connected");

        // Start MediaRecorder
        const audioTracks = mediaStreamRef.current!.getAudioTracks();
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

        // Keep-alive ping every 10s
        const keepAlive = setInterval(() => {
          if (dgSocket.readyState === WebSocket.OPEN) dgSocket.send(new Uint8Array(0));
          else clearInterval(keepAlive);
        }, 10000);
      };

      dgSocket.onmessage = async (msg) => {
        // Turn-based: skip during AI speech
        if (isAISpeaking.current) return;

        let raw: string;
        if (msg.data instanceof Blob) raw = await msg.data.text();
        else raw = msg.data;

        let data: any;
        try { data = JSON.parse(raw); } catch { return; }

        if (data.type !== "Results") return;
        const alt = data.channel?.alternatives?.[0];
        if (!alt) return;

        const text = alt.transcript || "";
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        if (isFinal && text) {
          handleFinalText(text);
          handleInterimText("");
          if (speechFinal && silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              const full = finalBufferRef.current.trim();
              if (!full) return;
              finalBufferRef.current = "";
              onCompleteRef.current(full);
            }, 1500); // Same 2s wait — consistent, gives candidate time to continue
          }
        } else if (!isFinal && text) {
          handleInterimText(text);
          if (text.trim()) {
            // Reset silence timer on interim too
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          }
        }
      };

      dgSocket.onerror = () => console.error("[STT:deepgram] Error");

      dgSocket.onclose = () => {
        console.log("[STT:deepgram] Disconnected");
        setConnected(false);
        // Auto-reconnect with backoff
        if (isStarted && !isEnding.current && reconnectCountRef.current < 5) {
          reconnectCountRef.current++;
          const delay = 2000 * reconnectCountRef.current;
          console.log(`[STT:deepgram] Reconnecting in ${delay}ms (${reconnectCountRef.current}/5)`);
          setTimeout(() => startDeepgram(), delay);
        } else if (reconnectCountRef.current >= 5) {
          // Max retries — try next provider
          console.warn("[STT:deepgram] Max retries, trying next provider");
          tryNextProvider();
        }
      };

      return true;
    } catch {
      return false;
    }
  }, [token, isAISpeaking, isStarted, isEnding, handleFinalText, handleInterimText]);

  // ─── Browser Speech API Provider ────────────────────────────────────────

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
        console.log("[STT:browser] Started");
        setConnected(true);
        setEverConnected(true);
        setActiveProvider("browser");
      };

      recognition.onresult = (event: any) => {
        // Turn-based: skip during AI speech
        if (isAISpeaking.current) return;

        const result = event.results[event.results.length - 1];
        const text = result[0].transcript;
        const isFinal = result.isFinal;

        if (!isFinal) {
          handleInterimText(text);
          return;
        }

        handleInterimText("");
        handleFinalText(text);
      };

      recognition.onerror = (event: any) => {
        console.warn("[STT:browser] Error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-available") {
          console.log("[STT:browser] Failed, trying next provider");
          tryNextProvider();
        }
      };

      recognition.onend = () => {
        console.log("[STT:browser] Ended");
        setConnected(false);
        // If stopped by echoGuard, don't restart — echoGuard handles it
        if (isStopped) return;
        // Natural end (browser timeout) — restart if interview active
        if (isStarted && !isEnding.current && !isAISpeaking.current) {
          setTimeout(() => {
            if (isAISpeaking.current || isStopped || stoppedRef.current) return;
            try {
              recognition.start();
              setConnected(true);
              console.log("[STT:browser] Auto-restarted");
            } catch {
              console.warn("[STT:browser] Restart failed, trying next provider");
              tryNextProvider();
            }
          }, 500);
        }
      };

      recognition.start();
      browserRecRef.current = recognition;

      // Manage start/stop when AI speaks/stops (prevents echo)
      let wasAISpeaking = false;
      let isStopped = false;
      let startFailCount = 0;
      const echoGuard = setInterval(() => {
        if (isAISpeaking.current && !isStopped) {
          isStopped = true;
          wasAISpeaking = true;
          try { recognition.abort(); } catch {}
          console.log("[STT:browser] Paused (AI speaking)");
        } else if (!isAISpeaking.current && wasAISpeaking && isStopped) {
          wasAISpeaking = false;
          setTimeout(() => {
            if (isAISpeaking.current || stoppedRef.current) return;
            try {
              recognition.start();
              isStopped = false;
              startFailCount = 0;
              setConnected(true);
              console.log("[STT:browser] Resumed");
            } catch {
              startFailCount++;
              console.warn(`[STT:browser] Resume failed (${startFailCount}/3)`);
              if (startFailCount >= 3) {
                console.error("[STT:browser] 3 failed resumes — falling back to Deepgram");
                clearInterval(echoGuard);
                tryNextProvider();
              }
            }
          }, 500);
        }
      }, 300);

      // Store cleanup ref
      const origStop = recognition.stop.bind(recognition);
      recognition._echoGuard = echoGuard;

      return true;
    } catch {
      return false;
    }
  }, [isAISpeaking, isStarted, isEnding, handleFinalText, handleInterimText]);

  // ─── Provider Manager ───────────────────────────────────────────────────

  const tryNextProvider = useCallback(() => {
    providerIdxRef.current++;
    if (providerIdxRef.current >= providers.length) {
      console.error("[STT] All providers failed");
      setConnected(false);
      setActiveProvider(null);
      return;
    }
    const next = providers[providerIdxRef.current];
    console.log(`[STT] Trying provider: ${next}`);
    if (next === "deepgram") startDeepgram();
    else if (next === "browser") startBrowser();
  }, [providers, startDeepgram, startBrowser]);

  const start = useCallback(() => {
    stoppedRef.current = false;
    providerIdxRef.current = 0;
    reconnectCountRef.current = 0;
    const first = providers[0];
    console.log(`[STT] Starting with provider: ${first}`);
    if (first === "deepgram") startDeepgram();
    else if (first === "browser") {
      const ok = startBrowser();
      if (!ok) tryNextProvider();
    }
  }, [providers, startDeepgram, startBrowser, tryNextProvider]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch {} dgSocketRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") { try { mediaRecorderRef.current.stop(); } catch {} }
    if (browserRecRef.current) {
      if (browserRecRef.current._echoGuard) clearInterval(browserRecRef.current._echoGuard);
      try { browserRecRef.current.stop(); } catch {}
      browserRecRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setConnected(false);
    setActiveProvider(null);
  }, []);

  // ─── Health Monitor ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStarted || isEnding.current) return;
    const monitor = setInterval(() => {
      if (!connected && !isAISpeaking.current && isStarted && !isEnding.current && activeProvider) {
        console.log("[STT] Health check — disconnected, reconnecting...");
        if (activeProvider === "deepgram") startDeepgram();
        else if (activeProvider === "browser") startBrowser();
      }
    }, 15000);
    return () => clearInterval(monitor);
  }, [isStarted, connected, activeProvider, isAISpeaking, isEnding, startDeepgram, startBrowser]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { connected, everConnected, provider: activeProvider, start, stop };
}
