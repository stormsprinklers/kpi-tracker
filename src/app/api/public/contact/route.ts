import { NextResponse } from "next/server";
import { CONTACT_INBOX_EMAIL } from "@/lib/contact";
import {
  buildContactFormEmailHtml,
  buildContactFormEmailPlainText,
} from "@/lib/email/contactEmailTemplate";
import { sendTransactionalEmail } from "@/lib/email/sendGrid";

export const dynamic = "force-dynamic";

const CONTACT_TOPICS = new Set([
  "general",
  "sales",
  "support",
  "billing",
  "partnership",
  "other",
]);

const TOPIC_LABELS: Record<string, string> = {
  general: "General inquiry",
  sales: "Sales / demo",
  support: "Product support",
  billing: "Billing",
  partnership: "Partnership",
  other: "Other",
};

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 8;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (bucket.count >= RATE_MAX_PER_WINDOW) return true;
  bucket.count += 1;
  return false;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function trimField(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      company?: string;
      topic?: string;
      message?: string;
      website?: string;
    };

    if (body.website?.trim()) {
      return NextResponse.json({ success: true, message: "Thank you for your message." });
    }

    const name = trimField(body.name, 120);
    const email = trimField(body.email, 254).toLowerCase();
    const company = trimField(body.company, 200);
    const topicKey = trimField(body.topic, 32).toLowerCase() || "general";
    const message = trimField(body.message, 5000);

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!CONTACT_TOPICS.has(topicKey)) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json({ error: "Message must be at least 10 characters" }, { status: 400 });
    }

    const topic = TOPIC_LABELS[topicKey] ?? topicKey;
    const emailInput = { name, email, company: company || undefined, topic, message };

    const html = buildContactFormEmailHtml(emailInput);
    const text = buildContactFormEmailPlainText(emailInput);

    const send = await sendTransactionalEmail({
      to: [CONTACT_INBOX_EMAIL],
      subject: `[Contact] ${topic} — ${name}`,
      html,
      text,
      replyTo: email,
    });

    if (!send.ok) {
      console.error("[contact] SendGrid:", send.error);
      return NextResponse.json(
        {
          error:
            "We could not send your message right now. Please email us directly or try again later.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for your message. We will get back to you soon.",
    });
  } catch (err) {
    console.error("[contact] error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
