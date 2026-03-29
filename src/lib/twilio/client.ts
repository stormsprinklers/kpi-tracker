import twilio from "twilio";
import {
  getDecryptedTwilioSubaccountRestCredentials,
  getTwilioWebhookAuthTokenForSubaccountSid,
} from "@/lib/db/webAttributionQueries";

export function getTwilioWebhookBase(): string {
  const raw =
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/$/, "");
}

export function getTwilioVoiceWebhookUrl(): string {
  return `${getTwilioWebhookBase()}/api/webhooks/twilio/voice`;
}

export function getTwilioRecordingWebhookUrl(): string {
  return `${getTwilioWebhookBase()}/api/webhooks/twilio/recording`;
}

function legacyAccountSid(): string | undefined {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || undefined;
}

/**
 * Parent/master Twilio client: creates subaccounts under this account.
 * Prefer TWILIO_MASTER_*; falls back to TWILIO_ACCOUNT_SID + API key or auth token.
 */
export function getTwilioMasterClient(): twilio.Twilio {
  const accountSid =
    process.env.TWILIO_MASTER_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) {
    throw new Error("Set TWILIO_MASTER_ACCOUNT_SID or TWILIO_ACCOUNT_SID for subaccount provisioning");
  }
  const keySid =
    process.env.TWILIO_MASTER_API_KEY_SID?.trim() || process.env.TWILIO_API_KEY_SID?.trim();
  const keySecret =
    process.env.TWILIO_MASTER_API_KEY_SECRET?.trim() || process.env.TWILIO_API_KEY_SECRET?.trim();
  if (keySid && keySecret) {
    return twilio(keySid, keySecret, { accountSid });
  }
  const authToken =
    process.env.TWILIO_MASTER_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim();
  if (authToken) {
    return twilio(accountSid, authToken);
  }
  throw new Error(
    "Set TWILIO_MASTER_API_KEY_SID + TWILIO_MASTER_API_KEY_SECRET (or TWILIO_API_KEY_*) or master auth token"
  );
}

/** Single-account / legacy: env-based Twilio REST client (main account). */
export function getTwilioClient(): twilio.Twilio {
  const accountSid = legacyAccountSid();
  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not set");
  }
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid });
  }
  if (authToken) {
    return twilio(accountSid, authToken);
  }
  throw new Error("Set TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET");
}

/** Per-organization Twilio client: subaccount API key from DB, else legacy env client. */
export async function getTwilioClientForOrganization(organizationId: string): Promise<twilio.Twilio> {
  const sub = await getDecryptedTwilioSubaccountRestCredentials(organizationId);
  if (sub) {
    return twilio(sub.apiKeySid, sub.apiKeySecret, { accountSid: sub.accountSid });
  }
  return getTwilioClient();
}

function mainAccountSidForWebhooks(): string | null {
  const a =
    process.env.TWILIO_MASTER_ACCOUNT_SID?.trim() ||
    process.env.TWILIO_ACCOUNT_SID?.trim() ||
    null;
  return a;
}

/**
 * Resolve Auth Token for X-Twilio-Signature using AccountSid from the webhook payload.
 */
export async function resolveTwilioWebhookAuthToken(accountSid: string | undefined): Promise<string | null> {
  if (accountSid) {
    const subToken = await getTwilioWebhookAuthTokenForSubaccountSid(accountSid);
    if (subToken) return subToken;
    const main = mainAccountSidForWebhooks();
    if (main && accountSid === main) {
      return process.env.TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_MASTER_AUTH_TOKEN?.trim() || null;
    }
  }
  return process.env.TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_MASTER_AUTH_TOKEN?.trim() || null;
}

export async function validateTwilioWebhookRequest(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;
  const token = await resolveTwilioWebhookAuthToken(params.AccountSid);
  if (!token) return false;
  try {
    return twilio.validateRequest(token, signature, fullUrl, params);
  } catch {
    return false;
  }
}

/** @deprecated Prefer validateTwilioWebhookRequest (supports per-subaccount tokens). */
export function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!signature) return false;
  const t = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!t) return false;
  try {
    return twilio.validateRequest(t, signature, fullUrl, params);
  } catch {
    return false;
  }
}

export function parseTwilioFormBody(text: string): Record<string, string> {
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function getIntelligenceServiceSid(organizationOverride?: string | null): string {
  const fromOrg = organizationOverride?.trim();
  if (fromOrg) return fromOrg;
  const envSid = process.env.TWILIO_INTELLIGENCE_SERVICE_SID?.trim();
  if (envSid) return envSid;
  throw new Error("Set TWILIO_INTELLIGENCE_SERVICE_SID or per-org service SID in Attribution settings");
}
