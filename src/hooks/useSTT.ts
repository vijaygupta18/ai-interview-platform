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
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stoppedRef = useRef(false);
  const finalBufferRef = useRef("");
  const reconnectCountRef = useRef(0);

  const onInterimRef = useRef(onInterim);
  const onCompleteRef = useRef(onComplete);
  onInterimRef.current = onInterim;
  onCompleteRef.current = onComplete;

  // ─── Buffer + Trigger Logic ───────────────────────────────────────────

  const handleFinalText = useCallback((text: string) => {
    if (!text.trim()) return;
    finalBufferRef.current += (finalBufferRef.current ? " " : "") + text;

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

  // ─── Deepgram: single connection for entire session ──────────────────
  // Audio ALWAYS flows — echo prevention by ignoring results when AI speaks

  const startDeepgram = useCallback(async () => {
    if (!mediaStream.current) {
      console.error("[STT:deepgram] No media stream available");
      return false;
    }

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
        reconnectCountRef.current = 0;
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

        // KeepAlive every 3s — must be TEXT frame (binary corrupts Deepgram's audio stream)
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
          if (finalBufferRef.current.trim()) {
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
          handleFinalText(text);
          handleInterimText("");
          if (speechFinal && silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              const full = finalBufferRef.current.trim();
              if (!full) return;
              finalBufferRef.current = "";
              onCompleteRef.current(full);
            }, 1500);
          }
        } else if (!isFinal && text) {
          handleInterimText(text);
          if (text.trim()) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          }
        }
      };

      dgSocket.onerror = () => console.error("[STT:deepgram] WebSocket error");

      dgSocket.onclose = (e) => {
        console.log(`[STT:deepgram] Disconnected code=${e.code}`);
        setConnected(false);
        if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }

        if (!stoppedRef.current && !isEnding.current && reconnectCountRef.current < 5) {
          reconnectCountRef.current++;
          const delay = Math.min(2000 * reconnectCountRef.current, 10000);
          setTimeout(() => { if (!stoppedRef.current) startDeepgram(); }, delay);
        } else if (reconnectCountRef.current >= 5) {
          console.warn("[STT:deepgram] Max retries — falling back to browser");
          startBrowser();
        }
      };

      return true;
    } catch {
      return false;
    }
  }, [token, isAISpeaking, isEnding, handleFinalText, handleInterimText]);

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
    reconnectCountRef.current = 0;
    const first = providers[0] || "deepgram";
    console.log(`[STT] Starting with provider: ${first}`);
    if (first === "deepgram") startDeepgram();
    else startBrowser();
  }, [providers, startDeepgram, startBrowser]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (dgSocketRef.current?.readyState === WebSocket.OPEN) {
      try { dgSocketRef.current.send(JSON.stringify({ type: "CloseStream" })); } catch {}
      setTimeout(() => { try { dgSocketRef.current?.close(); } catch {} dgSocketRef.current = null; }, 500);
    } else {
      try { dgSocketRef.current?.close(); } catch {}
      dgSocketRef.current = null;
    }
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    if (mediaRecorderRef.current?.state !== "inactive") { try { mediaRecorderRef.current?.stop(); } catch {} }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setConnected(false);
    setActiveProvider(null);
  }, []);

  // ─── Health Monitor ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStarted) return;
    const monitor = setInterval(() => {
      if (stoppedRef.current || isEnding.current) return;
      if (activeProvider === "deepgram" && dgSocketRef.current?.readyState !== WebSocket.OPEN && !connected) {
        console.log("[STT] Health check — reconnecting...");
        startDeepgram();
      }
    }, 15000);
    return () => clearInterval(monitor);
  }, [isStarted, connected, activeProvider, isEnding, startDeepgram]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => { stoppedRef.current = true; stop(); };
  }, [stop]);

  return { connected, everConnected, provider: activeProvider, start, stop };
}
