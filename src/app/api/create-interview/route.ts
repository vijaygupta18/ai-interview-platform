import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveInterview, Interview } from "@/lib/store";
import { sendInterviewInvite } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import mammoth from "mammoth";

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Write to temp file, parse via child process to avoid Next.js webpack issues
    const fs = await import("fs");
    const path = await import("path");
    const { execSync } = await import("child_process");

    const tmpPath = path.join(process.cwd(), `_tmp_resume_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buffer);

    try {
      const result = execSync(
        `node -e "const p=require('pdf-parse');const fs=require('fs');p(fs.readFileSync('${tmpPath}')).then(d=>{process.stdout.write(d.text)}).catch(e=>{process.stderr.write(e.message);process.exit(1)})"`,
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
      );
      fs.unlinkSync(tmpPath);
      const text = result.toString().trim();
      console.log(`PDF parsed successfully: ${text.length} chars`);
      return text;
    } catch (parseErr: any) {
      fs.unlinkSync(tmpPath);
      console.error("PDF child process failed:", parseErr.stderr?.toString());
      throw parseErr;
    }
  } catch (err) {
    console.error("PDF extraction failed completely:", err);
    return "Resume provided but could not be parsed. Proceed with general interview questions.";
  }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 10, 60000)) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const formData = await req.formData();
    const resumeFile = formData.get("resume") as File | null;
    const role = formData.get("role") as string;
    const level = formData.get("level") as string;
    const candidateEmail = formData.get("candidateEmail") as string;
    const focusAreas = (formData.get("focusAreas") as string)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const duration = parseInt(formData.get("duration") as string) || 30;
    const roundType = (formData.get("roundType") as string) || "General";
    const language = (formData.get("language") as string) || "";
    const questionBankId = formData.get("questionBankId") as string;

    if (!role || !level) {
      return NextResponse.json({ error: "Missing required fields: role, level" }, { status: 400 });
    }

    let resumeText = "";
    let resumeFileName = "";

    if (resumeFile && resumeFile.size > 0) {
      const arrayBuffer = await resumeFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      resumeFileName = resumeFile.name;

      if (resumeFile.name.toLowerCase().endsWith(".pdf")) {
        resumeText = await extractTextFromPDF(buffer);
      } else if (resumeFile.name.toLowerCase().endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        resumeText = result.value;
      } else {
        resumeText = buffer.toString("utf-8");
      }

      console.log(`Resume parsed: ${resumeFileName}, text length: ${resumeText.length}, first 200 chars: ${resumeText.substring(0, 200)}`);
    }

    if (!resumeText) {
      resumeText = "No resume content available. Proceed with general interview questions for the role.";
    }

    // Load question bank if selected
    let questionBankQuestions: string[] = [];
    if (questionBankId) {
      try {
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform" });
        const { rows } = await pool.query("SELECT questions FROM question_banks WHERE id = $1", [questionBankId]);
        if (rows.length > 0 && rows[0].questions) {
          questionBankQuestions = Array.isArray(rows[0].questions) ? rows[0].questions : JSON.parse(rows[0].questions);
        }
        await pool.end();
      } catch (err) {
        console.error("Failed to load question bank:", err);
      }
    }

    // Append question bank questions to resume context
    if (questionBankQuestions.length > 0) {
      resumeText += `\n\n--- QUESTION BANK ---\nUse these questions during the interview:\n${questionBankQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    }

    const session = await getServerSession(authOptions);
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");

    const interview: Interview = {
      id,
      resume: resumeText,
      resumeFileName,
      candidateEmail: candidateEmail || "",
      token,
      browserFingerprint: null,
      role,
      level,
      focusAreas,
      duration,
      roundType,
      language,
      status: "waiting",
      transcript: [],
      proctoring: [],
      scorecard: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      orgId: (session?.user as any)?.orgId || undefined,
      createdBy: (session?.user as any)?.id || undefined,
    };

    await saveInterview(interview);

    const interviewUrl = `/interview/${id}?token=${token}`;

    if (candidateEmail) {
      const fullUrl = `${req.headers.get("origin") || ""}${interviewUrl}`;
      sendInterviewInvite(candidateEmail, candidateEmail, fullUrl, role, duration).catch(console.error);
    }

    return NextResponse.json({ id, token, url: interviewUrl, candidateEmail });
  } catch (error) {
    console.error("Failed to create interview:", error);
    return NextResponse.json({ error: "Failed to create interview" }, { status: 500 });
  }
}
