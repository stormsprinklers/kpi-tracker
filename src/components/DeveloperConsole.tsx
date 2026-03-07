"use client";

import { useState } from "react";
import Link from "next/link";

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
  { label: "Webhook Status (GET)", path: "/api/webhooks/housecallpro" },
];

export function DeveloperConsole() {
  const [customPath, setCustomPath] = useState("/api/debug/hcp-sample");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Developer Console
        </h2>
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400"
        >
          Back to Dashboard
        </Link>
      </div>

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
