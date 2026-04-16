"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ConfirmModal } from "@/components/ConfirmModal";

type AISettings = any;

export default function AISettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "admin";

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [defaults, setDefaults] = useState<AISettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/login"); return; }
    if (!isAdmin) return; // don't fetch if not admin
    fetch("/api/settings/ai").then((r) => r.json()).then((d) => {
      if (d.error) return setMessage({ type: "error", text: d.error });
      setSettings(d.settings);
      setDefaults(d.defaults);
    });
  }, [status, session, isAdmin, router]);

  if (status === "loading") return <div className="flex min-h-screen"><Sidebar /><div className="flex-1 p-8">Loading...</div></div>;
  if (!isAdmin) return (
    <div className="flex min-h-screen bg-gray-50"><Sidebar />
      <div className="flex-1 p-8 max-w-4xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-amber-900 mb-2">Admin access required</h1>
          <p className="text-sm text-amber-700">AI settings can only be modified by organization administrators.</p>
        </div>
      </div>
    </div>
  );
  if (!settings) return <div className="flex min-h-screen"><Sidebar /><div className="flex-1 p-8">Loading...</div></div>;

  const update = (path: string, value: any) => {
    const keys = path.split(".");
    const next = JSON.parse(JSON.stringify(settings));
    let obj = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    setSettings(next);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "error", text: data.details?.join(", ") || data.error || "Save failed" });
      return;
    }
    setSettings(data.settings);
    setMessage({ type: "success", text: "Settings saved" });
    setTimeout(() => setMessage(null), 3000);
  };

  const reset = () => setShowResetModal(true);
  const confirmReset = () => {
    setSettings(JSON.parse(JSON.stringify(defaults)));
    setShowResetModal(false);
    setMessage({ type: "success", text: "Reset to defaults (click Save to persist)" });
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">AI Interviewer Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Customize interviewer behavior, scoring, and persona for your organization</p>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Reset to defaults</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {message.text}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
          <strong>Locked safety rules</strong> cannot be overridden:
          English-only output, no hints or answers, no score reveals during interview, TTS-safe output.
          Your custom guidelines are merged between these locked rules.
        </div>

        {/* Section 1: Persona */}
        <Section title="Persona" desc="How the AI introduces itself">
          <Row label="Interviewer name">
            <input type="text" value={settings.persona.name} onChange={(e) => update("persona.name", e.target.value)} maxLength={40} className="input" />
          </Row>
          <Row label="Tone">
            <select value={settings.persona.tone} onChange={(e) => update("persona.tone", e.target.value)} className="input">
              <option value="professional">Professional</option>
              <option value="warm">Warm</option>
              <option value="casual">Casual</option>
            </select>
          </Row>
        </Section>

        {/* Section 2: Scoring */}
        <Section title="Scoring Thresholds" desc="Determines hire / no_hire recommendation">
          <Row label="strong_hire — overall ≥">
            <input type="number" step="0.1" min="3" max="5" value={settings.scoring.strongHireOverall} onChange={(e) => update("scoring.strongHireOverall", parseFloat(e.target.value))} className="input w-24" />
          </Row>
          <Row label="strong_hire — min dimension ≥">
            <input type="number" step="0.1" min="1" max="5" value={settings.scoring.strongHireMinDim} onChange={(e) => update("scoring.strongHireMinDim", parseFloat(e.target.value))} className="input w-24" />
          </Row>
          <Row label="hire — overall >">
            <input type="number" step="0.1" min="1" max="5" value={settings.scoring.hireOverall} onChange={(e) => update("scoring.hireOverall", parseFloat(e.target.value))} className="input w-24" />
          </Row>
          <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
            <div className="text-xs text-gray-500 font-medium mb-2">Per-dimension minimums for hire (0-5):</div>
            {([
              ["technicalDepth", "Technical Depth"],
              ["communication", "Communication"],
              ["problemSolving", "Problem Solving"],
              ["domainKnowledge", "Domain Knowledge"],
              ["cultureFit", "Culture Fit"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-sm text-gray-700 w-40 shrink-0">{label}</label>
                <input type="number" step="0.5" min="0" max="5" value={settings.scoring.hireMinDims[key]} onChange={(e) => update(`scoring.hireMinDims.${key}`, parseFloat(e.target.value))} className="input w-20" />
                <span className="text-xs text-gray-400">min required for hire</span>
              </div>
            ))}
          </div>
          <Row label="strong_no_hire — overall <">
            <input type="number" step="0.1" min="1" max="5" value={settings.scoring.strongNoHireOverall} onChange={(e) => update("scoring.strongNoHireOverall", parseFloat(e.target.value))} className="input w-24" />
          </Row>
        </Section>

        {/* Section 3: Behavior */}
        <Section title="Interview Behavior" desc="How the AI conducts the interview">
          <Row label="Max follow-ups per question">
            <input type="number" min="0" max="5" value={settings.behavior.maxFollowUps} onChange={(e) => update("behavior.maxFollowUps", parseInt(e.target.value))} className="input w-24" />
          </Row>
          <Row label="Sentences per response">
            <select value={settings.behavior.sentencesPerResponse} onChange={(e) => update("behavior.sentencesPerResponse", e.target.value)} className="input">
              <option value="1-2">1-2 (very concise)</option>
              <option value="1-3">1-3 (default)</option>
              <option value="2-4">2-4 (more context)</option>
            </select>
          </Row>
          <div className="mt-4">
            <label className="block text-sm text-gray-700 font-medium mb-2">
              Custom interviewer guidelines <span className="text-gray-400 font-normal">({settings.behavior.customGuidelines.length}/2000)</span>
            </label>
            <textarea
              value={settings.behavior.customGuidelines}
              onChange={(e) => update("behavior.customGuidelines", e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="E.g. For senior roles push harder on system design. Probe compliance awareness for fintech. Ask for specific production incidents."
              className="input w-full"
            />
          </div>
        </Section>

        {/* Section 4: Scorecard */}
        <Section title="Scorecard Criteria" desc="Custom evaluation criteria for scoring">
          <div>
            <label className="block text-sm text-gray-700 font-medium mb-2">
              Custom scorecard criteria <span className="text-gray-400 font-normal">({settings.scorecard.customCriteria.length}/1000)</span>
            </label>
            <textarea
              value={settings.scorecard.customCriteria}
              onChange={(e) => update("scorecard.customCriteria", e.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="E.g. Weight candidates who discuss tradeoffs over those giving perfect answers. Deduct for refusing to commit to a decision."
              className="input w-full"
            />
          </div>
        </Section>

        {/* Section 5: Company */}
        <Section title="Company Context" desc="Culture and hiring philosophy">
          <Row label="Hiring bar">
            <select value={settings.company.hiringBar} onChange={(e) => update("company.hiringBar", e.target.value)} className="input">
              <option value="strict">Strict — only clear hires</option>
              <option value="balanced">Balanced (default)</option>
              <option value="lenient">Lenient — benefit of doubt</option>
            </select>
          </Row>
          <div className="mt-4">
            <label className="block text-sm text-gray-700 font-medium mb-2">
              Culture notes <span className="text-gray-400 font-normal">({settings.company.cultureNotes.length}/500)</span>
            </label>
            <textarea
              value={settings.company.cultureNotes}
              onChange={(e) => update("company.cultureNotes", e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="E.g. We value humility over credentials. First-principles thinkers preferred. Ownership matters more than perfection."
              className="input w-full"
            />
          </div>
        </Section>

        {/* Section 6: Boundaries */}
        <Section title="Boundaries" desc="Topics the AI must avoid">
          <div>
            <label className="block text-sm text-gray-700 font-medium mb-2">Banned topics</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {settings.boundaries.bannedTopics.map((t: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-red-50 text-red-700 text-sm rounded-full border border-red-200 flex items-center gap-2">
                  {t}
                  <button onClick={() => update("boundaries.bannedTopics", settings.boundaries.bannedTopics.filter((_: string, j: number) => j !== i))} className="text-red-400 hover:text-red-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && newTopic.trim()) {
                  e.preventDefault();
                  update("boundaries.bannedTopics", [...settings.boundaries.bannedTopics, newTopic.trim()]);
                  setNewTopic("");
                }
              }} placeholder="Add a topic and press Enter (e.g. salary, personal life)" className="input flex-1" />
            </div>
          </div>
        </Section>

        <style jsx global>{`
          .input { padding: 0.5rem 0.75rem; border: 1px solid rgb(229 231 235); border-radius: 0.5rem; font-size: 0.875rem; background: white; }
          .input:focus { outline: 2px solid rgb(59 130 246); outline-offset: -1px; border-color: transparent; }
        `}</style>
      </div>

      <ConfirmModal
        open={showResetModal}
        title="Reset all AI settings?"
        message="All persona, scoring, behavior, and custom prompt settings will revert to defaults. You'll still need to click Save to persist."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        danger={true}
        onConfirm={confirmReset}
        onCancel={() => setShowResetModal(false)}
      />
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <label className="text-sm text-gray-700 w-56 flex-shrink-0">{label}</label>
      {children}
    </div>
  );
}
