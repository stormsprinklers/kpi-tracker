export type TwoFactorPendingPayload = {
  userId: string;
  email: string;
  verifyTo: string;
  channel: "sms" | "email";
  exp: number;
};

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for 2FA");
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

export async function signTwoFactorPendingToken(payload: TwoFactorPendingPayload): Promise<string> {
  const body = base64UrlEncodeUtf8(JSON.stringify(payload));
  const sig = await hmacSha256Base64Url(body, secret());
  return `${body}.${sig}`;
}

export async function verifyTwoFactorPendingToken(token: string): Promise<TwoFactorPendingPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (!body || !sig) return null;
    const expected = await hmacSha256Base64Url(body, secret());
    if (!timingSafeEqualString(sig, expected)) return null;
    const json = base64UrlDecodeUtf8(body);
    const data = JSON.parse(json) as TwoFactorPendingPayload;
    if (
      typeof data.userId !== "string" ||
      typeof data.email !== "string" ||
      typeof data.verifyTo !== "string" ||
      (data.channel !== "sms" && data.channel !== "email") ||
      typeof data.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** 10 minutes */
export const TWO_FACTOR_PENDING_TTL_MS = 10 * 60 * 1000;
