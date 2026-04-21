"use client";

import { useCallback, useEffect, useState } from "react";
import type { CrewMemberRow, CrewWithMembersRow } from "@/lib/db/queries";

interface OrgUser {
  id: string;
  email: string;
  role: string;
  hcp_employee_id: string | null;
}

export function CrewsManagementClient() {
  const [crews, setCrews] = useState<CrewWithMembersRow[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editCrewId, setEditCrewId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [foremanUserId, setForemanUserId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, uRes] = await Promise.all([fetch("/api/crews"), fetch("/api/users")]);
      if (!cRes.ok) throw new Error("Failed to load crews");
      if (!uRes.ok) throw new Error("Failed to load users");
      const cData = (await cRes.json()) as { crews?: CrewWithMembersRow[] };
      const uData = (await uRes.json()) as OrgUser[];
      setCrews(cData.crews ?? []);
      setUsers(Array.isArray(uData) ? uData : []);
    } catch {
      setError("Could not load data.");
      setCrews([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setMode("create");
    setEditCrewId(null);
    setName("");
    setForemanUserId("");
    setSelectedMemberIds(new Set());
  }

  function startEdit(crew: CrewWithMembersRow) {
    setMode("edit");
    setEditCrewId(crew.id);
    setName(crew.name);
    setForemanUserId(crew.foremanUserId);
    setSelectedMemberIds(new Set(crew.members.map((m) => m.userId)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleMember(userId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !foremanUserId) {
      setError("Crew name and foreman are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const memberUserIds = Array.from(selectedMemberIds);
      if (mode === "create") {
        const res = await fetch("/api/crews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), foremanUserId, memberUserIds }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Create failed");
      } else if (editCrewId) {
        const res = await fetch(`/api/crews/${editCrewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            foremanUserId,
            memberUserIds,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this crew? Dashboard rollups will remove it.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/crews/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      if (editCrewId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function memberSummary(members: CrewMemberRow[]): string {
    if (members.length === 0) return "No members selected";
    return members.map((m) => m.email).join(", ");
  }

  const sortedUsers = [...users].sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {mode === "create" ? "Create crew" : "Edit crew"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Name the crew, choose a foreman, and select users to include. KPIs on the home dashboard roll up paid revenue,
          conversion, rev/hour, and avg ticket across everyone in the crew who has a linked Housecall Pro employee id
          (including the foreman when linked).
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="crew-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Crew name
            </label>
            <input
              id="crew-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full max-w-md rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="e.g. Crew A — North route"
            />
          </div>
          <div>
            <label htmlFor="crew-foreman" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Foreman
            </label>
            <select
              id="crew-foreman"
              value={foremanUserId}
              onChange={(e) => setForemanUserId(e.target.value)}
              required
              className="mt-1 w-full max-w-md rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Select user…</option>
              {sortedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                  {u.hcp_employee_id ? " (HCP linked)" : ""} — {u.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Crew members</span>
            <p className="mt-0.5 text-xs text-zinc-500">
              Check each user who belongs in this crew. Their linked technician IDs are combined for dashboard totals.
            </p>
            <div className="mt-2 max-h-48 overflow-y-auto rounded border border-zinc-200 p-2 dark:border-zinc-700">
              {sortedUsers.length === 0 ? (
                <p className="text-sm text-zinc-500">No users in organization.</p>
              ) : (
                <ul className="space-y-1.5">
                  {sortedUsers.map((u) => (
                    <li key={u.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/80">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(u.id)}
                          onChange={() => toggleMember(u.id)}
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                        <span className="text-sm text-zinc-900 dark:text-zinc-100">{u.email}</span>
                        <span className="text-xs text-zinc-500">{u.role}</span>
                        {!u.hcp_employee_id && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">(no HCP id)</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving…" : mode === "create" ? "Create crew" : "Save changes"}
            </button>
            {mode === "edit" && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Your crews</h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500">Loading…</p>
        ) : crews.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No crews yet. Create one above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {crews.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700 dark:bg-zinc-900/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{c.name}</h3>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      Foreman: <span className="font-medium">{c.foremanEmail}</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Members: {memberSummary(c.members)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="text-sm font-medium text-zinc-700 underline hover:no-underline dark:text-zinc-300"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
