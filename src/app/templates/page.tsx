"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfirmModal } from "@/components/ConfirmModal";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  description: string;
  is_default: boolean;
}

export default function TemplatesPage() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<{id: string; name: string} | null>(null);

  const isAdmin = (session?.user as any)?.role === "admin";

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/email-templates");
      if (res.ok) setTemplates(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ name: "", subject: "", body: "", description: "" });
    setShowModal(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setForm({ name: t.name, subject: t.subject, body: t.body, description: t.description || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body) return;
    const res = await fetch("/api/email-templates", {
      method: editingTemplate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingTemplate ? { ...form, id: editingTemplate.id } : form),
    });
    if (res.ok) {
      setShowModal(false);
      fetchTemplates();
    } else {
      alert("Failed to save template");
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/email-templates?id=${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 animate-fade-in-down">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
            <p className="text-sm text-gray-500 mt-1">Manage email templates sent to candidates with interview links</p>
          </div>
          {isAdmin && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Template
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-6">
                <div className="skeleton h-5 w-40 mb-3" />
                <div className="skeleton h-4 w-72 mb-2" />
                <div className="skeleton h-16 w-full" />
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="card p-16 text-center animate-scale-in">
            <svg className="w-16 h-16 mx-auto text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <p className="text-lg font-semibold text-gray-900 mb-2">No email templates</p>
            <p className="text-gray-500 mb-4">Create templates to send professional interview invites to candidates.</p>
            {isAdmin && <button onClick={openCreate} className="btn-primary">Create First Template</button>}
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in-up">
            {templates.map((t) => (
              <div key={t.id} className="card-hover p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{t.name}</h3>
                      {t.is_default && <span className="badge-info text-[10px]">Default</span>}
                    </div>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(t)} className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition">
                        Edit
                      </button>
                      {!t.is_default && (
                        <button onClick={() => setDeleteTarget({id: t.id, name: t.name})} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition">
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">Subject:</p>
                  <p className="text-sm font-medium text-gray-700 mb-3">{t.subject}</p>
                  <p className="text-xs text-gray-500 mb-1">Body:</p>
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{t.body}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["{{candidateName}}", "{{firstName}}", "{{role}}", "{{level}}", "{{duration}}", "{{orgName}}"].map(v => (
                    <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono">{v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
            <div className="card w-full max-w-lg p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editingTemplate ? "Edit Template" : "New Email Template"}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Template Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Professional, Friendly, Follow-up" className="input-field" />
                </div>
                <div>
                  <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Best for senior roles" className="input-field" />
                </div>
                <div>
                  <label className="label">Subject Line</label>
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="e.g. Interview Invitation — {{role}} at {{orgName}}" className="input-field" />
                </div>
                <div>
                  <label className="label">Email Body</label>
                  <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder={"Dear {{candidateName}},\n\nThank you for your interest in the {{role}} position...\n\nDuration: {{duration}} minutes"}
                    rows={8} className="input-field resize-none font-mono text-xs" />
                  <p className="text-xs text-gray-400 mt-1">
                    Variables: {"{{candidateName}}"}, {"{{firstName}}"}, {"{{role}}"}, {"{{level}}"}, {"{{duration}}"}, {"{{orgName}}"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSave} disabled={!form.name || !form.subject || !form.body} className="btn-primary disabled:opacity-40">
                  {editingTemplate ? "Save Changes" : "Create Template"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Email Template"
        message="Are you sure you want to delete this email template?"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
