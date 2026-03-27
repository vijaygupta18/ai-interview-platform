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
    await fetch("/api/proctor-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, type, severity, message, token }),
    });
  } catch {}
}

export default function Proctoring({ videoRef, interviewId, enabled, onAlert, token }: ProctoringProps) {
  const faceDetectorRef = useRef<any>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phoneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastTabSwitchRef = useRef(0);
  const photoCountRef = useRef(0);
  const lastAlertTimeRef = useRef<Record<string, number>>({});

  const captureViolationPhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = photoCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 160, 120);
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
    }, "image/webp", 0.3);
  }, [videoRef, interviewId, token]);

  const alert = useCallback(
    (type: string, severity: string, message: string) => {
      const now = Date.now();
      const cooldowns: Record<string, number> = {
        second_monitor: 300000,
        multiple_faces: 30000,
        face_missing: 10000,
        eye_away: 15000,
        devtools_open: 60000,
        phone_detected: 20000,
        fullscreen_exit: 5000,
        window_blur: 5000,
        virtual_camera: 300000,
        copy_paste: 5000,
      };
      const cooldown = cooldowns[type] || 5000;
      const lastTime = lastAlertTimeRef.current[type] || 0;
      if (now - lastTime < cooldown) return;
      lastAlertTimeRef.current[type] = now;

      onAlert({ type, severity, message });
      sendProctoringEvent(interviewId, type, severity, message, token);
      if (severity === "flag") captureViolationPhoto();
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

    const fireAlert = (duration: number) => {
      const now = Date.now();
      if (now - lastAlert < 5000) return; // 5s global debounce
      lastAlert = now;
      if (duration > 10000) {
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
      if (duration > 2000) {
        // Sustained loss >2s — definite flag
        fireAlert(duration);
      } else {
        // Short blur — track frequency. 3+ short blurs in 60s = suspicious
        shortBlurCount++;
        if (shortBlurResetTimer) clearTimeout(shortBlurResetTimer);
        shortBlurResetTimer = setTimeout(() => { shortBlurCount = 0; }, 60000);
        if (shortBlurCount >= 3) {
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
        if (duration > 2000) fireAlert(duration);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Periodic check removed — blur+visibility+focus cover all cases;
    // periodic poll caused too many false positives from momentary focus loss

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (shortBlurResetTimer) clearTimeout(shortBlurResetTimer);
    };
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
      const canvas = faceCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces.length === 0) {
            alert("face_missing", "flag", "No face detected — please face the camera");
          } else if (faces.length > 1) {
            alert("multiple_faces", "flag", `${faces.length} faces detected`);
          } else {
            const face = faces[0];
            const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
            const offset = Math.abs(faceCenterX - video.videoWidth / 2);
            if (offset > video.videoWidth * 0.4) {
              alert("eye_away", "flag", "Candidate appears to be looking away");
            }
          }
        } catch {}
      } else {
        // Canvas fallback — motion-based presence detection (race-neutral alternative to skin-tone)
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 80, 60);
        const currentData = ctx.getImageData(0, 0, 80, 60).data;
        if (prevFrameRef.current) {
          let changedPixels = 0;
          const totalPixels = 80 * 60;
          for (let i = 0; i < currentData.length; i += 4) {
            const diff = Math.abs(currentData[i] - prevFrameRef.current[i]) +
                         Math.abs(currentData[i+1] - prevFrameRef.current[i+1]) +
                         Math.abs(currentData[i+2] - prevFrameRef.current[i+2]);
            if (diff > 30) changedPixels++;
          }
          if (changedPixels / totalPixels < 0.02) {
            alert("face_missing", "flag", "No movement detected — please face the camera");
          }
        }
        prevFrameRef.current = new Uint8ClampedArray(currentData);
      }
    };

    const interval = setInterval(detect, 4000);
    return () => clearInterval(interval);
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
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 160, 120);
      photoCountRef.current++;
      const count = photoCountRef.current;
      // Use WebP (30% smaller than JPEG), send as binary blob via FormData (no base64 overhead)
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
      }, "image/webp", 0.3);
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
