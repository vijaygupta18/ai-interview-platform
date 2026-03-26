"use client";

import { useEffect, useRef, useCallback } from "react";

interface ProctoringAlert {
  type: string;
  severity: string;
  message: string;
}

interface ProctoringProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  interviewId: string;
  enabled: boolean;
  onAlert: (alert: ProctoringAlert) => void;
}

async function sendProctoringEvent(interviewId: string, type: string, severity: string, message: string) {
  try {
    await fetch("/api/proctor-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, type, severity, message }),
    });
  } catch {}
}

export default function Proctoring({ videoRef, interviewId, enabled, onAlert }: ProctoringProps) {
  const faceDetectorRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFaceTimeRef = useRef(Date.now());
  const lastTabSwitchRef = useRef(0);
  const photoCountRef = useRef(0);

  const alert = useCallback(
    (type: string, severity: string, message: string) => {
      onAlert({ type, severity, message });
      sendProctoringEvent(interviewId, type, severity, message);
    },
    [onAlert, interviewId]
  );

  useEffect(() => { canvasRef.current = document.createElement("canvas"); }, []);

  // Tab switch detection — DEBOUNCED, only visibilitychange (not blur)
  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      if (document.hidden) {
        const now = Date.now();
        if (now - lastTabSwitchRef.current > 5000) {
          lastTabSwitchRef.current = now;
          alert("tab_switch", "flag", "Candidate switched tabs or windows");
        }
      }
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [enabled, alert]);

  // Copy-paste blocking — logged as info, NOT counted as strike
  useEffect(() => {
    if (!enabled) return;
    const blockClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("copy_paste", "info", "Clipboard action blocked");
    };
    const blockKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "v"].includes(e.key)) {
        e.preventDefault();
        alert("copy_paste", "info", "Keyboard shortcut blocked");
      }
    };
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("keydown", blockKey);
    return () => {
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("keydown", blockKey);
    };
  }, [enabled, alert]);

  // Face detection + gaze tracking
  useEffect(() => {
    if (!enabled) return;

    if ("FaceDetector" in window) {
      try {
        faceDetectorRef.current = new (window as any).FaceDetector({ maxDetectedFaces: 5, fastMode: true });
      } catch { faceDetectorRef.current = null; }
    }

    const detect = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces.length === 0) {
            if (Date.now() - lastFaceTimeRef.current > 8000) {
              alert("face_missing", "flag", "No face detected — please face the camera");
              lastFaceTimeRef.current = Date.now();
            }
          } else {
            lastFaceTimeRef.current = Date.now();
            if (faces.length > 1) {
              alert("multiple_faces", "flag", `${faces.length} faces detected`);
            } else {
              const face = faces[0];
              const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
              const offset = Math.abs(faceCenterX - video.videoWidth / 2);
              if (offset > video.videoWidth * 0.4) {
                alert("eye_away", "warning", "Candidate appears to be looking away");
              }
            }
          }
        } catch {}
      } else {
        // Canvas fallback — skin tone heuristic
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 80, 60);
        const centerData = ctx.getImageData(20, 10, 40, 30);
        const pixels = centerData.data;
        let skinPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - b > 15) skinPixels++;
        }
        if (skinPixels / (40 * 30) < 0.05) {
          if (Date.now() - lastFaceTimeRef.current > 10000) {
            alert("face_missing", "flag", "Face not visible — please face the camera");
            lastFaceTimeRef.current = Date.now();
          }
        } else {
          lastFaceTimeRef.current = Date.now();
        }
      }
    };

    const interval = setInterval(detect, 4000);
    return () => clearInterval(interval);
  }, [enabled, videoRef, alert]);

  // Periodic photo capture — every 60s
  useEffect(() => {
    if (!enabled) return;
    const capture = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 240);
      photoCountRef.current++;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      fetch("/api/proctor-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, type: "photo_capture", severity: "info", message: `Photo #${photoCountRef.current}`, photo: dataUrl }),
      }).catch(() => {});
    };
    const first = setTimeout(capture, 30000);
    const interval = setInterval(capture, 60000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [enabled, videoRef, interviewId]);

  // Bright object detection (phone screen) — every 5s
  useEffect(() => {
    if (!enabled) return;
    let consecutiveSuspicious = 0;
    const analyze = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 160, 120);
      const data = ctx.getImageData(0, 0, 160, 120).data;
      let bright = 0, total = 0;
      for (let y = 60; y < 120; y++) {
        for (let x = 0; x < 50; x++) {
          const idx = (y * 160 + x) * 4;
          if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 > 200) bright++;
          total++;
        }
        for (let x = 110; x < 160; x++) {
          const idx = (y * 160 + x) * 4;
          if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 > 200) bright++;
          total++;
        }
      }
      if (total > 0 && bright / total > 0.3) {
        consecutiveSuspicious++;
        if (consecutiveSuspicious >= 4) {
          alert("phone_detected", "flag", "Bright object detected — possible phone or secondary screen");
          consecutiveSuspicious = 0;
        }
      } else {
        consecutiveSuspicious = Math.max(0, consecutiveSuspicious - 1);
      }
    };
    const interval = setInterval(analyze, 5000);
    return () => clearInterval(interval);
  }, [enabled, videoRef, alert]);

  return null;
}
