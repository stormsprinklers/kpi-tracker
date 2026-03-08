"use client";

import { useState } from "react";

type WebhookLogEntry = {
  id: string;
  organization_id: string;
  source: string;
  raw_body: string | null;
  headers: Record<string, string>;
  status: string;
  skip_reason: string | null;
  created_at: string;
};

type LogEntry = {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status?: number;
  duration?: number;
  response?: unknown;
  error?: string;
};

const QUICK_ACTIONS = [
  { label: "HCP Auth Test (diagnose 401)", path: "/api/debug/hcp-auth-test" },
  { label: "HCP Sample (Jobs, Employees, Invoices)", path: "/api/debug/hcp-sample" },
  { label: "HCP Raw Pagination (diagnose 10-only)", path: "/api/debug/hcp-raw-pagination" },
  { label: "Technician KPIs", path: "/api/metrics/technician-revenue" },
  { label: "Webhook Status (GET)", path: "/api/webhooks/hcp/status" },
  { label: "Webhook Logs (raw payloads)", path: "/api/debug/webhook-logs" },
];

export function DeveloperConsole() {
  const [customPath, setCustomPath] = useState("/api/debug/hcp-sample");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEntry[]>([]);
  const [webhookLogsLoading, setWebhookLogsLoading] = useState(false);
  const [webhookLogsError, setWebhookLogsError] = useState<string | null>(null);
  const [webhookOrgId, setWebhookOrgId] = useState<string | null>(null);
  const [selectedWebhookLog, setSelectedWebhookLog] = useState<WebhookLogEntry | null>(null);
  const [selectedWebhookIds, setSelectedWebhookIds] = useState<Set<string>>(new Set());
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ results: Array<{ webhookLogId: string; synced: boolean; skipped?: string; error?: string }> } | null>(null);

  async function fetchEndpoint(path: string) {
    const start = performance.now();
    setLoading(true);
    const id = crypto.randomUUID();
    const timestamp = new Date().toLocaleTimeString();

    try {
      const res = await fetch(path);
      const duration = Math.round(performance.now() - start);
      let data: unknown;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      const entry: LogEntry = {
        id,
        timestamp,
        endpoint: path,
        method: "GET",
        status: res.status,
        duration,
        response: data,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 20));
      setSelectedLog(entry);
    } catch (err) {
      const entry: LogEntry = {
        id,
        timestamp,
        endpoint: path,
        method: "GET",
        error: err instanceof Error ? err.message : String(err),
      };
      setLogs((prev) => [entry, ...prev].slice(0, 20));
      setSelectedLog(entry);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(path: string) {
    fetchEndpoint(path);
  }

  function handleCustomFetch() {
    const path = customPath.startsWith("/") ? customPath : `/${customPath}`;
    fetchEndpoint(path);
  }

  function copyResponse() {
    if (!selectedLog?.response) return;
    navigator.clipboard.writeText(
      JSON.stringify(selectedLog.response, null, 2)
    );
  }

  async function fetchWebhookLogs() {
    setWebhookLogsLoading(true);
    setWebhookLogsError(null);
    try {
      const res = await fetch("/api/debug/webhook-logs?limit=50", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to fetch (${res.status})`);
      const logs = data.logs ?? [];
      setWebhookLogs(logs);
      setSelectedWebhookLog(logs[0] ?? null);
      setWebhookOrgId(data.organizationId ?? null);
    } catch (err) {
      setWebhookLogs([]);
      setSelectedWebhookLog(null);
      setWebhookLogsError(err instanceof Error ? err.message : String(err));
    } finally {
      setWebhookLogsLoading(false);
    }
  }

  function copyWebhookPayload(log: WebhookLogEntry) {
    const obj = { headers: log.headers, raw_body: log.raw_body };
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  }

  function toggleWebhookSelection(id: string) {
    setSelectedWebhookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllWebhooks() {
    setSelectedWebhookIds(new Set(webhookLogs.map((e) => e.id)));
  }

  function clearWebhookSelection() {
    setSelectedWebhookIds(new Set());
    setSyncResult(null);
  }

  async function syncToCallRecords() {
    const ids = selectedWebhookIds.size > 0
      ? Array.from(selectedWebhookIds)
      : selectedWebhookLog
        ? [selectedWebhookLog.id]
        : [];
    if (ids.length === 0) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/debug/sync-webhook-to-call-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookLogIds: ids }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setSyncResult({ results: data.results ?? [] });
    } catch (err) {
      setSyncResult({
        results: [{ webhookLogId: "", synced: false, error: err instanceof Error ? err.message : String(err) }],
      });
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Developer Console
      </h2>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Quick Actions
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ label, path }) => (
            <button
              key={path}
              type="button"
              onClick={() => handleQuickAction(path)}
              disabled={loading}
              className="rounded border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Webhook Logs
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Raw payload and headers of incoming webhooks (GHL and HCP). Includes skipped/rejected requests. Select logs and click &quot;Sync to call_records&quot; to re-post GHL call webhooks to Postgres (avoids fake calls for testing).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchWebhookLogs}
            disabled={webhookLogsLoading}
            className="rounded border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {webhookLogsLoading ? "Loading…" : "Load Webhook Logs"}
          </button>
          {webhookOrgId && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Org: {webhookOrgId} — ensure your GHL URL uses this ID
            </span>
          )}
          {webhookLogs.length > 0 && (
            <>
              <button
                type="button"
                onClick={selectAllWebhooks}
                className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearWebhookSelection}
                className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={syncToCallRecords}
                disabled={syncLoading || (selectedWebhookIds.size === 0 && !selectedWebhookLog)}
                className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
              >
                {syncLoading ? "Syncing…" : `Sync to call_records${selectedWebhookIds.size > 0 ? ` (${selectedWebhookIds.size})` : selectedWebhookLog ? " (1)" : ""}`}
              </button>
            </>
          )}
        </div>
        {webhookLogsError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {webhookLogsError}
          </p>
        )}
        {webhookOrgId && webhookLogs.length === 0 && !webhookLogsLoading && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            No webhook logs for org {webhookOrgId}. Ensure HCP/GHL use these exact URLs from Settings (same org ID in path).
          </p>
        )}
        {webhookLogs.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ul className="max-h-64 space-y-1 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/50">
              {webhookLogs.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedWebhookIds.has(entry.id)}
                    onChange={() => toggleWebhookSelection(entry.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 shrink-0 rounded border-zinc-300"
                    aria-label={`Select ${entry.source} ${entry.created_at}`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedWebhookLog(entry)}
                    className={`flex flex-1 flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 ${
                      selectedWebhookLog?.id === entry.id
                        ? "bg-zinc-200 dark:bg-zinc-700"
                        : ""
                    }`}
                  >
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {entry.source} — {new Date(entry.created_at).toLocaleString()}
                    </span>
                    <span
                      className={
                        entry.status === "skipped"
                          ? "text-amber-600 dark:text-amber-400"
                          : entry.status === "received"
                          ? "text-zinc-500 dark:text-zinc-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {entry.status}
                      {entry.skip_reason ? `: ${entry.skip_reason}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="lg:col-span-2 space-y-3">
              {syncResult && (
                <div className="rounded border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                  <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Sync result</div>
                  <ul className="space-y-1 text-sm">
                    {syncResult.results.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        {r.synced ? (
                          <span className="text-emerald-600 dark:text-emerald-400">✓ Synced</span>
                        ) : r.skipped ? (
                          <span className="text-amber-600 dark:text-amber-400">Skipped: {r.skipped}</span>
                        ) : r.error ? (
                          <span className="text-red-600 dark:text-red-400">Error: {r.error}</span>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400">—</span>
                        )}
                        {r.webhookLogId && (
                          <span className="font-mono text-xs text-zinc-400">{r.webhookLogId.slice(0, 8)}…</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedWebhookLog && (
                <div className="space-y-2 rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                  <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {selectedWebhookLog.source} • {selectedWebhookLog.status}
                      {selectedWebhookLog.skip_reason
                        ? ` — ${selectedWebhookLog.skip_reason}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyWebhookPayload(selectedWebhookLog)}
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="max-h-72 overflow-auto p-3">
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Headers
                        </div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                          {JSON.stringify(selectedWebhookLog.headers, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Raw Payload
                        </div>
                        <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                          {selectedWebhookLog.raw_body != null
                            ? (() => {
                                try {
                                  return JSON.stringify(
                                    JSON.parse(selectedWebhookLog.raw_body),
                                    null,
                                    2
                                  );
                                } catch {
                                  return selectedWebhookLog.raw_body;
                                }
                              })()
                            : "(empty)"}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Custom Request
        </h3>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="/api/..."
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={handleCustomFetch}
            disabled={loading}
            className="rounded border border-zinc-300 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {loading ? "Fetching…" : "GET"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Response
          </h3>
          {selectedLog?.response != null ? (
            <button
              type="button"
              onClick={copyResponse}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
            >
              Copy JSON
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-auto p-4">
          {selectedLog ? (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{selectedLog.endpoint}</span>
                {selectedLog.status != null && (
                  <span
                    className={
                      selectedLog.status >= 400
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }
                  >
                    {selectedLog.status}
                  </span>
                )}
                {selectedLog.duration != null && (
                  <span>{selectedLog.duration}ms</span>
                )}
              </div>
              {selectedLog.error ? (
                <pre className="whitespace-pre-wrap break-words rounded bg-red-50 p-3 font-mono text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
                  {selectedLog.error}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {JSON.stringify(selectedLog.response, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Run a quick action or custom request to see the response.
            </p>
          )}
        </div>
      </section>

      {logs.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            History
          </h3>
          <ul className="mt-2 space-y-1">
            {logs.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLog(entry)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    selectedLog?.id === entry.id
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : ""
                  }`}
                >
                  <span className="font-mono text-zinc-600 dark:text-zinc-400">
                    {entry.endpoint}
                  </span>
                  {entry.status != null && (
                    <span
                      className={
                        entry.status >= 400
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {entry.status}
                    </span>
                  )}
                  <span className="text-zinc-400 dark:text-zinc-500">
                    {entry.timestamp}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
