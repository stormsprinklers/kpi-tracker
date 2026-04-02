"use client";

import { useEffect, useState } from "react";

export function PulseNotificationsClient() {
  const [pulseEmailEnabled, setPulseEmailEnabled] = useState(false);
  const [pulseDailyEnabled, setPulseDailyEnabled] = useState(false);
  const [pulseWeeklyEnabled, setPulseWeeklyEnabled] = useState(false);
  const [pulseTimezone, setPulseTimezone] = useState("America/Denver");
  const [dailyRecipientText, setDailyRecipientText] = useState("");
  const [weeklyRecipientText, setWeeklyRecipientText] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [weeklyNote, setWeeklyNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [testDailySending, setTestDailySending] = useState(false);
  const [testWeeklySending, setTestWeeklySending] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/settings/pulse-notifications");
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as {
          pulse_email_enabled: boolean;
          pulse_daily_enabled: boolean;
          pulse_weekly_enabled: boolean;
          pulse_timezone: string;
          pulse_daily_recipient_emails: string[];
          pulse_weekly_recipient_emails: string[];
          daily_content_note?: string;
          weekly_content_note?: string;
        };
        setPulseEmailEnabled(data.pulse_email_enabled);
        setPulseDailyEnabled(data.pulse_daily_enabled);
        setPulseWeeklyEnabled(data.pulse_weekly_enabled);
        setPulseTimezone(data.pulse_timezone || "America/Denver");
        setDailyRecipientText((data.pulse_daily_recipient_emails ?? []).join("\n"));
        setWeeklyRecipientText((data.pulse_weekly_recipient_emails ?? []).join("\n"));
        setDailyNote(data.daily_content_note ?? "");
        setWeeklyNote(data.weekly_content_note ?? "");
      } catch {
        setError("Failed to load notification settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setTestStatus(null);
    setSavedAt(null);
    try {
      const dailyLines = dailyRecipientText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const weeklyLines = weeklyRecipientText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/settings/pulse-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pulse_email_enabled: pulseEmailEnabled,
          pulse_daily_enabled: pulseDailyEnabled,
          pulse_weekly_enabled: pulseWeeklyEnabled,
          pulse_timezone: pulseTimezone.trim() || "America/Denver",
          pulse_daily_recipient_emails: dailyLines,
          pulse_weekly_recipient_emails: weeklyLines,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Save failed");
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(variant: "daily" | "weekly") {
    setError(null);
    setTestStatus(null);
    if (variant === "daily") setTestDailySending(true);
    if (variant === "weekly") setTestWeeklySending(true);
    try {
      const res = await fetch("/api/settings/pulse-notifications/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Test email failed");
      }
      const data = (await res.json()) as { ok: boolean; result: { status: string; detail?: string } };
      if (!data.ok) {
        throw new Error(data.result?.detail || "Test email failed");
      }
      setTestStatus(
        data.result.status === "sent"
          ? `Sent ${variant} test email.`
          : `Skipped ${variant} test email: ${data.result.detail ?? "No recipients"}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test email failed");
    } finally {
      if (variant === "daily") setTestDailySending(false);
      if (variant === "weekly") setTestWeeklySending(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300"
            checked={pulseEmailEnabled}
            onChange={(e) => setPulseEmailEnabled(e.target.checked)}
          />
          <span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">Enable business pulse emails</span>
            <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
              Master switch. Daily and weekly options apply only when this is on.
            </span>
          </span>
        </label>

        <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300"
              disabled={!pulseEmailEnabled}
              checked={pulseDailyEnabled}
              onChange={(e) => setPulseDailyEnabled(e.target.checked)}
            />
            <span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Daily pulse</span>
              {dailyNote ? (
                <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{dailyNote}</span>
              ) : null}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-300"
              disabled={!pulseEmailEnabled}
              checked={pulseWeeklyEnabled}
              onChange={(e) => setPulseWeeklyEnabled(e.target.checked)}
            />
            <span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Weekly pulse</span>
              {weeklyNote ? (
                <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{weeklyNote}</span>
              ) : null}
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Org time zone (IANA)</label>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          Used to define &quot;yesterday&quot; and week boundaries for pulses (e.g. America/Denver, America/New_York).
        </p>
        <input
          type="text"
          value={pulseTimezone}
          onChange={(e) => setPulseTimezone(e.target.value)}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="America/Denver"
        />
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Daily pulse recipients</label>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            One per line (leave empty to fall back to all organization Admin users).
          </p>
          <textarea
            value={dailyRecipientText}
            onChange={(e) => setDailyRecipientText(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="ops@example.com&#10;owner@example.com"
          />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Weekly pulse recipients</label>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            One per line (leave empty to fall back to all organization Admin users).
          </p>
          <textarea
            value={weeklyRecipientText}
            onChange={(e) => setWeeklyRecipientText(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="ops@example.com&#10;owner@example.com"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void sendTestEmail("daily")}
            disabled={testDailySending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {testDailySending ? "Sending daily…" : "Send daily test email"}
          </button>
          <button
            type="button"
            onClick={() => void sendTestEmail("weekly")}
            disabled={testWeeklySending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {testWeeklySending ? "Sending weekly…" : "Send weekly test email"}
          </button>
          {testStatus ? <span className="text-sm text-emerald-600 dark:text-emerald-400">{testStatus}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt ? <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved at {savedAt}</span> : null}
      </div>
    </div>
  );
}
