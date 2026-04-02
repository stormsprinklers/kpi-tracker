import type { OrganizationRow } from "@/lib/db/queries";
import { getUsersByOrganizationId } from "@/lib/db/queries";
import type { PulseEmailVariant } from "@/lib/email/pulseEmailTemplate";

function parseRecipientList(raw: string | null | undefined): string[] | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) {
      const emails = j.map((x) => String(x).trim()).filter(Boolean);
      return emails.length ? emails : null;
    }
  } catch {
    /* fall through */
  }
  const split = s.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
  return split.length ? split : null;
}

/**
 * Optional override JSON array (or comma/newline-separated list) on the org;
 * otherwise all users with role admin in the org.
 */
export async function resolvePulseRecipientEmails(
  organizationId: string,
  org: OrganizationRow,
  variant: PulseEmailVariant
): Promise<string[]> {
  // Backward compat:
  // - If split fields are entirely unconfigured, use legacy `pulse_recipient_emails`.
  // - Once split fields are in use, treat empty list as "no override" (admins only),
  //   not as "use legacy".
  const splitConfigured = org.pulse_daily_recipient_emails != null || org.pulse_weekly_recipient_emails != null;

  const rawOverride = splitConfigured
    ? variant === "daily"
      ? org.pulse_daily_recipient_emails
      : org.pulse_weekly_recipient_emails
    : org.pulse_recipient_emails;

  const parsed = parseRecipientList(rawOverride);
  if (parsed && parsed.length > 0) {
    return [...new Set(parsed.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }
  const users = await getUsersByOrganizationId(organizationId);
  return [
    ...new Set(
      users
        .filter((u) => u.role === "admin")
        .map((u) => u.email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}
