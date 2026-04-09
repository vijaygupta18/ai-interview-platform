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
  token?: string;
}

async function sendProctoringEvent(interviewId: string, type: string, severity: string, message: string, token?: string) {
  try {
    const res = await fetch("/api/proctor-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, type, severity, message, token }),
    });
    if (!res.ok) {
      console.error(`[Proctoring] Failed to save event ${type}: HTTP ${res.status}`, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error(`[Proctoring] Failed to send event ${type}:`, err);
  }
}

export default function Proctoring({ videoRef, interviewId, enabled, onAlert, token }: ProctoringProps) {
  // faceLandmarkerRef removed — FaceLandmarker model no longer available on Google CDN
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTabSwitchRef = useRef(0);
  const photoCountRef = useRef(0);
  const lastAlertTimeRef = useRef<Record<string, number>>({});

  const captureViolationPhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = photoCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 480, 360);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const formData = new FormData();
      formData.append("interviewId", interviewId);
      formData.append("type", "violation_photo");
      formData.append("severity", "info");
      formData.append("message", "Photo captured on violation");
      formData.append("photo", blob, "violation.webp");
      if (token) formData.append("token", token);
      fetch("/api/proctor-event", { method: "POST", body: formData }).catch(() => {});
    }, "image/webp", 0.5);
  }, [videoRef, interviewId, token]);

  const alert = useCallback(
    (type: string, severity: string, message: string) => {
      const now = Date.now();
      const cooldowns: Record<string, number> = {
        second_monitor: 300000,
        multiple_faces: 15000,
        face_missing: 15000,
        eye_away: 15000,
        devtools_open: 60000,
        phone_detected: 30000,
        fullscreen_exit: 10000,
        window_blur: 30000, // 30s — be lenient, candidates may briefly switch contexts
        virtual_camera: 300000,
      };
      const cooldown = cooldowns[type] || 5000;
      const lastTime = lastAlertTimeRef.current[type] || 0;
      if (now - lastTime < cooldown) return;
      lastAlertTimeRef.current[type] = now;

      onAlert({ type, severity, message });
      sendProctoringEvent(interviewId, type, severity, message, token);
      // Violation photo max 1 per 30s to prevent spam
      if (severity === "flag") {
        const lastPhoto = lastAlertTimeRef.current["_violation_photo"] || 0;
        if (now - lastPhoto > 30000) {
          lastAlertTimeRef.current["_violation_photo"] = now;
          captureViolationPhoto();
        }
      }
    },
    [onAlert, interviewId, token, captureViolationPhoto]
  );

  useEffect(() => {
    faceCanvasRef.current = document.createElement("canvas");
    photoCanvasRef.current = document.createElement("canvas");
    phoneCanvasRef.current = document.createElement("canvas");
  }, []);

  // Tab switch detection is now handled by the combined window focus loss detector below

  // Fullscreen exit detection — fires alert, InterviewRoom handles the mandatory re-enter prompt
  useEffect(() => {
    if (!enabled) return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        alert("fullscreen_exit", "flag", "Candidate exited fullscreen mode");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [enabled, alert]);

  // Window focus loss detection — only counts sustained loss (>2s) to avoid OS notification false positives
  useEffect(() => {
    if (!enabled) return;
    let blurStart = 0;
    let lastAlert = 0;
    let shortBlurCount = 0;
    let shortBlurResetTimer: NodeJS.Timeout | null = null;
    let pollLostStart = 0; // tracks sustained focus loss across polls

    const fireAlert = (duration: number) => {
      const now = Date.now();
      if (now - lastAlert < 10000) return; // 10s global debounce (was 5s)
      lastAlert = now;
      if (duration > 15000) {
        alert("window_blur", "flag", `Candidate left the interview window for ${Math.round(duration / 1000)}s`);
      } else {
        alert("window_blur", "flag", `Candidate left the interview window briefly`);
      }
    };

    const handleBlur = () => { blurStart = Date.now(); };
    const handleFocus = () => {
      if (!blurStart) return;
      const duration = Date.now() - blurStart;
      blurStart = 0;
      // Only flag sustained loss >5s (was 2s) — typing into chat may briefly blur the window
      if (duration > 5000) {
        fireAlert(duration);
      } else {
        // Short blur — track frequency. 5+ short blurs in 120s = suspicious (was 3 in 60s)
        shortBlurCount++;
        if (shortBlurResetTimer) clearTimeout(shortBlurResetTimer);
        shortBlurResetTimer = setTimeout(() => { shortBlurCount = 0; }, 120000);
        if (shortBlurCount >= 5) {
          fireAlert(duration);
          shortBlurCount = 0;
        }
      }
    };

    // Visibility change for tab switches (these are always intentional)
    const handleVisibility = () => {
      if (document.hidden) {
        blurStart = Date.now();
      } else if (blurStart) {
        const duration = Date.now() - blurStart;
        blurStart = 0;
        if (duration > 5000) fireAlert(duration);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Periodic focus poll — catches tab/window switches blur/visibility miss.
    // Now requires SUSTAINED loss (≥10s) before firing, not just one missed poll.
    const focusPoll = setInterval(() => {
      if (!document.hasFocus()) {
        if (!pollLostStart) {
          pollLostStart = Date.now();
        } else if (Date.now() - pollLostStart > 10000) {
          // 10s of sustained focus loss confirmed by polling
          fireAlert(Date.now() - pollLostStart);
          pollLostStart = 0;
        }
      } else {
        pollLostStart = 0;
      }
    }, 5000);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(focusPoll);
      if (shortBlurResetTimer) clearTimeout(shortBlurResetTimer);
    };
  }, [enabled, alert]);

  // Copy/paste blocking REMOVED — candidates can now type messages in the
  // chat input and need to paste code/text. Keyboard shortcuts allowed.

  // Second monitor / extended display detection
  useEffect(() => {
    if (!enabled) return;
    const checkMultipleScreens = () => {
      // Method 1: screen.isExtended (Chrome 93+)
      if ('isExtended' in window.screen && (window.screen as any).isExtended) {
        alert("second_monitor", "flag", "Extended display detected — please use a single screen");
        return;
      }
      // Method 2: Compare available screen size with window screen size
      // If available width is much larger than screen width, likely multiple monitors
      if (window.screen.availWidth > window.screen.width * 1.5) {
        alert("second_monitor", "flag", "Multiple screens detected");
        return;
      }
      // Method 3: Window Segments API (newer browsers)
      if ('getWindowSegments' in window.visualViewport!) {
        try {
          const segments = (window.visualViewport as any).getWindowSegments();
          if (segments && segments.length > 1) {
            alert("second_monitor", "flag", "Multiple display segments detected");
          }
        } catch {}
      }
    };
    // Check on mount and on resize (monitors added/removed trigger resize)
    checkMultipleScreens();
    window.addEventListener("resize", checkMultipleScreens);
    return () => window.removeEventListener("resize", checkMultipleScreens);
  }, [enabled, alert]);

  // DevTools detection
  useEffect(() => {
    if (!enabled) return;
    let devtoolsOpen = false;

    const checkDevTools = () => {
      // Method 1: Window size difference — DevTools changes outerHeight/innerHeight ratio
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 200;

      if (widthThreshold || heightThreshold) {
        if (!devtoolsOpen) {
          devtoolsOpen = true;
          alert("devtools_open", "flag", "Developer tools detected — please close them");
        }
      } else {
        devtoolsOpen = false;
      }
    };

    const interval = setInterval(checkDevTools, 5000);

    // Also block right-click context menu
    const blockContext = (e: MouseEvent) => {
      e.preventDefault();
      alert("devtools_open", "info", "Right-click disabled during interview");
    };
    document.addEventListener("contextmenu", blockContext);

    // Block F12 and Ctrl+Shift+I/J/C
    const blockShortcuts = (e: KeyboardEvent) => {
      if (e.key === "F12" ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C","i","j","c"].includes(e.key))) {
        e.preventDefault();
        alert("devtools_open", "info", "Developer shortcuts blocked");
      }
    };
    document.addEventListener("keydown", blockShortcuts);

    return () => {
      clearInterval(interval);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, [enabled, alert]);

  // Face detection using MediaPipe FaceDetector (BlazeFace)
  // Works on ALL browsers — detects face count + bounding box position
  // Chrome native FaceDetector used as immediate fallback while MediaPipe loads
  const nativeFaceDetectorRef = useRef<any>(null);
  const mediaPipeDetectorRef = useRef<any>(null);
  const detectionFailedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Chrome native FaceDetector (instant, no download)
    if ("FaceDetector" in window) {
      try {
        nativeFaceDetectorRef.current = new (window as any).FaceDetector({ maxDetectedFaces: 5, fastMode: true });
        console.log("[Proctoring] Chrome FaceDetector available");
      } catch { nativeFaceDetectorRef.current = null; }
    }

    // MediaPipe FaceDetector for all browsers (1MB model, works everywhere)
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FaceDetector, FilesetResolver } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
        );
        if (cancelled) return;
        // Try GPU first, then CPU
        let loaded = false;
        for (const delegate of ["GPU", "CPU"] as const) {
          try {
            mediaPipeDetectorRef.current = await FaceDetector.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
                delegate,
              },
              runningMode: "IMAGE",
              minDetectionConfidence: 0.5,
            });
            console.log(`[Proctoring] MediaPipe FaceDetector loaded (${delegate})`);
            loaded = true;
            break;
          } catch (e) {
            console.warn(`[Proctoring] MediaPipe ${delegate} failed:`, e);
          }
        }
        if (!loaded) console.error("[Proctoring] MediaPipe FaceDetector unavailable");
      } catch (err) {
        console.warn("[Proctoring] MediaPipe FaceDetector failed:", err);
      }
    })();

    const detect = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      let faceCount = -1;
      let faceCenterX: number | null = null;

      // Try MediaPipe first, then Chrome native
      if (mediaPipeDetectorRef.current) {
        try {
          const result = mediaPipeDetectorRef.current.detect(video);
          faceCount = result.detections.length;
          if (faceCount === 1) {
            const box = result.detections[0].boundingBox;
            faceCenterX = box.originX + box.width / 2;
          }
        } catch {}
      } else if (nativeFaceDetectorRef.current) {
        try {
          const faces = await nativeFaceDetectorRef.current.detect(video);
          faceCount = faces.length;
          if (faceCount === 1) {
            faceCenterX = faces[0].boundingBox.x + faces[0].boundingBox.width / 2;
          }
        } catch {}
      }

      if (faceCount === -1 && !detectionFailedRef.current) {
        detectionFailedRef.current = true;
        console.error("[Proctoring] No face detector available — face detection disabled");
        // Don't alert as a strike — it's a system issue, not candidate's fault
        // But log it for the interviewer
        sendProctoringEvent(interviewId, "detection_unavailable", "info", "Face detection unavailable on this browser", token);
      }

      if (faceCount === 0) {
        alert("face_missing", "flag", "No face detected — please face the camera");
      } else if (faceCount > 1) {
        alert("multiple_faces", "flag", `${faceCount} faces detected`);
      } else if (faceCount === 1 && faceCenterX !== null) {
        const offset = Math.abs(faceCenterX - video.videoWidth / 2);
        if (offset > video.videoWidth * 0.25) {
          alert("eye_away", "flag", "Candidate appears to be looking away");
        }
      }
    };

    const interval = setInterval(detect, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      // Clean up MediaPipe GPU resources
      if (mediaPipeDetectorRef.current) {
        try { mediaPipeDetectorRef.current.close(); } catch {}
        mediaPipeDetectorRef.current = null;
      }
    };
  }, [enabled, videoRef, alert]);

  // Virtual camera detection
  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === "videoinput");
        const virtualPatterns = /obs|virtual|manycam|camtwist|snap.?camera|xsplit|streamlabs|fake|droidcam/i;
        for (const device of videoInputs) {
          if (virtualPatterns.test(device.label)) {
            alert("virtual_camera", "flag", `Virtual camera detected: ${device.label}`);
            break;
          }
        }
        // Also check active video track settings
        const video = videoRef.current;
        if (video?.srcObject) {
          const track = (video.srcObject as MediaStream).getVideoTracks()[0];
          if (track) {
            const settings = track.getSettings();
            // Virtual cameras often report 0 for deviceId or unusual frameRate
            if (settings.frameRate && (settings.frameRate < 10 || settings.frameRate > 120)) {
              alert("virtual_camera", "flag", "Unusual camera frame rate detected");
            }
          }
        }
      } catch {}
    })();
  }, [enabled, videoRef, alert]);

  // Periodic photo capture — first at 30s, then every 2 min. WebP + binary upload for minimal size.
  useEffect(() => {
    if (!enabled) return;
    const capture = () => {
      const video = videoRef.current;
      const canvas = photoCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 240);
      photoCountRef.current++;
      const count = photoCountRef.current;
      // WebP binary upload — decent quality for review
      canvas.toBlob((blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append("interviewId", interviewId);
        formData.append("type", "photo_capture");
        formData.append("severity", "info");
        formData.append("message", `Photo #${count}`);
        formData.append("photo", blob, `photo_${count}.webp`);
        if (token) formData.append("token", token);
        fetch("/api/proctor-event", { method: "POST", body: formData }).catch(() => {});
      }, "image/webp", 0.5);
    };
    const first = setTimeout(capture, 30000);
    const interval = setInterval(capture, 120000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [enabled, videoRef, interviewId]);

  // Bright object detection (phone screen) — every 5s
  useEffect(() => {
    if (!enabled) return;
    let consecutiveSuspicious = 0;
    const analyze = () => {
      const video = videoRef.current;
      const canvas = phoneCanvasRef.current;
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
