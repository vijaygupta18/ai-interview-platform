"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTProviderName = "deepgram" | "browser";

interface UseSTTOptions {
  providers: STTProviderName[];        // fallback order
  interviewId: string;
  token: string;
  isAISpeaking: React.MutableRefObject<boolean>;  // gate: disconnect during AI speech
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
  const stoppedRef = useRef(false); // globally stopped (interview ended)
  const turnActiveRef = useRef(false); // true = candidate's turn, STT should be on
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

    // Reset silence timer — wait 1.5s of idle then send to AI
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

  // ─── Cleanup helpers ──────────────────────────────────────────────────

  const closeDeepgram = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    if (dgSocketRef.current) {
      try { dgSocketRef.current.close(); } catch {}
      dgSocketRef.current = null;
    }
    setConnected(false);
  }, []);

  const closeBrowser = useCallback(() => {
    if (browserRecRef.current) {
      if (browserRecRef.current._echoGuard) clearInterval(browserRecRef.current._echoGuard);
      try { browserRecRef.current.abort(); } catch {}
      browserRecRef.current = null;
    }
    setConnected(false);
  }, []);

  // ─── Deepgram Provider ──────────────────────────────────────────────────

  const startDeepgram = useCallback(async () => {
    // Get media stream (reuse across reconnects)
    if (!mediaStreamRef.current) {
      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return false;
      }
    }

    // Cleanup previous connection
    closeDeepgram();

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
      };

      dgSocket.onmessage = async (msg) => {
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
            }, 1500);
          }
        } else if (!isFinal && text) {
          handleInterimText(text);
          if (text.trim()) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          }
        }
      };

      dgSocket.onerror = (e) => console.error("[STT:deepgram] Error:", e);

      dgSocket.onclose = (e) => {
        console.log(`[STT:deepgram] Disconnected code=${e.code} reason=${e.reason}`);
        setConnected(false);
        // Only auto-reconnect if it's candidate's turn and not globally stopped
        if (turnActiveRef.current && !stoppedRef.current && !isEnding.current && reconnectCountRef.current < 5) {
          reconnectCountRef.current++;
          const delay = 2000 * reconnectCountRef.current;
          console.log(`[STT:deepgram] Reconnecting in ${delay}ms (${reconnectCountRef.current}/5)`);
          setTimeout(() => {
            if (turnActiveRef.current && !stoppedRef.current) startDeepgram();
          }, delay);
        } else if (reconnectCountRef.current >= 5) {
          console.warn("[STT:deepgram] Max retries, trying next provider");
          tryNextProvider();
        }
      };

      return true;
    } catch {
      return false;
    }
  }, [token, isEnding, handleFinalText, handleInterimText, closeDeepgram]);

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

      let isRunning = false;
      let lastInterimText = "";
      let startFailCount = 0;

      recognition.onstart = () => {
        isRunning = true;
        console.log("[STT:browser] Started");
        setConnected(true);
        setEverConnected(true);
        setActiveProvider("browser");
      };

      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1];
        const text = result[0].transcript;
        const isFinal = result.isFinal;

        if (!isFinal) {
          lastInterimText = text;
          handleInterimText(text);
          return;
        }

        lastInterimText = "";
        handleInterimText("");
        handleFinalText(text);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "aborted") return;
        console.warn("[STT:browser] Error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-available") {
          tryNextProvider();
        }
      };

      recognition.onend = () => {
        isRunning = false;
        setConnected(false);
        if (stoppedRef.current || !turnActiveRef.current) return;

        // Flush pending interim on browser timeout (~60s)
        if (lastInterimText.trim()) {
          console.log("[STT:browser] Flushing interim on timeout");
          handleFinalText(lastInterimText);
          handleInterimText("");
          lastInterimText = "";
        }

        // Auto-restart if still candidate's turn AND AI is not speaking
        if (turnActiveRef.current && !stoppedRef.current && !isEnding.current && !isAISpeaking.current) {
          setTimeout(() => {
            if (!turnActiveRef.current || stoppedRef.current || isRunning || isAISpeaking.current) return;
            try {
              recognition.start();
              console.log("[STT:browser] Auto-restarted");
            } catch {
              startFailCount++;
              if (startFailCount >= 3) tryNextProvider();
            }
          }, 300);
        }
      };

      recognition.start();
      browserRecRef.current = recognition;
      return true;
    } catch {
      return false;
    }
  }, [isEnding, handleFinalText, handleInterimText]);

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

  // ─── Turn Management (connect on candidate turn, disconnect on AI turn) ─

  const connectProvider = useCallback(() => {
    providerIdxRef.current = 0;
    reconnectCountRef.current = 0;
    const first = providers[0];
    console.log(`[STT] Connecting provider: ${first}`);
    if (first === "deepgram") startDeepgram();
    else if (first === "browser") {
      const ok = startBrowser();
      if (!ok) tryNextProvider();
    }
  }, [providers, startDeepgram, startBrowser, tryNextProvider]);

  const startTurn = useCallback(() => {
    console.log(`[STT] startTurn called — aiSpeaking=${isAISpeaking.current}`);
    stoppedRef.current = false; // reset — we're explicitly being told to start
    turnActiveRef.current = true;
    // If AI is still speaking, don't connect yet — turn watcher will connect when AI stops
    if (isAISpeaking.current) {
      console.log("[STT] Marked ready — will connect when AI stops speaking");
      return;
    }
    connectProvider();
  }, [isAISpeaking, connectProvider]);

  // Temporarily disconnect STT during AI speech — turnActive stays true
  const pauseSTT = useCallback(() => {
    closeDeepgram();
    closeBrowser();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, [closeDeepgram, closeBrowser]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    turnActiveRef.current = false;
    closeDeepgram();
    closeBrowser();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setActiveProvider(null);
  }, [closeDeepgram, closeBrowser]);

  // ─── Auto turn management: watch isAISpeaking ─────────────────────────
  // When AI starts speaking → end candidate turn (disconnect STT)
  // When AI stops speaking → start candidate turn (connect STT)

  const wasAISpeakingRef = useRef(false);

  useEffect(() => {
    if (!isStarted || stoppedRef.current) return;
    const turnWatcher = setInterval(() => {
      const aiSpeaking = isAISpeaking.current;
      if (aiSpeaking && !wasAISpeakingRef.current) {
        // AI started speaking — disconnect STT (but keep turn active)
        wasAISpeakingRef.current = true;
        console.log("[STT] AI speaking — pausing STT");
        pauseSTT();
      } else if (!aiSpeaking && wasAISpeakingRef.current) {
        // AI stopped speaking — reconnect STT if turn is active
        wasAISpeakingRef.current = false;
        if (turnActiveRef.current && !stoppedRef.current && !isEnding.current) {
          console.log("[STT] AI done — connecting STT for candidate turn");
          // Small delay to ensure audio is fully done
          setTimeout(() => {
            if (!isAISpeaking.current && !stoppedRef.current && turnActiveRef.current) connectProvider();
          }, 500);
        }
      }
    }, 300);
    return () => clearInterval(turnWatcher);
  }, [isStarted, isAISpeaking, isEnding, connectProvider, pauseSTT]);

  // ─── Health Monitor ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isStarted || isEnding.current) return;
    const monitor = setInterval(() => {
      if (!connected && turnActiveRef.current && !isAISpeaking.current && !stoppedRef.current) {
        console.log("[STT] Health check — disconnected during candidate turn, reconnecting...");
        const provider = providers[providerIdxRef.current] || providers[0];
        if (provider === "deepgram") startDeepgram();
        else if (provider === "browser") startBrowser();
      }
    }, 15000);
    return () => clearInterval(monitor);
  }, [isStarted, connected, isAISpeaking, isEnding, providers, startDeepgram, startBrowser]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { connected, everConnected, provider: activeProvider, start: startTurn, stop };
}
