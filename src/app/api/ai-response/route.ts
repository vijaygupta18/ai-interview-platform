import { NextResponse } from "next/server";
import { getInterview, addTranscriptEntry } from "@/lib/store";
import { getAIResponse } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { validateInterviewExists } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { interviewId, transcript } = await req.json();

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    if (!(await validateInterviewExists(interviewId))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    const interview = await getInterview(interviewId);
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Save the latest candidate message if present in transcript
    if (transcript?.length > 0) {
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry.role === "candidate" && lastEntry.text) {
        await addTranscriptEntry(interviewId, {
          role: "candidate",
          text: lastEntry.text,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const aiResponse = await getAIResponse(interview, transcript ?? interview.transcript);

    await addTranscriptEntry(interviewId, {
      role: "ai",
      text: aiResponse,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ text: aiResponse });
  } catch (error) {
    console.error("AI response error:", error);
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}
