export function validateEnv() {
  const required = ["DATABASE_URL", "NEXTAUTH_SECRET"];
  const recommended = ["DEEPGRAM_API_KEY", "AI_BASE_URL", "AI_API_KEY"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
  }
  recommended.filter(k => !process.env[k]).forEach(k => {
    console.warn(`Recommended env var not set: ${k}`);
  });
}
