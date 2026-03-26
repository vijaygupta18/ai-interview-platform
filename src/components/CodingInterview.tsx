"use client";

import { useState } from "react";
import CodeEditor from "./CodeEditor";

interface CodingInterviewProps {
  interviewId: string;
  question: string;
  language: string;
}

export default function CodingInterview({ interviewId, question, language }: CodingInterviewProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setFeedback("");

    try {
      const res = await fetch("/api/ai-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          transcript: [
            {
              role: "candidate",
              text: `[CODE SUBMISSION]\nLanguage: ${language}\nProblem: ${question}\n\n\`\`\`${language}\n${code}\n\`\`\``,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      const data = await res.json();
      if (data.text) {
        setFeedback(data.text);
        setSubmitted(true);
      } else {
        setFeedback("Failed to get feedback. Please try again.");
      }
    } catch {
      setFeedback("Error submitting code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Question Card */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">Coding Challenge</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{question}</p>
      </div>

      {/* Code Editor */}
      <CodeEditor language={language} onCodeChange={setCode} />

      {/* Submit Button */}
      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={submitting || !code.trim()}
          className="w-full py-3 rounded-lg font-medium text-sm transition-all
            bg-blue-600 hover:bg-blue-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              Evaluating Code...
            </span>
          ) : (
            "Submit Code"
          )}
        </button>
      )}

      {/* AI Feedback */}
      {feedback && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-300">AI Feedback</h3>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{feedback}</p>
        </div>
      )}
    </div>
  );
}
