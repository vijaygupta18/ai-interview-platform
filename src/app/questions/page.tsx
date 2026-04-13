"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfirmModal } from "@/components/ConfirmModal";

interface QuestionBank {
  id: number;
  org_id: string | null;
  name: string;
  role: string;
  level: string;
  round_type: string;
  questions: string[];
}

const ROUND_TYPES = ["Technical", "Behavioral", "System Design", "Coding", "Puzzle", "HR", "Case Study"];

export default function QuestionsPage() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("Senior");
  const [roundType, setRoundType] = useState("Technical");
  const [questions, setQuestions] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{id: number; name: string} | null>(null);

  const fetchBanks = useCallback(async () => {
    try {
      const res = await fetch("/api/questions");
      const data = await res.json();
      setBanks(Array.isArray(data) ? data : []);
    } catch {
      console.error("Failed to fetch question banks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const resetForm = () => {
    setName("");
    setRole("");
    setLevel("Senior");
    setRoundType("Technical");
    setQuestions([]);
    setNewQuestion("");
    setEditingBank(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (bank: QuestionBank) => {
    setEditingBank(bank);
    setName(bank.name);
    setRole(bank.role);
    setLevel(bank.level);
    setRoundType(bank.round_type);
    setQuestions(Array.isArray(bank.questions) ? bank.questions : []);
    setNewQuestion("");
    setShowModal(true);
  };

  const addQuestion = () => {
    if (newQuestion.trim()) {
      setQuestions((prev) => [...prev, newQuestion.trim()]);
      setNewQuestion("");
    }
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name || !role || !level || !roundType) return;

    const payload = { name, role, level, roundType, questions };

    try {
      if (editingBank) {
        await fetch(`/api/questions/${editingBank.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      resetForm();
      fetchBanks();
    } catch {
      console.error("Failed to save question bank");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/questions/${id}`, { method: "DELETE" });
      fetchBanks();
    } catch {
      console.error("Failed to delete question bank");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-down">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Question Banks</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your interview question libraries</p>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Question Bank
          </button>
        </div>

        {/* Banks List */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5">
                <div className="skeleton h-5 w-40 mb-3" />
                <div className="skeleton h-6 w-20 rounded-full mb-3" />
                <div className="flex items-center gap-3">
                  <div className="skeleton h-3 w-20" />
                  <div className="skeleton h-3 w-16" />
                  <div className="skeleton h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : banks.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            <svg className="w-28 h-28 mx-auto mb-6 text-gray-200" viewBox="0 0 120 120" fill="none">
              <rect x="25" y="20" width="70" height="80" rx="6" stroke="currentColor" strokeWidth="2" />
              <rect x="35" y="32" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
              <rect x="35" y="42" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="35" y="52" width="35" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="35" y="65" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
              <rect x="35" y="75" width="50" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="35" y="85" width="30" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <circle cx="85" cy="80" r="18" fill="#818cf8" opacity="0.15" stroke="#818cf8" strokeWidth="2" />
              <path d="M82 80h6M85 77v6" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            </svg>
            <p className="text-xl font-semibold text-gray-900 mb-2">No question banks yet</p>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">Create reusable sets of interview questions organized by role and round type.</p>
            <button
              onClick={openCreate}
              className="btn-primary inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Question Bank
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {banks.map((bank, idx) => {
              const qCount = Array.isArray(bank.questions) ? bank.questions.length : 0;
              return (
                <div
                  key={bank.id}
                  className="card-hover p-5 group animate-fade-in-up"
                  style={{ animationDelay: `${idx * 60}ms`, opacity: 0 }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 truncate">{bank.name}</h3>
                      <span className="badge-info mt-1">{bank.round_type}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => openEdit(bank)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget({id: bank.id, name: bank.name})}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                    <span>{bank.role}</span>
                    <span className="text-gray-300">&middot;</span>
                    <span>{bank.level}</span>
                    <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {qCount}
                    </span>
                  </div>
                  {/* Question preview */}
                  {Array.isArray(bank.questions) && bank.questions.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 space-y-1.5">
                      {bank.questions.slice(0, 2).map((q, qi) => (
                        <p key={qi} className="text-xs text-gray-500 truncate">
                          <span className="text-gray-400 mr-1">{qi + 1}.</span> {q}
                        </p>
                      ))}
                      {bank.questions.length > 2 && (
                        <p className="text-xs text-gray-400">+{bank.questions.length - 2} more</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-xl card p-0 max-h-[85vh] overflow-hidden animate-scale-in">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editingBank ? "Edit Question Bank" : "Create Question Bank"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {editingBank ? "Update your question bank details" : "Build a reusable set of interview questions"}
              </p>
            </div>
            <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "calc(85vh - 140px)" }}>

            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Frontend Technical Questions"
                  className="input-field"
                />
              </div>

              <div>
                <label className="label">Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Frontend Engineer"
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Level</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="input-field"
                  >
                    {["Junior", "Mid", "Senior", "Staff", "Principal"].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
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
              </div>

              <div>
                <label className="label">
                  Questions ({questions.length})
                </label>
                <div className="flex gap-2 mb-3">
                  <textarea
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addQuestion(); }
                    }}
                    placeholder={"Type a question and press Add (Shift+Enter for new line)\n\nSupports formatting:\n- Lists with dashes\n| Tables | with | pipes |\nGroups on separate lines"}
                    rows={3}
                    className="input-field flex-1 resize-none"
                  />
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="btn-secondary self-end"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {questions.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 group animate-fade-in-left"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <span className="text-xs text-gray-400 mt-0.5 shrink-0">{i + 1}.</span>
                      <p className="text-sm text-gray-700 flex-1 whitespace-pre-line">{q}</p>
                      <button
                        onClick={() => removeQuestion(i)}
                        className="text-gray-300 hover:text-red-500 transition shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!name || !role}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingBank ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Question Bank"
        message="Are you sure you want to delete this question bank? All questions in it will be permanently removed."
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
