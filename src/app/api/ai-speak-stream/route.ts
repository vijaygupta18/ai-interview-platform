import { getInterview, addTranscriptEntry, getProctoringViolationCount, addProctoringEvent } from "@/lib/store";
import { stripThinking, buildInterviewPrompt } from "@/lib/ai";
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
    .replace(/(\d+)-(\w+)/g, "$1 $2")  // "30-minute" → "30 minute"
    .replace(/(\w+)-(\w+)/g, "$1 $2")  // "real-time" → "real time"
    .replace(/[()]/g, "")              // parentheses
    .replace(/[/:;]/g, " ")            // slashes colons semicolons
    .replace(/\.\.\./g, ".")           // ellipsis
    .replace(/—|–/g, ", ")             // em/en dash → comma pause
    .replace(/\n+/g, " ")              // newlines to space
    .replace(/\s{2,}/g, " ")           // collapse spaces
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

    const MAX_STRIKES = parseInt(process.env.MAX_PROCTORING_STRIKES || process.env.NEXT_PUBLIC_MAX_PROCTORING_STRIKES || "25");
    console.log(`[Proctoring] Interview ${interviewId}: violations=${violations}/${MAX_STRIKES}`);
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

    // Build AI messages using full interview prompt
    const aiMessages = buildInterviewPrompt(interview, transcript || interview.transcript);

    // Stream AI response + TTS pipeline
    const encoder = new TextEncoder();
    const ttsProvider = getTTSProvider();

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return;
          try { controller.enqueue(data); } catch { closed = true; }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch {}
        };
        // AI fetch with retry — try twice with 35s timeout each
        const startTime = Date.now();
        const makeAICall = async (attempt: number) => {
          const abort = new AbortController();
          const timeout = setTimeout(() => abort.abort(), 35000);
          console.log(`[Stream] AI call attempt ${attempt} for ${interviewId} (model=${process.env.AI_MODEL}, messages=${aiMessages.length})`);
          try {
            const res = await fetch(`${process.env.AI_BASE_URL}/v1/chat/completions`, {
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
              signal: abort.signal,
            });
            clearTimeout(timeout);
            console.log(`[Stream] AI call attempt ${attempt} responded in ${Date.now() - startTime}ms (status=${res.status})`);
            return res;
          } catch (err) {
            clearTimeout(timeout);
            console.error(`[Stream] AI call attempt ${attempt} failed in ${Date.now() - startTime}ms:`, (err as Error).message);
            throw err;
          }
        };

        try {
          let aiRes;
          try {
            aiRes = await makeAICall(1);
          } catch (firstErr) {
            console.warn(`[Stream] Retrying AI call for ${interviewId}...`);
            aiRes = await makeAICall(2);
          }

          if (!aiRes.ok || !aiRes.body) {
            console.error(`[Stream] AI returned ${aiRes.status} for ${interviewId}`);
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI failed" })}\n\n`));
            safeClose();
            return;
          }

          const reader = aiRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullText = "";
          let sentenceIdx = 0;
          const ttsPromises: Promise<void>[] = [];

          const processSentence = (sentence: string) => {
            const cleaned = stripThinking(sentence).replace(/\[END_INTERVIEW\]/g, "").trim();
            if (!cleaned) return;
            const idx = sentenceIdx++;

            // Send original text for transcript
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: cleaned, idx })}\n\n`));

            // Clean for TTS — remove special chars and end signal
            const ttsText = cleanForTTS(cleaned);
            if (!ttsText) return;

            // Generate TTS in parallel (client plays in order using idx)
            const p = ttsProvider.synthesize(ttsText).then((audioBuffer) => {
              const audioBase64 = audioBuffer.toString("base64");
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                type: "audio",
                audio: audioBase64,
                contentType: ttsProvider.contentType,
                idx,
              })}\n\n`));
            }).catch((err: any) => {
              console.warn(`[Stream] TTS failed for sentence ${idx}:`, err.message);
              safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "audio_skip", idx })}\n\n`));
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
                // IMPORTANT: only read `content`, NOT `reasoning_content`.
                // Some models (e.g. MiniMax-M2.5) stream reasoning_content first
                // (the model's internal thinking) followed by the actual content.
                // We must not speak the model's reasoning out loud — skip it.
                const delta = json.choices?.[0]?.delta || {};
                const token = delta.content || "";
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
          console.log(`[Stream] AI done for ${interviewId} in ${Date.now() - startTime}ms (${sentenceIdx} sentences, waiting for TTS...)`);
          await Promise.all(ttsPromises);
          console.log(`[Stream] TTS done for ${interviewId} in ${Date.now() - startTime}ms total`);

          // Check for [END_INTERVIEW] signal — AI decided to close
          const hasEndSignal = fullText.includes("[END_INTERVIEW]");
          const cleanedFull = stripThinking(fullText).replace(/\[END_INTERVIEW\]/g, "").trim();

          if (cleanedFull) {
            await addTranscriptEntry(interviewId, {
              role: "ai", text: cleanedFull, timestamp: new Date().toISOString(),
            });
          }

          // If AI signaled end, mark interview as completed + trigger scorecard
          if (hasEndSignal) {
            console.log(`[Stream] AI ended interview ${interviewId}`);
            // Mark completed + auto-score in background
            import("@/lib/store").then(async ({ updateInterview, getInterview }) => {
              await updateInterview(interviewId, { status: "completed", endedAt: new Date().toISOString() });
              // Generate scorecard after 3s delay (let transcript save finish)
              setTimeout(async () => {
                try {
                  const { startScoring, completeScoring, failScoring } = await import("@/lib/scoring-tracker");
                  const { generateScorecard } = await import("@/lib/ai");
                  const { normalizeScorecard } = await import("@/lib/normalize-scorecard");
                  const freshInterview = await getInterview(interviewId);
                  if (freshInterview && freshInterview.transcript.length > 0 && !freshInterview.scorecard) {
                    if (await startScoring(interviewId)) {
                      const raw = await generateScorecard(freshInterview);
                      const { parseScorecardJSON } = await import("@/lib/parse-scorecard");
                      let parsed;
                      try { parsed = parseScorecardJSON(raw); } catch (parseErr) {
                        console.error(`[Stream] Scorecard parse failed for ${interviewId}:`, parseErr);
                      }
                      if (parsed) {
                        const scorecard = normalizeScorecard(parsed);
                        await updateInterview(interviewId, { scorecard });
                        completeScoring(interviewId);
                        console.log(`[Stream] Scorecard generated for ${interviewId}`);
                      }
                    }
                  }
                } catch (err) {
                  console.error(`[Stream] Scorecard failed for ${interviewId}:`, err);
                }
              }, 3000);
            }).catch(() => {});
          }

          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", fullText: cleanedFull, endInterview: hasEndSignal })}\n\n`));
          safeClose();
        } catch (err) {
          console.error("[Stream] Error:", err);
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
          safeClose();
        } finally {
          // timeouts are cleared inside makeAICall
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
