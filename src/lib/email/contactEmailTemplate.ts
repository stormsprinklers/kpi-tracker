function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BRAND_BG = "#0B1F33";
const BRAND_MUTED = "#F8FAFC";

export type ContactFormEmailInput = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  topic: string;
  message: string;
  smsCustomerCareConsent?: boolean;
  smsMarketingConsent?: boolean;
  consentRecordedAt?: string;
};

export function buildContactFormEmailHtml(input: ContactFormEmailInput): string {
  const rows = [
    ["Name", input.name],
    ["Email", input.email],
    ["Company", input.company?.trim() || "—"],
    ["Phone", input.phone?.trim() || "—"],
    ["Topic", input.topic],
    [
      "SMS — customer care",
      input.smsCustomerCareConsent ? "Opted in" : "Not opted in",
    ],
    [
      "SMS — marketing",
      input.smsMarketingConsent ? "Opted in" : "Not opted in",
    ],
  ];

  if (input.consentRecordedAt) {
    rows.push(["Consent recorded (UTC)", input.consentRecordedAt]);
  }

  const tableRows = rows
    .map(
      ([label, value]) => `<tr>
      <td style="padding:8px 12px 8px 0;font-size:13px;font-weight:600;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;font-size:14px;color:#0f172a;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND_MUTED};font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_MUTED};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:${BRAND_BG};padding:20px 24px;">
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#f8fafc;">New contact form message</h1>
              <p style="margin:6px 0 0 0;font-size:14px;color:#94a3b8;">Home Services Analytics website</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tableRows}</table>
              <p style="margin:20px 0 8px 0;font-size:13px;font-weight:600;color:#64748b;">Message</p>
              <div style="padding:12px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;color:#334155;line-height:1.55;white-space:pre-wrap;">${escapeHtml(input.message)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContactFormEmailPlainText(input: ContactFormEmailInput): string {
  return [
    "New contact form message — Home Services Analytics",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Company: ${input.company?.trim() || "—"}`,
    `Phone: ${input.phone?.trim() || "—"}`,
    `Topic: ${input.topic}`,
    `SMS customer care consent: ${input.smsCustomerCareConsent ? "Yes" : "No"}`,
    `SMS marketing consent: ${input.smsMarketingConsent ? "Yes" : "No"}`,
    ...(input.consentRecordedAt ? [`Consent recorded (UTC): ${input.consentRecordedAt}`] : []),
    "",
    "Message:",
    input.message,
  ].join("\n");
}
