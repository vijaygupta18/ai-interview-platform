"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { normalizeScorecard } from "@/lib/normalize-scorecard";

const dimensionLabels: Record<string, string> = {
  technicalDepth: "Technical Depth",
  communication: "Communication",
  problemSolving: "Problem Solving",
  domainKnowledge: "Domain Knowledge",
  cultureFit: "Culture Fit",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecommendation(rec: string) {
  return rec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = (value / 5) * 100;
  const color =
    value >= 4 ? "bg-green-500" : value >= 3 ? "bg-blue-500" : value >= 2 ? "bg-amber-500" : "bg-red-500";
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (el) {
      el.style.width = "0%";
      requestAnimationFrame(() => {
        el.style.width = `${pct}%`;
      });
    }
  }, [pct]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          ref={barRef}
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: "0%" }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-8 text-right">{value}</span>
    </div>
  );
}

const recommendationBadge: Record<string, string> = {
  strong_hire: "badge-success",
  hire: "badge-success",
  no_hire: "badge-danger",
  strong_no_hire: "badge-danger",
};

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="skeleton h-5 w-32 mb-4" />
      <div className="space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}

export default function InterviewDetailPage({ params }: { params: { id: string } }) {
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scoringStatus, setScoringStatus] = useState<string>("unknown");
  const [selectedPhoto, setSelectedPhoto] = useState<{ photo: string; timestamp: string } | null>(null);

  useEffect(() => {
    fetch(`/api/interview/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.scorecard && !data.scorecard.scores && data.scorecard.technicalDepth !== undefined) {
          data.scorecard = normalizeScorecard(data.scorecard);
        }
        setInterview(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  // Poll scoring status if no scorecard yet
  useEffect(() => {
    if (!interview || interview.scorecard) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/scoring-status/${params.id}`);
        const data = await res.json();
        setScoringStatus(data.status);
        if (data.status === "completed") {
          // Reload to get the scorecard
          window.location.reload();
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [interview, params.id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 text-sm mb-6">
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-4 w-4" />
            <div className="skeleton h-4 w-40" />
          </div>
          <SkeletonCard className="mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="space-y-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!interview) {
    return (
      <DashboardLayout>
        <div className="card p-8 text-center max-w-md mx-auto animate-scale-in">
          <p className="text-gray-500">Interview not found</p>
          <Link href="/dashboard" className="text-sm text-indigo-600 mt-4 block">Back to Dashboard</Link>
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "waiting": return <span className="badge-warning">Waiting</span>;
      case "in_progress": return <span className="badge-info animate-pulse">In Progress</span>;
      case "completed": return <span className="badge-success">Completed</span>;
      default: return <span className="badge-info">{status}</span>;
    }
  };

  const flagCount = interview.proctoring?.filter((p: any) => p.severity === "flag").length || 0;
  const warningCount = interview.proctoring?.filter((p: any) => p.severity === "warning").length || 0;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6 animate-fade-in-down">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 transition-colors">
            Interviews
          </Link>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-900 font-medium">
            {interview.candidateEmail || interview.resumeFileName}
          </span>
        </div>

        {/* Header Card */}
        <div className="card p-6 mb-6 animate-fade-in-up">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {interview.candidateEmail || interview.resumeFileName}
              </h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="badge-info">{interview.role}</span>
                <span className="badge-info">{interview.level}</span>
                {statusBadge(interview.status)}
                <span className="text-sm text-gray-500">{interview.duration}min</span>
              </div>
            </div>
            {interview.scorecard && (
              <div className="text-center">
                <span className={recommendationBadge[interview.scorecard.recommendation] || "badge-info"}>
                  {formatRecommendation(interview.scorecard.recommendation)}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-gray-100 text-sm">
            <div>
              <span className="text-gray-500">Created:</span>{" "}
              <span className="text-gray-700">{formatDate(interview.createdAt)}</span>
            </div>
            <div>
              <span className="text-gray-500">Started:</span>{" "}
              <span className="text-gray-700">{formatDate(interview.startedAt)}</span>
            </div>
            <div>
              <span className="text-gray-500">Ended:</span>{" "}
              <span className="text-gray-700">{formatDate(interview.endedAt)}</span>
            </div>
            <div>
              <span className="text-gray-500">Focus:</span>{" "}
              <span className="text-gray-700">{interview.focusAreas.join(", ")}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Scorecard + Transcript */}
          <div className="lg:col-span-2 space-y-6">
            {/* Scorecard Status */}
            {!interview.scorecard && interview.transcript.length > 0 && (
              <div className="card p-6 text-center animate-fade-in-up delay-1">
                {scoringStatus === "generating" ? (
                  <>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <svg className="w-5 h-5 text-indigo-600 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                      </svg>
                      <span className="text-sm font-medium text-indigo-600">AI is analyzing the interview...</span>
                    </div>
                    <p className="text-xs text-gray-400">Scorecard will appear automatically when ready. Checking every 5 seconds.</p>
                  </>
                ) : scoringStatus === "failed" ? (
                  <>
                    <p className="text-sm text-red-600 mb-3">Scorecard generation failed. You can retry.</p>
                    <button
                      onClick={async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        btn.textContent = "Generating...";
                        try {
                          const res = await fetch("/api/scorecard", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ interviewId: interview.id }),
                          });
                          if (res.ok) setTimeout(() => window.location.reload(), 1000);
                          else { btn.textContent = "Failed — Try Again"; btn.disabled = false; }
                        } catch { btn.textContent = "Failed — Try Again"; btn.disabled = false; }
                      }}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      Retry Scoring
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 mb-4">No scorecard generated yet.</p>
                    <button
                      onClick={async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        btn.textContent = "Generating...";
                        setScoringStatus("generating");
                        try {
                          const res = await fetch("/api/scorecard", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ interviewId: interview.id }),
                          });
                          if (res.ok) setTimeout(() => window.location.reload(), 1000);
                          else if (res.status === 409) setScoringStatus("generating");
                          else { btn.textContent = "Failed — Try Again"; btn.disabled = false; setScoringStatus("failed"); }
                        } catch { btn.textContent = "Failed — Try Again"; btn.disabled = false; setScoringStatus("failed"); }
                      }}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Generate Scorecard
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Scorecard */}
            {interview.scorecard && (
              <div className="card p-6 animate-fade-in-up delay-1">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Scorecard</h2>
                  <button
                    onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      btn.textContent = "Rescoring...";
                      try {
                        const res = await fetch("/api/scorecard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ interviewId: interview.id }),
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
                    className="btn-secondary text-xs !px-3 !py-1.5 inline-flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Rescore
                  </button>
                </div>

                {/* Overall Score */}
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
                    <span className="text-2xl font-bold text-indigo-600">{interview.scorecard.overall}</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Overall Score</p>
                    <p className="text-sm text-gray-700 mt-1">{interview.scorecard.overallAssessment}</p>
                  </div>
                </div>

                {/* Dimension Scores */}
                <div className="space-y-3 mb-6">
                  {Object.entries(dimensionLabels).map(([key, label]) => (
                    <ScoreBar
                      key={key}
                      label={label}
                      value={(interview.scorecard as any)[key] as number}
                    />
                  ))}
                </div>

                {/* Strengths & Weaknesses */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-medium text-green-700 mb-2">Strengths</h3>
                    <ul className="space-y-1">
                      {interview.scorecard.strengths.map((s: any, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-red-700 mb-2">Weaknesses</h3>
                    <ul className="space-y-1">
                      {interview.scorecard.weaknesses.map((w: any, i: number) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Evidence */}
                {interview.scorecard.evidence.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Evidence</h3>
                    <div className="space-y-3">
                      {interview.scorecard.evidence.map((e: any, i: number) => (
                        <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}>
                          <p className="text-xs font-medium text-indigo-600 mb-1">{e.dimension}</p>
                          <p className="text-sm text-gray-500 italic">&ldquo;{e.quote}&rdquo;</p>
                          <p className="text-sm text-gray-700 mt-1">{e.assessment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Transcript */}
            <div className="card p-6 animate-fade-in-up delay-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Transcript
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({interview.transcript.length} messages)
                </span>
              </h2>

              {interview.transcript.length === 0 ? (
                <p className="text-gray-400 text-sm">No transcript entries yet.</p>
              ) : (
                <div className="space-y-4">
                  {interview.transcript.map((entry: any, i: number) => (
                    <div
                      key={i}
                      className={`flex gap-3 animate-fade-in-up ${entry.role === "ai" ? "" : "flex-row-reverse"}`}
                      style={{ animationDelay: `${i * 30}ms`, opacity: 0 }}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          entry.role === "ai"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-indigo-50 text-indigo-600"
                        }`}
                      >
                        {entry.role === "ai" ? "AI" : "C"}
                      </div>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          entry.role === "ai"
                            ? "bg-gray-50 rounded-tl-sm"
                            : "bg-indigo-50 rounded-tr-sm"
                        }`}
                      >
                        <p className="text-sm text-gray-700 leading-relaxed">{entry.text}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(entry.timestamp).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Resume Info */}
            <div className="card p-6 animate-fade-in-right delay-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Resume</h2>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-700 truncate">{interview.resumeFileName}</span>
                </div>
              </div>
              {interview.resume && (
                <div className="mt-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed">
                    {interview.resume.slice(0, 1500)}
                    {interview.resume.length > 1500 ? "..." : ""}
                  </pre>
                </div>
              )}
            </div>

            {/* Proctoring Events */}
            <div className="card p-6 animate-fade-in-right delay-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Proctoring</h2>
              <p className="text-xs text-gray-500 mb-4">
                {flagCount} flag{flagCount !== 1 ? "s" : ""}, {warningCount} warning{warningCount !== 1 ? "s" : ""}
              </p>

              {interview.proctoring.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-10 h-10 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-2">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-sm text-green-600">No issues detected</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {interview.proctoring.map((event: any, i: number) => (
                    <div
                      key={i}
                      className={`rounded-lg p-3 border ${
                        event.severity === "flag"
                          ? "bg-red-50 border-red-100"
                          : "bg-amber-50 border-amber-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${event.severity === "flag" ? "bg-red-500" : "bg-amber-500"}`} />
                          <span className={`text-xs font-medium uppercase ${event.severity === "flag" ? "text-red-700" : "text-amber-700"}`}>
                            {event.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(event.timestamp).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{event.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Proctoring Photos */}
            {interview.proctoring.some((e: any) => e.photo) && (
              <div className="card p-6 animate-fade-in-right delay-3">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Candidate Snapshots</h2>
                <p className="text-xs text-gray-500 mb-3">Periodic photos captured during the interview for integrity verification</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
                  {interview.proctoring
                    .filter((e: any) => e.photo)
                    .map((e: any, i: number) => (
                      <div key={i} className="relative group">
                        <img
                          src={e.photo}
                          alt={`Capture ${i + 1}`}
                          className="w-full aspect-[4/3] object-cover rounded-lg border border-gray-200 hover:border-indigo-300 transition-all cursor-pointer hover:shadow-md"
                          onClick={() => setSelectedPhoto({ photo: e.photo, timestamp: e.timestamp })}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-lg px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] text-white">
                            {new Date(e.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Proctoring Notes from Scorecard */}
            {interview.scorecard?.proctoringNotes && (
              <div className="card p-6 animate-fade-in-right delay-3">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Proctoring Assessment</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{interview.scorecard.proctoringNotes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.photo}
              alt="Candidate snapshot"
              className="w-full rounded-xl shadow-2xl border border-gray-700"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-xl px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-white">
                {new Date(selectedPhoto.timestamp).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </span>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="text-xs text-gray-300 hover:text-white px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
