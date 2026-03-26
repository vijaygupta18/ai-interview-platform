"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface AudioRecorderProps {
  interviewId: string;
  mediaStream: MediaStream | null;
  enabled: boolean;
}

export function AudioRecorder({ interviewId, mediaStream, enabled }: AudioRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(() => {
    if (!mediaStream || recorderRef.current) return;

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const mimeType = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "";

    try {
      const recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("AudioRecorder: failed to start", err);
    }
  }, [mediaStream]);

  const stopAndUpload = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        setIsRecording(false);
        recorderRef.current = null;

        if (chunksRef.current.length === 0) {
          resolve();
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];

        try {
          const formData = new FormData();
          formData.append("audio", blob, `${interviewId}.webm`);
          formData.append("interviewId", interviewId);
          await fetch("/api/upload-recording", { method: "POST", body: formData });
        } catch (err) {
          console.error("AudioRecorder: upload failed", err);
        }
        resolve();
      };
      recorder.stop();
    });
  }, [interviewId]);

  useEffect(() => {
    if (enabled && mediaStream) {
      startRecording();
    }
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, mediaStream, startRecording]);

  // Expose stopAndUpload on the window for InterviewRoom to call before redirect
  useEffect(() => {
    (window as any).__stopAudioRecording = stopAndUpload;
    return () => { delete (window as any).__stopAudioRecording; };
  }, [stopAndUpload]);

  if (!isRecording) return null;

  const mins = Math.floor(duration / 60).toString().padStart(2, "0");
  const secs = (duration % 60).toString().padStart(2, "0");

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <span className="text-xs font-mono text-red-400">{mins}:{secs}</span>
    </div>
  );
}
