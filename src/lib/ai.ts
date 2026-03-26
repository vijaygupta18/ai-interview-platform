import type { Interview, TranscriptEntry } from "./store";

function stripThinking(text: string): string {
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

  // Split into paragraphs
  const paragraphs = cleaned.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Filter out paragraphs that are clearly thinking/planning
  const isThinking = (p: string): boolean => {
    // Numbered lists (1. Do X, 2. Do Y)
    if (/^\d+\.\s/.test(p) && /\d+\.\s/.test(p)) return true;
    // Starts with thinking keywords
    if (/^(?:The user|I need|I should|Let me|Since |Wait|Actually|Looking|Given|My |Key |Current|Constraint|Remember|Note|This is the|I'm going|I'll |The candidate|Plan|Step)/i.test(p)) return true;
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

function buildSystemPrompt(interview: Interview): string {
  const focusStr = interview.focusAreas.join(", ");
  const domainGuidance = getDomainGuidance(interview.role);
  const minPerArea = Math.floor(interview.duration / (interview.focusAreas.length || 1));

  return `You are Alex, a senior interviewer conducting a ${interview.duration}-minute interview for a ${interview.level} ${interview.role} position. Focus areas: ${focusStr}.

${domainGuidance}

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
- Calibrate difficulty to ${interview.level} level
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
  const res = await fetch(`${process.env.JUSPAY_AI_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.JUSPAY_AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.JUSPAY_AI_MODEL || "kimi-latest",
      messages,
      max_tokens: maxTokens,
      temperature,
      thinking: { type: "disabled" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Juspay AI error: ${res.status} ${err}`);
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

  for (const entry of transcript) {
    messages.push({
      role: entry.role === "ai" ? "assistant" : "user",
      content: entry.text,
    });
  }

  // If no transcript yet, this is the opening — tell AI to start
  if (transcript.length === 0) {
    messages.push({ role: "user", content: "Start the interview now." });
  }

  return callJuspayAI(messages, 600, 0.7);
}

export async function generateScorecard(interview: Interview): Promise<string> {
  const transcriptText = interview.transcript
    .map((e) => `${e.role === "ai" ? "Interviewer" : "Candidate"}: ${e.text}`)
    .join("\n\n");

  const proctoringText = interview.proctoring.length > 0
    ? interview.proctoring.map((e) => `[${e.severity.toUpperCase()}] ${e.type}: ${e.message} at ${e.timestamp}`).join("\n")
    : "No proctoring issues detected.";

  const scorecardPrompt = `You are a senior hiring manager evaluating an interview for a ${interview.level} ${interview.role} position. Focus areas were: ${interview.focusAreas.join(", ")}.

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
