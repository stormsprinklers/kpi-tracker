"use client";

import { useEffect, useState } from "react";

export function UsersSettingsClient() {
  const [csrCandidates, setCsrCandidates] = useState<{ id: string; name: string }[]>([]);
  const [csrSelectedIds, setCsrSelectedIds] = useState<Set<string>>(new Set());
  const [csrSaving, setCsrSaving] = useState(false);

  function fetchCsrSelections() {
    fetch("/api/settings/csr-selections")
      .then((res) => res.json())
      .then((data: { selections?: string[]; candidates?: { id: string; name: string }[] }) => {
        setCsrCandidates(data.candidates ?? []);
        setCsrSelectedIds(new Set(data.selections ?? []));
      })
      .catch(() => {
        setCsrCandidates([]);
        setCsrSelectedIds(new Set());
      });
  }

  useEffect(() => {
    fetchCsrSelections();
  }, []);

  function toggleCsrSelection(id: string) {
    setCsrSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveCsrSelections() {
    setCsrSaving(true);
    try {
      const res = await fetch("/api/settings/csr-selections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hcpEmployeeIds: Array.from(csrSelectedIds) }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      alert("Failed to save CSR selections");
    } finally {
      setCsrSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        CSR Selection
      </h2>
      <div className="mt-4 max-h-64 overflow-y-auto rounded border border-zinc-200 p-2 dark:border-zinc-700">
        {csrCandidates.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sync Housecall Pro to load employees and pros.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {csrCandidates.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={csrSelectedIds.has(c.id)}
                  onChange={() => toggleCsrSelection(c.id)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-900 dark:text-zinc-50">{c.name}</span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">({c.id})</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleSaveCsrSelections}
        disabled={csrSaving || csrCandidates.length === 0}
        className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {csrSaving ? "Saving…" : "Save CSR Selection"}
      </button>
    </section>
  );
}
