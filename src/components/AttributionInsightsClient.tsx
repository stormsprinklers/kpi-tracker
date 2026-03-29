"use client";

import { useEffect, useMemo, useState } from "react";

type Source = {
  id: string;
  slug: string;
  label: string;
  public_token: string;
};

type InstallResponse = {
  publishableKey: string | null;
  allowedOrigins: string[];
  verifiedAt: string | null;
  lastEventAt: string | null;
  website: string;
};

type EventsResponse = {
  recentEvents: Array<{
    id: string;
    source_label: string | null;
    event_type: string;
    occurred_at: string;
    page_url: string | null;
  }>;
  counts30d: Record<string, number>;
};

function normalizeWebsite(input: string): string {
  if (!input.trim()) return "";
  const value = input.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

export function AttributionInsightsClient() {
  const [install, setInstall] = useState<InstallResponse | null>(null);
  const [newPublishableKey, setNewPublishableKey] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [events, setEvents] = useState<EventsResponse | null>(null);
  const [newSourceName, setNewSourceName] = useState("");
  const [allowedOriginsText, setAllowedOriginsText] = useState("");
  const [savingOrigins, setSavingOrigins] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    const [installRes, sourceRes, eventsRes] = await Promise.all([
      fetch("/api/attribution/install", { cache: "no-store" }),
      fetch("/api/attribution/sources", { cache: "no-store" }),
      fetch("/api/attribution/events", { cache: "no-store" }),
    ]);
    if (!installRes.ok || !sourceRes.ok || !eventsRes.ok) {
      throw new Error("Failed to load attribution data.");
    }
    const installJson = (await installRes.json()) as InstallResponse;
    setInstall(installJson);
    setAllowedOriginsText((installJson.allowedOrigins ?? []).join("\n"));
    if (installJson.publishableKey) setNewPublishableKey(installJson.publishableKey);
    setSources((await sourceRes.json()) as Source[]);
    setEvents((await eventsRes.json()) as EventsResponse);
  }

  useEffect(() => {
    loadAll().catch((e) => setError(e instanceof Error ? e.message : "Failed to load attribution."));
  }, []);

  const websiteBase = useMemo(() => normalizeWebsite(install?.website ?? ""), [install?.website]);
  const snippet = useMemo(() => {
    const appUrl =
      ((process.env.NEXT_PUBLIC_APP_URL as string | undefined) ||
        (typeof window !== "undefined" ? window.location.origin : ""))
        .replace(/\/$/, "");
    const key = newPublishableKey ?? "REPLACE_WITH_PUBLISHABLE_KEY";
    return `<script defer src="${appUrl}/attribution.js" data-key="${key}"></script>`;
  }, [newPublishableKey]);

  async function saveOrigins() {
    setSavingOrigins(true);
    setError(null);
    try {
      const allowedOrigins = allowedOriginsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/attribution/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedOrigins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save origins");
      setInstall((prev) =>
        prev
          ? { ...prev, allowedOrigins: data.allowedOrigins, verifiedAt: data.verifiedAt, lastEventAt: data.lastEventAt }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save origins");
    } finally {
      setSavingOrigins(false);
    }
  }

  async function rotateKey() {
    setBusy(true);
    setError(null);
    try {
      const allowedOrigins = allowedOriginsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/attribution/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateKey: true, allowedOrigins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to rotate key");
      setNewPublishableKey(data.publishableKey ?? null);
      setInstall((prev) =>
        prev
          ? { ...prev, allowedOrigins: data.allowedOrigins, verifiedAt: data.verifiedAt, lastEventAt: data.lastEventAt }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate key");
    } finally {
      setBusy(false);
    }
  }

  async function createSource() {
    if (!newSourceName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newSourceName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create source");
      setSources((prev) => [...prev, data as Source]);
      setNewSourceName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create source");
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(sourceId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attribution/sources?sourceId=${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to archive source");
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive source");
    } finally {
      setBusy(false);
    }
  }

  if (!install) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading Attribution...</div>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Install snippet</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          Paste this script before the closing <code>&lt;/body&gt;</code> tag on your website.
        </p>
        <textarea
          className="mt-3 h-20 w-full rounded border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          value={snippet}
          readOnly
        />
        {newPublishableKey ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Save this key now. It is shown one time only after creation/rotation.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={rotateKey}
            disabled={busy}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Rotate publishable key
          </button>
          <button
            type="button"
            onClick={() => loadAll().catch((e) => setError(e instanceof Error ? e.message : "Failed to refresh"))}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Verify/Refresh
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Allowed origins</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          One origin per line, for example: <code>https://example.com</code>
        </p>
        <textarea
          className="mt-3 h-24 w-full rounded border border-zinc-300 bg-zinc-50 p-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          value={allowedOriginsText}
          onChange={(e) => setAllowedOriginsText(e.target.value)}
        />
        <button
          type="button"
          onClick={saveOrigins}
          disabled={savingOrigins}
          className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save origins
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Generated source links</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          Use these homepage links in Facebook, Instagram, GBP, LSA, or any other channel.
        </p>
        <div className="mt-4 space-y-2">
          {sources.map((source) => {
            const link = websiteBase ? `${websiteBase}?hsa_c=${encodeURIComponent(source.public_token)}` : "(Set website in SEO settings first)";
            return (
              <div key={source.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{source.label}</p>
                    <p className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">{link}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    onClick={() => removeSource(source.id)}
                  >
                    Archive
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
            placeholder="Custom source name"
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          />
          <button
            type="button"
            onClick={createSource}
            disabled={busy}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add source
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Verification + last 30 days</h2>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          Verified at: {install.verifiedAt ? new Date(install.verifiedAt).toLocaleString() : "Not verified yet"} | Last event:{" "}
          {install.lastEventAt ? new Date(install.lastEventAt).toLocaleString() : "No events yet"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {Object.entries(events?.counts30d ?? {}).map(([k, v]) => (
            <div key={k} className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{k}</p>
              <p className="text-zinc-600 dark:text-zinc-400">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent events</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 pr-3">Time</th>
                <th className="pb-2 pr-3">Event</th>
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3">Page</th>
              </tr>
            </thead>
            <tbody>
              {(events?.recentEvents ?? []).map((event) => (
                <tr key={event.id} className="border-b border-zinc-100 align-top dark:border-zinc-800">
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(event.occurred_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{event.event_type}</td>
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{event.source_label ?? "-"}</td>
                  <td className="py-2 pr-3 break-all text-zinc-600 dark:text-zinc-400">{event.page_url ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Phase 2 note: map <code>tel_click</code> and <code>form_submit</code> events to <code>call_records</code> by
        normalized phone and a short time window, then join linked calls to jobs for booking rate, conversion, revenue,
        and average ticket by source.
      </section>
    </div>
  );
}

