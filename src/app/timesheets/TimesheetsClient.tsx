"use client";

import { useEffect, useState } from "react";

interface TimeEntry {
  id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  job_hcp_id: string | null;
  notes: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface TimesheetsClientProps {
  isAdmin?: boolean;
  hcpEmployeeId?: string;
}

export function TimesheetsClient({ isAdmin, hcpEmployeeId: initialHcpEmployeeId }: TimesheetsClientProps = {}) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialHcpEmployeeId ?? "");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("17:00");
  const [formHours, setFormHours] = useState("8");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveHcpEmployeeId = isAdmin ? selectedEmployeeId || null : initialHcpEmployeeId ?? null;

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/employees")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: { id: string; name: string }[]) => {
          const opts: EmployeeOption[] = Array.isArray(data)
            ? data.map((e) => ({ id: String(e.id), name: String(e.name || e.id || "Unknown") }))
            : [];
          setEmployees(opts);
          if (opts.length > 0 && !selectedEmployeeId) setSelectedEmployeeId(opts[0].id);
        })
        .catch(() => setEmployees([]));
    }
  }, [isAdmin]);

  function fetchEntries() {
    if (isAdmin && !effectiveHcpEmployeeId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (effectiveHcpEmployeeId) params.set("hcp_employee_id", effectiveHcpEmployeeId);
    fetch(`/api/timesheets?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load timesheets");
        return res.json();
      })
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchEntries();
  }, [startDate, endDate, effectiveHcpEmployeeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(effectiveHcpEmployeeId && isAdmin ? { hcp_employee_id: effectiveHcpEmployeeId } : {}),
          entry_date: formDate,
          start_time: formStart || null,
          end_time: formEnd || null,
          hours: formHours ? parseFloat(formHours) : null,
          notes: formNotes || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add entry");
      }
      setShowForm(false);
      setFormDate(new Date().toISOString().slice(0, 10));
      setFormStart("09:00");
      setFormEnd("17:00");
      setFormHours("8");
      setFormNotes("");
      fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this time entry?")) return;
    try {
      const res = await fetch(`/api/timesheets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {isAdmin && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Employee
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Select employee...</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          From
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-400">
          To
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={isAdmin && !effectiveHcpEmployeeId}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Add entry
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New time entry</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs">
              Date
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="text-xs">
              Start
              <input
                type="time"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="text-xs">
              End
              <input
                type="time"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <label className="text-xs">
              Hours
              <input
                type="number"
                step="0.25"
                min="0"
                value={formHours}
                onChange={(e) => setFormHours(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>
          <label className="mt-3 block text-xs">
            Notes
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No time entries in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Date</th>
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Start</th>
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">End</th>
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Hours</th>
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Notes</th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">{e.entry_date}</td>
                  <td className="py-2">{e.start_time ?? "—"}</td>
                  <td className="py-2">{e.end_time ?? "—"}</td>
                  <td className="py-2">{e.hours ?? "—"}</td>
                  <td className="py-2 max-w-[200px] truncate">{e.notes ?? "—"}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
