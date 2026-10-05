import { logger } from "@/server/platform/observability/logger";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/**
 * Email adapter (Architecture §30). Sends through Resend when RESEND_API_KEY
 * is set; otherwise, outside production, writes the message to the log so
 * links can be followed during development.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_TRANSPORT !== "log") {
      throw new Error("Email is not configured (RESEND_API_KEY missing)");
    }
    logger.warn(
      { to: message.to, subject: message.subject, body: message.text },
      "email not sent: no provider configured",
    );
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "StudyOS <no-reply@studyos.local>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) {
    logger.error({ status: response.status }, "email provider rejected message");
    throw new Error(`Email provider returned ${response.status}`);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, accessible transactional email with one action link. */
export function actionEmail(opts: { to: string; subject: string; intro: string; actionLabel: string; url: string }) {
  const text = `${opts.intro}\n\n${opts.actionLabel}: ${opts.url}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;line-height:1.5;color:#111">
<p>${escapeHtml(opts.intro)}</p>
<p><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(opts.actionLabel)}</a></p>
<p style="color:#555;font-size:13px">If you didn't request this, you can ignore this email.</p></div>`;
  return sendEmail({ to: opts.to, subject: opts.subject, text, html });
}
