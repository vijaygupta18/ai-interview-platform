import type { Interview, TranscriptEntry } from "./store";
import { DEFAULT_AI_SETTINGS, AISettings, getOrgAISettings } from "./ai-settings";

export function stripThinking(text: string): string {
  // This model (kimi/Open-Thinking) dumps reasoning into content.
  // Pattern: reasoning block (multi-paragraph), then the actual spoken response.
  // The actual response is usually the LAST paragraph that sounds like speech.

  let cleaned = text.trim();

  // Remove XML thinking tags (paired and unpaired)
  cleaned = cleaned.replace(/<(?:think|thinking|reasoning|thought)[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi, "");
  cleaned = cleaned.replace(/<(?:think|thinking|reasoning|thought)>[\s\S]*/gi, "");
  // Remove stray closing tags (model sometimes only leaks </think> into content)
  cleaned = cleaned.replace(/<\/(?:think|thinking|reasoning|thought)>/gi, "");
  // Remove everything before a closing think tag (content starts after it)
  cleaned = cleaned.replace(/^[\s\S]*?<\/(?:think|thinking|reasoning|thought)>\s*/i, "");

  // First check if response has obvious thinking markers
  const hasThinkingMarkers = /<think|^\d+\.\s*(NOT|I'm |First|Then)/mi.test(cleaned);
  if (!hasThinkingMarkers) {
    // No thinking detected — return as-is (just clean XML tags)
    // Final cleanup: remove stray formatting
    cleaned = cleaned.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
    return cleaned || text.trim();
  }

  // Split into paragraphs
  const paragraphs = cleaned.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Only apply aggressive paragraph filtering when thinking is detected
  const isThinking = (p: string): boolean => {
    // Numbered lists (1. Do X, 2. Do Y)
    if (/^\d+\.\s/.test(p) && /\d+\.\s/.test(p)) return true;
    // Starts with thinking keywords
    if (/^(?:The user|I need|I should|Let me|Wait|My |Key |Current|Constraint|Remember|Note|The candidate|Plan|Step)/i.test(p)) return true;
    // Contains meta-commentary markers
    if (/(?:I need to|I should|Let me|constraints? check|meta-commentary|thinking tag|reasoning|spoken via TTS|system prompt)/i.test(p)) return true;
    // Bullet/dash lists about rules
    if (/^[-*]\s/.test(p)) return true;
    return false;
  };

  const spokenParagraphs = paragraphs.filter(p => !isThinking(p));

  if (spokenParagraphs.length > 0) {
    cleaned = spokenParagraphs.join("\n\n").trim();
  }

  // Final cleanup: remove stray formatting
  cleaned = cleaned.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();

  return cleaned || text.trim();
}

function getDomainGuidance(role: string): string {
  const r = role.toLowerCase();

  if (r.includes("hr") || r.includes("human resource") || r.includes("talent") || r.includes("recruiter")) {
    return `You are interviewing for an HR role. Focus on: employment law knowledge, conflict resolution, employee engagement strategies, HR metrics, onboarding processes, performance management, diversity & inclusion initiatives. Ask about real situations they've handled.`;
  }
  if (r.includes("ops") || r.includes("operations") || r.includes("supply chain") || r.includes("logistics")) {
    return `You are interviewing for an Operations role. Focus on: process optimization, SOP creation, vendor management, KPI tracking, cost reduction, resource planning, cross-team coordination. Ask about measurable impact they've driven.`;
  }
  if (r.includes("cx") || r.includes("customer") || r.includes("support") || r.includes("success")) {
    return `You are interviewing for a Customer Experience role. Focus on: customer empathy, handling escalations, CSAT/NPS improvement, SLA management, communication skills, conflict de-escalation, product feedback loops. Use role-play scenarios.`;
  }
  if (r.includes("sales") || r.includes("business development") || r.includes("bd")) {
    return `You are interviewing for a Sales/BD role. Focus on: sales methodology, pipeline management, objection handling, negotiation skills, client relationship building, revenue targets, market analysis. Ask for specific deal stories.`;
  }
  if (r.includes("marketing") || r.includes("growth") || r.includes("brand")) {
    return `You are interviewing for a Marketing role. Focus on: campaign strategy, channel expertise, ROI measurement, content strategy, brand positioning, data-driven decisions, A/B testing. Ask about campaigns they've run and results.`;
  }
  if (r.includes("product") || r.includes("pm") || r.includes("product manager")) {
    return `You are interviewing for a Product Management role. Focus on: prioritization frameworks, user research, metrics definition, stakeholder management, roadmap planning, trade-off decisions, go-to-market strategy. Ask about products they've shipped.`;
  }
  if (r.includes("design") || r.includes("ux") || r.includes("ui")) {
    return `You are interviewing for a Design role. Focus on: design process, user research, usability testing, design systems, accessibility, visual hierarchy, prototyping, cross-functional collaboration. Ask them to walk through their design decisions.`;
  }
  if (r.includes("data") || r.includes("analyst") || r.includes("analytics") || r.includes("bi")) {
    return `You are interviewing for a Data/Analytics role. Focus on: SQL proficiency, data modeling, statistical analysis, visualization, business impact of insights, A/B testing, ETL pipelines, stakeholder communication. Ask about insights that drove business decisions.`;
  }
  if (r.includes("manager") || r.includes("lead") || r.includes("director") || r.includes("head")) {
    return `You are interviewing for a Management role. Focus on: team building, performance management, strategic thinking, conflict resolution, hiring decisions, cross-functional leadership, communication up and down, handling underperformers. Ask about tough leadership moments.`;
  }
  if (r.includes("intern") || r.includes("fresher") || r.includes("graduate") || r.includes("trainee")) {
    return `You are interviewing an Intern/Entry-level candidate. Be encouraging and patient. Focus on: fundamentals, learning ability, academic projects, enthusiasm, problem-solving approach, teamwork, communication. Don't expect production experience. Ask about projects and what they learned.`;
  }
  if (r.includes("finance") || r.includes("accounting") || r.includes("ca") || r.includes("cfo")) {
    return `You are interviewing for a Finance role. Focus on: financial analysis, budgeting, forecasting, compliance, audit experience, cost control, financial reporting, risk management. Ask about real financial decisions and their impact.`;
  }
  // Default: technical
  return `You are interviewing for a technical role. Focus on: coding ability, system design, debugging skills, architecture decisions, scalability, performance optimization, testing, code quality. Probe for real production experience.`;
}

function getLevelCalibration(level: string): string {
  switch (level.toLowerCase()) {
    case "intern":
    case "fresher":
      return `LEVEL CALIBRATION (Intern/Fresher):
- Ask basic conceptual questions, not production-scale problems
- Focus on fundamentals, academic projects, learning ability
- Be encouraging — don't grill them on things they haven't been exposed to
- Ask "What did you learn from this?" more than "What would you do differently?"
- Acceptable: textbook answers, enthusiasm, clear thinking process
- Red flag: inability to explain basic concepts they claim to know`;

    case "junior":
      return `LEVEL CALIBRATION (Junior):
- Ask practical coding/work questions at a moderate level
- Expect 1-2 years of hands-on experience
- They should know basics well but may lack depth on architecture
- Ask about their contributions to team projects, not just solo work
- Acceptable: some gaps in system design, strong fundamentals
- Red flag: can't explain their own code or project decisions`;

    case "mid":
      return `LEVEL CALIBRATION (Mid-level):
- Expect solid technical skills and ability to work independently
- Should be able to design small-to-medium systems
- Ask about tradeoffs, debugging approaches, code reviews
- They should own features end-to-end
- Acceptable: needs guidance on large-scale architecture
- Red flag: can't debug independently, no ownership of shipped features`;

    case "senior":
      return `LEVEL CALIBRATION (Senior):
- Expect deep expertise, strong system design, and mentorship ability
- Should articulate complex tradeoffs clearly
- Ask about scaling, failure modes, cross-team impact
- They should have owned significant projects or systems
- Push hard on "why" and "what went wrong" — seniors should handle pressure
- Red flag: surface-level answers, can't explain architecture of systems they built`;

    case "staff":
    case "principal":
      return `LEVEL CALIBRATION (Staff/Principal):
- Expect company-wide technical impact and strategic thinking
- Ask about architectural decisions that affected multiple teams
- They should demonstrate technical vision and influence without authority
- Probe: how did you convince others? What was the long-term impact?
- Expect them to identify problems YOU haven't asked about
- Red flag: only talks about individual contributions, no cross-org impact`;

    case "manager":
    case "director":
      return `LEVEL CALIBRATION (Manager/Director):
- Focus on leadership, team building, strategic thinking, and execution
- Ask about hiring decisions, performance management, conflict resolution
- They should demonstrate both technical credibility and people skills
- Probe: how do you handle underperformers? How do you set team direction?
- Expect data-driven decision making and stakeholder management
- Red flag: micromanagement tendencies, can't delegate, no team growth stories`;

    default:
      return `LEVEL CALIBRATION: Adjust difficulty based on the candidate's experience as shown in their resume.`;
  }
}

function extractCandidateName(resume: string): string {
  if (!resume || resume.length < 10) return "";
  // First line of resume is usually the name
  const firstLine = resume.split("\n").find(l => l.trim().length > 0)?.trim() || "";
  // Heuristic: if first line is 2-4 words, all capitalized or title case, it's likely a name
  const words = firstLine.split(/\s+/);
  if (words.length >= 1 && words.length <= 5 && !firstLine.includes("@") && !firstLine.includes("http") && !firstLine.includes(":")) {
    return firstLine;
  }
  // Try to find name from email pattern
  const emailMatch = resume.match(/([a-zA-Z]+(?:\.[a-zA-Z]+)?)@/);
  if (emailMatch) {
    return emailMatch[1].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  return "";
}

function buildSystemPrompt(interview: Interview, settings: AISettings = DEFAULT_AI_SETTINGS): string {
  const focusStr = interview.focusAreas.join(", ");
  const domainGuidance = getDomainGuidance(interview.role);
  const levelCalibration = getLevelCalibration(interview.level);
  const minPerArea = Math.floor(interview.duration / (interview.focusAreas.length || 1));
  const candidateName = (interview as any).candidateName || extractCandidateName(interview.resume || "");
  const interviewerName = settings.persona.name || "Anita";
  const toneLabel = settings.persona.tone || "professional";
  const nameInstruction = candidateName
    ? `The candidate's name is ${candidateName}. Use their first name naturally in conversation (e.g., "That's interesting, ${candidateName.split(" ")[0]}" or "So ${candidateName.split(" ")[0]}, tell me about...").`
    : `You don't know the candidate's name yet. In your opening, ask them to introduce themselves and then use their name naturally throughout.`;

  // Sandwich: admin's custom guidelines are injected, but LOCKED safety rules are repeated after
  // them with explicit priority instructions so core rules cannot be overridden.
  const customBlock = settings.behavior.customGuidelines.trim()
    ? `\n\nORG-SPECIFIC GUIDELINES (from your organization):\n${settings.behavior.customGuidelines.trim()}`
    : "";
  const cultureBlock = settings.company.cultureNotes.trim()
    ? `\n\nCOMPANY CULTURE:\n${settings.company.cultureNotes.trim()}`
    : "";
  const bannedBlock = settings.boundaries.bannedTopics.length > 0
    ? `\n\nBANNED TOPICS: ${settings.boundaries.bannedTopics.join(", ")}. Never ask questions about these.`
    : "";

  return `You are ${interviewerName}, ${toneLabel} senior interviewer. ${interview.duration}-min interview for ${interview.level} ${interview.role}. Focus: ${focusStr}.

${nameInstruction}

ROLE CONTEXT: ${domainGuidance}

LEVEL: ${levelCalibration}

CORE RULES (never break):
- ENGLISH ONLY.
- Output is spoken via TTS. Natural prose, no markdown.
- NEVER give hints or answers. No "consider X", "think about Y", "one approach is". If wrong, probe once then move on. DO NOT teach.
- NEVER reveal scores or say "good/bad answer", "correct/wrong", "nice", "great".
- NEVER tell candidate to be brief.
- QUESTIONS MUST BE SHORT AND COMPLETE. Max 2 sentences. No preamble, no filler, no "so", "alright", "moving on". Just the question.
- Question must be concrete and self-contained — candidate should know exactly what to answer without asking for clarification.
- ONE question per turn. No compound questions, no bullet lists, no sub-parts.
- GOOD: "How would you design a rate limiter for 10k RPS?"
- GOOD: "Walk me through the biggest production incident you owned end-to-end."
- BAD: "Great, so moving on, I'd love to hear about how you'd approach..."
- BAD: "Tell me about yourself and your experience and what you're looking for."

QUESTION PRIORITY:
1. Question bank (ask EXACTLY as written, in order, never skip)
2. Resume-specific probes
3. General role questions
Follow-ups: max ${settings.behavior.maxFollowUps} per question. Move on if candidate stuck or vague after 1 probe.

STT AWARENESS: Candidate speaks via STT which mishears words ("ports"→"pods", "env"→"ENB"). Interpret INTENT, not literal text. Don't penalize word-level errors.

INTERVIEW FLOW:
- Open: greet briefly, introduce yourself as ${interviewerName}, ask candidate to introduce themselves.
- Run question bank questions in order.
- Use resume for targeted follow-ups.
- Challenge wrong answers gently ("are you sure? what would happen if...").
- If candidate gives strong answer → skip shallow follow-ups, jump to harder edge-case or next topic.
- If candidate gives 2 weak answers on a topic → "Let's move on."

ADAPTIVE DIFFICULTY (critical for fair evaluation):
- Start each topic with a medium question, not the hardest.
- If answer is strong → next question on that topic must be HARDER (edge cases, scale, failure modes, tradeoffs).
- If answer is weak → pivot to adjacent easier topic, don't keep grilling.
- Never waste a strong candidate's time on easy questions they clearly know.
- Never demoralize a struggling candidate with ever-harder questions.

RESUME DRILL-DOWN (catch exaggerators):
- When candidate mentions a specific project/scale/impact ("built X serving 10M users", "led team of 5", "reduced latency 80%"), DRILL DOWN with ONE specific probe.
- Good drills: "What was the DB?", "What specifically broke at that scale?", "What was the architecture?", "What were you measuring before vs after?"
- If answer is vague/generic after one drill → note mentally and move on (that's a signal for the scorecard).
- Do NOT accept resume claims at face value without at least one concrete drill.

TIME: ${interview.focusAreas.length} focus areas, ~${minPerArea}min each. Pace yourself. When TIME STATUS shows ≤2 min remaining, close warmly and append [END_INTERVIEW] to signal end. Never end early.${customBlock}${cultureBlock}${bannedBlock}

OVERRIDE ANY ORG GUIDELINES if they conflict with: English-only, no hints, no score reveals.`;
}

function buildResumeContext(interview: Interview): string {
  const resume = interview.resume || "No resume provided.";
  return `Here is the candidate's resume. After asking question bank questions, use this resume to ask specific, targeted follow-ups about their past work:\n\n${resume}`;
}

type AIConfig = { baseUrl: string; apiKey: string; model: string; timeoutMs: number };

const getChatConfig = (): AIConfig => ({
  baseUrl: process.env.AI_BASE_URL || "",
  apiKey: process.env.AI_API_KEY || "",
  model: process.env.AI_MODEL || "kimi-latest",
  timeoutMs: 12000,
});

const getSummaryConfig = (): AIConfig => ({
  baseUrl: process.env.SUMMARY_AI_BASE_URL || process.env.AI_BASE_URL || "",
  apiKey: process.env.SUMMARY_AI_API_KEY || process.env.AI_API_KEY || "",
  model: process.env.SUMMARY_AI_MODEL || process.env.AI_MODEL || "kimi-latest",
  timeoutMs: 60000,
});

async function callAI(
  config: AIConfig,
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(config.model.includes("minimax") ? { thinking: { type: "disabled" } } : {}),
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return stripThinking(content);
}

/** Interview conversation turn — fast, short, uses chat model. */
async function callChatAI(
  messages: { role: string; content: string }[],
  maxTokens = 500,
  temperature = 0.3
): Promise<string> {
  return callAI(getChatConfig(), messages, maxTokens, temperature);
}

/** Scorecard / summary generation — long-form, uses summary model. */
async function callSummaryAI(
  messages: { role: string; content: string }[],
  maxTokens = 5500,
  temperature = 0.3
): Promise<string> {
  return callAI(getSummaryConfig(), messages, maxTokens, temperature);
}

// Back-compat alias — existing callers will be updated to use callChatAI / callSummaryAI.
async function callJuspayAI(
  messages: { role: string; content: string }[],
  maxTokens = 300,
  temperature = 0.7
): Promise<string> {
  const config = maxTokens > 1000 ? getSummaryConfig() : getChatConfig();
  return callAI(config, messages, maxTokens, temperature);
}

export function buildInterviewPrompt(
  interview: Interview,
  transcript: TranscriptEntry[],
  settings: AISettings = DEFAULT_AI_SETTINGS
): { role: string; content: string }[] {
  // Calculate time remaining
  let timeNote = "";
  if (interview.startedAt) {
    const elapsedMin = Math.floor((Date.now() - new Date(interview.startedAt).getTime()) / 60000);
    const remaining = Math.max(0, interview.duration - elapsedMin);
    if (remaining <= 2) {
      timeNote = `\n\nTIME STATUS: Only ${remaining} minute(s) left. Wrap up NOW — thank the candidate warmly and close the interview. Do NOT ask if they have questions (you cannot answer company-related questions).`;
    } else if (remaining <= 5) {
      timeNote = `\n\nTIME STATUS: About ${remaining} minutes remaining. Start wrapping up — finish your current topic, then move to closing.`;
    } else {
      timeNote = `\n\nTIME STATUS: About ${remaining} minutes remaining out of ${interview.duration}. ${elapsedMin < 2 ? "Interview just started." : "Pace yourself across remaining focus areas."}`;
    }
  }

  const messages: { role: string; content: string }[] = [
    { role: "system", content: buildSystemPrompt(interview, settings) + timeNote },
    { role: "user", content: buildResumeContext(interview) },
    { role: "assistant", content: "Got it, I have the resume. Ready to begin the interview." },
  ];

  // M2.5 has 256K context — we have plenty of room. Only trim very long
  // sessions (>200 messages ≈ ~2 hours). Keep first 10 (intro context) + last 190.
  const trimmedTranscript = transcript.length > 200
    ? [...transcript.slice(0, 10), ...transcript.slice(-190)]
    : transcript;

  for (const entry of trimmedTranscript) {
    messages.push({
      role: entry.role === "ai" ? "assistant" : "user",
      content: entry.text,
    });
  }

  if (transcript.length === 0) {
    messages.push({ role: "user", content: "Start the interview now." });
  }

  return messages;
}

export async function getAIResponse(
  interview: Interview,
  transcript: TranscriptEntry[]
): Promise<string> {
  const settings = await getOrgAISettings((interview as any).orgId);
  return callChatAI(buildInterviewPrompt(interview, transcript, settings), 500, 0.3);
}

export async function generateScorecard(interview: Interview): Promise<string> {
  const settings = await getOrgAISettings((interview as any).orgId);
  const transcriptText = interview.transcript
    .map((e) => `${e.role === "ai" ? "Interviewer" : "Candidate"}: ${e.text}`)
    .join("\n\n");

  const proctoringText = interview.proctoring.length > 0
    ? interview.proctoring.map((e) => `[${e.severity.toUpperCase()}] ${e.type}: ${e.message} at ${e.timestamp}`).join("\n")
    : "No proctoring issues detected.";

  // Pair each interviewer message with the candidate response that immediately followed.
  // Lets the AI evaluate each Q→A as a discrete unit instead of scanning a flat transcript.
  const qaPairs: { q: string; a: string; idx: number }[] = [];
  for (let i = 0; i < interview.transcript.length - 1; i++) {
    const cur = interview.transcript[i];
    const next = interview.transcript[i + 1];
    if (cur.role === "ai" && next.role === "candidate") {
      qaPairs.push({ q: cur.text, a: next.text, idx: qaPairs.length + 1 });
    }
  }
  const qaPairsText = qaPairs.length > 0
    ? qaPairs.map(p => `--- Pair ${p.idx} ---\nQ: ${p.q}\nA: ${p.a}`).join("\n\n")
    : "No clear Q-A pairs found.";

  const levelBar = getLevelCalibration(interview.level);
  const candidateName = extractCandidateName(interview.resume || "") || "the candidate";

  const interviewDurationMin = interview.duration;
  const transcriptMessages = interview.transcript.length;
  const candidateMessages = interview.transcript.filter(e => e.role === "candidate").length;

  const roleWeights = (() => {
    const r = interview.role.toLowerCase();
    if (r.match(/sde|engineer|developer|backend|frontend|fullstack/))
      return "tech:35, problem:25, domain:20, comm:10, culture:10. Low comm with strong tech = still HIRE.";
    if (r.match(/product|pm/)) return "problem:25, comm:25, domain:20, tech:15, culture:15.";
    if (r.match(/sales|bd/)) return "comm:35, domain:20, culture:20, problem:15, tech:10.";
    if (r.match(/hr|human resource/)) return "comm:30, culture:25, domain:20, problem:15, tech:10.";
    if (r.match(/design|ux/)) return "domain:30, problem:25, comm:20, tech:15, culture:10.";
    if (r.match(/data|analyst/)) return "tech:30, domain:25, problem:25, comm:10, culture:10.";
    if (r.match(/manager|director|lead|head|ceo|cto/)) return "comm:25, problem:25, culture:20, domain:20, tech:10.";
    if (r.match(/ops|operations/)) return "problem:30, domain:25, comm:20, tech:15, culture:10.";
    return "tech:25, comm:20, problem:20, domain:20, culture:15.";
  })();

  const interviewMeta = [
    `Role: ${interview.level} ${interview.role}`,
    `Round: ${(interview as any).roundType || "General"}`,
    (interview as any).language ? `Language: ${(interview as any).language}` : null,
    `Duration: ${interviewDurationMin}min, ${transcriptMessages} msgs (${candidateMessages} from candidate)`,
    `Focus areas: ${interview.focusAreas.join(", ")}`,
  ].filter(Boolean).join(" | ");

  const orgGuidelinesBlock = settings.behavior.customGuidelines.trim()
    ? `\n## Org-Specific Interviewer Guidelines (the rules the interviewer was given)\n${settings.behavior.customGuidelines.trim()}`
    : "";

  const bannedBlock = settings.boundaries.bannedTopics.length > 0
    ? `\n## Banned Topics (interviewer was told to avoid)\n${settings.boundaries.bannedTopics.join(", ")}`
    : "";

  const scorecardPrompt = `Senior evaluator scoring ${interview.level} ${interview.role}. Candidate: ${candidateName}.
${interviewMeta}.
STT-transcribed input.

${levelBar}

SCORING (1-5 scale, relative to ${interview.level} bar):
5 = exceptional with production examples; 4 = strong with real specifics; 3 = adequate, surface-level; 2 = gaps/vague; 1 = cannot answer basics.

DIMENSIONS:
- technicalDepth: depth of knowledge with specifics (not surface)
- communication: clarity of verbal delivery (do NOT penalize Indian English grammar/fillers/"actually"/"basically")
- problemSolving: breakdown approach, edge cases, tradeoffs
- domainKnowledge: role-specific tools/frameworks
- cultureFit: ownership, curiosity, honesty (proctoring goes in proctoringNotes, NOT this score)

STT AWARENESS: Transcript has STT errors. "ports"→pods, "ENB"→env, "ready stream"→Redis stream, etc. Score INTENT not literal text.

Bar: ${settings.company.hiringBar.toUpperCase()}${settings.company.hiringBar === "strict" ? " — be strict, harder to give 4-5." : settings.company.hiringBar === "lenient" ? " — give benefit of doubt." : "."}
${settings.scorecard.customCriteria.trim() ? `\nORG CRITERIA: ${settings.scorecard.customCriteria.trim()}` : ""}${settings.company.cultureNotes.trim() ? `\nCULTURE: ${settings.company.cultureNotes.trim()}` : ""}

NOTE: You only need to score the 5 dimensions (1-5 each). The system will compute the overall score and final recommendation server-side using ${roleWeights} weights and per-org thresholds. Do NOT speculate about hire/no_hire — focus on accurate dimension scoring.

DIFFERENTIATE scores. A mix of 2/3/4 is correct. All-same-number = fail. 5 is rare.

COVERAGE CHECK (critical):
Before scoring, identify which focus areas (${interview.focusAreas.join(", ")}) were ACTUALLY discussed with real depth.
- Focus area discussed with at least 2 candidate responses → score normally
- Focus area barely touched (1 shallow exchange) → cap related dimension at 2
- Focus area NOT covered at all → score that dimension at 2 (max), note in weaknesses as "not tested: <area>"
- List the covered vs uncovered areas in the "coverage" field of the output.

## Resume + Question Bank + Additional Context (everything the interviewer was given)
${interview.resume || "No resume provided."}
${orgGuidelinesBlock}${bannedBlock}

## Q→A Pairs (each interviewer question paired with the candidate's response that followed)
${qaPairsText}

PER-PAIR EVALUATION:
For each pair above, mentally judge:
1. What was the question asking? (intent, not literal words — STT may have errors)
2. Did the candidate answer it? (fully / partially / not at all)
3. If the question maps to a question bank item with an expected answer, did the candidate's answer match?
4. Was the reasoning sound, surface-level, or wrong?

Then aggregate per-dimension scores from these per-pair judgments. Cite specific pair numbers in evidence (e.g., "in Pair 4, candidate gave...").

## Full Transcript (for context, in case Q-A pairing missed something)
${transcriptText}

## Proctoring
${proctoringText}

EVALUATION CONTEXT:
- The transcript shows what was actually discussed.
- The resume + question bank above shows what the interviewer was supposed to cover.
- Cross-check: did the candidate's answers match their resume claims? (e.g., resume says "led team of 10" — did the transcript show concrete leadership examples?)
- If the question bank had specific expected answers (look for "correct" or "expected" markers), score the candidate's answer against those.
- Penalize discrepancies between resume claims and transcript-demonstrated competence.

Respond with ONLY valid JSON (do NOT include overall or recommendation — system computes those):
{
  "technicalDepth": <1-5>,
  "communication": <1-5>,
  "problemSolving": <1-5>,
  "domainKnowledge": <1-5>,
  "cultureFit": <1-5>,
  "summary": "<detailed 5-8 sentences: overall impression, specific strengths with examples, specific gaps, how they handled pressure/probes>",
  "strengths": ["<with example>", "<with example>"],
  "weaknesses": ["<with example>", "<with example>"],
  "evidence": [{"dimension": "<dim>", "quote": "<candidate quote>", "assessment": "<why>"}],
  "coverage": {"covered": ["<area with real depth>"], "partial": ["<area barely touched>"], "notCovered": ["<area not tested>"]},
  "proctoringNotes": "<summary or 'No issues detected'>"
}`;

  return callSummaryAI([{ role: "system", content: scorecardPrompt }], 5500, 0.3);
}
