import type { EnrollmentEmailChallenge } from "@/lib/auth/enrollmentEmailChallenge";

export type TwoFactorEnrollmentPayload =
  | {
      flow: "signup";
      email: string;
      phoneE164: string;
      orgName: string;
      passwordHash: string;
      emailChallenge?: EnrollmentEmailChallenge;
      exp: number;
    }
  | {
      flow: "invite";
      inviteId: string;
      organizationId: string;
      email: string;
      role: "admin" | "employee" | "investor";
      hcpEmployeeId: string | null;
      phoneE164: string;
      passwordHash: string;
      emailChallenge?: EnrollmentEmailChallenge;
      exp: number;
    };

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for 2FA enrollment");
  return s;
}

function base64UrlEncodeUtf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function base64UrlDecodeUtf8(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

async function hmacSha256Base64Url(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Buffer.from(sig).toString("base64url");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

export async function signTwoFactorEnrollmentToken(payload: TwoFactorEnrollmentPayload): Promise<string> {
  const body = base64UrlEncodeUtf8(JSON.stringify(payload));
  const sig = await hmacSha256Base64Url(body, secret());
  return `${body}.${sig}`;
}

function isValidPayload(data: unknown): data is TwoFactorEnrollmentPayload {
  if (!data || typeof data !== "object") return false;
  const r = data as Record<string, unknown>;
  if (typeof r.exp !== "number") return false;
  const challenge = r.emailChallenge as Record<string, unknown> | undefined;
  const challengeValid =
    challenge == null ||
    (challenge.provider === "twilio") ||
    (challenge.provider === "app_email" && typeof challenge.codeHash === "string");
  if (r.flow === "signup") {
    return (
      typeof r.email === "string" &&
      typeof r.phoneE164 === "string" &&
      typeof r.orgName === "string" &&
      typeof r.passwordHash === "string" &&
      challengeValid
    );
  }
  if (r.flow === "invite") {
    return (
      typeof r.inviteId === "string" &&
      typeof r.organizationId === "string" &&
      typeof r.email === "string" &&
      (r.role === "admin" || r.role === "employee" || r.role === "investor") &&
      (typeof r.hcpEmployeeId === "string" || r.hcpEmployeeId === null) &&
      typeof r.phoneE164 === "string" &&
      typeof r.passwordHash === "string" &&
      challengeValid
    );
  }
  return false;
}

export async function verifyTwoFactorEnrollmentToken(
  token: string
): Promise<TwoFactorEnrollmentPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (!body || !sig) return null;
    const expected = await hmacSha256Base64Url(body, secret());
    if (!timingSafeEqualString(sig, expected)) return null;
    const json = base64UrlDecodeUtf8(body);
    const data = JSON.parse(json) as unknown;
    if (!isValidPayload(data)) return null;
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** 15 minutes */
export const TWO_FACTOR_ENROLLMENT_TTL_MS = 15 * 60 * 1000;
