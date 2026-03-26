"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";

interface Scorecard {
  scores: { dimension: string; score: number }[];
  overall: number;
  recommendation: string;
  overallAssessment: string;
  strengths: string[];
  weaknesses: string[];
}

interface Interview {
  id: string;
  candidateEmail: string;
  role: string;
  level: string;
  status: string;
  scorecard: Scorecard | null;
  createdAt: string;
}

const COLORS = ["#4f46e5", "#7c3aed", "#059669", "#d97706"];

function RadarChart({ candidates }: { candidates: { label: string; scores: { dimension: string; score: number }[]; color: string }[] }) {
  if (candidates.length === 0) return null;

  const dimensions = candidates[0].scores.map((s) => s.dimension);
  const count = dimensions.length;
  if (count < 3) return null;

  const cx = 150, cy = 150, radius = 110;
  const angleStep = (2 * Math.PI) / count;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 5) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridLevels = [1, 2, 3, 4, 5];

  const polygonRefs = useRef<(SVGPolygonElement | null)[]>([]);

  useEffect(() => {
    polygonRefs.current.forEach((el, i) => {
      if (el) {
        el.style.opacity = "0";
        el.style.transform = "scale(0.3)";
        el.style.transformOrigin = `${cx}px ${cy}px`;
        requestAnimationFrame(() => {
          el.style.transition = `opacity 0.6s ease-out ${i * 150}ms, transform 0.6s ease-out ${i * 150}ms`;
          el.style.opacity = "1";
          el.style.transform = "scale(1)";
        });
      }
    });
  }, [candidates.length]);

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[400px] mx-auto">
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={dimensions.map((_, i) => {
            const p = getPoint(i, level);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}
      {dimensions.map((_, i) => {
        const p = getPoint(i, 5);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {candidates.map((cand, ci) => (
        <polygon
          key={ci}
          ref={(el) => { polygonRefs.current[ci] = el; }}
          points={cand.scores.map((s, i) => {
            const p = getPoint(i, s.score);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill={cand.color + "15"}
          stroke={cand.color}
          strokeWidth="2"
        />
      ))}
      {dimensions.map((dim, i) => {
        const p = getPoint(i, 6);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-gray-500 text-[9px]"
          >
            {dim.length > 14 ? dim.slice(0, 12) + "..." : dim}
          </text>
        );
      })}
    </svg>
  );
}

function Badge({ recommendation }: { recommendation: string }) {
  const rec = recommendation.toLowerCase();
  if (rec.includes("strong") && rec.includes("hire") && !rec.includes("no")) return <span className="badge-success">{recommendation}</span>;
  if (rec.includes("hire") && !rec.includes("no")) return <span className="badge-success">{recommendation}</span>;
  if (rec.includes("no")) return <span className="badge-danger">{recommendation}</span>;
  return <span className="badge-info">{recommendation}</span>;
}

export default function ComparePage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/interviews")
      .then((r) => r.json())
      .then((data) => {
        const scored = (data || []).filter((i: Interview) => i.scorecard && i.status === "completed");
        setInterviews(scored);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const selectedInterviews = interviews.filter((i) => selected.includes(i.id));

  const bestCandidate = selectedInterviews.length >= 2
    ? selectedInterviews.reduce((best, curr) =>
        (curr.scorecard?.overall ?? 0) > (best.scorecard?.overall ?? 0) ? curr : best
      )
    : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in-down">
          <h1 className="text-2xl font-bold text-gray-900">Compare Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">Select 2-4 completed interviews to compare side-by-side</p>
        </div>

        {/* Candidate Selector */}
        <div className="card p-5 mb-6 animate-fade-in-up delay-1">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Select Candidates ({selected.length}/4)
          </h3>
          {loading ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-10 w-40 rounded-lg" />
              ))}
            </div>
          ) : interviews.length === 0 ? (
            <p className="text-sm text-gray-500">No completed interviews with scorecards found.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {interviews.map((interview) => {
                const isSelected = selected.includes(interview.id);
                const idx = selected.indexOf(interview.id);
                return (
                  <button
                    key={interview.id}
                    onClick={() => toggleSelect(interview.id)}
                    disabled={!isSelected && selected.length >= 4}
                    className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 border ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    }`}
                  >
                    {isSelected && (
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[idx] }} />
                    )}
                    {interview.candidateEmail || interview.id.slice(0, 8)}
                    <span className="text-gray-400 ml-2">
                      {interview.scorecard?.overall ?? "?"}/5
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Comparison */}
        {selectedInterviews.length >= 2 && (
          <>
            {/* Radar Chart */}
            <div className="card p-5 mb-6 animate-fade-in-up delay-2">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Performance Radar</h3>
              <div className="flex items-center justify-center gap-4 mb-4 flex-wrap">
                {selectedInterviews.map((interview, i) => (
                  <div key={interview.id} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-xs text-gray-600">
                      {interview.candidateEmail || interview.id.slice(0, 8)}
                    </span>
                  </div>
                ))}
              </div>
              <RadarChart
                candidates={selectedInterviews.map((interview, i) => ({
                  label: interview.candidateEmail || interview.id.slice(0, 8),
                  scores: interview.scorecard?.scores || [],
                  color: COLORS[i],
                }))}
              />
            </div>

            {/* Side-by-side Scorecards */}
            <div className={`grid gap-4 mb-6 ${
              selectedInterviews.length === 2 ? "grid-cols-2" :
              selectedInterviews.length === 3 ? "grid-cols-3" : "grid-cols-4"
            }`}>
              {selectedInterviews.map((interview, i) => {
                const sc = interview.scorecard;
                if (!sc) return null;
                const isBest = bestCandidate?.id === interview.id;
                return (
                  <div
                    key={interview.id}
                    className={`card p-5 animate-fade-in-up ${isBest ? "ring-2 ring-green-500 ring-offset-2" : ""} ${i === 0 ? "animate-fade-in-left" : i === selectedInterviews.length - 1 ? "animate-fade-in-right" : "animate-fade-in-up"}`}
                    style={{ animationDelay: `${i * 100}ms`, opacity: 0 }}
                  >
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                        <h4 className="text-sm font-semibold text-gray-900 truncate">
                          {interview.candidateEmail || interview.id.slice(0, 8)}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl font-bold text-gray-900">{sc.overall}</span>
                        <span className="text-sm text-gray-500">/5</span>
                        {isBest && (
                          <span className="ml-auto badge-success !text-[10px]">TOP</span>
                        )}
                      </div>
                      <Badge recommendation={sc.recommendation} />
                    </div>

                    <div className="space-y-2 mb-4">
                      {sc.scores.map((s) => {
                        const maxScore = Math.max(
                          ...selectedInterviews.map(
                            (si) => si.scorecard?.scores.find((x) => x.dimension === s.dimension)?.score ?? 0
                          )
                        );
                        const minScore = Math.min(
                          ...selectedInterviews.map(
                            (si) => si.scorecard?.scores.find((x) => x.dimension === s.dimension)?.score ?? 0
                          )
                        );
                        const isBestDim = s.score === maxScore && maxScore !== minScore;
                        const isWorstDim = s.score === minScore && maxScore !== minScore;
                        return (
                          <div key={s.dimension}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-500 truncate mr-2">{s.dimension}</span>
                              <span className={`font-medium ${
                                isBestDim ? "text-green-600" : isWorstDim ? "text-red-600" : "text-gray-700"
                              }`}>
                                {s.score}/5
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${
                                  isBestDim ? "bg-green-500" : isWorstDim ? "bg-red-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${(s.score / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Strengths</p>
                        <div className="space-y-1">
                          {sc.strengths.slice(0, 3).map((s, j) => (
                            <p key={j} className="text-xs text-green-700 leading-snug">+ {s}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Weaknesses</p>
                        <div className="space-y-1">
                          {sc.weaknesses.slice(0, 3).map((w, j) => (
                            <p key={j} className="text-xs text-red-700 leading-snug">- {w}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hiring Recommendation */}
            {bestCandidate && (
              <div className="card p-5 border-green-200 bg-green-50/50 animate-scale-in" style={{ animationDelay: "300ms", opacity: 0 }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-green-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700">Hiring Recommendation</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Based on overall scores, <span className="text-green-700 font-semibold">{bestCandidate.candidateEmail || bestCandidate.id.slice(0, 8)}</span> is
                  the strongest candidate with an overall score of <span className="text-gray-900 font-semibold">{bestCandidate.scorecard?.overall}/5</span>.
                  {bestCandidate.scorecard?.recommendation && (
                    <> Recommendation: <span className="text-green-700">{bestCandidate.scorecard.recommendation}</span>.</>
                  )}
                </p>
                {selectedInterviews.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedInterviews
                      .sort((a, b) => (b.scorecard?.overall ?? 0) - (a.scorecard?.overall ?? 0))
                      .map((interview, i) => (
                        <div key={interview.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">#{i + 1}</span>
                          <span>{interview.candidateEmail || interview.id.slice(0, 8)}</span>
                          <span className="text-gray-400">({interview.scorecard?.overall}/5)</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {selectedInterviews.length === 1 && (
          <div className="text-center py-12 text-gray-500 text-sm animate-fade-in">
            Select at least one more candidate to compare.
          </div>
        )}

        {selectedInterviews.length === 0 && !loading && interviews.length > 0 && (
          <div className="text-center py-12 text-gray-500 text-sm animate-fade-in">
            Select candidates above to start comparing.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
