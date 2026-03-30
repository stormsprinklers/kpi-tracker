/** Twilio Account / IncomingPhoneNumber / New Key FriendlyName max length. */
export const TWILIO_FRIENDLY_NAME_MAX = 64;

/**
 * Label for Twilio resources tied to an organization (subaccount, API key, phone number).
 * Uses the company name from `organizations.name` when present.
 */
export function twilioFriendlyNameFromOrg(
  organizationName: string | null | undefined,
  organizationId: string
): string {
  const raw = (organizationName ?? "").replace(/\s+/g, " ").trim();
  if (raw.length > 0) {
    return raw.slice(0, TWILIO_FRIENDLY_NAME_MAX);
  }
  return `Organization ${organizationId.slice(0, 8)}`.slice(0, TWILIO_FRIENDLY_NAME_MAX);
}
