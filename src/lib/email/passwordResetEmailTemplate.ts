/** Matches invite / pulse transactional layout (brand, logo, footer). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BRAND_BG = "#0B1F33";
const BRAND_MUTED = "#F8FAFC";

export type PasswordResetEmailInput = {
  appBaseUrl: string;
  resetUrl: string;
};

export function buildPasswordResetEmailHtml(input: PasswordResetEmailInput): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  const logoUrl = `${base}/logo.png`;

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
              <table role="presentation" width="100%"><tr>
                <td><img src="${escapeHtml(logoUrl)}" alt="" width="40" height="40" style="display:block;border-radius:8px;vertical-align:middle;" onerror="this.style.display='none'"/></td>
                <td align="right" style="color:#e2e8f0;font-size:13px;">Home Services Analytics</td>
              </tr></table>
              <h1 style="margin:12px 0 0 0;font-size:20px;font-weight:600;color:#f8fafc;">Reset your password</h1>
              <p style="margin:6px 0 0 0;font-size:14px;color:#94a3b8;">Password reset</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 20px 0;color:#334155;font-size:15px;line-height:1.55;">
                We received a request to reset the password for your account. Use the button below to choose a new password. This link expires in 1 hour.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">
                <tr>
                  <td style="border-radius:8px;background:${BRAND_BG};">
                    <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#f8fafc;text-decoration:none;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <span style="word-break:break-all;color:#0f172a;">${escapeHtml(input.resetUrl)}</span>
              </p>
              <p style="margin:20px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                If you did not request a password reset, you can ignore this email. Your password will not change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
              <a href="${escapeHtml(base)}" style="color:#0B1F33;">Open Home Services Analytics</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetEmailPlainText(input: PasswordResetEmailInput): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  return [
    "Reset your Home Services Analytics password",
    "",
    "We received a request to reset the password for your account.",
    "Use this link to choose a new password (expires in 1 hour):",
    "",
    input.resetUrl,
    "",
    "If you did not request a reset, you can ignore this email.",
    "",
    `Open the app: ${base}`,
  ].join("\n");
}
