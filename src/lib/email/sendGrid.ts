const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

const DEFAULT_FROM_EMAIL = "noreply@homeservicesanalytics.com";
const DEFAULT_FROM_NAME = "Home Services Analytics";

export type SendTransactionalEmailParams = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send via SendGrid v3 Mail Send (Twilio). Requires SENDGRID_API_KEY.
 * from + reply_to are fixed to noreply@homeservicesanalytics.com per product requirements.
 */
export async function sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "SENDGRID_API_KEY is not set" };
  }

  const recipients = [...new Set(params.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) {
    return { ok: false, error: "No recipients" };
  }

  const sandbox = process.env.SENDGRID_SANDBOX_MODE === "true";

  const content: Array<{ type: string; value: string }> = [
    { type: "text/html", value: params.html },
  ];
  if (params.text?.trim()) {
    content.push({ type: "text/plain", value: params.text.trim() });
  }

  const body = {
    personalizations: recipients.map((email) => ({ to: [{ email }] })),
    from: { email: DEFAULT_FROM_EMAIL, name: DEFAULT_FROM_NAME },
    reply_to: { email: DEFAULT_FROM_EMAIL },
    subject: params.subject,
    content,
    mail_settings: sandbox ? { sandbox_mode: { enable: true } } : undefined,
  };

  try {
    const res = await fetch(SENDGRID_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { ok: false, error: `SendGrid ${res.status}: ${errText.slice(0, 500)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
