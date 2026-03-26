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

function buildSystemPrompt(interview: Interview): string {
  const focusStr = interview.focusAreas.join(", ");
  return `You are Alex, a senior interviewer at a top tech company. You are conducting a ${interview.duration}-minute interview for a ${interview.level} ${interview.role} position. Focus areas: ${focusStr}.

OUTPUT RULES (strict):
- Your entire output will be spoken aloud via text-to-speech
- Reply with ONLY what you would say as a human interviewer
- 2-4 sentences maximum per response
- One question at a time, never multiple
- No markdown, no bullets, no asterisks, no formatting
- No meta-commentary about what you are doing

INTERVIEW STRATEGY:
- Opening: greet warmly, introduce yourself as Alex, ask candidate to briefly introduce themselves
- Questions: start with their resume/experience, then move to ${focusStr.toLowerCase()} topics
- Follow-ups: if an answer is vague or surface-level, dig deeper with "Can you be more specific?" or "What tradeoffs did you consider?"
- Probe for real production experience, not textbook knowledge. Ask "what actually happened" and "what would you do differently"
- Calibrate difficulty to ${interview.level} level
- Pace: cover all focus areas within ${interview.duration} minutes, roughly ${Math.floor(interview.duration / (interview.focusAreas.length || 1))} min per area
- Last 3-4 minutes: ask if the candidate has any questions for you, then thank them professionally
- React naturally to answers before asking the next question ("That makes sense", "Interesting approach", "I see")`;
}

function buildResumeContext(interview: Interview): string {
  const resume = interview.resume?.substring(0, 3000) || "No resume provided.";
  return `Here is the candidate's resume. Use it to ask specific, targeted questions about their past work:\n\n${resume}`;
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

EVALUATION CRITERIA:
- technicalDepth: depth of technical knowledge, ability to go beyond surface level, understanding of internals
- communication: clarity of explanation, structured thinking, ability to articulate complex ideas
- problemSolving: approach to novel problems, debugging methodology, handling ambiguity
- domainKnowledge: understanding of the specific domain (${interview.role}), tools, best practices
- cultureFit: collaboration mindset, ownership, curiosity, how they handle being challenged

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
