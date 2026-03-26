import nodemailer from "nodemailer";

const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "InterviewAI <noreply@interview.ai>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapHtml(body: string, orgName?: string): string {
  const org = orgName || "InterviewAI";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:18px;font-weight:700;color:#111827">${escapeHtml(org)}</span>
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      ${body}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px">
      Sent via ${escapeHtml(org)} &middot; Powered by InterviewAI
    </p>
  </div>
</body>
</html>`;
}

async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    console.log(`[Email Dev] To: ${to}`);
    console.log(`[Email Dev] Subject: ${subject}`);
    console.log(`[Email Dev] (SMTP not configured — email logged to console)`);
    return;
  }
  await transporter.sendMail({ from: fromAddress, to, subject, html });
  console.log(`[Email] Sent to ${to}: ${subject}`);
}

export async function sendInterviewInvite(
  to: string,
  candidateName: string,
  interviewUrl: string,
  role: string,
  duration: number
) {
  const subject = `Interview Invitation — ${role}`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827">Interview Invitation</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
      Hi ${escapeHtml(candidateName || "there")}, you've been invited to an AI-powered interview.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 24px">
      <table style="width:100%;color:#374151;font-size:14px" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280">Role</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">${escapeHtml(role)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280">Duration</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">${duration} minutes</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280">Format</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">AI Voice Interview</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px">
      <a href="${escapeHtml(interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
        Start Your Interview
      </a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
      This link is unique to you. Do not share it with others.
    </p>
  `);

  await sendMail(to, subject, html);
}

export async function sendInterviewComplete(
  to: string,
  interviewerName: string,
  candidateEmail: string,
  reviewUrl: string
) {
  const subject = `Interview Complete — ${candidateEmail}`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827">Interview Completed</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
      Hi ${escapeHtml(interviewerName || "there")}, the interview with <strong style="color:#111827">${escapeHtml(candidateEmail)}</strong> has been completed. The scorecard is ready for review.
    </p>
    <div style="text-align:center">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
        Review Scorecard
      </a>
    </div>
  `);

  await sendMail(to, subject, html);
}

export async function sendCustomEmail(
  to: string,
  subject: string,
  bodyText: string,
  interviewUrl: string,
  orgName: string
) {
  // Handle both real newlines and literal \n from DB
  const normalizedText = bodyText.replace(/\\n/g, "\n");
  const bodyHtml = escapeHtml(normalizedText).replace(/\n/g, "<br>");

  const html = wrapHtml(`
    <div style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px">
      ${bodyHtml}
    </div>
    <div style="text-align:center;margin:0 0 24px">
      <a href="${escapeHtml(interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
        Start Your Interview
      </a>
    </div>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 16px">
      <p style="color:#92400e;font-size:13px;margin:0;line-height:1.5">
        <strong>Before you start:</strong> Ensure you have a quiet environment, working camera, microphone, and stable internet. The interview will be recorded.
      </p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
      This link is unique to you. Do not share it with anyone.
    </p>
  `, orgName);

  await sendMail(to, subject, html);
}
