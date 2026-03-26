"use client";

import { useEffect, useState, useMemo } from "react";
import { MetricTooltip } from "@/components/MetricTooltip";

interface TimeEntry {
  id: string;
  hcp_employee_id?: string;
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

interface TimeOffRequest {
  id: string;
  batch_id: string;
  hcp_employee_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "declined";
  admin_reason: string | null;
  created_at: string;
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
  const [formEmployeeId, setFormEmployeeId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formHours, setFormHours] = useState("8");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showTimeOffForm, setShowTimeOffForm] = useState(false);
  const [timeOffRanges, setTimeOffRanges] = useState<Array<{ startDate: string; endDate: string; startTime: string; endTime: string; allDay: boolean }>>([
    { startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), startTime: "09:00", endTime: "17:00", allDay: true },
  ]);
  const [timeOffSubmitting, setTimeOffSubmitting] = useState(false);
  const [timeOffError, setTimeOffError] = useState<string | null>(null);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [timeOffLoading, setTimeOffLoading] = useState(false);

  const effectiveHcpEmployeeId = isAdmin ? null : initialHcpEmployeeId ?? null;
  const employeeMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const empId = e.hcp_employee_id ?? "unknown";
      const raw = e.hours;
      const h =
        typeof raw === "number" && !Number.isNaN(raw)
          ? raw
          : typeof raw === "string"
            ? parseFloat(raw) || 0
            : 0;
      map.set(empId, (map.get(empId) ?? 0) + h);
    }
    return map;
  }, [entries]);

  const grandTotal = useMemo(() => {
    return [...totalsByEmployee.values()].reduce((a, b) => a + b, 0);
  }, [totalsByEmployee]);

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/employees")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: { id: string; name: string }[]) => {
          const opts: EmployeeOption[] = Array.isArray(data)
            ? data.map((e) => ({ id: String(e.id), name: String(e.name || e.id || "Unknown") }))
            : [];
          setEmployees(opts);
          if (opts.length > 0 && !formEmployeeId) setFormEmployeeId(opts[0].id);
        })
        .catch(() => setEmployees([]));
    }
  }, [isAdmin]);

  function fetchEntries() {
    if (!isAdmin && !effectiveHcpEmployeeId) {
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

  useEffect(() => {
    if (!isAdmin) return;
    setTimeOffLoading(true);
    const params = new URLSearchParams();
    params.set("start_date", startDate);
    params.set("end_date", endDate);
    fetch(`/api/time-off?${params}`)
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data: { requests: TimeOffRequest[] }) => setTimeOffRequests(data.requests ?? []))
      .catch(() => setTimeOffRequests([]))
      .finally(() => setTimeOffLoading(false));
  }, [isAdmin, startDate, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const empId = isAdmin ? formEmployeeId : effectiveHcpEmployeeId;
    if (isAdmin && !empId) {
      setError("Please select an employee");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(empId ? { hcp_employee_id: empId } : {}),
          entry_date: formDate,
          start_time: null,
          end_time: null,
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
      setFormHours("8");
      setFormNotes("");
      fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestTimeOff(e: React.FormEvent) {
    e.preventDefault();
    setTimeOffSubmitting(true);
    setTimeOffError(null);
    try {
      const res = await fetch("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ranges: timeOffRanges.map((r) => ({
            startDate: r.startDate,
            endDate: r.endDate,
            startTime: r.allDay ? null : (r.startTime || null),
            endTime: r.allDay ? null : (r.endTime || null),
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setShowTimeOffForm(false);
      setTimeOffRanges([
        { startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), startTime: "09:00", endTime: "17:00", allDay: true },
      ]);
    } catch (err) {
      setTimeOffError(err instanceof Error ? err.message : "Failed");
    } finally {
      setTimeOffSubmitting(false);
    }
  }

  function addTimeOffRange() {
    const last = timeOffRanges[timeOffRanges.length - 1];
    setTimeOffRanges([
      ...timeOffRanges,
      {
        startDate: last?.endDate ?? new Date().toISOString().slice(0, 10),
        endDate: last?.endDate ?? new Date().toISOString().slice(0, 10),
        startTime: "09:00",
        endTime: "17:00",
        allDay: true,
      },
    ]);
  }

  function updateTimeOffRange(idx: number, field: "startDate" | "endDate" | "startTime" | "endTime" | "allDay", value: string | boolean) {
    setTimeOffRanges((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: field === "allDay" ? value : String(value) } : r))
    );
  }

  function removeTimeOffRange(idx: number) {
    if (timeOffRanges.length <= 1) return;
    setTimeOffRanges((prev) => prev.filter((_, i) => i !== idx));
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
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={employees.length === 0}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add hours
          </button>
        )}
        {!isAdmin && effectiveHcpEmployeeId && (
          <button
            type="button"
            onClick={() => setShowTimeOffForm(true)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Request time off
          </button>
        )}
      </div>

      {showTimeOffForm && !isAdmin && (
        <form onSubmit={handleRequestTimeOff} className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Request time off</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Add one or more time ranges. Your admin will receive a notification and can approve or decline.
          </p>
          {timeOffError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{timeOffError}</p>
          )}
          <div className="mt-3 space-y-3">
            {timeOffRanges.map((r, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
                <label className="text-xs">
                  Start date
                  <input
                    type="date"
                    value={r.startDate}
                    onChange={(e) => updateTimeOffRange(idx, "startDate", e.target.value)}
                    required
                    className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <label className="text-xs">
                  End date
                  <input
                    type="date"
                    value={r.endDate}
                    onChange={(e) => updateTimeOffRange(idx, "endDate", e.target.value)}
                    required
                    className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={r.allDay}
                    onChange={(e) => updateTimeOffRange(idx, "allDay", e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-600"
                  />
                  All day
                </label>
                {!r.allDay && (
                  <>
                    <label className="text-xs">
                      Start time
                      <input
                        type="time"
                        value={r.startTime}
                        onChange={(e) => updateTimeOffRange(idx, "startTime", e.target.value)}
                        className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                    </label>
                    <label className="text-xs">
                      End time
                      <input
                        type="time"
                        value={r.endTime}
                        onChange={(e) => updateTimeOffRange(idx, "endTime", e.target.value)}
                        className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                      />
                    </label>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeTimeOffRange(idx)}
                  disabled={timeOffRanges.length <= 1}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addTimeOffRange}
              className="rounded border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Add another request
            </button>
            <button
              type="submit"
              disabled={timeOffSubmitting}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {timeOffSubmitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowTimeOffForm(false);
                setTimeOffError(null);
              }}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {isAdmin && (timeOffLoading || timeOffRequests.length > 0) && (
        <div className="rounded border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <MetricTooltip
              label="Time off requests"
              tooltip="Days and times requested off by employees, with approval status. Approve or decline from the notification bell."
            />
          </h3>
          {timeOffLoading ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Employee</th>
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Dates</th>
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Time</th>
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Status</th>
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {timeOffRequests.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 text-zinc-900 dark:text-zinc-50">{employeeMap[r.hcp_employee_id] ?? r.hcp_employee_id}</td>
                      <td className="py-2 text-zinc-700 dark:text-zinc-300">
                        {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                      </td>
                      <td className="py-2 text-zinc-700 dark:text-zinc-300">
                        {r.start_time || r.end_time ? `${r.start_time ?? "—"} – ${r.end_time ?? "—"}` : "All day"}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            r.status === "approved"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : r.status === "declined"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 max-w-[200px] truncate text-zinc-600 dark:text-zinc-400">{r.admin_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Log hours</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Enter the hours worked for a specific day. No clock in/out times.
          </p>
          {isAdmin && (
            <label className="mt-3 block text-xs">
              Employee
              <select
                value={formEmployeeId}
                onChange={(e) => setFormEmployeeId(e.target.value)}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">Select employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              {submitting ? "Saving..." : "Save"}
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
        <>
          {isAdmin && totalsByEmployee.size > 0 && (
            <div className="rounded border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Totals by employee"
                  tooltip="Sum of hours logged per employee in the selected date range. Used for pay calculation and performance tracking."
                />
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {[...totalsByEmployee.entries()]
                  .sort((a, b) => (employeeMap[a[0]] ?? a[0]).localeCompare(employeeMap[b[0]] ?? b[0]))
                  .map(([empId, hours]) => (
                    <li key={empId} className="flex justify-between gap-4">
                      <span className="text-zinc-600 dark:text-zinc-400">{employeeMap[empId] ?? empId}</span>
                      <span className="font-medium tabular-nums">{hours.toFixed(2)} hrs</span>
                    </li>
                  ))}
                <li className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-medium dark:border-zinc-700">
                  <span>Total</span>
                  <span className="tabular-nums">{grandTotal.toFixed(2)} hrs</span>
                </li>
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  {isAdmin && (
                    <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Employee</th>
                  )}
                  <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Date</th>
                  <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                    <MetricTooltip label="Hours" tooltip="Hours worked for the day (entered by owner/admin). Used for pay calculation." />
                  </th>
                  <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Notes</th>
                  {isAdmin && (
                    <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    {isAdmin && (
                      <td className="py-2 text-zinc-900 dark:text-zinc-50">
                        {e.hcp_employee_id ? (employeeMap[e.hcp_employee_id] ?? e.hcp_employee_id) : "—"}
                      </td>
                    )}
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">{e.entry_date}</td>
                    <td className="py-2">{e.hours ?? "—"}</td>
                    <td className="py-2 max-w-[200px] truncate">{e.notes ?? "—"}</td>
                    {isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
