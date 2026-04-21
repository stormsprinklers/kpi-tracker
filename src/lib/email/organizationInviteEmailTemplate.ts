/** Matches pulse transactional email layout (brand, logo, footer). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BRAND_BG = "#0B1F33";
const BRAND_MUTED = "#F8FAFC";

export type OrganizationInviteEmailInput = {
  orgName: string;
  /** Role label for the invitee, e.g. "Employee" */
  roleLabel: string;
  appBaseUrl: string;
  joinUrl: string;
  invitedByEmail?: string | null;
};

export function buildOrganizationInviteEmailHtml(input: OrganizationInviteEmailInput): string {
  const base = input.appBaseUrl.replace(/\/$/, "");
  const logoUrl = `${base}/logo.png`;
  const invitedLine =
    input.invitedByEmail?.trim() ?
      `<p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.55;">You were invited by <strong>${escapeHtml(input.invitedByEmail.trim())}</strong>.</p>`
      : "";

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
                <td align="right" style="color:#e2e8f0;font-size:13px;">${escapeHtml(input.orgName)}</td>
              </tr></table>
              <h1 style="margin:12px 0 0 0;font-size:20px;font-weight:600;color:#f8fafc;">Join your team on Home Services Analytics</h1>
              <p style="margin:6px 0 0 0;font-size:14px;color:#94a3b8;">Organization invitation</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px 0;color:#334155;font-size:15px;line-height:1.55;">
                You have been invited to join <strong>${escapeHtml(input.orgName)}</strong> with the role <strong>${escapeHtml(input.roleLabel)}</strong>.
              </p>
              ${invitedLine}
              <p style="margin:0 0 20px 0;color:#334155;font-size:15px;line-height:1.55;">
                Use the button below to create your password and access the organization. This link expires in 7 days.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">
                <tr>
                  <td style="border-radius:8px;background:${BRAND_BG};">
                    <a href="${escapeHtml(input.joinUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#f8fafc;text-decoration:none;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <span style="word-break:break-all;color:#0f172a;">${escapeHtml(input.joinUrl)}</span>
              </p>
              <p style="margin:20px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
                Questions? Reply is not monitored; contact the person who invited you or your account admin.
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

export function buildOrganizationInviteEmailPlainText(input: OrganizationInviteEmailInput): string {
  const lines = [
    "Join your team on Home Services Analytics",
    "",
    `You have been invited to join ${input.orgName} with the role ${input.roleLabel}.`,
  ];
  if (input.invitedByEmail?.trim()) {
    lines.push("", `Invited by: ${input.invitedByEmail.trim()}`);
  }
  lines.push(
    "",
    "Use this link to create your password and access the organization (expires in 7 days):",
    input.joinUrl,
    "",
    `Open the app: ${input.appBaseUrl.replace(/\/$/, "")}`
  );
  return lines.join("\n");
}
