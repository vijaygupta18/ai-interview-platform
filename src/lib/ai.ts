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

  return `You are Alex, a senior interviewer conducting a ${interview.duration}-minute interview for a ${interview.level} ${interview.role} position. Focus areas: ${focusStr}.

${nameInstruction}

${domainGuidance}

${levelCalibration}

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
- React naturally before asking the next question ("That makes sense", "Interesting", "I see")`;
}

function buildResumeContext(interview: Interview): string {
  const resume = interview.resume?.substring(0, 3000) || "No resume provided.";
  return `Here is the candidate's resume. After asking question bank questions, use this resume to ask specific, targeted follow-ups about their past work:\n\n${resume}`;
}

async function callJuspayAI(
  messages: { role: string; content: string }[],
  maxTokens = 300,
  temperature = 0.7
): Promise<string> {
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
  });

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

  const trimmedTranscript = transcript.length > 40
    ? [...transcript.slice(0, 5), ...transcript.slice(-35)]
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

  return callJuspayAI(messages, 1200, 0.7);
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

  const scorecardPrompt = `You are a senior hiring manager evaluating an interview for a ${interview.level} ${interview.role} position. Candidate: ${candidateName}. Focus areas: ${interview.focusAreas.join(", ")}.

IMPORTANT: Score relative to the ${interview.level} level bar. A Senior engineer is judged differently than an Intern. An answer that's excellent for a Junior might be inadequate for a Staff engineer.

${levelBar}

SCORING RUBRIC:
- 5 = Exceptional. Exceeds bar significantly. Would be a top performer.
- 4 = Strong. Meets bar with room to grow. Solid hire.
- 3 = Adequate. Meets minimum bar. Borderline.
- 2 = Below bar. Significant gaps. Would struggle in the role.
- 1 = Far below bar. Fundamental gaps in required skills.

EVALUATION CRITERIA (adapt to the role — for non-tech roles, "technicalDepth" means role-specific expertise):
- technicalDepth: for tech roles = coding/system knowledge. For HR = employment law/policy knowledge. For Ops = process expertise. For Sales = methodology knowledge. For CX = customer handling skills. Rate depth of role-specific expertise.
- communication: clarity of explanation, structured thinking, ability to articulate complex ideas, listening skills
- problemSolving: approach to novel problems, handling ambiguity, creative thinking, analytical ability
- domainKnowledge: understanding of the specific domain (${interview.role}), industry best practices, tools of the trade
- cultureFit: collaboration mindset, ownership, curiosity, adaptability, how they handle being challenged

RECOMMENDATION GUIDE:
- strong_hire: overall >= 4 AND no dimension below 3
- hire: overall >= 3.5 AND no dimension below 2
- no_hire: overall < 3 OR any critical dimension below 2
- strong_no_hire: overall < 2 OR fundamental dishonesty/inability to answer basic questions

EVIDENCE: For each dimension, cite an EXACT quote from the candidate's responses and explain why it demonstrates that score level. Include at least 3-4 evidence items.

PROCTORING: Note any integrity concerns from proctoring events. If the candidate switched tabs, had face detection issues, or other flags, factor that into the assessment.

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

  return callJuspayAI([{ role: "system", content: scorecardPrompt }], 2000, 0.3);
}
