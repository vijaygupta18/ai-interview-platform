"use client";

import { useState, useRef, useCallback } from "react";

interface ScreenShareProps {
  onScreenShareStart: () => void;
  onScreenShareEnd: () => void;
}

export function ScreenShare({ onScreenShareStart, onScreenShareEnd }: ScreenShareProps) {
  const [isSharing, setIsSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startSharing = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsSharing(true);
      onScreenShareStart();

      // Detect when user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        setIsSharing(false);
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        onScreenShareEnd();
      };
    } catch (err) {
      console.error("Screen share failed:", err);
    }
  }, [onScreenShareStart, onScreenShareEnd]);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
    onScreenShareEnd();
  }, [onScreenShareEnd]);

  return (
    <div>
      {isSharing ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-green-500/20 bg-black/30">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto max-h-32 object-contain"
            />
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 rounded bg-green-500/20 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-medium text-green-400">Screen Shared</span>
            </div>
          </div>
          <button
            onClick={stopSharing}
            className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
          >
            Stop Sharing
          </button>
        </div>
      ) : (
        <button
          onClick={startSharing}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-300 hover:border-white/20 transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8m-4-4v4" />
          </svg>
          Share Screen
        </button>
      )}
    </div>
  );
}
