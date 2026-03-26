"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/DashboardLayout";

const LEVELS = ["Junior", "Mid", "Senior", "Staff", "Principal"];
const DURATIONS = [15, 30, 45, 60];
const ROUND_TYPES = ["General", "Technical", "Behavioral", "System Design", "Coding"];
const CODING_LANGUAGES = ["JavaScript", "Python", "Java", "C++", "Go"];
const FOCUS_AREAS = [
  "Technical",
  "Behavioral",
  "System Design",
  "Problem Solving",
  "Leadership",
  "Communication",
  "Domain Knowledge",
];

interface QuestionBank {
  id: number;
  name: string;
  role: string;
  level: string;
  round_type: string;
  questions: string[];
}

export default function LandingPage() {
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Senior");
  const [duration, setDuration] = useState(30);
  const [roundType, setRoundType] = useState("General");
  const [codingLanguage, setCodingLanguage] = useState("JavaScript");
  const [focusAreas, setFocusAreas] = useState<string[]>(["Technical"]);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [interviewLink, setInterviewLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setQuestionBanks(data); })
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
    if (
      droppedFile &&
      /\.(pdf|doc|docx|txt)$/i.test(droppedFile.name)
    ) {
      setFile(droppedFile);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !email) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("candidateEmail", email);
      formData.append("role", role);
      formData.append("level", level);
      formData.append("duration", String(duration));
      formData.append("focusAreas", focusAreas.join(","));
      formData.append("roundType", roundType);
      if (roundType === "Coding") formData.append("language", codingLanguage);
      if (selectedBankId) formData.append("questionBankId", selectedBankId);
      if (file) formData.append("resume", file);

      const res = await fetch("/api/create-interview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Error: ${data.error || "Failed to create interview"}`);
        return;
      }
      if (data.id) {
        const link = data.token
          ? `${window.location.origin}/interview/${data.id}?token=${data.token}`
          : `${window.location.origin}/interview/${data.id}`;
        setInterviewLink(link);
      }
    } catch (err) {
      console.error("Create interview failed:", err);
      alert("Failed to create interview. Check console for details.");
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 animate-fade-in-down">Create Interview</h1>

        {interviewLink ? (
          /* Success state */
          <div className="card p-8 text-center space-y-6 animate-scale-in" style={{ boxShadow: "0 0 30px rgba(34, 197, 94, 0.1)" }}>
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center animate-scale-in" style={{ animationDelay: "100ms", opacity: 0 }}>
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Interview Created</h2>
              <p className="text-sm text-gray-500">Share this link with the candidate</p>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <input
                readOnly
                value={interviewLink}
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none truncate"
              />
              <button
                onClick={copyLink}
                className="btn-primary shrink-0 !py-1.5 !px-3 text-xs"
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  window.location.href = `mailto:${email}?subject=Your AI Interview&body=Here is your interview link: ${encodeURIComponent(interviewLink)}`;
                }}
                className="btn-primary flex-1"
              >
                Send to Candidate
              </button>
              <button
                onClick={() => {
                  setInterviewLink("");
                  setFile(null);
                  setRole("");
                  setEmail("");
                }}
                className="btn-secondary"
              >
                New
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <div className="card p-6 animate-slide-in-up">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Candidate Email */}
              <div>
                <label className="label">Candidate Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="candidate@example.com"
                  className="input-field"
                />
              </div>

              {/* Role */}
              <div>
                <label className="label">Role</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  className="input-field"
                />
              </div>

              {/* Level & Duration row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Level</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="input-field"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="input-field"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d} minutes</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Round Type & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Round Type</label>
                  <select
                    value={roundType}
                    onChange={(e) => setRoundType(e.target.value)}
                    className="input-field"
                  >
                    {ROUND_TYPES.map((rt) => (
                      <option key={rt} value={rt}>{rt}</option>
                    ))}
                  </select>
                </div>
                {roundType === "Coding" && (
                  <div>
                    <label className="label">Language</label>
                    <select
                      value={codingLanguage}
                      onChange={(e) => setCodingLanguage(e.target.value)}
                      className="input-field"
                    >
                      {CODING_LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Resume Upload */}
              <div>
                <label className="label">Resume</label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200
                    ${isDragging
                      ? "border-indigo-400 bg-indigo-50 scale-[1.01]"
                      : file
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium">{file.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="ml-1 text-xs text-gray-400 hover:text-red-500"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-gray-500">
                        Drop resume here or{" "}
                        <span className="text-indigo-600 font-medium">browse</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">PDF, DOC, TXT</p>
                    </>
                  )}
                </div>
              </div>

              {/* Question Bank */}
              {questionBanks.length > 0 && (
                <div>
                  <label className="label">
                    Question Bank <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">None</option>
                    {questionBanks.map((bank) => (
                      <option key={bank.id} value={String(bank.id)}>
                        {bank.name} ({bank.round_type} &middot; {Array.isArray(bank.questions) ? bank.questions.length : 0} questions)
                      </option>
                    ))}
                  </select>
                  {selectedBankId && (() => {
                    const bank = questionBanks.find((b) => String(b.id) === selectedBankId);
                    const qs = bank && Array.isArray(bank.questions) ? bank.questions : [];
                    return qs.length > 0 ? (
                      <div className="mt-2 space-y-1 max-h-[120px] overflow-y-auto">
                        {qs.map((q, i) => (
                          <p key={i} className="text-xs text-gray-500 px-2 py-1 rounded bg-gray-50 border border-gray-100">
                            {i + 1}. {q}
                          </p>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Focus Areas */}
              <div>
                <label className="label">Focus Areas</label>
                <div className="flex flex-wrap gap-2">
                  {FOCUS_AREAS.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleFocus(area)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200
                        ${focusAreas.includes(area)
                          ? "bg-indigo-50 text-indigo-600 border border-indigo-200 scale-100"
                          : "bg-gray-100 text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-700 scale-[0.97] hover:scale-100"
                        }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!role || !email || submitting}
                className="btn-primary w-full !py-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  "Create Interview"
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
