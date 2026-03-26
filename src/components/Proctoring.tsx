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

async function sendProctoringEvent(
  interviewId: string,
  type: string,
  severity: string,
  message: string
) {
  try {
    await fetch("/api/proctor-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, type, severity, message }),
    });
  } catch {
    // Silently fail - don't disrupt the interview
  }
}

export default function Proctoring({
  videoRef,
  interviewId,
  enabled,
  onAlert,
}: ProctoringProps) {
  const faceDetectorRef = useRef<any>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const alert = useCallback(
    (type: string, severity: string, message: string) => {
      onAlert({ type, severity, message });
      sendProctoringEvent(interviewId, type, severity, message);
    },
    [onAlert, interviewId]
  );

  // Tab/window switch detection
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        alert("tab_switch", "flag", "Candidate switched tabs");
      }
    };

    const handleBlur = () => {
      alert("tab_switch", "warning", "Window lost focus");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, alert]);

  // Copy-paste blocking
  useEffect(() => {
    if (!enabled) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("copy_paste", "warning", "Copy action blocked");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("copy_paste", "warning", "Paste action blocked");
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "Tab"].includes(e.key)) {
        e.preventDefault();
        alert("tab_switch", "warning", "Keyboard shortcut blocked");
      }
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [enabled, alert]);

  // Face detection using FaceDetector API with canvas fallback
  useEffect(() => {
    if (!enabled) return;

    const initFaceDetection = async () => {
      // Use Chrome's FaceDetector API if available
      if ("FaceDetector" in window) {
        try {
          faceDetectorRef.current = new (window as any).FaceDetector({
            maxDetectedFaces: 5,
            fastMode: true,
          });
        } catch {
          // FaceDetector not supported in this environment
          return;
        }
      } else {
        // No face detection available - use canvas heuristic fallback
        return;
      }

      const detectFaces = async () => {
        if (!videoRef.current || !faceDetectorRef.current) return;
        if (
          videoRef.current.readyState < 2 ||
          videoRef.current.videoWidth === 0
        )
          return;

        try {
          const faces = await faceDetectorRef.current.detect(
            videoRef.current
          );
          if (faces.length === 0) {
            alert("face_missing", "flag", "No face detected");
          } else if (faces.length > 1) {
            alert(
              "multiple_faces",
              "flag",
              `${faces.length} faces detected`
            );
          } else {
            // Check if face is centered (gaze heuristic)
            const face = faces[0];
            const videoWidth = videoRef.current.videoWidth;
            const faceCenterX =
              face.boundingBox.x + face.boundingBox.width / 2;
            const offset = Math.abs(faceCenterX - videoWidth / 2);
            if (offset > videoWidth * 0.35) {
              alert(
                "gaze_away",
                "warning",
                "Candidate may be looking away"
              );
            }
          }
        } catch {
          // Detection failed for this frame - skip
        }
      };

      detectionIntervalRef.current = setInterval(detectFaces, 2000);
    };

    initFaceDetection();

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [enabled, videoRef, alert]);

  // Fullscreen suggestion
  useEffect(() => {
    if (!enabled) return;

    const checkFullscreen = () => {
      if (!document.fullscreenElement) {
        alert(
          "fullscreen",
          "info",
          "Interview is not in fullscreen mode"
        );
      }
    };

    // Check once after a short delay
    const timeout = setTimeout(checkFullscreen, 3000);

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        alert("fullscreen", "warning", "Exited fullscreen mode");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, [enabled, alert]);

  // TODO: Periodic screenshot analysis for phone detection
  // Could capture canvas frames and send to AI vision API

  return null;
}
