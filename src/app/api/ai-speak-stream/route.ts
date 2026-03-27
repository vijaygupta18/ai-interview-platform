import { getInterview, addTranscriptEntry, getProctoringViolationCount, addProctoringEvent } from "@/lib/store";
import { stripThinking } from "@/lib/ai";
import { validateAccessPost } from "@/lib/auth-check";
import { rateLimit } from "@/lib/rate-limit";
import { pool } from "@/lib/db";
import { getTTSProvider } from "@/lib/providers";

// Clean text for TTS — remove special characters that cause TTS to speak them literally
function cleanForTTS(text: string): string {
  return text
    .replace(/[*#_~`|<>{}[\]\\]/g, "") // markdown/code chars
    .replace(/\bhttps?:\/\/\S+/g, "")  // URLs
    .replace(/\b[\w.-]+@[\w.-]+\.\w+/g, "") // emails
    .replace(/\n+/g, " ")              // newlines to space
    .replace(/\s{2,}/g, " ")           // collapse multiple spaces
    .trim();
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 30, 60000)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const { interviewId, transcript, token, skipSave } = await req.json();
    if (!interviewId) {
      return new Response(JSON.stringify({ error: "Missing interviewId" }), { status: 400 });
    }

    if (!(await validateAccessPost(interviewId, token))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    // Parallel: interview + violations + heartbeat
    const [interview, violations, hbResult] = await Promise.all([
      getInterview(interviewId),
      getProctoringViolationCount(interviewId),
      pool.query("SELECT last_heartbeat_at FROM interviews WHERE id = $1", [interviewId]),
    ]);

    if (!interview) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    const MAX_STRIKES = parseInt(process.env.NEXT_PUBLIC_MAX_PROCTORING_STRIKES || "10");
    if (violations >= MAX_STRIKES) {
      return new Response(JSON.stringify({ error: "Interview terminated" }), { status: 403 });
    }

    // Heartbeat check (fire-and-forget)
    const hbRows = hbResult.rows;
    if (hbRows.length > 0 && hbRows[0].last_heartbeat_at) {
      const elapsed = Date.now() - new Date(hbRows[0].last_heartbeat_at).getTime();
      if (elapsed > 45000) {
        addProctoringEvent(interviewId, {
          type: "heartbeat_missing", severity: "flag",
          message: `No heartbeat for ${Math.round(elapsed / 1000)}s`,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Save candidate message (fire-and-forget)
    if (!skipSave && transcript?.length > 0) {
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry.role === "candidate" && lastEntry.text) {
        addTranscriptEntry(interviewId, {
          role: "candidate", text: lastEntry.text, timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Build AI messages
    // Build messages for streaming AI call
    const sysPrompt = interview.role ? `You are Alex, a senior interviewer conducting a ${interview.duration} minute interview for a ${interview.level} ${interview.role} position. Reply with ONLY what you would say. 2-3 sentences max. No markdown.` : "";

    // Use the existing non-streaming path but with stream=true
    const aiMessages: { role: string; content: string }[] = [
      { role: "system", content: sysPrompt || "You are Alex, a senior interviewer. Reply with ONLY what you would say. 2-3 sentences max." },
    ];

    if (interview.resume) {
      aiMessages.push({ role: "user", content: `Resume: ${interview.resume.substring(0, 5000)}` });
      aiMessages.push({ role: "assistant", content: "Got it." });
    }

    const trimmedTranscript = (transcript || interview.transcript).length > 80
      ? [...(transcript || interview.transcript).slice(0, 5), ...(transcript || interview.transcript).slice(-75)]
      : (transcript || interview.transcript);

    for (const entry of trimmedTranscript) {
      aiMessages.push({
        role: entry.role === "ai" ? "assistant" : "user",
        content: entry.text,
      });
    }

    if (trimmedTranscript.length === 0) {
      aiMessages.push({ role: "user", content: "Start the interview now." });
    }

    // Stream AI response + TTS pipeline
    const encoder = new TextEncoder();
    const ttsProvider = getTTSProvider();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiRes = await fetch(`${process.env.AI_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.AI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.AI_MODEL || "minimaxai/minimax-m2",
              messages: aiMessages,
              max_tokens: 500,
              temperature: 0.3,
              thinking: { type: "disabled" },
              stream: true,
            }),
          });

          if (!aiRes.ok || !aiRes.body) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI failed" })}\n\n`));
            controller.close();
            return;
          }

          const reader = aiRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";
          let sentenceIdx = 0;
          const ttsPromises: Promise<void>[] = [];

          const processSentence = (sentence: string) => {
            const idx = sentenceIdx++;
            const cleaned = stripThinking(sentence).trim();
            if (!cleaned) return;

            // Send original text for transcript
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: cleaned, idx })}\n\n`));

            // Clean for TTS — remove special chars that TTS speaks literally
            const ttsText = cleanForTTS(cleaned);
            if (!ttsText) return;

            // Generate TTS in parallel (client plays in order using idx)
            const p = ttsProvider.synthesize(ttsText).then((audioBuffer) => {
              const audioBase64 = audioBuffer.toString("base64");
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "audio",
                audio: audioBase64,
                contentType: ttsProvider.contentType,
                idx,
              })}\n\n`));
            }).catch((err: any) => {
              console.warn(`[Stream] TTS failed for sentence ${idx}:`, err.message);
            });
            ttsPromises.push(p);
          };

          // Read AI stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              try {
                const json = JSON.parse(line.slice(6));
                const token = json.choices?.[0]?.delta?.content || "";
                if (!token) continue;
                buffer += token;
                fullText += token;

                // Check for sentence boundary
                const sentenceMatch = buffer.match(/[.!?]\s/);
                if (sentenceMatch) {
                  const idx = sentenceMatch.index! + 1;
                  const sentence = buffer.slice(0, idx).trim();
                  buffer = buffer.slice(idx);
                  if (sentence) processSentence(sentence);
                }
              } catch {}
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) processSentence(buffer.trim());

          // Wait for all parallel TTS to complete
          await Promise.all(ttsPromises);

          // Save AI response to transcript
          const cleanedFull = stripThinking(fullText).trim();
          if (cleanedFull) {
            await addTranscriptEntry(interviewId, {
              role: "ai", text: cleanedFull, timestamp: new Date().toISOString(),
            });
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", fullText: cleanedFull })}\n\n`));
          controller.close();
        } catch (err) {
          console.error("[Stream] Error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 });
  }
}
