import twilio from "twilio";
import {
  getDecryptedTwilioSubaccountRestCredentials,
  getTwilioWebhookAuthTokenForSubaccountSid,
  getWebAttributionInstall,
} from "@/lib/db/webAttributionQueries";

export function getTwilioWebhookBase(): string {
  const raw =
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/$/, "");
}

/**
 * Absolute `https://host` for TwiML callbacks (Gather action, recording status).
 * Relative URLs make Twilio fail the call with a generic application error.
 */
export function getTwilioPublicHttpsOrigin(): string | null {
  const raw = getTwilioWebhookBase().trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function webhookUrlVariants(fullUrl: string): string[] {
  const u = fullUrl.trim();
  if (!u) return [];
  const variants = new Set<string>([u]);
  if (u.endsWith("/")) variants.add(u.replace(/\/+$/, ""));
  else variants.add(`${u}/`);
  return [...variants];
}

export function getTwilioVoiceWebhookUrl(): string {
  const origin = getTwilioPublicHttpsOrigin();
  if (origin) return `${origin}/api/webhooks/twilio/voice`;
  return `${getTwilioWebhookBase()}/api/webhooks/twilio/voice`;
}

/** Twilio POSTs here after IVR &lt;Gather&gt; (digit or timeout). */
export function getTwilioVoiceGatherWebhookUrl(): string {
  const origin = getTwilioPublicHttpsOrigin();
  if (origin) return `${origin}/api/webhooks/twilio/voice/gather`;
  return `${getTwilioWebhookBase()}/api/webhooks/twilio/voice/gather`;
}

export function getTwilioRecordingWebhookUrl(): string {
  const origin = getTwilioPublicHttpsOrigin();
  if (origin) return `${origin}/api/webhooks/twilio/recording`;
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

/**
 * Same master credentials as {@link getTwilioMasterClient}, but REST calls run in the subaccount context.
 * Use this to create API keys (and IAM helpers) on a new subaccount when Twilio did not return an Auth Token
 * on `accounts.create` (common when the parent authenticates with an API key).
 */
export function getTwilioMasterClientForSubaccount(subaccountSid: string): twilio.Twilio {
  const parentSid =
    process.env.TWILIO_MASTER_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!parentSid) {
    throw new Error("Set TWILIO_MASTER_ACCOUNT_SID or TWILIO_ACCOUNT_SID for subaccount provisioning");
  }
  const keySid =
    process.env.TWILIO_MASTER_API_KEY_SID?.trim() || process.env.TWILIO_API_KEY_SID?.trim();
  const keySecret =
    process.env.TWILIO_MASTER_API_KEY_SECRET?.trim() || process.env.TWILIO_API_KEY_SECRET?.trim();
  if (keySid && keySecret) {
    return twilio(keySid, keySecret, { accountSid: subaccountSid });
  }
  const authToken =
    process.env.TWILIO_MASTER_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim();
  if (authToken) {
    return twilio(parentSid, authToken, { accountSid: subaccountSid });
  }
  throw new Error(
    "Set TWILIO_MASTER_API_KEY_SID + TWILIO_MASTER_API_KEY_SECRET (or TWILIO_API_KEY_*) or master auth token"
  );
}

/**
 * Parent **Auth Token** only (not API key), scoped to a subaccount.
 * Twilio `accounts.twilio.com` IAM calls (e.g. secondary Auth Token) often fail with API-key auth but succeed with Auth Token.
 * Use when `TWILIO_*_API_KEY_*` is set for the primary client but env also has `TWILIO_AUTH_TOKEN` / `TWILIO_MASTER_AUTH_TOKEN`.
 */
export function tryTwilioParentAuthTokenClientForSubaccount(subaccountSid: string): twilio.Twilio | null {
  const parentSid =
    process.env.TWILIO_MASTER_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken =
    process.env.TWILIO_MASTER_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!parentSid || !authToken) return null;
  return twilio(parentSid, authToken, { accountSid: subaccountSid });
}

/** Check that `authToken` belongs to the given subaccount (lightweight Twilio fetch). */
export async function verifySubaccountAuthToken(subaccountSid: string, authToken: string): Promise<boolean> {
  const t = authToken.trim();
  if (!t) return false;
  try {
    const client = twilio(subaccountSid, t);
    await client.api.accounts(subaccountSid).fetch();
    return true;
  } catch {
    return false;
  }
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

/**
 * Per-organization Twilio REST client.
 * 1) Subaccount API key from DB (preferred).
 * 2) Else if the org has a Twilio subaccount SID, master credentials scoped to that subaccount (numbers live on the subaccount, not the parent).
 * 3) Else legacy single-account env client.
 */
export async function getTwilioClientForOrganization(organizationId: string): Promise<twilio.Twilio> {
  const sub = await getDecryptedTwilioSubaccountRestCredentials(organizationId);
  if (sub) {
    return twilio(sub.apiKeySid, sub.apiKeySecret, { accountSid: sub.accountSid });
  }
  const install = await getWebAttributionInstall(organizationId);
  const subSid = install?.twilio_subaccount_sid?.trim();
  if (subSid) {
    return getTwilioMasterClientForSubaccount(subSid);
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

/**
 * Public URL Twilio used for this request (must match signature). Prefer proxy headers on Vercel.
 */
export function twilioWebhookPublicUrl(request: Request): string {
  const u = new URL(request.url);
  const pathAndSearch = `${u.pathname}${u.search}`;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
    return `${proto}://${forwardedHost}${pathAndSearch}`;
  }
  return `${u.origin}${pathAndSearch}`;
}

/**
 * Validate signature using the request URL first, then the configured canonical URL if different.
 * Env-only URLs often drift from the URL Twilio actually POSTs to (www vs apex, preview host, etc.).
 */
export async function validateTwilioWebhookRequestForIncomingRequest(
  request: Request,
  configuredCanonicalUrl: string,
  params: Record<string, string>,
  signature: string | null
): Promise<boolean> {
  const fromRequest = twilioWebhookPublicUrl(request);
  for (const u of webhookUrlVariants(fromRequest)) {
    if (await validateTwilioWebhookRequest(u, params, signature)) return true;
  }
  for (const u of webhookUrlVariants(configuredCanonicalUrl)) {
    if (await validateTwilioWebhookRequest(u, params, signature)) return true;
  }
  return false;
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

/**
 * Download recording bytes from Twilio (API key or account token). Used to proxy audio to the browser.
 */
export async function fetchTwilioRecordingMp3(
  organizationId: string,
  recordingSid: string
): Promise<Response | null> {
  const client = await getTwilioClientForOrganization(organizationId);
  try {
    const rec = await client.recordings(recordingSid).fetch();
    const mp3Url = rec.uri.replace(/\.json$/i, ".mp3");
    const sub = await getDecryptedTwilioSubaccountRestCredentials(organizationId);
    let user: string;
    let pass: string;
    if (sub) {
      user = sub.apiKeySid;
      pass = sub.apiKeySecret;
    } else {
      const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
      const keySid = process.env.TWILIO_API_KEY_SID?.trim();
      const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
      const token = process.env.TWILIO_AUTH_TOKEN?.trim();
      if (keySid && keySecret) {
        user = keySid;
        pass = keySecret;
      } else if (accountSid && token) {
        user = accountSid;
        pass = token;
      } else {
        return null;
      }
    }
    const authHeader = Buffer.from(`${user}:${pass}`).toString("base64");
    const mediaRes = await fetch(mp3Url, { headers: { Authorization: `Basic ${authHeader}` } });
    if (!mediaRes.ok) return null;
    return mediaRes;
  } catch {
    return null;
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
