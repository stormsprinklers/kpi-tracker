import OpenAI from "openai";

export type DashboardType = "main" | "calls" | "profit" | "time" | "marketing";

const SYSTEM_PROMPT = `You are an operations analyst for a home service business (HVAC, plumbing, electrical, etc.). Given the following metrics for the last 30 days, produce exactly 3 brief, actionable insights.

Each insight should be 1–2 sentences. Focus on patterns, outliers, and concrete recommendations (e.g. pair high performers with low performers for mentoring, adjust scheduling, improve call handling). Be specific with employee names and numbers when available. Write in a friendly, professional tone.`;

/** Parse 3 insights from model output. Handles numbered lists, bullet points, and plain text. */
function parseInsights(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((s) => s.replace(/^[\d\.\)\-\*\•]\s*/, "").trim())
    .filter(Boolean);
  const insights: string[] = [];
  for (const line of lines) {
    if (insights.length >= 3) break;
    const trimmed = line.trim();
    if (trimmed.length > 10) insights.push(trimmed);
  }
  while (insights.length < 3 && insights.length > 0) {
    const last = insights[insights.length - 1];
    const parts = last.split(/[.;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      insights.pop();
      insights.push(...parts.slice(0, 3 - insights.length));
    } else break;
  }
  return insights.slice(0, 3);
}

export async function generateInsights(
  dashboardType: DashboardType,
  dataSnapshot: unknown
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your environment to enable AI insights.");
  }

  const client = new OpenAI({ apiKey });
  const dataStr = JSON.stringify(dataSnapshot, null, 2);
  const userContent = `Dashboard: ${dashboardType}\n\nMetrics (last 30 days):\n\n${dataStr}`;

  const model = "o1-mini";
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "developer", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      reasoning_effort: "medium",
      max_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    const insights = parseInsights(content);
    if (insights.length === 0) {
      return ["Unable to generate insights from the data. Try again with more metrics."];
    }
    return insights;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const useFallback =
        err.code === "model_not_found" ||
        err.status === 404 ||
        String(err.message || "").toLowerCase().includes("o1");
      if (useFallback) {
        return generateInsightsWithFallback(userContent);
      }
    }
    throw err;
  }
}

/** Fallback to gpt-4o-mini when o1-mini is unavailable. */
async function generateInsightsWithFallback(userContent: string): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 1024,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return ["Unable to generate insights."];
  const insights = parseInsights(content);
  return insights.length > 0 ? insights : ["Unable to generate insights from the data."];
}
