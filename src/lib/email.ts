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

const fromAddress = process.env.SMTP_FROM || "AI Interview Platform <noreply@interview.ai>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="background:#1e1e2e;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:40px;color:#e4e4e7">
      ${body}
    </div>
    <p style="text-align:center;color:#52525b;font-size:12px;margin-top:24px">
      AI Interview Platform
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
}

export async function sendInterviewInvite(
  to: string,
  candidateName: string,
  interviewUrl: string,
  role: string,
  duration: number
) {
  const subject = `Your AI Interview for ${role}`;
  const html = wrapHtml(`
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:rgba(59,130,246,0.15);line-height:48px;font-size:24px">
        &#127909;
      </div>
    </div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;text-align:center">
      Interview Invitation
    </h1>
    <p style="color:#a1a1aa;font-size:14px;text-align:center;margin:0 0 28px">
      Hi ${escapeHtml(candidateName || "there")}, you've been invited to an AI-powered interview.
    </p>
    <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:20px;margin-bottom:28px">
      <table style="width:100%;color:#a1a1aa;font-size:14px" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#71717a">Role</td>
          <td style="padding:4px 0;text-align:right;color:#e4e4e7;font-weight:500">${escapeHtml(role)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#71717a">Duration</td>
          <td style="padding:4px 0;text-align:right;color:#e4e4e7;font-weight:500">${duration} minutes</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center">
      <a href="${escapeHtml(interviewUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:600;font-size:14px;padding:12px 32px;border-radius:10px;text-decoration:none">
        Start Interview
      </a>
    </div>
    <p style="color:#52525b;font-size:12px;text-align:center;margin-top:24px">
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
    <div style="text-align:center;margin-bottom:24px">
      <div style="display:inline-block;width:48px;height:48px;border-radius:12px;background:rgba(34,197,94,0.15);line-height:48px;font-size:24px">
        &#9989;
      </div>
    </div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;text-align:center">
      Interview Completed
    </h1>
    <p style="color:#a1a1aa;font-size:14px;text-align:center;margin:0 0 28px">
      Hi ${escapeHtml(interviewerName || "there")}, the interview with <strong style="color:#e4e4e7">${escapeHtml(candidateEmail)}</strong> has been completed.
    </p>
    <div style="text-align:center">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:600;font-size:14px;padding:12px 32px;border-radius:10px;text-decoration:none">
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
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br>");
  const html = wrapHtml(`
    <div style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px">
      ${bodyHtml}
    </div>
    <div style="text-align:center;margin:0 0 24px">
      <a href="${escapeHtml(interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
        Start Interview
      </a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">
      This link is unique to you. Do not share it.
    </p>
  `);

  await sendMail(to, subject, html);
}
