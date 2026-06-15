"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Role {
  id: string;
  name: string;
  source?: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  hcpRole: "technician" | "office_staff";
}

interface AssignmentRow {
  hcp_employee_id: string;
  role_id: string | null;
  overridden: boolean;
}

export function PerformancePayRoleAssignmentsSection() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRoleId, setBulkRoleId] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/performance-pay/setup");
      if (!res.ok) throw new Error("Failed to load roster");
      const data = (await res.json()) as {
        roles?: Role[];
        employees?: EmployeeRow[];
        assignments?: AssignmentRow[];
      };
      setRoles(data.roles ?? []);
      setEmployees(data.employees ?? []);
      setAssignments(data.assignments ?? []);
      setBulkRoleId((prev) => {
        if (prev) return prev;
        const tech = data.roles?.find(
          (r) => r.name.toLowerCase() === "technician" && r.source === "hcp"
        );
        return tech?.id ?? data.roles?.[0]?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRoles([]);
      setEmployees([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleNameById = useMemo(
    () => new Map(roles.map((r) => [r.id, r.name])),
    [roles]
  );

  const assignmentByEmployee = useMemo(() => {
    const map = new Map<string, AssignmentRow>();
    for (const a of assignments) {
      map.set(a.hcp_employee_id.trim(), a);
    }
    return map;
  }, [assignments]);

  const filteredEmployees = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = [...employees].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter(
      (e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );
  }, [employees, filter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filteredEmployees.map((e) => e.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function saveAssignments(
    updates: { hcpEmployeeId: string; roleId: string | null }[]
  ) {
    if (updates.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/performance-pay/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: updates.map((u) => ({
            hcpEmployeeId: u.hcpEmployeeId,
            roleId: u.roleId,
            overridden: true,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSuccess(`Updated ${updates.length} assignment(s).`);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function assignSelected() {
    if (!bulkRoleId || selectedIds.size === 0) return;
    await saveAssignments(
      Array.from(selectedIds).map((id) => ({ hcpEmployeeId: id, roleId: bulkRoleId }))
    );
  }

  async function assignOne(employeeId: string, roleId: string | null) {
    await saveAssignments([{ hcpEmployeeId: employeeId, roleId }]);
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Role assignments</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Assign synced Housecall Pro employees to a performance pay role. New field staff are auto-assigned
        to Technician when you sync employees; manual assignments here are preserved. Employees inherit pay
        configs from their role unless they have an individual override config.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">Loading roster…</p>
      ) : employees.length === 0 ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          No synced employees yet. Run Sync employees in Settings → CRM, then return here.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Search
              </label>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name or HCP id"
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Assign selected to
              </label>
              <select
                value={bulkRoleId}
                onChange={(e) => setBulkRoleId(e.target.value)}
                className="mt-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void assignSelected()}
              disabled={saving || selectedIds.size === 0 || !bulkRoleId}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Saving…" : `Assign ${selectedIds.size || ""} selected`.trim()}
            </button>
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded border border-zinc-300 px-2.5 py-1.5 text-xs dark:border-zinc-600"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded border border-zinc-300 px-2.5 py-1.5 text-xs dark:border-zinc-600"
            >
              Clear
            </button>
          </div>

          <div className="mt-4 max-h-80 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="w-10 px-2 py-2" />
                  <th className="px-2 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">HCP default</th>
                  <th className="px-2 py-2 font-medium">Pay role</th>
                  <th className="px-2 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const assign = assignmentByEmployee.get(emp.id);
                  const currentRoleId = assign?.role_id ?? "";
                  const currentRoleName = currentRoleId
                    ? roleNameById.get(currentRoleId) ?? "—"
                    : "Unassigned";
                  return (
                    <tr
                      key={emp.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(emp.id)}
                          onChange={() => toggleSelected(emp.id)}
                          aria-label={`Select ${emp.name}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-zinc-900 dark:text-zinc-100">{emp.name}</td>
                      <td className="px-2 py-2 capitalize text-zinc-600 dark:text-zinc-400">
                        {emp.hcpRole.replace("_", " ")}
                      </td>
                      <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                        {currentRoleName}
                        {assign?.overridden ? (
                          <span className="ml-1 text-xs text-zinc-500">(manual)</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={currentRoleId}
                          onChange={(e) => {
                            const next = e.target.value;
                            void assignOne(emp.id, next ? next : null);
                          }}
                          disabled={saving}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                        >
                          <option value="">Unassigned</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {success && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">{success}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
