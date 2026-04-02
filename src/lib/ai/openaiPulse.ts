import OpenAI from "openai";
import type { PulseDailySnapshot, PulseWeeklySnapshot } from "@/lib/email/pulseSnapshots";

const DAILY_SYSTEM = `You are an operations analyst for a home services business. Given JSON metrics for a single calendar day, respond with ONLY valid JSON (no markdown) matching this shape:
{"summary":"2-4 sentences executive summary","focusBullets":["3-5 short actionable bullets"]}
Be specific with numbers from the payload. If data is sparse, say so briefly.`;

const WEEKLY_SYSTEM = `You are an operations analyst for a home services business. Given JSON metrics for a 7-day window, respond with ONLY valid JSON (no markdown) matching this shape:
{"narrative":"4-8 sentences overview","sections":{"revenueOps":["bullets"],"callsCsr":["bullets"],"marketing":["bullets"],"risks":["bullets"]}}
Each sections array should have 2-5 strings when data supports it; use fewer if data is thin. Use marketing only when marketingSnippet in the payload has useful signal; otherwise note gaps in risks.`;

function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

export type DailyPulseAi = { summary: string; focusBullets: string[] };

export async function generateDailyPulseAi(snapshot: PulseDailySnapshot): Promise<DailyPulseAi> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      summary: "AI summary unavailable (OPENAI_API_KEY is not set).",
      focusBullets: ["Configure OPENAI_API_KEY to enable pulse summaries."],
    };
  }

  const client = new OpenAI({ apiKey });
  const userContent = JSON.stringify(snapshot, null, 2);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DAILY_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(extractJsonObject(raw)) as { summary?: string; focusBullets?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const bullets = Array.isArray(parsed.focusBullets)
      ? parsed.focusBullets.map((b) => String(b).trim()).filter(Boolean)
      : [];
    if (!summary && bullets.length === 0) throw new Error("parse");
    return {
      summary: summary || "See focus areas below.",
      focusBullets: bullets.length ? bullets.slice(0, 8) : ["Review metrics in the dashboard."],
    };
  } catch {
    return {
      summary: "We could not generate an AI summary for this period. Your key numbers are still shown below.",
      focusBullets: ["Open the app dashboard for full detail."],
    };
  }
}

export type WeeklyPulseAi = {
  narrative: string;
  sections: { revenueOps: string[]; callsCsr: string[]; marketing: string[]; risks: string[] };
};

export async function generateWeeklyPulseAi(snapshot: PulseWeeklySnapshot): Promise<WeeklyPulseAi> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      narrative: "AI narrative unavailable (OPENAI_API_KEY is not set).",
      sections: { revenueOps: [], callsCsr: [], marketing: [], risks: ["Configure OPENAI_API_KEY for weekly AI copy."] },
    };
  }

  const client = new OpenAI({ apiKey });
  const userContent = JSON.stringify(snapshot, null, 2);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: WEEKLY_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(extractJsonObject(raw)) as {
      narrative?: string;
      sections?: Record<string, unknown>;
    };
    const narrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";
    const sec = parsed.sections && typeof parsed.sections === "object" ? parsed.sections : {};
    const asList = (k: string) =>
      Array.isArray(sec[k])
        ? (sec[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
        : [];
    return {
      narrative: narrative || "Weekly performance summary.",
      sections: {
        revenueOps: asList("revenueOps"),
        callsCsr: asList("callsCsr"),
        marketing: asList("marketing"),
        risks: asList("risks"),
      },
    };
  } catch {
    return {
      narrative: "We could not generate a full AI narrative this week. Use the metrics below and the in-app dashboards for detail.",
      sections: { revenueOps: [], callsCsr: [], marketing: [], risks: [] },
    };
  }
}
