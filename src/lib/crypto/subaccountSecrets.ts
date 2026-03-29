import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "v1:";

function getKeyBytes(): Buffer {
  const raw = process.env.TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY is not set");
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    const buf = Buffer.from(raw, "hex");
    if (buf.length === 32) return buf;
  }
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* ignore */
  }
  return scryptSync(raw, "hsa-twilio-subaccount", 32);
}

/** AES-256-GCM; output is url-safe base64 with version prefix. */
export function encryptSubaccountSecret(plaintext: string): string {
  const key = getKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]);
  return PREFIX + combined.toString("base64url");
}

export function decryptSubaccountSecret(blob: string): string {
  if (!blob.startsWith(PREFIX)) {
    throw new Error("Invalid encrypted secret format");
  }
  const key = getKeyBytes();
  const combined = Buffer.from(blob.slice(PREFIX.length), "base64url");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const data = combined.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
