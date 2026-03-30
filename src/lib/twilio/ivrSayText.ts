/** Default IVR script; use `{company}` or `{company_name}` for the organization name. */
export const DEFAULT_IVR_PROMPT_TEMPLATE =
  "Thank you for calling {company}. Press 1 to be connected.";

const MAX_PROMPT_LEN = 600;
const MAX_COMPANY_LEN = 120;

/**
 * Build the spoken IVR string for Twilio &lt;Say&gt;. Empty company becomes a neutral phrase.
 */
export function resolveIvrSayText(
  template: string | null | undefined,
  companyDisplayName: string | null | undefined
): string {
  const raw = (template?.trim() || DEFAULT_IVR_PROMPT_TEMPLATE).slice(0, MAX_PROMPT_LEN);
  const company = (companyDisplayName?.trim() || "our business").slice(0, MAX_COMPANY_LEN);
  return raw
    .replace(/\{company_name\}/gi, company)
    .replace(/\{company\}/gi, company);
}
