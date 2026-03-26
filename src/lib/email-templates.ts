function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface TemplateVars {
  candidateName: string;
  candidateEmail: string;
  role: string;
  level: string;
  duration: number;
  interviewUrl: string;
  orgName: string;
  senderName: string;
}

function wrapHtml(body: string, orgName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;background:#4f46e5;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">
          <span style="color:white;font-size:16px;font-weight:bold">&#9654;</span>
        </div>
        <span style="font-size:18px;font-weight:700;color:#111827">${escapeHtml(orgName)}</span>
      </div>
    </div>
    <!-- Body -->
    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      ${body}
    </div>
    <!-- Footer -->
    <div style="text-align:center;margin-top:24px">
      <p style="color:#9ca3af;font-size:12px;margin:0">Sent via ${escapeHtml(orgName)} Interview Platform</p>
      <p style="color:#d1d5db;font-size:11px;margin:4px 0 0">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>`;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  description: string;
  generate: (vars: TemplateVars) => { subject: string; html: string };
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "professional",
    name: "Professional",
    subject: "Interview Invitation — {role}",
    description: "Clean, professional tone. Best for senior roles.",
    generate: (v) => ({
      subject: `Interview Invitation — ${v.role} at ${v.orgName}`,
      html: wrapHtml(`
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827">Interview Invitation</h1>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
          Dear ${escapeHtml(v.candidateName || "Candidate")},
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
          Thank you for your interest in the <strong style="color:#111827">${escapeHtml(v.role)}</strong> position at <strong style="color:#111827">${escapeHtml(v.orgName)}</strong>. We would like to invite you to participate in an AI-powered interview as the next step in our evaluation process.
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 24px">
          <table style="width:100%;color:#374151;font-size:14px" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;color:#6b7280">Position</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">${escapeHtml(v.role)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280">Level</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">${escapeHtml(v.level)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280">Duration</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">${v.duration} minutes</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6b7280">Format</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827">AI Voice Interview</td>
            </tr>
          </table>
        </div>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${escapeHtml(v.interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
            Start Your Interview
          </a>
        </div>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 16px">
          <p style="color:#92400e;font-size:13px;margin:0;line-height:1.5">
            <strong>Please note:</strong> Ensure you have a quiet environment, working camera, microphone, and a stable internet connection. The interview will be recorded and monitored.
          </p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">
          This link is unique to you. Do not share it with anyone.
        </p>
      `, v.orgName),
    }),
  },
  {
    id: "friendly",
    name: "Friendly & Warm",
    subject: "You're invited to interview! — {role}",
    description: "Casual, welcoming tone. Great for startups and junior roles.",
    generate: (v) => ({
      subject: `Hey ${v.candidateName?.split(" ")[0] || "there"}! You're invited to interview for ${v.role} at ${v.orgName}`,
      html: wrapHtml(`
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827">Hey ${escapeHtml(v.candidateName?.split(" ")[0] || "there")}! 👋</h1>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 16px">
          Great news — we'd love to chat with you about the <strong style="color:#111827">${escapeHtml(v.role)}</strong> role at <strong style="color:#111827">${escapeHtml(v.orgName)}</strong>!
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
          We use an AI interviewer to make the process convenient — you can take the interview anytime, from anywhere. It's a ${v.duration}-minute voice conversation, so just be yourself!
        </p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${escapeHtml(v.interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
            Let's Go! Start Interview →
          </a>
        </div>
        <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 8px">
          <strong>Quick tips:</strong>
        </p>
        <ul style="color:#6b7280;font-size:14px;line-height:1.8;margin:0 0 16px;padding-left:20px">
          <li>Find a quiet spot with good lighting</li>
          <li>Use Chrome for the best experience</li>
          <li>Have your resume handy for reference</li>
          <li>Relax and be yourself — there are no trick questions!</li>
        </ul>
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">
          This link is just for you — please don't share it.
        </p>
      `, v.orgName),
    }),
  },
  {
    id: "minimal",
    name: "Short & Direct",
    subject: "Interview link — {role}",
    description: "Brief, no-frills. Gets straight to the point.",
    generate: (v) => ({
      subject: `${v.orgName}: Interview for ${v.role} (${v.duration} min)`,
      html: wrapHtml(`
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
          Hi ${escapeHtml(v.candidateName?.split(" ")[0] || "there")},
        </p>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">
          Click below to start your ${v.duration}-minute AI interview for <strong>${escapeHtml(v.role)}</strong> (${escapeHtml(v.level)}).
        </p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${escapeHtml(v.interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
            Start Interview
          </a>
        </div>
        <p style="color:#9ca3af;font-size:13px;margin:0">
          Ensure you have a camera, mic, and quiet environment ready.
        </p>
      `, v.orgName),
    }),
  },
  {
    id: "followup",
    name: "Reminder / Follow-up",
    subject: "Reminder: Your interview is waiting",
    description: "For candidates who haven't started yet.",
    generate: (v) => ({
      subject: `Reminder: Complete your ${v.role} interview at ${v.orgName}`,
      html: wrapHtml(`
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827">Just a gentle reminder</h1>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 16px">
          Hi ${escapeHtml(v.candidateName?.split(" ")[0] || "there")},
        </p>
        <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
          We noticed you haven't started your interview for <strong style="color:#111827">${escapeHtml(v.role)}</strong> yet. The link is still active — you can start anytime that works for you.
        </p>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${escapeHtml(v.interviewUrl)}" style="display:inline-block;background:#4f46e5;color:white;font-weight:600;font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
            Start Interview Now
          </a>
        </div>
        <p style="color:#6b7280;font-size:13px;margin:0;text-align:center">
          If you have any questions, please reach out to us.
        </p>
      `, v.orgName),
    }),
  },
];

export function getTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}

export function generateEmail(templateId: string, vars: TemplateVars): { subject: string; html: string } {
  const template = getTemplate(templateId);
  if (!template) {
    return EMAIL_TEMPLATES[0].generate(vars);
  }
  return template.generate(vars);
}
