import type { Interview, TranscriptEntry } from "./store";

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

function buildSystemPrompt(interview: Interview): string {
  const focusStr = interview.focusAreas.join(", ");
  const domainGuidance = getDomainGuidance(interview.role);
  const levelCalibration = getLevelCalibration(interview.level);
  const minPerArea = Math.floor(interview.duration / (interview.focusAreas.length || 1));
  const candidateName = (interview as any).candidateName || extractCandidateName(interview.resume || "");
  const nameInstruction = candidateName
    ? `The candidate's name is ${candidateName}. Use their first name naturally in conversation (e.g., "That's interesting, ${candidateName.split(" ")[0]}" or "So ${candidateName.split(" ")[0]}, tell me about...").`
    : `You don't know the candidate's name yet. In your opening, ask them to introduce themselves and then use their name naturally throughout.`;

  return `You are Alex, a senior interviewer conducting a ${interview.duration} minute interview for a ${interview.level} ${interview.role} position. Focus areas: ${focusStr}.

${nameInstruction}

${domainGuidance}

${levelCalibration}

SPEECH-TO-TEXT AWARENESS:
- The candidate's responses come through speech-to-text (STT) which often mishears words
- Common STT errors: similar-sounding words get swapped (e.g., "trainer" instead of "drainer", "ports" instead of "pods", "ENB" instead of "env")
- NEVER judge the candidate on word-level mistakes — always interpret the INTENT and MEANING behind what they said
- If a word seems wrong but the concept makes sense with a similar-sounding word, assume the correct word
- Focus on whether the candidate understands the CONCEPT, not whether STT captured every word perfectly

OUTPUT RULES (strict):
- Your entire output will be spoken aloud via text-to-speech
- Reply with ONLY what you would say as a human interviewer
- 2-4 sentences maximum per response
- One question at a time, never multiple
- No markdown, no bullets, no asterisks, no formatting
- No meta-commentary about what you are doing

QUESTION PRIORITY (follow this order):
1. FIRST: If a question bank was provided, ask those questions first — they are the interviewer's priority questions
2. SECOND: Ask questions based on the candidate's resume — probe their specific past experience
3. THIRD: Ask general questions for the role and focus areas
Always mix in follow-up questions between main questions to dig deeper.

INTERVIEW STRATEGY:
- Opening: greet warmly, introduce yourself as Alex, ask candidate to briefly introduce themselves
- After intro: start with question bank questions (if provided), weave in resume-based questions
- Follow-ups: if an answer is vague, dig deeper. Ask "Can you give me a specific example?" or "What was the outcome?"
- Pace: roughly ${minPerArea} min per focus area. Move on if candidate is clearly stuck after 2 attempts.
- Last 2-3 minutes: ask if candidate has questions, then thank them professionally
- React naturally before asking the next question ("That makes sense", "Interesting", "I see")

TIME MANAGEMENT:
- This is a ${interview.duration} minute interview. You have limited time — use it wisely.
- You have ${interview.focusAreas.length} focus areas with ~${minPerArea} min each. Don't spend too long on one area.
- Aim for 2-3 questions per focus area (including follow-ups). Move on when you have enough signal.
- If a candidate gives a strong, detailed answer, acknowledge it and move to the next topic — don't keep drilling the same point.
- If a candidate is struggling, give them 1-2 chances then move on. Don't waste time on dead ends.
- With 2-3 minutes left, wrap up: ask if they have questions, thank them, and close.`;
}

function buildResumeContext(interview: Interview): string {
  const resume = interview.resume?.substring(0, 5000) || "No resume provided.";
  return `Here is the candidate's resume. After asking question bank questions, use this resume to ask specific, targeted follow-ups about their past work:\n\n${resume}`;
}

async function callJuspayAI(
  messages: { role: string; content: string }[],
  maxTokens = 300,
  temperature = 0.7
): Promise<string> {
  const controller = new AbortController();
  const timeoutMs = maxTokens > 1000 ? 60000 : 12000; // 60s for scorecard, 12s for interview
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${process.env.AI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "kimi-latest",
      messages,
      max_tokens: maxTokens,
      temperature,
      thinking: { type: "disabled" },
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

export async function getAIResponse(
  interview: Interview,
  transcript: TranscriptEntry[]
): Promise<string> {
  const messages: { role: string; content: string }[] = [
    { role: "system", content: buildSystemPrompt(interview) },
    { role: "user", content: buildResumeContext(interview) },
    { role: "assistant", content: "Got it, I have the resume. Ready to begin the interview." },
  ];

  const trimmedTranscript = transcript.length > 80
    ? [...transcript.slice(0, 5), ...transcript.slice(-75)]
    : transcript;

  for (const entry of trimmedTranscript) {
    messages.push({
      role: entry.role === "ai" ? "assistant" : "user",
      content: entry.text,
    });
  }

  // If no transcript yet, this is the opening — tell AI to start
  if (transcript.length === 0) {
    messages.push({ role: "user", content: "Start the interview now." });
  }

  return callJuspayAI(messages, 500, 0.3);
}

export async function generateScorecard(interview: Interview): Promise<string> {
  const transcriptText = interview.transcript
    .map((e) => `${e.role === "ai" ? "Interviewer" : "Candidate"}: ${e.text}`)
    .join("\n\n");

  const proctoringText = interview.proctoring.length > 0
    ? interview.proctoring.map((e) => `[${e.severity.toUpperCase()}] ${e.type}: ${e.message} at ${e.timestamp}`).join("\n")
    : "No proctoring issues detected.";

  const levelBar = getLevelCalibration(interview.level);
  const candidateName = extractCandidateName(interview.resume || "") || "the candidate";

  const interviewDurationMin = interview.duration;
  const transcriptMessages = interview.transcript.length;
  const candidateMessages = interview.transcript.filter(e => e.role === "candidate").length;

  const scorecardPrompt = `You are a senior hiring evaluator for Indian companies. You are evaluating a candidate for a ${interview.level} ${interview.role} position. Candidate: ${candidateName}. Focus areas: ${interview.focusAreas.join(", ")}.

INTERVIEW CONTEXT:
- This was a ${interviewDurationMin}-minute AI voice interview conducted via speech-to-text (STT)
- Total exchanges: ${transcriptMessages} messages (${candidateMessages} from candidate)
- The candidate had limited time to cover ${interview.focusAreas.length} focus areas (~${Math.floor(interviewDurationMin / (interview.focusAreas.length || 1))} min each)
- Judge the candidate on what they COULD cover in the available time, not on topics that weren't reached
- This was likely the candidate's FIRST AI interview — factor in nervousness and unfamiliarity with the format

CRITICAL — SPEECH-TO-TEXT (STT) AWARENESS:
- The transcript was generated by speech-to-text, NOT typed by the candidate
- STT frequently mishears technical terms, Indian names, and similar-sounding words
- Examples: "trainer"="drainer", "ports"="pods", "ENB"="env", "MNCB"="KV", "ready stream"="Redis stream", "Namma Yatri"="Nam May Atri"
- NEVER penalize for word-level STT errors — interpret INTENT, not literal text
- Indian English patterns are NOT errors: "I am having experience", "I did my BTech from", "Actually...", "Basically...", "haan", "accha"
- Filler words ("so", "like", "I mean", "basically", "actually") are natural in spoken Indian English
- Mixing Hindi/regional words is normal — "matlab" means "meaning", "haan" means "yes"

IMPORTANT — INDIAN INTERVIEW CULTURE:
- Indian candidates often provide context before the answer (circular storytelling) — this is cultural, not poor communication
- Saying "sir/ma'am" to the interviewer is respectful, not weakness
- Starting answers with "Actually..." or "Basically..." is a cultural speech habit, not hedging
- Nervousness in first 5 minutes is expected — if the candidate improves over the interview, weight later answers higher
- Service company (TCS/Infosys/Wipro) experience is valid — don't dismiss it vs product company experience
- Tier-2/3 college candidates may have stronger practical skills despite less polished communication

IMPORTANT: Score relative to the ${interview.level} level bar.

${levelBar}

SCORING RUBRIC (score RELATIVE to ${interview.level} ${interview.role} bar):
- 5 = Exceptional. Deep expertise beyond level expectations. Specific production examples, tradeoffs discussed, shows real ownership.
- 4 = Strong. Solid depth, real experience (not textbook). Meets the bar comfortably. Clear understanding with examples.
- 3 = Adequate. Correct but surface-level. Lacks specifics or depth. Meets minimum expectations.
- 2 = Below bar. Significant gaps. Vague or generic answers. Would need substantial ramp-up.
- 1 = Far below bar. Cannot answer basic expected questions. Fundamental gaps.

EVALUATION CRITERIA (adapt to ${interview.role}):
- technicalDepth: For tech: system design, coding depth, architecture understanding. For HR: policy/law knowledge. For Ops: process optimization. For Sales: methodology depth. For PM: product thinking. Score how DEEP they go, not surface knowledge. If they describe a real system they built with specific numbers/tradeoffs, that's 4-5.
- communication: How well they convey concepts VERBALLY. IMPORTANT: Do NOT judge Indian English grammar — "I am having 3 years experience" is perfectly valid Indian English. Judge by: Can you understand their point? Do they use examples? Do they structure their thinking? Filler words and indirect speech are culturally normal.
- problemSolving: How they approach unfamiliar problems. Do they break it down? Consider edge cases? For ${interview.role}: evaluate domain-appropriate problem-solving. If they identified issues the interviewer didn't ask about, that's a strong signal.
- domainKnowledge: Understanding of ${interview.role} domain, tools, frameworks, industry context. ${interview.level === "Senior" || interview.level === "Staff" ? "Expect expert-level mastery with opinions on best practices." : "Expect working knowledge of common tools."}
- cultureFit: Ownership mindset, curiosity, collaboration, honesty about gaps. Proctoring flags go in proctoringNotes ONLY — do NOT reduce cultureFit for proctoring issues.

SCORING APPROACH:
1. SUBSTANCE over DELIVERY — a technically correct but poorly transcribed answer is still a good answer
2. Look for PROGRESSION — if the candidate started nervous but improved, weight later answers higher
3. Experience-backed answers with real numbers/tradeoffs = 4-5
4. Textbook answers without real examples = 2-3
5. Identifying edge cases or failure modes unprompted = strong positive signal
6. If the candidate clearly knows the concept but STT garbled their explanation, give benefit of doubt
7. Short answers are fine if they're correct and to the point — don't penalize brevity

RECOMMENDATION GUIDE:
- strong_hire: overall >= 4 AND no dimension below 3. Exceptional candidate for ${interview.level}.
- hire: overall >= 3. Meets the bar. One weak dimension is OK if others compensate (e.g., strong technical but average communication is still hire for an SDE).
- no_hire: overall < 2.5 OR critical role-specific dimension below 2 (e.g., technicalDepth < 2 for SDE, communication < 2 for Sales).
- strong_no_hire: overall < 2 OR fundamental inability to answer basic questions OR clear dishonesty.

EVIDENCE: For each dimension, cite a candidate quote and explain the score. Note STT errors and interpret intended meaning. Include at least 3-4 evidence items. If the candidate improved over time, note that.

PROCTORING: Summarize in proctoringNotes. Phone detection and window blur can be false positives (notifications, bright objects). Be factual, not accusatory. Do not let proctoring affect scores unless there's a clear pattern of sustained cheating.

## Interview Transcript
${transcriptText}

## Proctoring Events
${proctoringText}

Respond with ONLY valid JSON, no markdown, no code blocks, no explanation outside the JSON:
{
  "technicalDepth": <1-5>,
  "communication": <1-5>,
  "problemSolving": <1-5>,
  "domainKnowledge": <1-5>,
  "cultureFit": <1-5>,
  "overall": <1-5 weighted average>,
  "recommendation": "<strong_hire|hire|no_hire|strong_no_hire>",
  "summary": "<3-4 sentence assessment covering strengths, gaps, and hiring recommendation with reasoning>",
  "strengths": ["<specific strength with example>", "<another>"],
  "weaknesses": ["<specific weakness with example>", "<another>"],
  "evidence": [
    {"dimension": "<technicalDepth|communication|problemSolving|domainKnowledge|cultureFit>", "quote": "<exact candidate quote>", "assessment": "<why this quote supports the score>"}
  ],
  "proctoringNotes": "<summary of integrity concerns or 'No issues detected'>"
}`;

  return callJuspayAI([{ role: "system", content: scorecardPrompt }], 4000, 0.3);
}
