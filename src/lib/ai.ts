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
  return `You are Alex, a senior interviewer conducting a technical interview. Role: ${interview.role}, Level: ${interview.level}, Focus: ${interview.focusAreas.join(", ")}. Duration: ${interview.duration} min.

Your output goes to TTS so reply ONLY with spoken words. Two to four sentences max. One question at a time. Be professional, warm but sharp. Probe deep on system design and scalability. If they give a textbook answer, push for real production experience. Ask follow-ups if answers are vague.`;
}

function buildResumeContext(interview: Interview): string {
  const resume = interview.resume?.substring(0, 3000) || "No resume provided.";
  return `Candidate resume:\n${resume}`;
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

  return callJuspayAI(messages, 1000, 0.7);
}

export async function generateScorecard(interview: Interview): Promise<string> {
  const transcriptText = interview.transcript
    .map((e) => `${e.role === "ai" ? "Interviewer" : "Candidate"}: ${e.text}`)
    .join("\n\n");

  const proctoringText = interview.proctoring.length > 0
    ? interview.proctoring.map((e) => `[${e.severity.toUpperCase()}] ${e.type}: ${e.message} at ${e.timestamp}`).join("\n")
    : "No proctoring issues detected.";

  const scorecardPrompt = `You are an expert interview evaluator. Analyze the following interview transcript and produce a detailed scorecard.

Role: ${interview.role}
Level: ${interview.level}
Focus Areas: ${interview.focusAreas.join(", ")}

## Transcript
${transcriptText}

## Proctoring Events
${proctoringText}

## Output Format (respond in valid JSON only, no markdown, no code blocks)
{
  "technicalDepth": <1-5>,
  "communication": <1-5>,
  "problemSolving": <1-5>,
  "domainKnowledge": <1-5>,
  "cultureFit": <1-5>,
  "overall": <1-5>,
  "recommendation": "<strong_hire|hire|no_hire|strong_no_hire>",
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength1>", "<strength2>"],
  "weaknesses": ["<weakness1>", "<weakness2>"],
  "evidence": [
    {"dimension": "<category>", "quote": "<exact candidate quote>", "assessment": "<your analysis>"}
  ],
  "proctoringNotes": "<summary of any proctoring concerns or 'No issues detected'>"
}`;

  return callJuspayAI([{ role: "system", content: scorecardPrompt }], 2000, 0.3);
}
