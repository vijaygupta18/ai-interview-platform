"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function CompletedPage() {
  const { id } = useParams<{ id: string }>();
  const [interview, setInterview] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    // Fetch minimal interview info (token from URL for auth)
    const token = new URLSearchParams(window.location.search).get("token");
    const params = token ? `?token=${token}` : "";
    fetch(`/api/interview/${id}${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setInterview(data); })
      .catch(() => {});

    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, [id]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Confetti-like celebration dots */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => {
            // Deterministic positions based on index (avoids SSR hydration mismatch from Math.random)
            const seed = (i * 7 + 3) % 20;
            return (
            <div
              key={i}
              className="absolute rounded-full animate-fade-in"
              style={{
                width: `${4 + (seed % 6)}px`,
                height: `${4 + ((seed * 3) % 6)}px`,
                left: `${10 + ((seed * 17) % 80)}%`,
                top: `${5 + ((seed * 13) % 40)}%`,
                backgroundColor: ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#60a5fa"][i % 5],
                opacity: 0,
                animation: `fadeInUp 0.6s ease-out ${i * 80}ms forwards, fadeIn 2s ease-out ${i * 80 + 600}ms forwards`,
                animationFillMode: "forwards",
              }}
            />
          );})}
        </div>
      )}

      <div className="w-full max-w-lg relative z-10">
        {/* Company branding area */}
        <div className="text-center mb-6 animate-fade-in-down">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-gray-900">InterviewAI</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-200/50 p-8 sm:p-10 text-center animate-fade-in-up">
          {/* Success checkmark with ring animation */}
          <div className="mx-auto mb-8 relative">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-green-50 animate-scale-in" style={{ animationDelay: "200ms", opacity: 0 }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-10 w-10 text-green-500"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ animationDelay: "400ms", opacity: 0 }}>
              <div className="w-20 h-20 rounded-full border-2 border-green-200 animate-ping opacity-20" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2 animate-fade-in-up" style={{ animationDelay: "300ms", opacity: 0 }}>
            Interview Complete
          </h1>

          <p className="text-gray-500 leading-relaxed mb-8 max-w-sm mx-auto animate-fade-in-up" style={{ animationDelay: "400ms", opacity: 0 }}>
            Thank you for your time and thoughtful responses. Your interview has been submitted successfully.
          </p>

          <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 mb-8 text-left space-y-4 animate-fade-in-up" style={{ animationDelay: "500ms", opacity: 0 }}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-600">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Role</p>
                <p className="text-sm text-gray-800 font-medium">{interview?.role || "..."} &middot; {interview?.level || "..."}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-600">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Duration</p>
                <p className="text-sm text-gray-800 font-medium">{interview?.duration || 30} minutes</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-green-500">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Status</p>
                <p className="text-sm text-green-600 font-semibold">Submitted for Review</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 mb-8 animate-slide-in-up" style={{ animationDelay: "600ms", opacity: 0 }}>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 mt-0.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-600">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800 mb-1">What happens next?</p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Our team will review your interview responses and provide feedback. You&apos;ll be contacted via email with next steps.
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-400 animate-fade-in" style={{ animationDelay: "700ms", opacity: 0 }}>
            You can safely close this window now.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 animate-fade-in" style={{ animationDelay: "800ms", opacity: 0 }}>
          Powered by InterviewAI
        </p>
      </div>
    </div>
  );
}
