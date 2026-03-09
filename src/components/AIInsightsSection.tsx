"use client";

import { useCallback, useEffect, useState } from "react";

export type DashboardType = "main" | "calls" | "profit" | "time" | "marketing";

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week(s) ago`;
  return `${Math.floor(diffDays / 30)} month(s) ago`;
}

export function AIInsightsSection({ dashboard }: { dashboard: DashboardType }) {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-insights?dashboard=${dashboard}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { insights: string[] | null; generatedAt: string | null };
      setInsights(data.insights ?? null);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insights");
      setInsights(null);
      setGeneratedAt(null);
    } finally {
      setLoading(false);
    }
  }, [dashboard]);

  const generateInsights = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard }),
      });
      const data = (await res.json()) as { error?: string; insights?: string[]; generatedAt?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setInsights(data.insights ?? null);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate insights");
    } finally {
      setGenerating(false);
    }
  }, [dashboard]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const isStale =
    generatedAt && (new Date().getTime() - new Date(generatedAt).getTime()) / (1000 * 60 * 60 * 24) > 7;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">AI Insights</h3>
        <button
          type="button"
          onClick={generateInsights}
          disabled={generating}
          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {generating ? "Generating…" : "Refresh insights"}
        </button>
      </div>
      {loading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!loading && !error && insights && insights.length > 0 && (
        <>
          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {insights.map((insight, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-zinc-400">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
          {generatedAt && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Last updated {formatTimeAgo(generatedAt)}
              {isStale && " — Consider refreshing for newer data."}
            </p>
          )}
        </>
      )}
      {!loading && !error && (!insights || insights.length === 0) && (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No insights yet. Click &quot;Refresh insights&quot; to generate AI-powered recommendations from your data.
          </p>
        </div>
      )}
    </section>
  );
}
