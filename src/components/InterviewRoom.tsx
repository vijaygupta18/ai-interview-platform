"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSTT } from "@/hooks/useSTT";
import { AudioRecorder } from "./AudioRecorder";
import { ScreenShare } from "./ScreenShare";
import Proctoring from "./Proctoring";

interface TranscriptEntry {
  role: "ai" | "candidate";
  text: string;
  timestamp: number;
}

interface InterviewData {
  id: string;
  title: string;
  role: string;
  level: string;
  focusAreas: string[];
  candidateName: string;
  duration: number; // in minutes
  startedAt?: string;
}

interface ProctoringAlert {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

// Pipe ALL console logs to server (for local testing/debugging)
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  const _origLog = console.log;
  const _origWarn = console.warn;
  const _origError = console.error;
  const _send = (level: string, args: any[]) => {
    fetch("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") }),
    }).catch(() => {});
  };
  console.log = (...args) => { _origLog(...args); _send("info", args); };
  console.warn = (...args) => { _origWarn(...args); _send("warn", args); };
  console.error = (...args) => { _origError(...args); _send("error", args); };
}

// Send critical frontend logs to server for debugging
function serverLog(level: "info" | "warn" | "error", message: string, interviewId?: string, data?: any) {
  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, message, interviewId, data }),
  }).catch(() => {});
}

// Format AI text: render tables, lists, and line breaks nicely
function formatAIText(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let listItems: string[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    elements.push(
      <table key={`t${elements.length}`} className="my-2 text-xs border-collapse w-full">
        <tbody>
          {tableRows.map((cells, r) => (
            <tr key={r} className={r === 0 ? "font-semibold text-blue-200" : ""}>
              {cells.map((cell, c) => (
                <td key={c} className="border border-white/10 px-2 py-1 text-blue-100/80">{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
    tableRows = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`l${elements.length}`} className="my-1.5 ml-4 space-y-0.5">
        {listItems.map((item, j) => (
          <li key={j} className="text-blue-100/90 list-disc">{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushTable(); flushList();
      elements.push(<br key={`br${elements.length}`} />);
      continue;
    }
    // Table row: contains | separators
    if (trimmed.includes("|") && trimmed.split("|").length >= 3) {
      flushList();
      const cells = trimmed.split("|").map(c => c.trim()).filter(c => c && !c.match(/^[-:]+$/));
      if (cells.length > 0) tableRows.push(cells);
      continue;
    }
    // List item: starts with - or •
    if (trimmed.match(/^[-•]\s/)) {
      flushTable();
      listItems.push(trimmed.replace(/^[-•]\s*/, ""));
      continue;
    }
    // Regular text
    flushTable(); flushList();
    elements.push(<p key={`p${elements.length}`} className="whitespace-pre-line">{trimmed}</p>);
  }
  flushTable(); flushList();
  return <>{elements}</>;
}

export function InterviewRoom({ interviewId }: { interviewId: string }) {
  // Core state
  const [interviewData, setInterviewData] = useState<InterviewData | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentCheck1, setConsentCheck1] = useState(false);
  const [consentCheck2, setConsentCheck2] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [timeWarningShown, setTimeWarningShown] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [proctoringAlerts, setProctoringAlerts] = useState<ProctoringAlert[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [currentAIText, _setCurrentAIText] = useState("");
  const setCurrentAIText = (text: string) => { _setCurrentAIText(text); currentAITextRef.current = text; };
  const [interimTranscript, setInterimTranscript] = useState("");
  const [proctoringWarnings, setProctoringWarnings] = useState(0);
  const [showProctoringBan, setShowProctoringBan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsFullscreenClick, setNeedsFullscreenClick] = useState(false);
  const [fullscreenCountdown, setFullscreenCountdown] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const [expired, setExpired] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [aiError, setAiError] = useState(false);
  const lastTranscriptRef = useRef<TranscriptEntry[]>([]);

  // Runtime config from /api/config — avoids NEXT_PUBLIC_* build-time baking
  // Default must be HIGH to avoid false terminations before config loads
  const [runtimeConfig, setRuntimeConfig] = useState({
    maxProctoringStrikes: 999,
    sttProviders: ["deepgram", "browser"] as ("deepgram" | "browser")[],
    sttBackend: "deepgram",
    silenceDelayMs: 4000,
  });
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(cfg => {
      setRuntimeConfig(prev => ({ ...prev, ...cfg }));
      console.log(`[Config] STT=${cfg.sttBackend} strikes=${cfg.maxProctoringStrikes} silence=${cfg.silenceDelayMs}ms env=${cfg.environment}`);
    }).catch(() => {});
  }, []);

  // Pre-interview checks
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const audioLevelRef = useRef(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && mediaStreamRef.current) {
      node.srcObject = mediaStreamRef.current;
    }
  }, []);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isEndingRef = useRef(false);
  const isAISpeakingRef = useRef(false);
  const currentAITextRef = useRef("");
  const speakTextRef = useRef<(text: string) => Promise<void>>();
  const needsResumeRef = useRef(false);
  const tokenRef = useRef("");
  const generationRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader | null>(null);

  const supportsFullscreen = typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";

  // If browser doesn't support fullscreen, skip the prompt
  useEffect(() => {
    if (needsFullscreenClick && !supportsFullscreen) {
      setNeedsFullscreenClick(false);
      setFullscreenCountdown(0);
    }
  }, [needsFullscreenClick, supportsFullscreen]);

  // Multi-tab protection — prevent same interview in multiple tabs
  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(`interview-${interviewId}`);
      channel.postMessage({ type: "tab-open", timestamp: Date.now() });
      channel.onmessage = (e) => {
        if (e.data.type === "tab-open") {
          window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
        }
      };
      return () => channel.close();
    } else {
      // localStorage fallback for Safari < 15.4
      const key = `interview-active-${interviewId}`;
      const existing = localStorage.getItem(key);
      if (existing && Date.now() - parseInt(existing) < 30000) {
        window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
        return;
      }
      localStorage.setItem(key, String(Date.now()));
      const interval = setInterval(() => localStorage.setItem(key, String(Date.now())), 10000);
      return () => { clearInterval(interval); localStorage.removeItem(key); };
    }
  }, [interviewId]);

  // Fetch interview data on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    tokenRef.current = searchParams.get("token") || "";
    async function init() {
      try {
        const tokenParam = tokenRef.current ? `?token=${tokenRef.current}` : "";
        const interviewRes = await fetch(`/api/interview/${interviewId}${tokenParam}`);
        const interview = await interviewRes.json();
        // Check if interview link has expired
        if (interview.expired || (interview.expiresAt && new Date(interview.expiresAt) < new Date())) {
          setExpired(true);
          setIsLoading(false);
          return;
        }
        // Redirect to review if interview is already completed
        if (interview.status === "completed") {
          window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
          return;
        }
        setInterviewData(interview);

        // Resume interview if already started (in_progress OR has startedAt)
        const hasStarted = interview.status === "in_progress" || interview.startedAt || (interview.transcript?.length > 0);
        if (hasStarted && interview.status !== "completed") {
          const totalSeconds = (interview.duration || 30) * 60;
          let remaining = totalSeconds;
          if (interview.startedAt) {
            const startTime = new Date(interview.startedAt).getTime();
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            remaining = Math.max(0, totalSeconds - elapsed);
          }

          if (remaining === 0) {
            // Time expired — mark completed only if still in_progress
            if (interview.status === "in_progress") {
              fetch(`/api/interview/${interviewId}/end`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: tokenRef.current }),
              }).catch(() => {});
            }
            window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
            return;
          }

          // Restore transcript from DB
          if (interview.transcript?.length > 0) {
            setTranscript(
              interview.transcript.map((t: any) => ({
                role: t.role,
                text: t.text || t.content || "",
                timestamp: new Date(t.timestamp).getTime(),
              }))
            );
          }

          // Fetch server-side violation count + config for resume
          try {
            const [violationRes, cfgRes] = await Promise.all([
              fetch(`/api/interview/${interviewId}/violations${tokenParam}`),
              fetch("/api/config").then(r => r.json()).catch(() => null),
            ]);
            const maxStrikes = cfgRes?.maxProctoringStrikes || 25;
            if (violationRes.ok) {
              const { count } = await violationRes.json();
              // Apply time-based decay: subtract 0.5 for every 5 minutes since interview started
              const startTime = new Date(interview.startedAt).getTime();
              const elapsedMinutes = (Date.now() - startTime) / 60000;
              const decayAmount = Math.floor(elapsedMinutes / 5) * 0.5;
              const adjustedCount = Math.max(0, count - decayAmount);
              setProctoringWarnings(adjustedCount);
              if (count >= maxStrikes) setShowProctoringBan(true);
            }
          } catch (err) {
            console.error("Failed to fetch violation count:", err);
          }

          setRemainingSeconds(remaining);
          setConsentGiven(true);
          setIsStarted(true);
          needsResumeRef.current = true;

          // Browser blocks auto-fullscreen without user gesture — show mandatory prompt
          if (!document.fullscreenElement && supportsFullscreen) {
            setNeedsFullscreenClick(true);
          }

        }
      } catch (err) {
        console.error("Failed to initialize:", err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [interviewId]);

  // Setup camera + mic preview (only after consent)
  useEffect(() => {
    if (!consentGiven) return;
    async function setupMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: true,
        });
        mediaStreamRef.current = stream;
        setMediaStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
        setMicReady(true);

        // If resuming, start STT now that media is ready
        if (needsResumeRef.current) {
          needsResumeRef.current = false;
          console.log("[Interview] Media ready — resuming STT...");
          // Small delay to ensure everything is wired up
          setTimeout(() => stt.start(), 500);
        }

        // Audio level monitoring
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          audioLevelRef.current = avg / 255;
          // Directly update DOM element for the level bars
          const levelEl = document.getElementById("mic-level-bars");
          if (levelEl) {
            const bars = levelEl.children;
            for (let i = 0; i < bars.length; i++) {
              const threshold = (i + 1) / bars.length;
              (bars[i] as HTMLElement).style.opacity = audioLevelRef.current > threshold ? "1" : "0.2";
            }
          }
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.error("Media setup failed:", err);
      }
    }
    setupMedia();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, [consentGiven]);

  // Countdown timer
  useEffect(() => {
    if (isStarted && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds((s) => {
          if (s <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      // Resync timer every 60s from server startedAt to prevent drift
      const resync = setInterval(() => {
        if (interviewData?.startedAt) {
          const totalSeconds = (interviewData.duration || 30) * 60;
          const elapsed = Math.floor((Date.now() - new Date(interviewData.startedAt).getTime()) / 1000);
          const serverRemaining = Math.max(0, totalSeconds - elapsed);
          setRemainingSeconds(serverRemaining);
        }
      }, 60000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        clearInterval(resync);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, remainingSeconds > 0, interviewData]);

  // Proctoring heartbeat — server detects if proctoring is silently disabled
  useEffect(() => {
    if (!isStarted) return;
    const sendHeartbeat = () => {
      fetch("/api/proctor-heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, token: tokenRef.current }),
      }).catch(() => {});
    };
    sendHeartbeat(); // Send immediately on start
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [isStarted, interviewId]);

  // Time warning at 60s
  useEffect(() => {
    if (isStarted && remainingSeconds === 60 && !timeWarningShown) {
      setTimeWarningShown(true);
      setProctoringAlerts((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "time_warning",
          message: "1 minute remaining",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isStarted, remainingSeconds, timeWarningShown]);

  // Auto-end when timer hits 0
  useEffect(() => {
    if (!isStarted || remainingSeconds !== 0 || isEndingRef.current) return;
    isEndingRef.current = true;

    async function autoEnd() {
      // Cancel any active AI pipeline
      if (activeAbortRef.current) { activeAbortRef.current.abort(); activeAbortRef.current = null; }
      if (activeReaderRef.current) { try { activeReaderRef.current.cancel(); } catch {} activeReaderRef.current = null; }
      isProcessingRef.current = false;

      if (currentAudioRef.current) {
        const audioUrl = currentAudioRef.current.src;
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
        if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
      }

      // Stop STT/recording first so no new speech comes in
      stt.stop();

      // Send time-up note to AI for a goodbye message
      try {
        const res = await fetch("/api/ai-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            transcript,
            token: tokenRef.current,
            systemNote: "Time is up. Please wrap up and say goodbye to the candidate.",
          }),
        });
        const { text } = await res.json();
        const aiEntry: TranscriptEntry = { role: "ai", text, timestamp: Date.now() };
        setTranscript((prev) => [...prev, aiEntry]);
        if (speakTextRef.current) await speakTextRef.current(text);
      } catch (err) {
        console.error("Auto-end AI response failed:", err);
      }

      // Stop camera/mic
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

      // End interview + auto-score in background on server
      fetch(`/api/interview/${interviewId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current }),
      }).catch(console.error);

      // Redirect to completion page
      window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
    }

    autoEnd();
  }, [isStarted, remainingSeconds, interviewId, transcript]);

  // Scroll tracking — show "Go to bottom" button when not at bottom
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBottom(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBottom(false);
  }, []);

  // Check if we should show "new messages" when transcript updates
  useEffect(() => {
    handleTranscriptScroll();
  }, [transcript, interimTranscript, handleTranscriptScroll]);

  // Dismiss proctoring alerts after 5s
  useEffect(() => {
    if (proctoringAlerts.length === 0) return;
    const timeout = setTimeout(() => {
      setProctoringAlerts((prev) => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timeout);
  }, [proctoringAlerts]);

  const lastActivityRef = useRef(Date.now());

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Combined AI + TTS: one request, returns audio with text in header
  const speakText = useCallback(async (text: string) => {
    setIsAISpeaking(true);
    isAISpeakingRef.current = true;
    setCurrentAIText(text);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!data.audio) throw new Error("No audio in TTS response");
      const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: data.contentType || "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          setIsAISpeaking(false);
          isAISpeakingRef.current = false;
          setCurrentAIText("");
          currentAudioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = (e) => {
          setIsAISpeaking(false);
          isAISpeakingRef.current = false;
          setCurrentAIText("");
          URL.revokeObjectURL(audioUrl);
          reject(e);
        };
        audio.play().catch(reject);
      });
    } catch (err) {
      console.error("TTS failed:", err);
      setIsAISpeaking(false);
      isAISpeakingRef.current = false;
      setCurrentAIText("");
    }
  }, []);
  speakTextRef.current = speakText;

  const getAIResponse = useCallback(
    async (currentTranscript: TranscriptEntry[], options?: { skipSave?: boolean }) => {
      if (isProcessingRef.current) {
        console.warn("[AI] Already processing, skipping");
        return;
      }
      if (isEndingRef.current) return;
      isProcessingRef.current = true;
      setIsAIThinking(true);
      setAiError(false);
      lastTranscriptRef.current = currentTranscript;
      const thisGeneration = ++generationRef.current;

      // Abort any previous in-flight request
      if (activeAbortRef.current) { activeAbortRef.current.abort(); }
      const abortController = new AbortController();
      activeAbortRef.current = abortController;

      // Safety timeout — if AI call hangs for >30s, force-reset
      const safetyTimeout = setTimeout(() => {
        if (isProcessingRef.current && generationRef.current === thisGeneration) {
          console.error("[AI] Safety timeout — force resetting after 30s");
          serverLog("error", "AI safety timeout — force reset after 90s", interviewId);
          abortController.abort();
          isProcessingRef.current = false;
          setIsAIThinking(false);
          setIsAISpeaking(false);
          isAISpeakingRef.current = false;
        }
      }, 90000); // 90s — server retries AI call (35s × 2) + TTS + playback

      try {
        // Streaming AI + TTS pipeline
        const res = await fetch("/api/ai-speak-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId, transcript: currentTranscript, token: tokenRef.current, skipSave: options?.skipSave }),
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          // Fallback to non-streaming
          const fallbackRes = await fetch("/api/ai-speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interviewId, transcript: currentTranscript, token: tokenRef.current, skipSave: options?.skipSave }),
          });
          const data = await fallbackRes.json();
          if (data.text) {
            setTranscript((prev) => [...prev, { role: "ai", text: data.text, timestamp: Date.now() }]);
            if (data.audio) {
              const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
              const audioBlob = new Blob([audioBytes], { type: data.contentType || "audio/mpeg" });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              currentAudioRef.current = audio;
              setIsAISpeaking(true); isAISpeakingRef.current = true; setCurrentAIText(data.text);
              await new Promise<void>((resolve) => {
                audio.onended = () => { setIsAISpeaking(false); isAISpeakingRef.current = false; setCurrentAIText(""); URL.revokeObjectURL(audioUrl); resolve(); };
                audio.onerror = () => { setIsAISpeaking(false); isAISpeakingRef.current = false; URL.revokeObjectURL(audioUrl); resolve(); };
                audio.play().catch(() => resolve());
              });
            }
          }
          return;
        }

        // Parse SSE stream — play audio chunks in order
        const reader = res.body.getReader();
        activeReaderRef.current = reader;
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let fullText = "";
        const audioMap = new Map<number, { audio: string; contentType: string }>();
        const skippedIdxs = new Set<number>();
        let nextPlayIdx = 0;
        let isPlaying = false;
        let transcriptAdded = false;
        let streamDone = false;

        const playNext = async () => {
          // Skip over failed TTS chunks
          while (skippedIdxs.has(nextPlayIdx)) { skippedIdxs.delete(nextPlayIdx); nextPlayIdx++; }
          if (isPlaying || !audioMap.has(nextPlayIdx)) return;
          isPlaying = true;
          const chunk = audioMap.get(nextPlayIdx)!;
          audioMap.delete(nextPlayIdx);
          nextPlayIdx++;
          try {
            const audioBytes = Uint8Array.from(atob(chunk.audio), (c) => c.charCodeAt(0));
            const audioBlob = new Blob([audioBytes], { type: chunk.contentType || "audio/mpeg" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            if (!isAISpeakingRef.current) { setIsAISpeaking(true); isAISpeakingRef.current = true; setIsAIThinking(false); }
            await new Promise<void>((resolve) => {
              audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
              audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
              audio.play().catch(() => resolve());
            });
          } catch {}
          isPlaying = false;
          if (audioMap.has(nextPlayIdx)) playNext();
          else if (streamDone && audioMap.size === 0) {
            setIsAISpeaking(false); isAISpeakingRef.current = false; setCurrentAIText(""); currentAudioRef.current = null;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text") {
                fullText += (fullText ? " " : "") + data.text;
                setCurrentAIText(fullText);
                if (!transcriptAdded) { transcriptAdded = true; setTranscript((prev) => [...prev, { role: "ai", text: data.text, timestamp: Date.now() }]); }
                else { setTranscript((prev) => { const u = [...prev]; if (u.length > 0 && u[u.length-1].role === "ai") u[u.length-1] = { ...u[u.length-1], text: fullText }; return u; }); }
              }
              if (data.type === "audio") { audioMap.set(data.idx, { audio: data.audio, contentType: data.contentType }); playNext(); }
              if (data.type === "audio_skip") { skippedIdxs.add(data.idx); playNext(); }
              if (data.error) { console.error("[AI] Server error:", data.error); serverLog("error", `SSE error: ${data.error}`, interviewId); setAiError(true); }
              if (data.type === "done") {
                if (data.fullText) { setTranscript((prev) => { const u = [...prev]; if (u.length > 0 && u[u.length-1].role === "ai") u[u.length-1] = { ...u[u.length-1], text: data.fullText }; return u; }); }
                // AI decided to end the interview — redirect after TTS finishes
                if (data.endInterview) {
                  streamDone = true;
                  let waitCount = 0;
                  const waitForAudio = async () => {
                    while ((audioMap.size > 0 || isPlaying) && waitCount < 200) { await new Promise((r) => setTimeout(r, 100)); waitCount++; }
                    // Wait 5s after speech ends so candidate can read/absorb
                    await new Promise((r) => setTimeout(r, 5000));
                    stt.stop();
                    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
                    window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
                  };
                  waitForAudio();
                }
              }
            } catch {}
          }
        }

        streamDone = true;
        let waitCount = 0;
        while ((audioMap.size > 0 || isPlaying) && waitCount < 200) { await new Promise((r) => setTimeout(r, 100)); waitCount++; }
        setIsAISpeaking(false); isAISpeakingRef.current = false; setCurrentAIText("");
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          console.log("[AI] Request aborted (superseded or ended)");
        } else {
          console.error("[AI] Response failed:", err);
          serverLog("error", "AI response failed", interviewId, { error: String(err) });
          setAiError(true);
        }
        setIsAISpeaking(false);
        isAISpeakingRef.current = false;
        setCurrentAIText("");
      } finally {
        clearTimeout(safetyTimeout);
        activeReaderRef.current = null;
        if (activeAbortRef.current === abortController) activeAbortRef.current = null;
        if (generationRef.current === thisGeneration) {
          isProcessingRef.current = false;
          setIsAIThinking(false);
        }
      }
    },
    [interviewId, speakText]
  );

  // Send a typed chat message — routes through the same pipeline as STT
  const sendChatMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    if (isProcessingRef.current || isAIThinking) return; // allow typing while AI speaks
    setChatInput("");
    setInterimTranscript("");
    lastActivityRef.current = Date.now();
    const entry: TranscriptEntry = { role: "candidate", text, timestamp: Date.now() };
    setTranscript((prev) => {
      const updated = [...prev, entry];
      getAIResponse(updated);
      return updated;
    });
  }, [chatInput, isAIThinking, getAIResponse]);

  // Silence watchdog — if no activity for 45s AND no interim speech, nudge AI
  useEffect(() => { lastActivityRef.current = Date.now(); }, [transcript]);
  // Also reset on interim speech (candidate is actively talking)
  useEffect(() => { if (interimTranscript) lastActivityRef.current = Date.now(); }, [interimTranscript]);
  useEffect(() => {
    if (!isStarted || isEndingRef.current) return;
    const watchdog = setInterval(() => {
      const silenceSec = (Date.now() - lastActivityRef.current) / 1000;
      // Only nudge if: 45s silence AND no interim speech AND AI not speaking AND not processing
      if (!micEnabled) return; // Don't nudge when deliberately muted
      if (silenceSec > 45 && !interimTranscript && !isProcessingRef.current && !isAISpeakingRef.current) {
        console.log("[Watchdog] 45s silence, nudging AI...");
        getAIResponse([...transcript, { role: "candidate", text: "(candidate is waiting)", timestamp: Date.now() }], { skipSave: true });
        lastActivityRef.current = Date.now();
      }
    }, 10000);
    return () => clearInterval(watchdog);
  }, [isStarted, isAISpeaking, interimTranscript, micEnabled, getAIResponse, transcript]);

  // ─── STT Hook ──────────────────────────────────────────────────────────────
  const stt = useSTT({
    providers: runtimeConfig.sttProviders,
    interviewId,
    token: tokenRef.current,
    isAISpeaking: isAISpeakingRef,
    isStarted,
    isEnding: isEndingRef,
    mediaStream: mediaStreamRef,
    silenceDelayMs: runtimeConfig.silenceDelayMs,
    onInterim: (text) => {
      setInterimTranscript(text);
      if (text.trim()) lastActivityRef.current = Date.now();
    },
    onComplete: (candidateText) => {
      setInterimTranscript("");
      lastActivityRef.current = Date.now();
      const entry: TranscriptEntry = { role: "candidate", text: candidateText, timestamp: Date.now() };
      setTranscript((prev) => {
        const updated = [...prev, entry];
        getAIResponse(updated);
        return updated;
      });
    },
    onInterrupt: () => {
      // Candidate spoke during AI speech — stop audio, text stays on screen
      if (currentAudioRef.current) {
        const src = currentAudioRef.current.src;
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
        if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
      }
      setIsAISpeaking(false);
      isAISpeakingRef.current = false;
      console.log("[STT] Candidate interrupted AI — stopped TTS");
    },
  });

  const handleStartInterview = useCallback(async () => {
    // Request fullscreen
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn("Fullscreen request denied:", err);
    }

    // Initialize countdown from interview duration (default 30 min)
    const durationMinutes = interviewData?.duration || 30;
    setRemainingSeconds(durationMinutes * 60);
    setIsStarted(true);

    // Mark interview as in_progress
    try {
      await fetch(`/api/interview/${interviewId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current }),
      });
    } catch (err) {
      console.error("Failed to start interview:", err);
    }

    // Get AI opening message
    console.log("[Interview] Getting AI opening message...");
    const openingTranscript: TranscriptEntry[] = [];
    await getAIResponse(openingTranscript);
    // STT turn management is automatic — hook watches isAISpeaking
    // and connects/disconnects Deepgram per turn. Just start the first turn.
    console.log("[Interview] AI finished speaking, starting STT...");
    stt.start();
  }, [getAIResponse, stt, interviewData, interviewId]);

  const handleEndInterview = useCallback(async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    setIsEnding(true);
    setShowEndConfirm(false);

    // Cancel any active AI pipeline
    if (activeAbortRef.current) { activeAbortRef.current.abort(); activeAbortRef.current = null; }
    if (activeReaderRef.current) { try { activeReaderRef.current.cancel(); } catch {} activeReaderRef.current = null; }
    isProcessingRef.current = false;

    // Stop STT
    stt.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (currentAudioRef.current) {
      const audioUrl = currentAudioRef.current.src;
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    }

    // End interview + auto-score in background on server
    fetch(`/api/interview/${interviewId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenRef.current }),
    }).catch(console.error);

    // Stop audio recording and upload
    if ((window as any).__stopAudioRecording) {
      await (window as any).__stopAudioRecording();
    }

    // Stop camera/mic
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Redirect to completion page (not scorecard — that's for interviewers only)
    window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
  }, [interviewId]);

  const toggleMic = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCameraEnabled(videoTrack.enabled);
      if (!videoTrack.enabled) {
        // First time = warning (info severity, no strike). Repeat = flag (counts as strike).
        const cameraOffCount = (window as any).__cameraOffCount = ((window as any).__cameraOffCount || 0) + 1;
        const severity = cameraOffCount <= 1 ? "info" : "flag";
        const message = cameraOffCount <= 1
          ? "Camera turned off — please keep your camera on during the interview"
          : "Camera turned off again — this counts as a violation";
        fetch("/api/proctor-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId, type: "camera_off", severity, message, token: tokenRef.current }),
        }).catch(() => {});
      }
    }
  }, [interviewId]);

  // Proctoring callback — handles alerts from Proctoring.tsx and local events (e.g. screen_share_stopped)
  const onProctoringEvent = useCallback(
    (event: { type: string; message: string; severity?: string }) => {
      // Only show toast for events that count as strikes — disabled checks are silent
      // (they still log to DB for interviewer review, just no candidate-facing toast)
      const strikeWeights: Record<string, number> = {
        face_missing: 0.25,
        multiple_faces: 1,
        screen_share_stopped: 0.5,
        fullscreen_exit: 0.25,
        window_blur: 0.5,
        camera_off: 1,
      };
      const weight = strikeWeights[event.type] || 0;
      if (weight > 0) {
        const alert: ProctoringAlert = {
          id: crypto.randomUUID(),
          type: event.type,
          message: event.message,
          timestamp: Date.now(),
        };
        setProctoringAlerts((prev) => [...prev, alert]);
      }

      // For events not originating from Proctoring.tsx (e.g. screen_share_stopped),
      // persist to server so they appear in DB and getProctoringViolationCount
      const localOnlyTypes = ["screen_share_stopped"];
      if (localOnlyTypes.includes(event.type)) {
        fetch("/api/proctor-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            type: event.type,
            severity: event.severity || "flag",
            message: event.message,
            token: tokenRef.current,
          }),
        }).catch(() => {});
      }

      const effectiveSeverity = event.severity || "flag";
      if (weight > 0 && effectiveSeverity === "flag") {
        setProctoringWarnings((prev) => {
          const next = prev + weight;
          const maxStrikes = runtimeConfig.maxProctoringStrikes;
          if (next >= maxStrikes) {
            setShowProctoringBan(true);
          }
          return next;
        });
      }
    },
    [interviewId, runtimeConfig.maxProctoringStrikes]
  );

  // Auto-end interview after max proctoring violations — give 10 seconds to read the message
  useEffect(() => {
    if (!showProctoringBan || isEndingRef.current) return;
    const timer = setTimeout(() => {
      // #24: set isEndingRef so STT doesn't reconnect during shutdown
      isEndingRef.current = true;
      setIsEnding(true);
      stt.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeAbortRef.current) { activeAbortRef.current.abort(); activeAbortRef.current = null; }
      if (activeReaderRef.current) { try { activeReaderRef.current.cancel(); } catch {} activeReaderRef.current = null; }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      fetch(`/api/interview/${interviewId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current }),
      }).catch(console.error);
      window.location.href = `/completed/${interviewId}?token=${tokenRef.current}`;
    }, 10000);
    return () => clearTimeout(timer);
  }, [showProctoringBan, interviewId]);

  // Fullscreen enforcement — detect exit during interview, show 30s countdown to re-enter
  useEffect(() => {
    if (!supportsFullscreen) return; // Skip on iOS
    if (!isStarted || isEndingRef.current) return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isStarted && !isEndingRef.current) {
        setNeedsFullscreenClick(true);
        setFullscreenCountdown(30);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isStarted]);

  // Fullscreen countdown — auto-end interview if not re-entered within 30s
  useEffect(() => {
    if (!needsFullscreenClick || fullscreenCountdown <= 0) return;
    const timer = setInterval(() => {
      setFullscreenCountdown((prev) => {
        if (prev <= 1) {
          // Time's up — end interview
          setNeedsFullscreenClick(false);
          handleEndInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [needsFullscreenClick, fullscreenCountdown, handleEndInterview]);

  // Strike decay — reduce accumulated warnings by 0.5 every 5 minutes
  // This prevents early false positives from permanently harming the candidate
  useEffect(() => {
    if (!isStarted) return;
    const decay = setInterval(() => {
      setProctoringWarnings((prev) => Math.max(0, prev - 0.5));
    }, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(decay);
  }, [isStarted]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // ─── Expired Screen ───────────────────────────────────────────────────────
  if (expired) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="mb-4 text-4xl text-zinc-500">&#9202;</div>
          <h2 className="text-xl font-semibold text-white">Interview Link Expired</h2>
          <p className="mt-3 text-sm text-zinc-400">
            This interview link has expired. Please contact the interviewer for a new link.
          </p>
        </div>
      </div>
    );
  }

  // ─── Declined Screen ──────────────────────────────────────────────────────
  if (declined) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="mb-4 text-4xl text-zinc-500">&#10005;</div>
          <h2 className="text-xl font-semibold text-white">Interview Declined</h2>
          <p className="mt-3 text-sm text-zinc-400">
            You have declined the recording consent. The interview cannot proceed without your consent.
          </p>
          <button
            onClick={() => { setDeclined(false); setConsentCheck1(false); setConsentCheck2(false); }}
            className="mt-6 rounded-lg bg-zinc-700 px-6 py-2 text-sm text-zinc-300 transition hover:bg-zinc-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Mandatory Fullscreen Prompt (on resume or ESC exit) ───────────────────
  if (needsFullscreenClick) {
    return (
      <div className="flex h-screen items-center justify-center px-4 bg-zinc-950">
        <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="mb-4 text-4xl">&#128274;</div>
          <h2 className="text-xl font-semibold text-white">Fullscreen Required</h2>
          <p className="mt-3 text-sm text-zinc-400">
            This interview must be conducted in fullscreen mode.
          </p>
          {fullscreenCountdown > 0 && (
            <p className="mt-2 text-lg font-bold text-red-400">
              Interview will end in {fullscreenCountdown}s
            </p>
          )}
          <button
            onClick={async () => {
              try {
                await document.documentElement.requestFullscreen();
                setNeedsFullscreenClick(false);
                setFullscreenCountdown(0);
              } catch {
                // If fullscreen fails, still dismiss (browser may block repeated requests)
                console.warn("[Fullscreen] Request failed");
                setNeedsFullscreenClick(false);
                setFullscreenCountdown(0);
              }
            }}
            className="mt-6 rounded-lg bg-indigo-600 px-8 py-3 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Enter Fullscreen & Resume
          </button>
          <p className="mt-3 text-xs text-zinc-500">
            This is recorded as a proctoring violation.
          </p>
        </div>
      </div>
    );
  }

  // ─── Recording Consent Screen ─────────────────────────────────────────────
  if (!consentGiven) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="glass w-full max-w-md rounded-2xl p-8">
          <div className="mb-6 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/15">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-blue-400">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-xl font-semibold text-white">
            Interview Recording Consent
          </h2>
          <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
            This interview will be recorded and monitored for quality and integrity purposes. By proceeding, you consent to:
          </p>
          <div className="mt-4 mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <span className="text-amber-400 text-lg">🎧</span>
            <span className="text-sm text-amber-200">Please use headphones for the best experience and to avoid audio echo.</span>
          </div>
          <ul className="space-y-2.5">
            {[
              "Video and audio recording",
              "AI-powered proctoring (face detection, eye tracking, tab/window monitoring, periodic photo capture)",
              "Analysis of your responses by AI",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <span className="mt-0.5 text-blue-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
            Periodic photos will be captured during the interview for integrity verification. Photos are stored securely and automatically deleted after 90 days.
          </p>

          {/* Environment Tips */}
          <div className="mt-5 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5">
            <p className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wider">Before you start</p>
            <ul className="space-y-1.5 text-xs text-zinc-400">
              <li className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                Sit in a quiet environment without background noise
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                Ensure good lighting so your face is clearly visible
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                Use headphones for best audio quality
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                Close other tabs and applications
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">&#10003;</span>
                Keep your ID ready if asked for verification
              </li>
            </ul>
          </div>
          <div className="mt-6 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consentCheck1} onChange={() => setConsentCheck1(!consentCheck1)} className="mt-0.5 h-4 w-4 accent-blue-500" />
              <span className="text-sm text-zinc-300">I understand this session will be recorded</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consentCheck2} onChange={() => setConsentCheck2(!consentCheck2)} className="mt-0.5 h-4 w-4 accent-blue-500" />
              <span className="text-sm text-zinc-300">I agree to AI proctoring and monitoring</span>
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setDeclined(true)}
              className="flex-1 rounded-lg bg-zinc-700 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-600"
            >
              Decline
            </button>
            <button
              onClick={() => setConsentGiven(true)}
              disabled={!consentCheck1 || !consentCheck2}
              className="glow-blue flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              I Agree &amp; Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pre-Interview Setup Screen ───────────────────────────────────────────
  if (!isStarted) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-8 px-4">
        <h1 className="text-2xl font-semibold text-white">
          {interviewData?.title || "Interview Setup"}
        </h1>

        {interviewData && (
          <div className="glass rounded-xl px-6 py-4 text-center">
            <p className="text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">{interviewData.role}</span>
              {" \u00b7 "}
              <span>{interviewData.level}</span>
            </p>
            {interviewData.focusAreas?.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {interviewData.focusAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-full bg-blue-500/10 px-3 py-1 text-xs text-blue-400"
                  >
                    {area}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Camera Preview */}
        <div className="relative overflow-hidden rounded-2xl border border-white/5">
          <video
            ref={videoCallbackRef}
            autoPlay
            playsInline
            muted
            className="h-[240px] w-[320px] sm:h-[360px] sm:w-[480px] -scale-x-100 bg-zinc-900 object-cover"
          />
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <p className="text-sm text-zinc-500">Requesting camera access...</p>
            </div>
          )}
        </div>

        {/* Mic Level */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">Mic Level</span>
          <div id="mic-level-bars" className="flex items-end gap-0.5 h-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-0.5 bg-green-400 rounded-full transition-opacity duration-75"
                style={{ height: `${20 + (i / 20) * 80}%`, opacity: 0.2 }}
              />
            ))}
          </div>
        </div>

        {/* System Checks */}
        <div className="glass rounded-xl px-6 py-4 space-y-3">
          <div className="flex gap-6">
            <SystemCheck label="Camera" ready={cameraReady} />
            <SystemCheck label="Microphone" ready={micReady} />
            <SystemCheck label="Speaker" ready={true} />
            <SystemCheck label="Screen Share" ready={screenSharing} />
          </div>

          {/* Screen Share Button */}
          {!screenSharing ? (
            <div className="pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                      video: { displaySurface: "monitor" } as any,
                      audio: false,
                    });
                    // Detect when user stops sharing
                    screenStream.getVideoTracks()[0].onended = () => {
                      setScreenSharing(false);
                      if (isStarted) {
                        onProctoringEvent({ type: "screen_share_stopped", severity: "flag", message: "Candidate stopped screen sharing" });
                      }
                    };
                    setScreenSharing(true);
                  } catch (err) {
                    console.error("Screen share denied:", err);
                  }
                }}
                className="w-full rounded-lg bg-blue-500/20 border border-blue-500/30 px-4 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/30 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Share Your Entire Screen
              </button>
              <p className="text-[10px] text-zinc-500 text-center mt-1.5">Required — select "Entire Screen" when prompted</p>
            </div>
          ) : (
            <div className="pt-2 border-t border-white/10 flex items-center justify-center gap-2 text-green-400 text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Screen sharing active
            </div>
          )}
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartInterview}
          disabled={!cameraReady || !micReady || (!screenSharing && !isMobile)}
          className="glow-blue rounded-xl bg-blue-600 px-10 py-3.5 text-lg font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {!screenSharing && !isMobile ? "Share screen to continue" : "Start Interview"}
        </button>
      </div>
    );
  }

  // ─── Main Interview Screen ────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col">
      {/* Muted mic warning */}
      {!micEnabled && isStarted && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium animate-pulse">
          Microphone is muted — your voice is not being captured
        </div>
      )}
      {/* Top Bar */}
      <div className="glass flex items-center justify-between px-3 sm:px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h2 className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
            {interviewData?.title || "Interview"}
          </h2>
          <span className="text-xs text-zinc-500 hidden sm:inline">|</span>
          <span className={`font-mono text-xs sm:text-sm ${remainingSeconds <= 60 ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
            {formatTime(remainingSeconds)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* STT Status + Retry */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2 w-2 rounded-full ${stt.connected ? "bg-green-500" : stt.everConnected ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
            <button
              onClick={() => {
                if (activeAbortRef.current) { activeAbortRef.current.abort(); activeAbortRef.current = null; }
                if (activeReaderRef.current) { try { activeReaderRef.current.cancel(); } catch {} activeReaderRef.current = null; }
                isProcessingRef.current = false;
                setIsAIThinking(false);
                setIsAISpeaking(false);
                isAISpeakingRef.current = false;
                if (currentAudioRef.current) {
                  const audioUrl = currentAudioRef.current.src;
                  currentAudioRef.current.pause();
                  currentAudioRef.current = null;
                  if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
                }
                setCurrentAIText("");
                stt.stop();
                setTimeout(() => stt.start(), 500);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-all"
              title="Click if interviewer is not responding or microphone seems stuck"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh mic
            </button>
          </div>
          {/* AudioRecorder removed — recording timer was unreliable */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-xs font-medium text-red-400">REC</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row flex-1 gap-2 sm:gap-3 overflow-hidden p-2 sm:p-3">
        {/* Left: Video + AI Avatar */}
        <div className="flex flex-[5] flex-col gap-2 sm:gap-3">
          {/* Video Feed */}
          <div className="relative flex-[3] min-h-[150px] sm:min-h-[200px] lg:min-h-0 overflow-hidden rounded-xl sm:rounded-2xl border border-white/5 bg-zinc-900">
            <video
              ref={videoCallbackRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full -scale-x-100 object-cover ${!cameraEnabled ? "invisible" : ""}`}
            />
            {!cameraEnabled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-3xl font-semibold text-zinc-400">
                  {interviewData?.candidateName?.[0]?.toUpperCase() || "C"}
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur">
              {interviewData?.candidateName || "Candidate"}
            </div>
            {/* AI Interviewer Avatar — top right of video */}
            <div className="absolute right-4 top-4 flex items-center gap-3">
              <div className="relative" style={{ perspective: "400px" }}>
                {/* 3D animated head */}
                <div
                  className={`w-14 h-14 rounded-full relative transition-all duration-300 ${isAISpeaking ? "shadow-lg shadow-blue-500/40" : ""}`}
                  style={{
                    transformStyle: "preserve-3d",
                    animation: isAISpeaking ? "aiHeadBob 2s ease-in-out infinite" : "aiFloat 4s ease-in-out infinite",
                  }}
                >
                  {/* Face base */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-200 to-amber-300 border-2 border-amber-400/30" />
                  {/* Hair */}
                  <div className="absolute -top-1 left-1 right-1 h-7 rounded-t-full bg-gray-800" style={{ borderRadius: "50% 50% 0 0" }} />
                  {/* Eyes */}
                  <div className="absolute top-[40%] left-[22%] w-2 h-2.5 bg-gray-800 rounded-full">
                    <div className="absolute top-0.5 left-0.5 w-1 h-1 bg-white rounded-full" />
                  </div>
                  <div className="absolute top-[40%] right-[22%] w-2 h-2.5 bg-gray-800 rounded-full">
                    <div className="absolute top-0.5 left-0.5 w-1 h-1 bg-white rounded-full" />
                  </div>
                  {/* Eyebrows */}
                  <div className="absolute top-[32%] left-[18%] w-3 h-[2px] bg-gray-700 rounded-full -rotate-6" />
                  <div className="absolute top-[32%] right-[18%] w-3 h-[2px] bg-gray-700 rounded-full rotate-6" />
                  {/* Mouth - animated when speaking */}
                  <div
                    className="absolute bottom-[22%] left-1/2 -translate-x-1/2 bg-gray-700 rounded-full transition-all duration-150"
                    style={{
                      width: isAISpeaking ? "10px" : "8px",
                      height: isAISpeaking ? "6px" : "2px",
                      animation: isAISpeaking ? "aiMouthMove 0.3s ease-in-out infinite alternate" : "none",
                    }}
                  />
                  {/* Cheeks */}
                  <div className="absolute bottom-[30%] left-[12%] w-2 h-1.5 bg-pink-300/40 rounded-full" />
                  <div className="absolute bottom-[30%] right-[12%] w-2 h-1.5 bg-pink-300/40 rounded-full" />
                </div>
                {/* Speaking rings */}
                {isAISpeaking && (
                  <>
                    <div className="pulse-ring absolute inset-0 rounded-full border-2 border-blue-400" />
                    <div className="pulse-ring absolute -inset-1 rounded-full border border-blue-400/50" style={{ animationDelay: "0.5s" }} />
                  </>
                )}
              </div>
              <div className="rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur">
                <span className="text-xs font-medium text-zinc-300">Alex (AI)</span>
                {isAISpeaking && (
                  <div className="mt-1 flex items-center gap-[2px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="waveform w-[2px] rounded-full bg-blue-400"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Current AI Subtitle — below video */}
          {currentAIText && (
            <div className="glass rounded-xl px-4 py-3">
              <p className="text-sm leading-relaxed text-blue-300">
                <span className="mr-2 text-xs font-semibold text-blue-500">ALEX:</span>
                {currentAIText}
              </p>
            </div>
          )}
        </div>

        {/* Right: Live Transcript + Screen Share */}
        <div className="flex flex-[3] flex-col gap-3 min-h-0">
          {/* Screen Share Status */}
          {screenSharing && (
            <div className="glass rounded-2xl px-3 py-2 hidden lg:flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-xs text-green-400">Screen sharing active</span>
            </div>
          )}
          <div className="glass flex-1 flex flex-col rounded-2xl min-h-0 relative">
            <div className="flex-1 overflow-y-auto p-4 relative" ref={transcriptScrollRef} onScroll={handleTranscriptScroll}>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Live Transcript
            </h3>
            <div className="space-y-4">
              {transcript.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${entry.role === "ai" ? "" : "flex-row-reverse"}`}
                >
                  {/* Avatar */}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    entry.role === "ai"
                      ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                      : "bg-zinc-700 text-zinc-300"
                  }`}>
                    {entry.role === "ai" ? "A" : "Y"}
                  </div>
                  {/* Message bubble */}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    entry.role === "ai"
                      ? "rounded-tl-sm bg-blue-600/20 text-blue-100"
                      : "rounded-tr-sm bg-zinc-700/50 text-zinc-200"
                  }`}>
                    <div className="text-sm leading-relaxed">
                      {entry.role === "ai" ? formatAIText(entry.text) : <p className="whitespace-pre-line">{entry.text}</p>}
                    </div>
                    <span className="mt-1 block text-[10px] text-zinc-500">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
              {interimTranscript && (
                <div className="flex flex-row-reverse gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-300">
                    Y
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-700/30 px-4 py-2.5">
                    <p className="text-sm italic leading-relaxed text-zinc-400">{interimTranscript}...</p>
                  </div>
                </div>
              )}
              {/* AI thinking indicator */}
              {isAIThinking && !isAISpeaking && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold">
                    A
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-blue-600/20 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
            </div>
            {/* Go to bottom — floats above scroll area */}
            {showScrollBottom && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10">
                <button
                  onClick={scrollToBottom}
                  className="rounded-full bg-blue-600/90 px-3 py-1.5 text-xs text-white hover:bg-blue-500 transition-all inline-flex items-center gap-1 shadow-lg shadow-black/30"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  New messages
                </button>
              </div>
            )}
            {/* Skip voice — only stops audio, text stays in transcript */}
            {isAISpeaking && (
              <div className="border-t border-white/5 px-3 py-2">
                <button
                  onClick={() => {
                    // Only stop audio — don't abort SSE stream or clear text
                    if (currentAudioRef.current) {
                      const src = currentAudioRef.current.src;
                      currentAudioRef.current.pause();
                      currentAudioRef.current = null;
                      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
                    }
                    setIsAISpeaking(false);
                    isAISpeakingRef.current = false;
                    // Text stays in transcript — candidate can read it
                  }}
                  className="w-full rounded-lg bg-zinc-700/50 border border-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  Skip voice — read instead
                </button>
              </div>
            )}
            {/* Chat input — type messages alongside voice */}
            <div className="border-t border-white/5 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder={isAISpeaking ? "AI is speaking..." : isAIThinking ? "AI is thinking..." : "Type a message or use voice..."}
                  disabled={isAIThinking}
                  className="flex-1 rounded-lg bg-zinc-800/60 border border-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || isAIThinking}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Send (Enter)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 py-3 sm:py-4 flex-wrap">
        <ControlButton
          active={micEnabled}
          onClick={toggleMic}
          icon={
            micEnabled ? (
              <MicIcon className="h-5 w-5" />
            ) : (
              <MicOffIcon className="h-5 w-5" />
            )
          }
          label={micEnabled ? "Mute" : "Unmute"}
        />
        <ControlButton
          active={cameraEnabled}
          onClick={toggleCamera}
          icon={
            cameraEnabled ? (
              <CameraIcon className="h-5 w-5" />
            ) : (
              <CameraOffIcon className="h-5 w-5" />
            )
          }
          label={cameraEnabled ? "Stop Video" : "Start Video"}
        />
        {/* Skip button moved to chat area */}
        {/* Retry — re-send last transcript after AI failure */}
        {aiError && !isProcessingRef.current && (
          <button
            onClick={() => {
              setAiError(false);
              getAIResponse(lastTranscriptRef.current);
            }}
            className="rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 animate-pulse"
          >
            Retry AI
          </button>
        )}
        <button
          onClick={() => setShowEndConfirm(true)}
          className="glow-red rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-500"
        >
          End Interview
        </button>
      </div>

      {/* Proctoring Warning Counter */}
      {proctoringWarnings > 0 && !showProctoringBan && (
        <div className="fixed left-1/2 -translate-x-1/2 top-16 z-50">
          <div className={`flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg border ${
            proctoringWarnings >= 2
              ? "bg-red-900/90 border-red-500/40 backdrop-blur"
              : "bg-yellow-900/90 border-yellow-500/30 backdrop-blur"
          }`}>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(runtimeConfig.maxProctoringStrikes, 10) }, (_, i) => i + 1).map((i) => (
                <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                  i <= proctoringWarnings
                    ? "bg-red-500 border-red-400 scale-110"
                    : "bg-transparent border-zinc-600"
                }`} />
              ))}
            </div>
            <span className={`text-sm font-medium ${proctoringWarnings >= 3 ? "text-red-200" : "text-yellow-200"}`}>
              Warning {proctoringWarnings}/{runtimeConfig.maxProctoringStrikes} — {proctoringWarnings >= runtimeConfig.maxProctoringStrikes - 1 ? "Next violation will end the interview" : "Please stay focused and look at the screen"}
            </span>
          </div>
        </div>
      )}

      {/* Proctoring Alerts (toast) */}
      <div className="fixed right-4 top-16 z-50 flex flex-col gap-2">
        {proctoringAlerts.map((alert) => (
          <div
            key={alert.id}
            className="glass flex items-center gap-2 rounded-lg border border-yellow-500/20 px-4 py-2"
            style={{ animation: "fadeInRight 0.3s ease-out" }}
          >
            <span className="text-yellow-400">&#9888;</span>
            <span className="text-sm text-yellow-200">{alert.message}</span>
          </div>
        ))}
      </div>

      {/* Proctoring Ban Modal — 3 strikes */}
      {showProctoringBan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass w-full max-w-md rounded-2xl p-8 text-center border border-red-500/30">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Interview Terminated</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Your interview has been ended due to multiple integrity violations. Our proctoring system detected that you were:
            </p>
            <ul className="text-left text-sm text-zinc-400 space-y-1.5 mb-6 px-4">
              <li className="flex items-center gap-2"><span className="text-red-400">&#10005;</span> Not looking at the screen</li>
              <li className="flex items-center gap-2"><span className="text-red-400">&#10005;</span> Switching tabs or windows</li>
              <li className="flex items-center gap-2"><span className="text-red-400">&#10005;</span> Using unauthorized assistance</li>
            </ul>
            <p className="text-xs text-zinc-500">
              This incident has been recorded. You will be redirected in a few seconds.
            </p>
            <div className="mt-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full" style={{ animation: "shrinkBar 10s linear forwards" }} />
            </div>
          </div>
        </div>
      )}

      {/* Proctoring — invisible monitoring component */}
      <Proctoring
        videoRef={videoRef as React.RefObject<HTMLVideoElement>}
        interviewId={interviewId}
        enabled={isStarted && !isEndingRef.current}
        onAlert={onProctoringEvent}
        token={tokenRef.current}
      />

      {/* End Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass w-full max-w-sm rounded-2xl p-6 text-center">
            <h3 className="text-lg font-semibold text-white">End Interview?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This will end the session and generate your scorecard.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="rounded-lg bg-zinc-700 px-5 py-2 text-sm text-zinc-200 transition hover:bg-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={handleEndInterview}
                disabled={isEnding}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {isEnding ? "Ending..." : "End Interview"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SystemCheck({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${ready ? "text-green-400" : "text-zinc-500"}`}>
        {ready ? "\u2713" : "\u25CB"}
      </span>
      <span className="text-sm text-zinc-300">{label}</span>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
        active
          ? "bg-zinc-700/80 text-white hover:bg-zinc-600"
          : "bg-red-600/80 text-white hover:bg-red-500"
      }`}
    >
      {icon}
    </button>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5.29" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 7 16 12 23 17Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CameraOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M23 7 16 12 23 17Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
