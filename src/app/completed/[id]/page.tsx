"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function CompletedPage() {
  const { id } = useParams<{ id: string }>();
  const [interview, setInterview] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/interview/${id}`)
      .then((r) => r.json())
      .then(setInterview)
      .catch(console.error);
  }, [id]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          {/* Success checkmark */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
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

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Interview Completed
          </h1>

          <p className="text-gray-500 leading-relaxed mb-6">
            Thank you for taking the time to complete this interview. Your responses have been recorded successfully.
          </p>

          <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 mb-6 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-600">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Role</p>
                <p className="text-sm text-gray-700">{interview?.role || "..."} — {interview?.level || "..."}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-indigo-600">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Duration</p>
                <p className="text-sm text-gray-700">{interview?.duration || 30} minutes</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-green-500">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="text-sm text-green-600 font-medium">Submitted for Review</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-700 mb-1">What happens next?</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Our team will review your interview and get back to you shortly.
                  You will be contacted via email with the results and next steps in the process.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            You can close this window now.
          </p>
        </div>
      </div>
    </div>
  );
}
