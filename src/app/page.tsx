"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";

interface Scorecard {
  technicalDepth: number;
  communication: number;
  problemSolving: number;
  domainKnowledge: number;
  cultureFit: number;
  overall: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  evidence: { dimension: string; quote: string; assessment: string }[];
  proctoringNotes: string;
}

interface ProctoringEvent {
  type: string;
  severity: "warning" | "flag";
  message: string;
  timestamp: string;
}

interface Interview {
  id: string;
  resumeFileName: string;
  candidateEmail: string;
  role: string;
  level: string;
  focusAreas: string[];
  duration: number;
  status: "waiting" | "in_progress" | "completed";
  transcript: { role: string; text: string; timestamp: string }[];
  proctoring: ProctoringEvent[];
  scorecard: Scorecard | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

type SortField = "date" | "score" | "status";
type SortDir = "asc" | "desc";

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

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-6 py-4"><div className="skeleton h-4 w-40" /><div className="skeleton h-3 w-24 mt-2" /></td>
      <td className="px-6 py-4"><div className="skeleton h-4 w-28" /><div className="skeleton h-3 w-16 mt-2" /></td>
      <td className="px-6 py-4"><div className="skeleton h-6 w-20 rounded-full" /></td>
      <td className="px-6 py-4"><div className="skeleton h-4 w-8" /></td>
      <td className="px-6 py-4"><div className="skeleton h-4 w-16" /></td>
      <td className="px-6 py-4"><div className="skeleton h-4 w-24" /></td>
      <td className="px-6 py-4"><div className="skeleton h-4 w-12" /></td>
    </tr>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set());
  const pageSize = 10;

  const fetchInterviews = useCallback(async () => {
    try {
      const res = await fetch("/api/interviews");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInterviews(data);
      setError("");
    } catch {
      setError("Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInterviews();
    const interval = setInterval(fetchInterviews, 30000);
    return () => clearInterval(interval);
  }, [fetchInterviews]);

  // Check scoring status for unscored interviews on load
  useEffect(() => {
    const unscored = interviews.filter((i) => !i.scorecard && i.transcript.length > 0);
    if (unscored.length === 0) return;

    const checkAll = async () => {
      const generating = new Set<string>();
      for (const interview of unscored) {
        try {
          const res = await fetch(`/api/scoring-status/${interview.id}`);
          const data = await res.json();
          if (data.status === "generating") generating.add(interview.id);
          if (data.status === "completed") {
            // Refresh to get the scorecard
            fetchInterviews();
          }
        } catch {}
      }
      if (generating.size > 0) setScoringIds(generating);
    };
    checkAll();

    // Poll every 10s if any are generating
    const interval = setInterval(checkAll, 10000);
    return () => clearInterval(interval);
  }, [interviews, fetchInterviews]);

  const filtered = useMemo(() => {
    let result = interviews;

    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (verdictFilter !== "all") {
      if (verdictFilter === "hire") {
        result = result.filter((i) => i.scorecard?.recommendation && i.scorecard.recommendation.includes("hire") && !i.scorecard.recommendation.includes("no"));
      } else if (verdictFilter === "no_hire") {
        result = result.filter((i) => i.scorecard?.recommendation?.includes("no_hire") || i.scorecard?.recommendation?.includes("strong_no"));
      } else if (verdictFilter === "unscored") {
        result = result.filter((i) => !i.scorecard);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.candidateEmail.toLowerCase().includes(q) ||
          i.role.toLowerCase().includes(q) ||
          i.resumeFileName.toLowerCase().includes(q)
      );
    }

    const statusOrder: Record<string, number> = { in_progress: 0, waiting: 1, completed: 2 };

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "score") {
        cmp = (a.scorecard?.overall ?? -1) - (b.scorecard?.overall ?? -1);
      } else if (sortField === "status") {
        cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [interviews, statusFilter, verdictFilter, search, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedFiltered = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [statusFilter, verdictFilter, search]);

  const stats = useMemo(() => {
    const scored = interviews.filter((i) => i.scorecard);
    return {
      total: interviews.length,
      waiting: interviews.filter((i) => i.status === "waiting").length,
      inProgress: interviews.filter((i) => i.status === "in_progress").length,
      completed: interviews.filter((i) => i.status === "completed").length,
      avgScore:
        scored.length > 0
          ? (scored.reduce((s, i) => s + (i.scorecard?.overall ?? 0), 0) / scored.length).toFixed(1)
          : "-",
    };
  }, [interviews]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

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

  const statusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return (
          <span className="badge-warning">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
            Waiting
          </span>
        );
      case "in_progress":
        return (
          <span className="badge-info">
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            In Progress
          </span>
        );
      case "completed":
        return (
          <span className="badge-success">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
            Completed
          </span>
        );
      default:
        return <span className="badge-info">{status}</span>;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-down">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
            <p className="text-sm text-gray-500 mt-1">
              {(session?.user as any)?.orgName && (
                <span>{(session?.user as any)?.orgName} &middot; </span>
              )}
              Manage and review all interview sessions
            </p>
          </div>
          <Link href="/new" className="btn-primary flex items-center gap-2 hover:translate-y-[-1px] hover:shadow-md transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Interview
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total", value: stats.total, iconBg: "bg-gray-100", iconColor: "text-gray-600", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", delay: "" },
            { label: "Waiting", value: stats.waiting, iconBg: "bg-amber-50", iconColor: "text-amber-600", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", delay: "delay-1" },
            { label: "In Progress", value: stats.inProgress, iconBg: "bg-blue-50", iconColor: "text-blue-600", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z", delay: "delay-2" },
            { label: "Completed", value: stats.completed, iconBg: "bg-green-50", iconColor: "text-green-600", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", delay: "delay-3" },
            { label: "Avg Score", value: stats.avgScore, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", delay: "delay-4" },
          ].map((stat) => (
            <div key={stat.label} className={`card-hover p-4 animate-fade-in-up ${stat.delay}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <svg className={`w-4.5 h-4.5 ${stat.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
                  </svg>
                </div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 animate-count-up">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-6 animate-fade-in-up delay-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by email, role, or file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "all", label: "All" },
              { key: "waiting", label: "Pending" },
              { key: "in_progress", label: "Active" },
              { key: "completed", label: "Completed" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  statusFilter === f.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: "all", label: "All Verdicts" },
              { key: "hire", label: "Hire" },
              { key: "no_hire", label: "No Hire" },
              { key: "unscored", label: "Unscored" },
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
        </div>

        {/* Content */}
        <div className="animate-fade-in-up delay-4">
        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="md:hidden space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="skeleton h-4 w-40 mb-2" />
                      <div className="skeleton h-3 w-24" />
                    </div>
                    <div className="skeleton h-6 w-20 rounded-full" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="skeleton h-3 w-16" />
                    <div className="skeleton h-3 w-12" />
                    <div className="skeleton h-3 w-24 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop skeleton */}
            <div className="card overflow-hidden hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Candidate</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Role</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Score</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Proctoring</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </tbody>
              </table>
            </div>
          </>
        ) : error ? (
          <div className="card p-12 text-center animate-scale-in">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-red-600 font-medium">{error}</p>
            <button onClick={fetchInterviews} className="text-sm text-gray-500 hover:text-gray-700 mt-2 transition-colors">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 && interviews.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            {/* Empty state illustration */}
            <svg className="w-32 h-32 mx-auto mb-6 text-gray-200" viewBox="0 0 120 120" fill="none">
              <rect x="20" y="30" width="80" height="65" rx="8" stroke="currentColor" strokeWidth="2" />
              <rect x="30" y="42" width="30" height="4" rx="2" fill="currentColor" opacity="0.5" />
              <rect x="30" y="52" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="30" y="60" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="30" y="68" width="45" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <circle cx="82" cy="45" r="8" stroke="currentColor" strokeWidth="2" opacity="0.5" />
              <path d="M79 45l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
              <rect x="30" y="78" width="24" height="8" rx="4" fill="#818cf8" opacity="0.3" />
              <circle cx="90" cy="25" r="12" fill="#818cf8" opacity="0.1" />
              <path d="M87 25l2 2 4-4" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </svg>
            <p className="text-xl font-semibold text-gray-900 mb-2">No interviews yet</p>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">Create your first AI-powered interview and share the link with your candidate to get started.</p>
            <Link href="/new" className="btn-primary inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Interview
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center animate-scale-in">
            <p className="text-gray-500">No interviews match your filters</p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
              className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {paginatedFiltered.map((interview, idx) => {
                const flagCount = interview.proctoring.filter((p) => p.severity === "flag").length;
                const warningCount = interview.proctoring.filter((p) => p.severity === "warning").length;
                return (
                  <Link
                    key={interview.id}
                    href={`/dashboard/${interview.id}`}
                    className="card-hover p-4 block animate-fade-in-up"
                    style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{interview.candidateEmail || interview.resumeFileName}</p>
                        <p className="text-xs text-gray-500">{interview.role} &middot; {interview.level}</p>
                      </div>
                      {statusBadge(interview.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{interview.duration} min</span>
                      {interview.scorecard && (
                        <span className={`font-medium ${scoreColor(interview.scorecard.overall)}`}>
                          {interview.scorecard.overall}/5
                        </span>
                      )}
                      {(flagCount > 0 || warningCount > 0) && (
                        <span className="text-amber-600">{flagCount + warningCount} alert{flagCount + warningCount !== 1 ? "s" : ""}</span>
                      )}
                      <span className="ml-auto">{formatDate(interview.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
              <div className="text-center py-2">
                <p className="text-xs text-gray-400">
                  {filtered.length} of {interviews.length} interview{interviews.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="card overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                        Candidate
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                        Role
                      </th>
                      <th
                        className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => toggleSort("status")}
                      >
                        Status <SortIcon field="status" />
                      </th>
                      <th
                        className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => toggleSort("score")}
                      >
                        Score <SortIcon field="score" />
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                        Verdict
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                        Proctoring
                      </th>
                      <th
                        className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={() => toggleSort("date")}
                      >
                        Date <SortIcon field="date" />
                      </th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiltered.map((interview, idx) => {
                      const flagCount = interview.proctoring.filter((p) => p.severity === "flag").length;
                      const warningCount = interview.proctoring.filter((p) => p.severity === "warning").length;
                      const totalIssues = flagCount + warningCount;

                      return (
                        <tr
                          key={interview.id}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-all duration-200 hover:border-l-2 hover:border-l-indigo-500 animate-table-row"
                          style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                        >
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {interview.candidateEmail || interview.resumeFileName}
                            </p>
                            {interview.candidateEmail && (
                              <p className="text-xs text-gray-500 mt-0.5">{interview.resumeFileName}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-gray-900">{interview.role}</p>
                            <p className="text-xs text-gray-500">{interview.level}</p>
                          </td>
                          <td className="px-6 py-4">
                            {statusBadge(interview.status)}
                          </td>
                          <td className="px-6 py-4">
                            {interview.scorecard ? (
                              <div className="flex items-center gap-2">
                                <div className="relative w-8 h-8">
                                  <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                    <circle cx="18" cy="18" r="14" fill="none"
                                      stroke={interview.scorecard.overall >= 3.5 ? "#22c55e" : interview.scorecard.overall >= 2.5 ? "#f59e0b" : "#ef4444"}
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
                          <td className="px-6 py-4">
                            {interview.scorecard?.recommendation ? (
                              <span className={
                                interview.scorecard.recommendation.includes("hire") && !interview.scorecard.recommendation.includes("no")
                                  ? "badge-success" : "badge-danger"
                              }>
                                {interview.scorecard.recommendation.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {totalIssues > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-xs text-gray-600">
                                  {flagCount > 0 && <span className="text-red-600">{flagCount} flag{flagCount !== 1 ? "s" : ""}</span>}
                                  {flagCount > 0 && warningCount > 0 && ", "}
                                  {warningCount > 0 && <span className="text-amber-600">{warningCount} warn</span>}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-green-600">Clean</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-500">{formatDate(interview.createdAt)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/dashboard/${interview.id}`}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                              >
                                View
                              </Link>
                              {interview.transcript.length > 0 && (
                                <button
                                  disabled={scoringIds.has(interview.id)}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const btn = e.currentTarget;
                                    btn.disabled = true;
                                    btn.textContent = "Scoring...";
                                    try {
                                      const res = await fetch("/api/scorecard", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ interviewId: interview.id }),
                                      });
                                      if (res.ok) {
                                        btn.textContent = "Done!";
                                        setTimeout(() => window.location.reload(), 1000);
                                      } else if (res.status === 409) {
                                        btn.textContent = "Scoring...";
                                        // Poll until done
                                        const poll = setInterval(async () => {
                                          const s = await fetch(`/api/scoring-status/${interview.id}`).then(r => r.json());
                                          if (s.status === "completed") {
                                            clearInterval(poll);
                                            window.location.reload();
                                          } else if (s.status === "failed") {
                                            clearInterval(poll);
                                            btn.textContent = "Retry";
                                            btn.disabled = false;
                                          }
                                        }, 5000);
                                      } else {
                                        btn.textContent = "Failed";
                                        btn.disabled = false;
                                      }
                                    } catch {
                                      btn.textContent = "Failed";
                                      btn.disabled = false;
                                    }
                                  }}
                                  className="btn-secondary text-xs !px-3 !py-1.5"
                                >
                                  {scoringIds.has(interview.id) ? "Scoring..." : interview.scorecard ? "Rescore" : "Score"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer with pagination */}
              <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-500">
                  Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} interview{filtered.length !== 1 ? "s" : ""}
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
                <p className="text-xs text-gray-400">Auto-refreshes every 30s</p>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
