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
  const photoCountRef = useRef(0);

  const alert = useCallback(
    (type: string, severity: string, message: string) => {
      onAlert({ type, severity, message });
      sendProctoringEvent(interviewId, type, severity, message);
    },
    [onAlert, interviewId]
  );

  // Create canvas once
  useEffect(() => {
    canvasRef.current = document.createElement("canvas");
  }, []);

  // Tab/window switch detection
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.hidden) alert("tab_switch", "flag", "Candidate switched tabs");
    };
    const handleBlur = () => alert("tab_switch", "warning", "Window lost focus");

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, alert]);

  // Copy-paste blocking
  useEffect(() => {
    if (!enabled) return;

    const block = (e: ClipboardEvent) => { e.preventDefault(); alert("copy_paste", "warning", "Clipboard action blocked"); };
    const blockKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "Tab"].includes(e.key)) {
        e.preventDefault();
        alert("tab_switch", "warning", "Keyboard shortcut blocked");
      }
    };

    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    document.addEventListener("keydown", blockKey);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("keydown", blockKey);
    };
  }, [enabled, alert]);

  // Face detection + gaze tracking + photo capture
  useEffect(() => {
    if (!enabled) return;

    // Try to init FaceDetector
    const initFaceDetector = async () => {
      if ("FaceDetector" in window) {
        try {
          faceDetectorRef.current = new (window as any).FaceDetector({ maxDetectedFaces: 5, fastMode: true });
        } catch { faceDetectorRef.current = null; }
      }
    };
    initFaceDetector();

    const detect = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

      // Method 1: FaceDetector API (Chrome)
      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces.length === 0) {
            // No face for 5+ seconds = flag
            if (Date.now() - lastFaceTimeRef.current > 5000) {
              alert("face_missing", "flag", "No face detected — are you still there?");
              lastFaceTimeRef.current = Date.now(); // Reset to avoid spam
            }
          } else {
            lastFaceTimeRef.current = Date.now();
            if (faces.length > 1) {
              alert("multiple_faces", "flag", `${faces.length} faces detected in frame`);
            } else {
              // Gaze check — is face too far off-center?
              const face = faces[0];
              const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
              const offset = Math.abs(faceCenterX - video.videoWidth / 2);
              if (offset > video.videoWidth * 0.35) {
                alert("eye_away", "warning", "Candidate appears to be looking away");
              }
            }
          }
        } catch {}
      } else {
        // Method 2: Canvas heuristic fallback (no FaceDetector)
        // Check if the center of the frame has skin-tone pixels (face present)
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 80, 60);

        const centerData = ctx.getImageData(20, 10, 40, 30);
        const pixels = centerData.data;
        let skinPixels = 0;
        const total = 40 * 30;

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          // Simple skin color detection (works for various skin tones)
          if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - b > 15) {
            skinPixels++;
          }
        }

        const skinRatio = skinPixels / total;
        if (skinRatio < 0.05) {
          // Very few skin pixels in center — face likely missing
          if (Date.now() - lastFaceTimeRef.current > 8000) {
            alert("face_missing", "flag", "Face not clearly visible — please face the camera");
            lastFaceTimeRef.current = Date.now();
          }
        } else {
          lastFaceTimeRef.current = Date.now();
        }
      }
    };

    const interval = setInterval(detect, 3000);
    return () => clearInterval(interval);
  }, [enabled, videoRef, alert]);

  // Periodic photo capture — every 30s, save a snapshot for review
  useEffect(() => {
    if (!enabled) return;

    const capturePhoto = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 240);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      photoCountRef.current++;

      // Send to server for storage
      fetch("/api/proctor-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          type: "photo_capture",
          severity: "info",
          message: `Periodic photo #${photoCountRef.current} captured`,
          photo: dataUrl,
        }),
      }).catch(() => {});
    };

    // First capture after 10s, then every 30s
    const firstCapture = setTimeout(capturePhoto, 10000);
    const interval = setInterval(capturePhoto, 30000);
    return () => { clearTimeout(firstCapture); clearInterval(interval); };
  }, [enabled, videoRef, interviewId]);

  // Bright object detection (phone screen)
  useEffect(() => {
    if (!enabled) return;

    let consecutiveSuspicious = 0;

    const analyzeFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 160, 120);

      const imageData = ctx.getImageData(0, 0, 160, 120);
      const data = imageData.data;

      // Check bottom corners for bright rectangles (phone screen glow)
      let brightPixels = 0;
      let totalChecked = 0;

      for (let y = 60; y < 120; y++) {
        for (let x = 0; x < 50; x++) {
          const idx = (y * 160 + x) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness > 200) brightPixels++;
          totalChecked++;
        }
        for (let x = 110; x < 160; x++) {
          const idx = (y * 160 + x) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness > 200) brightPixels++;
          totalChecked++;
        }
      }

      if (totalChecked > 0 && brightPixels / totalChecked > 0.3) {
        consecutiveSuspicious++;
        if (consecutiveSuspicious >= 3) {
          alert("phone_detected", "flag", "Bright object detected — possible phone or secondary screen");
          consecutiveSuspicious = 0;
        }
      } else {
        consecutiveSuspicious = Math.max(0, consecutiveSuspicious - 1);
      }
    };

    const interval = setInterval(analyzeFrame, 4000);
    return () => clearInterval(interval);
  }, [enabled, videoRef, alert]);

  return null;
}
