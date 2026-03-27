"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  candidateName: string;
  role: string;
  level: string;
  status: string;
  scorecard: Scorecard | null;
  createdAt: string;
}

type SortField = "date" | "score" | "name";
type SortDir = "asc" | "desc";

const COLORS = ["#4f46e5", "#7c3aed", "#059669", "#d97706"];
const PAGE_SIZE = 12;

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(score: number) {
  if (score >= 3.5) return "text-green-600";
  if (score >= 2.5) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number) {
  if (score >= 3.5) return "#22c55e";
  if (score >= 2.5) return "#f59e0b";
  return "#ef4444";
}

function RecBadge({ recommendation }: { recommendation: string }) {
  const rec = recommendation.toLowerCase();
  if (rec.includes("strong") && rec.includes("hire") && !rec.includes("no"))
    return <span className="badge-success">{recommendation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
  if (rec.includes("hire") && !rec.includes("no"))
    return <span className="badge-success">{recommendation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
  if (rec.includes("no"))
    return <span className="badge-danger">{recommendation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
  return <span className="badge-info">{recommendation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
}

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

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3"><div className="skeleton h-4 w-4 rounded" /></td>
      <td className="px-4 py-3"><div className="skeleton h-4 w-32" /><div className="skeleton h-3 w-24 mt-1" /></td>
      <td className="px-4 py-3"><div className="skeleton h-4 w-24" /><div className="skeleton h-3 w-16 mt-1" /></td>
      <td className="px-4 py-3"><div className="skeleton h-4 w-8" /></td>
      <td className="px-4 py-3"><div className="skeleton h-5 w-16 rounded-full" /></td>
      <td className="px-4 py-3"><div className="skeleton h-4 w-20" /></td>
    </tr>
  );
}

export default function ComparePage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);

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

  // Extract unique roles and levels for filter dropdowns
  const uniqueRoles = useMemo(() => {
    const roles = new Set(interviews.map((i) => i.role).filter(Boolean));
    return Array.from(roles).sort();
  }, [interviews]);

  const uniqueLevels = useMemo(() => {
    const levels = new Set(interviews.map((i) => i.level).filter(Boolean));
    return Array.from(levels).sort();
  }, [interviews]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let result = interviews;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          (i.candidateName || "").toLowerCase().includes(q) ||
          i.candidateEmail.toLowerCase().includes(q) ||
          i.role.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== "all") {
      result = result.filter((i) => i.role === roleFilter);
    }

    if (levelFilter !== "all") {
      result = result.filter((i) => i.level === levelFilter);
    }

    if (verdictFilter !== "all") {
      if (verdictFilter === "hire") {
        result = result.filter(
          (i) =>
            i.scorecard?.recommendation &&
            i.scorecard.recommendation.toLowerCase().includes("hire") &&
            !i.scorecard.recommendation.toLowerCase().includes("no")
        );
      } else if (verdictFilter === "no_hire") {
        result = result.filter(
          (i) =>
            i.scorecard?.recommendation?.toLowerCase().includes("no_hire") ||
            i.scorecard?.recommendation?.toLowerCase().includes("strong_no") ||
            i.scorecard?.recommendation?.toLowerCase().includes("no hire")
        );
      }
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "score") {
        cmp = (a.scorecard?.overall ?? -1) - (b.scorecard?.overall ?? -1);
      } else if (sortField === "name") {
        const nameA = (a.candidateName || a.candidateEmail || "").toLowerCase();
        const nameB = (b.candidateName || b.candidateEmail || "").toLowerCase();
        cmp = nameA.localeCompare(nameB);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [interviews, search, roleFilter, levelFilter, verdictFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [search, roleFilter, levelFilter, verdictFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const selectedInterviews = interviews.filter((i) => selected.includes(i.id));

  const bestCandidate = selectedInterviews.length >= 2
    ? selectedInterviews.reduce((best, curr) =>
        (curr.scorecard?.overall ?? 0) > (best.scorecard?.overall ?? 0) ? curr : best
      )
    : null;

  const displayName = (i: Interview) => i.candidateName || i.candidateEmail || i.id.slice(0, 8);

  const SortIcon = ({ field }: { field: SortField }) => (
    <svg
      className={`w-3.5 h-3.5 ml-1 inline-block transition-transform ${sortField === field ? "text-indigo-600" : "text-gray-400"} ${sortField === field && sortDir === "asc" ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setLevelFilter("all");
    setVerdictFilter("all");
  };

  const hasActiveFilters = search || roleFilter !== "all" || levelFilter !== "all" || verdictFilter !== "all";

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-fade-in-down">
          <h1 className="text-2xl font-bold text-gray-900">Compare Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">Select 2-4 completed interviews to compare side-by-side</p>
        </div>

        {/* Selected Candidates Chips */}
        {selected.length > 0 && (
          <div className="card p-4 mb-4 animate-fade-in-up">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Selected ({selected.length}/4):</span>
              {selectedInterviews.map((interview, i) => (
                <button
                  key={interview.id}
                  onClick={() => toggleSelect(interview.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                  {displayName(interview)}
                  <span className="text-indigo-400 ml-0.5">{interview.scorecard?.overall}/5</span>
                  <svg className="w-3 h-3 text-indigo-400 hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ))}
              {selected.length >= 2 && (
                <a href="#comparison" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors ml-auto">
                  Jump to comparison
                </a>
              )}
            </div>
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-4 animate-fade-in-up delay-1">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field !pl-11"
            />
          </div>

          {/* Role filter */}
          {uniqueRoles.length > 1 && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input-field !w-auto !py-2 text-sm"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          {/* Level filter */}
          {uniqueLevels.length > 1 && (
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="input-field !w-auto !py-2 text-sm"
            >
              <option value="all">All Levels</option>
              {uniqueLevels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}

          {/* Verdict filter pills */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "all", label: "All" },
              { key: "hire", label: "Hire" },
              { key: "no_hire", label: "No Hire" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setVerdictFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  verdictFilter === f.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Candidate Table */}
        <div className="animate-fade-in-up delay-2">
          {loading ? (
            <>
              {/* Mobile skeleton */}
              <div className="md:hidden space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="skeleton h-4 w-36 mb-2" />
                        <div className="skeleton h-3 w-24" />
                      </div>
                      <div className="skeleton h-6 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="skeleton h-3 w-16" />
                      <div className="skeleton h-3 w-12" />
                      <div className="skeleton h-3 w-20 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop skeleton */}
              <div className="card overflow-hidden hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 w-10" />
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Candidate</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Role</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Score</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Verdict</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </tbody>
                </table>
              </div>
            </>
          ) : interviews.length === 0 ? (
            <div className="card p-12 text-center animate-scale-in">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">No completed interviews with scorecards found.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center animate-scale-in">
              <p className="text-gray-500">No interviews match your filters</p>
              <button onClick={clearFilters} className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 transition-colors">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {paginated.map((interview, idx) => {
                  const isSelected = selected.includes(interview.id);
                  const isFull = selected.length >= 4;
                  return (
                    <button
                      key={interview.id}
                      onClick={() => toggleSelect(interview.id)}
                      disabled={!isSelected && isFull}
                      className={`card-hover p-4 w-full text-left animate-fade-in-up transition-all ${
                        isSelected ? "ring-2 ring-indigo-500 ring-offset-1 bg-indigo-50/30" : ""
                      } ${!isSelected && isFull ? "opacity-40 cursor-not-allowed" : ""}`}
                      style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex items-center gap-2">
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[selected.indexOf(interview.id)] }} />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{displayName(interview)}</p>
                            {interview.candidateName && (
                              <p className="text-xs text-gray-500 truncate">{interview.candidateEmail}</p>
                            )}
                          </div>
                        </div>
                        {interview.scorecard && (
                          <span className={`text-sm font-bold ${scoreColor(interview.scorecard.overall)}`}>
                            {interview.scorecard.overall}/5
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">{interview.role}</span>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-500">{interview.level}</span>
                        {interview.scorecard?.recommendation && (
                          <RecBadge recommendation={interview.scorecard.recommendation} />
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{formatDate(interview.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="card overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 w-10">
                          <span className="sr-only">Select</span>
                        </th>
                        <th
                          className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                          onClick={() => toggleSort("name")}
                        >
                          Candidate <SortIcon field="name" />
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                          Role
                        </th>
                        <th
                          className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                          onClick={() => toggleSort("score")}
                        >
                          Score <SortIcon field="score" />
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                          Verdict
                        </th>
                        <th
                          className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                          onClick={() => toggleSort("date")}
                        >
                          Date <SortIcon field="date" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((interview, idx) => {
                        const isSelected = selected.includes(interview.id);
                        const isFull = selected.length >= 4;
                        const colorIdx = selected.indexOf(interview.id);
                        return (
                          <tr
                            key={interview.id}
                            onClick={() => { if (isSelected || !isFull) toggleSelect(interview.id); }}
                            className={`border-b border-gray-100 transition-all duration-200 animate-table-row ${
                              isSelected
                                ? "bg-indigo-50/50 hover:bg-indigo-50"
                                : isFull
                                  ? "opacity-40 cursor-not-allowed"
                                  : "hover:bg-gray-50 cursor-pointer"
                            } ${isSelected ? "border-l-2 border-l-indigo-500" : "hover:border-l-2 hover:border-l-indigo-500"}`}
                            style={{ animationDelay: `${idx * 40}ms`, opacity: 0 }}
                          >
                            <td className="px-4 py-3">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-500"
                                  : "border-gray-300 hover:border-gray-400"
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                {isSelected && (
                                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[colorIdx] }} />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[colorIdx] }} />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{displayName(interview)}</p>
                                  {interview.candidateName && (
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">{interview.candidateEmail}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-900">{interview.role}</p>
                              <p className="text-xs text-gray-500">{interview.level}</p>
                            </td>
                            <td className="px-4 py-3">
                              {interview.scorecard ? (
                                <div className="flex items-center gap-2">
                                  <div className="relative w-8 h-8">
                                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                                      <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                      <circle cx="18" cy="18" r="14" fill="none"
                                        stroke={scoreBg(interview.scorecard.overall)}
                                        strokeWidth="3" strokeLinecap="round"
                                        strokeDasharray={`${(interview.scorecard.overall / 5) * 87.96} 87.96`}
                                      />
                                    </svg>
                                    <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${scoreColor(interview.scorecard.overall)}`}>
                                      {interview.scorecard.overall}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {interview.scorecard?.recommendation ? (
                                <RecBadge recommendation={interview.scorecard.recommendation} />
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500">{formatDate(interview.createdAt)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                  <p className="text-xs text-gray-500">
                    Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} candidate{filtered.length !== 1 ? "s" : ""}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Prev
                      </button>
                      {(() => {
                        const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];
                        if (totalPages <= 7) {
                          for (let i = 1; i <= totalPages; i++) pages.push(i);
                        } else {
                          pages.push(1);
                          if (currentPage > 3) pages.push("ellipsis-start");
                          const start = Math.max(2, currentPage - 1);
                          const end = Math.min(totalPages - 1, currentPage + 1);
                          for (let i = start; i <= end; i++) pages.push(i);
                          if (currentPage < totalPages - 2) pages.push("ellipsis-end");
                          pages.push(totalPages);
                        }
                        return pages.map((page) =>
                          typeof page === "string" ? (
                            <span key={page} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">...</span>
                          ) : (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${
                                currentPage === page
                                  ? "bg-indigo-600 text-white shadow-sm"
                                  : "text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              {page}
                            </button>
                          )
                        );
                      })()}
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile pagination summary */}
              <div className="md:hidden text-center py-3">
                <p className="text-xs text-gray-400 mb-2">
                  Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} candidate{filtered.length !== 1 ? "s" : ""}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Comparison Area */}
        <div id="comparison">
          {selectedInterviews.length >= 2 && (
            <>
              {/* Radar Chart */}
              <div className="card p-5 mb-6 mt-6 animate-fade-in-up delay-2">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Performance Radar</h3>
                <div className="flex items-center justify-center gap-4 mb-4 flex-wrap">
                  {selectedInterviews.map((interview, i) => (
                    <div key={interview.id} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-xs text-gray-600">{displayName(interview)}</span>
                    </div>
                  ))}
                </div>
                <RadarChart
                  candidates={selectedInterviews.map((interview, i) => ({
                    label: displayName(interview),
                    scores: interview.scorecard?.scores || [],
                    color: COLORS[i],
                  }))}
                />
              </div>

              {/* Side-by-side Scorecards */}
              <div className={`grid gap-4 mb-6 grid-cols-1 sm:grid-cols-2 ${
                selectedInterviews.length === 3 ? "lg:grid-cols-3" : selectedInterviews.length >= 4 ? "lg:grid-cols-4" : ""
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
                            {displayName(interview)}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl font-bold text-gray-900">{sc.overall}</span>
                          <span className="text-sm text-gray-500">/5</span>
                          {isBest && (
                            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" /></svg>
                              BEST
                            </span>
                          )}
                        </div>
                        <RecBadge recommendation={sc.recommendation} />
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
                    Based on overall scores, <span className="text-green-700 font-semibold">{displayName(bestCandidate)}</span> is
                    the strongest candidate with an overall score of <span className="text-gray-900 font-semibold">{bestCandidate.scorecard?.overall}/5</span>.
                    {bestCandidate.scorecard?.recommendation && (
                      <> Recommendation: <span className="text-green-700">{bestCandidate.scorecard.recommendation.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>.</>
                    )}
                  </p>
                  {selectedInterviews.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedInterviews
                        .sort((a, b) => (b.scorecard?.overall ?? 0) - (a.scorecard?.overall ?? 0))
                        .map((interview, i) => (
                          <div key={interview.id} className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">#{i + 1}</span>
                            <span>{displayName(interview)}</span>
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
            <div className="card p-12 text-center animate-fade-in mt-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Select at least one more candidate to compare.</p>
            </div>
          )}

          {selectedInterviews.length === 0 && !loading && interviews.length > 0 && (
            <div className="card p-12 text-center animate-fade-in mt-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Click rows in the table above to select candidates for comparison.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
