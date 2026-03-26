"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";

interface ScoreItem {
  dimension: string;
  score: number;
}

interface Evidence {
  dimension: string;
  quote: string;
  assessment: string;
}

interface ProctoringEvent {
  type: string;
  severity: string;
  message: string;
  timestamp: string;
}

interface TranscriptMessage {
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
}

interface InterviewData {
  id: string;
  candidateName: string;
  role: string;
  level: string;
  date: string;
  duration: number;
  scorecard: {
    recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire" | "strong_no_hire";
    overallAssessment: string;
    scores: ScoreItem[];
    strengths: string[];
    weaknesses: string[];
    evidence: Evidence[];
  } | null;
  proctoring: ProctoringEvent[];
  transcript: TranscriptMessage[];
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 5) * circumference;
  const color =
    score > 3.5
      ? "text-green-600"
      : score >= 2.5
        ? "text-amber-600"
        : "text-red-600";
  const strokeColor =
    score > 3.5
      ? "#16a34a"
      : score >= 2.5
        ? "#d97706"
        : "#dc2626";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="4" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${color}`}>
            {score.toFixed(1)}
          </span>
        </div>
      </div>
      <span className="text-xs text-gray-500 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const config: Record<string, { label: string; className: string }> = {
    strong_hire: { label: "Strong Hire", className: "badge-success" },
    hire: { label: "Hire", className: "badge-success" },
    lean_hire: { label: "Lean Hire", className: "badge-success" },
    lean_no_hire: { label: "Lean No Hire", className: "badge-warning" },
    no_hire: { label: "No Hire", className: "badge-danger" },
    strong_no_hire: { label: "Strong No Hire", className: "badge-danger" },
  };
  const c = config[recommendation] || config.no_hire;
  return <span className={c.className}>{c.label}</span>;
}

export default function ReviewPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<InterviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"evidence" | "proctoring" | "transcript">("evidence");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/interview/${id}`);
        if (!res.ok) throw new Error("Interview not found");
        const json = await res.json();

        if (json.scorecard && !json.scorecard.scores) {
          const sc = json.scorecard;
          json.scorecard = {
            scores: [
              { dimension: "Technical Depth", score: sc.technicalDepth ?? sc.overall ?? 3 },
              { dimension: "Communication", score: sc.communication ?? sc.overall ?? 3 },
              { dimension: "Problem Solving", score: sc.problemSolving ?? sc.overall ?? 3 },
              { dimension: "Domain Knowledge", score: sc.domainKnowledge ?? sc.overall ?? 3 },
              { dimension: "Culture Fit", score: sc.cultureFit ?? sc.overall ?? 3 },
            ],
            overall: sc.overall ?? 3,
            recommendation: sc.recommendation ?? "no_hire",
            overallAssessment: sc.overallAssessment ?? sc.summary ?? "No assessment available.",
            strengths: sc.strengths ?? [],
            weaknesses: sc.weaknesses ?? [],
            evidence: sc.evidence ?? [],
          };
        }

        if (json.transcript) {
          json.transcript = json.transcript.map((t: any) => ({
            ...t,
            content: t.content || t.text || "",
          }));
        }

        setData(json);
      } catch (e: any) {
        setError(e.message || "Failed to load interview");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading interview scorecard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="card p-8 text-center max-w-md mx-auto">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-gray-700">{error || "Interview not found"}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!data.scorecard) {
    return (
      <DashboardLayout>
        <div className="card p-8 text-center max-w-md mx-auto space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No Scorecard Yet</h2>
          <p className="text-sm text-gray-500">
            {data.transcript?.length > 0
              ? "This interview has transcript data but hasn't been scored yet."
              : "This interview has no transcript data to score."}
          </p>
          {data.transcript?.length > 0 && (
            <button
              id="generate-scorecard-btn"
              onClick={async () => {
                const btn = document.getElementById("generate-scorecard-btn") as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = "Generating...";
                try {
                  const res = await fetch("/api/scorecard", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interviewId: id }),
                  });
                  if (res.ok) {
                    window.location.reload();
                  } else {
                    btn.textContent = "Failed — Try Again";
                    btn.disabled = false;
                  }
                } catch {
                  btn.textContent = "Failed — Try Again";
                  btn.disabled = false;
                }
              }}
              className="btn-primary inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Generate Scorecard
            </button>
          )}
          <a href={`/dashboard/${id}`} className="block text-xs text-gray-500 hover:text-indigo-600 transition mt-2">
            View interview details
          </a>
        </div>
      </DashboardLayout>
    );
  }

  const { scorecard, proctoring, transcript } = data;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="card p-6 animate-fade-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">
                {data.candidateName || "Candidate"}
              </h1>
              <RecommendationBadge recommendation={scorecard.recommendation} />
            </div>
            <p className="text-sm text-gray-500">
              {data.role} ({data.level})
            </p>
          </div>
          <div className="text-sm text-gray-500 sm:text-right">
            <p>{new Date(data.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            <p>{data.duration} minutes</p>
            <button
              onClick={async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = "Rescoring...";
                try {
                  const res = await fetch("/api/scorecard", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interviewId: id }),
                  });
                  if (res.ok) {
                    btn.textContent = "Done!";
                    setTimeout(() => window.location.reload(), 1000);
                  } else {
                    btn.textContent = "Failed";
                    btn.disabled = false;
                  }
                } catch {
                  btn.textContent = "Failed";
                  btn.disabled = false;
                }
              }}
              className="mt-1 btn-secondary text-xs !px-3 !py-1.5 inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Rescore
            </button>
          </div>
        </div>

        {/* Score Rings */}
        <div className="card p-6 animate-fade-in-delay-1">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">
            Scores
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap justify-center gap-4 sm:gap-6 md:gap-10">
            {scorecard.scores.map((s) => (
              <ScoreRing key={s.dimension} score={s.score} label={s.dimension} />
            ))}
          </div>
        </div>

        {/* Assessment Summary */}
        <div className="card p-6 space-y-5 animate-fade-in-delay-2">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Assessment
          </h2>
          <p className="text-gray-700 text-sm leading-relaxed">
            {scorecard.overallAssessment}
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-green-700">Strengths</h3>
              <ul className="space-y-1.5">
                {scorecard.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-red-700">Areas for Improvement</h3>
              <ul className="space-y-1.5">
                {scorecard.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Tabbed sections */}
        <div className="card overflow-hidden animate-fade-in-delay-3">
          <div className="flex border-b border-gray-200">
            {(["evidence", "proctoring", "transcript"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors
                  ${activeTab === tab
                    ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                    : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Evidence */}
            {activeTab === "evidence" && (
              <div className="space-y-3">
                {scorecard.evidence.map((ev, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-100">
                    <span className="text-xs font-medium text-indigo-600 uppercase tracking-wider">
                      {ev.dimension}
                    </span>
                    <blockquote className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">
                      &ldquo;{ev.quote}&rdquo;
                    </blockquote>
                    <p className="text-sm text-gray-700">{ev.assessment}</p>
                  </div>
                ))}
                {scorecard.evidence.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-8">No evidence recorded</p>
                )}
              </div>
            )}

            {/* Proctoring */}
            {activeTab === "proctoring" && (
              <div className="space-y-2">
                {proctoring.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-8 h-8 mx-auto text-green-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <p className="text-sm text-gray-500">No proctoring alerts recorded</p>
                  </div>
                ) : (
                  proctoring.map((event, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        event.severity === "flag" ? "bg-red-500" : event.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                      }`} />
                      <span className="text-xs text-gray-400 font-mono shrink-0">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-sm text-gray-700">{event.message}</span>
                      <span className="ml-auto text-xs text-gray-400 capitalize">
                        {event.severity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Transcript */}
            {activeTab === "transcript" && (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {transcript.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No transcript available</p>
                ) : (
                  transcript.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === "ai" ? "" : "flex-row-reverse"}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-medium
                          ${msg.role === "ai"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-indigo-50 text-indigo-600"
                          }`}
                      >
                        {msg.role === "ai" ? "AI" : "C"}
                      </div>
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm
                          ${msg.role === "ai"
                            ? "bg-gray-50 text-gray-700"
                            : "bg-indigo-50 text-gray-700"
                          }`}
                      >
                        <p>{msg.content}</p>
                        <span className="block text-[10px] text-gray-400 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
