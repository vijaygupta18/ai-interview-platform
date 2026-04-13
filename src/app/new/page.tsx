"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/DashboardLayout";

const LEVELS = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal", "Manager", "Director"];
const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const ROUND_TYPES = ["General", "Technical", "Behavioral", "System Design", "Coding", "HR", "Culture Fit", "Managerial", "Case Study", "Puzzle"];
const CODING_LANGUAGES = ["JavaScript", "TypeScript", "Python", "Java", "C++", "Go", "Rust", "Haskell", "Kotlin", "Swift", "Ruby", "C#", "Scala", "SQL", "PHP"];
const FOCUS_AREAS = [
  "Technical Skills", "Behavioral", "System Design", "Problem Solving",
  "Leadership", "Communication", "Domain Knowledge", "Customer Handling",
  "Process & Operations", "People Management", "Analytical Thinking",
  "Culture Fit", "Stakeholder Management", "Project Management",
];

interface QuestionBank {
  id: number;
  name: string;
  role: string;
  level: string;
  round_type: string;
  questions: string[];
}

function SectionHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {step}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

export default function NewInterviewPage() {
  const { data: session } = useSession();
  const [candidates, setCandidates] = useState([{ email: "", name: "", phone: "" }]);
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Senior");
  const [duration, setDuration] = useState(30);
  const [roundType, setRoundType] = useState("General");
  const [codingLanguage, setCodingLanguage] = useState("JavaScript");
  const [focusAreas, setFocusAreas] = useState<string[]>(["Technical Skills"]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [interviewLink, setInterviewLink] = useState(""); // single link (backward compat)
  const [bulkResults, setBulkResults] = useState<{ email: string; link: string; error?: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; subject: string; description: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setQuestionBanks(data); })
      .catch(() => {});
    fetch("/api/email-templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEmailTemplates(data);
          const def = data.find((t: any) => t.is_default);
          if (def) setSelectedTemplateId(def.id);
        }
      })
      .catch(() => {});
  }, []);

  const toggleFocus = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && /\.(pdf|doc|docx|txt)$/i.test(droppedFile.name)) {
      setFile(droppedFile);
    }
  }, []);

  const addCandidate = () => setCandidates(prev => [...prev, { email: "", name: "", phone: "" }]);
  const removeCandidate = (i: number) => setCandidates(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const updateCandidate = (i: number, field: string, value: string) => setCandidates(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const validCandidates = candidates.filter(c => c.email.trim() && c.email.includes("@"));
  const hasContext = file || additionalContext.trim().length > 0 || selectedBankId;
  const canSubmit = role && validCandidates.length > 0 && hasContext && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setBulkResults([]);

    try {
      if (validCandidates.length === 1) {
        // Single candidate — original flow
        const c = validCandidates[0];
        const formData = new FormData();
        formData.append("candidateEmail", c.email.trim());
        if (c.name.trim()) formData.append("candidateName", c.name.trim());
        if (c.phone.trim()) formData.append("candidatePhone", c.phone.trim());
        formData.append("role", role);
        formData.append("level", level);
        formData.append("duration", String(duration));
        formData.append("focusAreas", focusAreas.join(","));
        formData.append("roundType", roundType);
        if (roundType === "Coding") formData.append("language", codingLanguage);
        if (selectedBankId) formData.append("questionBankId", selectedBankId);
        if (additionalContext.trim()) formData.append("additionalContext", additionalContext.trim());
        if (selectedTemplateId) formData.append("emailTemplateId", selectedTemplateId);
        if (file) formData.append("resume", file);

        const res = await fetch("/api/create-interview", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { alert(`Error: ${data.error || "Failed"}`); return; }
        if (data.id) {
          const link = data.token
            ? `${window.location.origin}/interview/${data.id}?token=${data.token}`
            : `${window.location.origin}/interview/${data.id}`;
          setInterviewLink(link);
        }
      } else {
        // Bulk — create one interview per candidate with the same settings
        const results: { email: string; link: string; error?: string }[] = [];
        for (const c of validCandidates) {
          try {
            const formData = new FormData();
            formData.append("candidateEmail", c.email.trim());
            if (c.name.trim()) formData.append("candidateName", c.name.trim());
            if (c.phone.trim()) formData.append("candidatePhone", c.phone.trim());
            formData.append("role", role);
            formData.append("level", level);
            formData.append("duration", String(duration));
            formData.append("focusAreas", focusAreas.join(","));
            formData.append("roundType", roundType);
            if (roundType === "Coding") formData.append("language", codingLanguage);
            if (selectedBankId) formData.append("questionBankId", selectedBankId);
            if (additionalContext.trim()) formData.append("additionalContext", additionalContext.trim());
            if (selectedTemplateId) formData.append("emailTemplateId", selectedTemplateId);
            if (file) formData.append("resume", file);

            const res = await fetch("/api/create-interview", { method: "POST", body: formData });
            const data = await res.json();
            if (res.ok && data.id) {
              const link = data.token
                ? `${window.location.origin}/interview/${data.id}?token=${data.token}`
                : `${window.location.origin}/interview/${data.id}`;
              results.push({ email: c.email.trim(), link });
            } else {
              results.push({ email: c.email.trim(), link: "", error: data.error || "Failed" });
            }
          } catch {
            results.push({ email: c.email.trim(), link: "", error: "Request failed" });
          }
        }
        setBulkResults(results);
        setInterviewLink("__bulk__"); // trigger success screen
      }
    } catch (err) {
      console.error("Create interview failed:", err);
      alert("Failed to create interview.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(interviewLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="mb-8 animate-fade-in-down">
          <h1 className="text-2xl font-bold text-gray-900">Create Interview</h1>
          <p className="text-sm text-gray-500 mt-1">Set up an AI-powered interview session for your candidate</p>
        </div>

        {interviewLink ? (
          /* ── Success State ──────────────────────────────────────── */
          <div className="card p-10 text-center space-y-6 animate-scale-in relative overflow-hidden">
            {/* Subtle celebration dots */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full animate-fade-in"
                  style={{
                    width: `${3 + Math.random() * 4}px`,
                    height: `${3 + Math.random() * 4}px`,
                    left: `${15 + Math.random() * 70}%`,
                    top: `${5 + Math.random() * 30}%`,
                    backgroundColor: ["#818cf8", "#34d399", "#fbbf24"][i % 3],
                    opacity: 0.3,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>

            {/* Bulk results */}
            {bulkResults.length > 0 ? (
              <div className="relative text-left space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {bulkResults.filter(r => r.link).length} of {bulkResults.length} Interviews Created
                  </h2>
                  {selectedTemplateId && (
                    <p className="text-sm text-gray-500 mt-1">Email invitations sent to each candidate</p>
                  )}
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {bulkResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.error ? "bg-red-50" : "bg-gray-50"}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${r.error ? "bg-red-500" : "bg-green-500"}`} />
                      <span className="text-sm text-gray-700 truncate flex-1">{r.email}</span>
                      {r.error ? (
                        <span className="text-xs text-red-500">{r.error}</span>
                      ) : (
                        <button
                          onClick={() => { navigator.clipboard.writeText(r.link); }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                        >
                          Copy Link
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      const links = bulkResults.filter(r => r.link).map(r => `${r.email}: ${r.link}`).join("\n");
                      navigator.clipboard.writeText(links);
                    }}
                    className="btn-secondary flex-1"
                  >
                    Copy All Links
                  </button>
                  <button onClick={() => { setInterviewLink(""); setBulkResults([]); setFile(null); setRole(""); setCandidates([{email:"",name:"",phone:""}]); setAdditionalContext(""); setSelectedBankId(""); setSelectedTemplateId(""); }}
                    className="btn-primary flex-1">
                    Create More
                  </button>
                </div>
              </div>
            ) : (
            /* Single result */
            <>
            <div className="relative">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-green-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Interview Created</h2>
              <p className="text-gray-500">Share this link with the candidate to begin the interview</p>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <input readOnly value={interviewLink} className="flex-1 bg-transparent text-sm text-gray-700 outline-none truncate" />
              <button onClick={copyLink} className="btn-primary shrink-0 !py-1.5 !px-3 text-xs">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {selectedTemplateId ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700">Interview invite email sent to <strong>{candidates[0]?.email}</strong></p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center">No email template was selected — share the link manually.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setInterviewLink(""); setBulkResults([]); setFile(null); setRole(""); setCandidates([{email:"",name:"",phone:""}]); setAdditionalContext(""); setSelectedBankId(""); setSelectedTemplateId(""); }} className="btn-primary flex-1">
                Create Another
              </button>
              <button
                onClick={() => { window.location.href = `mailto:${candidates[0]?.email || ""}?subject=Your Interview&body=Here is your interview link: ${encodeURIComponent(interviewLink)}`; }}
                className="btn-secondary flex-1"
              >
                Open in Mail App
              </button>
            </div>
            </>
            )}
          </div>
        ) : (
          /* ── Form ───────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Section 1: Candidate Info */}
            <div className="card p-6 animate-fade-in-up border-l-4 border-l-indigo-500">
              <SectionHeader step={1} title="Candidate Information" subtitle={candidates.length > 1 ? `${candidates.length} candidates` : "Who are you interviewing?"} />
              <div className="space-y-4">
                {candidates.map((c, i) => (
                  <div key={i} className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 ${i > 0 ? "pt-3 border-t border-gray-100" : ""}`}>
                    <div>
                      {i === 0 && <label className="label">Email <span className="text-red-400">*</span></label>}
                      <input type="email" required value={c.email} onChange={(e) => updateCandidate(i, "email", e.target.value)}
                        placeholder="candidate@example.com" className="input-field" />
                    </div>
                    <div>
                      {i === 0 && <label className="label">Name <span className="text-gray-400 font-normal">(optional)</span></label>}
                      <input type="text" value={c.name} onChange={(e) => updateCandidate(i, "name", e.target.value)}
                        placeholder="e.g. Vijay Gupta" className="input-field" />
                    </div>
                    <div>
                      {i === 0 && <label className="label">Phone <span className="text-gray-400 font-normal">(optional)</span></label>}
                      <input type="tel" value={c.phone} onChange={(e) => updateCandidate(i, "phone", e.target.value)}
                        placeholder="+91 98765 43210" className="input-field" />
                    </div>
                    <div className={i === 0 ? "mt-6" : ""}>
                      {candidates.length > 1 && (
                        <button type="button" onClick={() => removeCandidate(i)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addCandidate}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Another Candidate
                </button>
                <div>
                  <label className="label">Role <span className="text-red-400">*</span></label>
                  <input type="text" required value={role} onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Senior SDET, HR Manager, Sales Lead" className="input-field" />
                </div>

                {/* Email Template */}
                {emailTemplates.length > 0 && (
                  <div>
                    <label className="label">
                      Email Template <span className="text-gray-400 font-normal">(sent with interview link)</span>
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="input-field"
                    >
                      <option value="">Don't send email</option>
                      {emailTemplates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Resume Upload */}
                <div>
                  <label className="label">
                    Resume <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300
                      ${isDragging ? "border-indigo-400 bg-indigo-50 scale-[1.02] shadow-lg shadow-indigo-100"
                        : file ? "border-green-300 bg-green-50 p-4"
                        : "border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/30 p-6"}`}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    {file ? (
                      <div className="flex items-center justify-center gap-3 text-green-700">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium">{file.name}</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          className="ml-1 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition">&times;</button>
                      </div>
                    ) : (
                      <div className="py-2">
                        <div className="w-12 h-12 mx-auto rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">Drop resume here or <span className="text-indigo-600 font-medium">browse files</span></p>
                        <p className="text-xs text-gray-400">Supports PDF, DOC, DOCX, TXT</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Interview Settings */}
            <div className="card p-6 animate-fade-in-up delay-1 border-l-4 border-l-purple-500">
              <SectionHeader step={2} title="Interview Settings" subtitle="Configure the interview format" />
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="label">Level</label>
                    <select value={level} onChange={(e) => setLevel(e.target.value)} className="input-field">
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Duration</label>
                    <div className="flex gap-2">
                      <select
                        value={DURATIONS.includes(duration) ? duration : "custom"}
                        onChange={(e) => {
                          if (e.target.value === "custom") { setDuration(25); return; } // trigger custom input
                          setDuration(Number(e.target.value));
                        }}
                        className="input-field flex-1"
                      >
                        {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                        <option value="custom">Custom</option>
                      </select>
                      {!DURATIONS.includes(duration) && (
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={duration}
                          onChange={(e) => setDuration(Math.max(5, Math.min(180, Number(e.target.value))))}
                          className="input-field w-20"
                          placeholder="min"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label">Round</label>
                    <select value={roundType} onChange={(e) => setRoundType(e.target.value)} className="input-field">
                      {ROUND_TYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
                    </select>
                  </div>
                  {roundType === "Coding" && (
                    <div>
                      <label className="label">Language</label>
                      <select value={codingLanguage} onChange={(e) => setCodingLanguage(e.target.value)} className="input-field">
                        {CODING_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Focus Areas */}
                <div>
                  <label className="label">Focus Areas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS_AREAS.map((area) => (
                      <button key={area} type="button" onClick={() => toggleFocus(area)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                          ${focusAreas.includes(area)
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"}`}>
                        {focusAreas.includes(area) && (
                          <svg className="w-3 h-3 inline-block mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Context & Questions */}
            <div className="card p-6 animate-fade-in-up delay-2 border-l-4 border-l-emerald-500">
              <SectionHeader step={3} title="Interview Context" subtitle="Provide context so the AI asks better questions. At least one of resume, context, or question bank is required." />
              <div className="space-y-4">
                {/* Question Bank */}
                {questionBanks.length > 0 && (
                  <div>
                    <label className="label">
                      Question Bank <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} className="input-field">
                      <option value="">None — AI will generate questions</option>
                      {questionBanks.map((bank) => (
                        <option key={bank.id} value={String(bank.id)}>
                          {bank.name} ({bank.round_type} &middot; {Array.isArray(bank.questions) ? bank.questions.length : 0}q)
                        </option>
                      ))}
                    </select>
                    {selectedBankId && (() => {
                      const bank = questionBanks.find((b) => String(b.id) === selectedBankId);
                      const qs = bank && Array.isArray(bank.questions) ? bank.questions : [];
                      return qs.length > 0 ? (
                        <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto rounded-lg border border-gray-100 p-2 bg-gray-50">
                          {qs.map((q, i) => (
                            <p key={i} className="text-xs text-gray-600 whitespace-pre-line">{i + 1}. {q}</p>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Additional Context */}
                <div>
                  <label className="label">
                    Additional Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea value={additionalContext} onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder={[
                      "Add any context for the AI interviewer:",
                      "",
                      "Test scores:",
                      "  Scored 85% on coding test, weak on recursion and graphs",
                      "",
                      "Coding problem to ask:",
                      "  Design an LRU cache. Expected: HashMap + DLL, O(1) get/put",
                      "",
                      "Custom scenario:",
                      "  Start with: You have a service handling 10K RPS that suddenly spikes to 50K...",
                      "",
                      "Hiring manager notes:",
                      "  Claims 5 yrs React but resume shows only 2 projects — verify depth",
                      "",
                      "Previous round feedback:",
                      "  Strong on coding, weak on system design — probe deeper",
                      "",
                      "Domain-specific:",
                      "  Ask about GDPR compliance and data retention policies",
                    ].join("\n")}
                    rows={6} className="input-field resize-none" />
                </div>

                {/* Validation hint */}
                {!hasContext && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-xs text-amber-700">
                      Please provide at least one: a resume, additional notes, or select a question bank. This helps the AI ask relevant questions.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="animate-fade-in-up delay-3">
              <button type="submit" disabled={!canSubmit}
                className="btn-primary w-full !py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed hover:translate-y-[-1px] hover:shadow-md transition-all">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    {validCandidates.length > 1 ? `Creating ${validCandidates.length} Interviews...` : "Creating Interview..."}
                  </span>
                ) : (
                  validCandidates.length > 1 ? `Create ${validCandidates.length} Interviews` : "Create Interview"
                )}
              </button>
              {!hasContext && (
                <p className="text-xs text-center text-gray-400 mt-2">
                  Upload a resume, add notes, or select a question bank to enable
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
