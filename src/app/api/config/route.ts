import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Runtime config served to the client — avoids NEXT_PUBLIC_* build-time baking.
// Change these env vars at runtime (configmap/secret) without rebuilding.
export async function GET() {
  return NextResponse.json({
    // Proctoring
    maxProctoringStrikes: parseInt(process.env.MAX_PROCTORING_STRIKES || process.env.NEXT_PUBLIC_MAX_PROCTORING_STRIKES || "25"),

    // STT
    sttProviders: (process.env.STT_CLIENT_PROVIDERS || "deepgram,browser").split(",").map(s => s.trim()),
    sttBackend: process.env.STT_PROVIDER || "deepgram",
    silenceDelayMs: parseInt(process.env.SILENCE_DELAY_MS || "3000"),

    // App
    appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "",
    environment: process.env.NODE_ENV || "development",
  });
}
