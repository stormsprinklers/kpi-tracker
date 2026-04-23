"use client";

import { useCallback, useEffect, useState } from "react";
import type { EmployeeInviteCandidate } from "@/lib/db/queries";

interface User {
  id: string;
  email: string;
  role: string;
  hcp_employee_id?: string | null;
  created_at: string;
}

export function UsersManagementSection({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "employee" | "salesman" | "investor">("employee");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee" | "salesman" | "investor">("employee");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [candidates, setCandidates] = useState<EmployeeInviteCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [selectedInviteEmails, setSelectedInviteEmails] = useState<Set<string>>(new Set());
  const [bulkInviteLoading, setBulkInviteLoading] = useState(false);
  const [bulkInviteSummary, setBulkInviteSummary] = useState<string | null>(null);

  function fetchUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }

  const fetchInviteCandidates = useCallback(() => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    fetch("/api/users/invite/candidates")
      .then(async (res) => {
        const data = (await res.json()) as { candidates?: EmployeeInviteCandidate[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        const list = data.candidates ?? [];
        setCandidates(list);
        const inviteable = new Set<string>();
        for (const c of list) {
          if (c.email && !c.alreadyInOrg && !c.missingEmail) inviteable.add(c.email);
        }
        setSelectedInviteEmails(inviteable);
      })
      .catch(() => {
        setCandidates([]);
        setCandidatesError("Could not load Housecall Pro directory for invites.");
        setSelectedInviteEmails(new Set());
      })
      .finally(() => setCandidatesLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchInviteCandidates();
  }, [fetchInviteCandidates]);

  function isInviteable(c: EmployeeInviteCandidate): boolean {
    return Boolean(c.email && !c.alreadyInOrg && !c.missingEmail);
  }

  function toggleInviteEmail(email: string, checked: boolean) {
    setSelectedInviteEmails((prev) => {
      const next = new Set(prev);
      if (checked) next.add(email);
      else next.delete(email);
      return next;
    });
  }

  function selectAllInviteable() {
    const next = new Set<string>();
    for (const c of candidates) {
      if (isInviteable(c) && c.email) next.add(c.email);
    }
    setSelectedInviteEmails(next);
  }

  function clearInviteSelection() {
    setSelectedInviteEmails(new Set());
  }

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    setBulkInviteSummary(null);
    setInviteLoading(true);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to send invitation");
        setInviteLoading(false);
        return;
      }
      setInviteSuccess(data.message ?? "Invitation sent.");
      setInviteEmail("");
      setInviteRole("employee");
      fetchInviteCandidates();
      fetchUsers();
    } catch {
      setInviteError("Something went wrong");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleBulkInvite() {
    const emails = Array.from(selectedInviteEmails);
    if (emails.length === 0) {
      setInviteError("Select at least one person with a valid email who is not already in the organization.");
      return;
    }
    setInviteError(null);
    setInviteSuccess(null);
    setBulkInviteSummary(null);
    setBulkInviteLoading(true);
    const failures: string[] = [];
    let ok = 0;
    try {
      for (const email of emails) {
        const res = await fetch("/api/users/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role: inviteRole }),
        });
        const data = (await res.json()) as { error?: string };
        if (res.ok) ok += 1;
        else failures.push(`${email}: ${data.error ?? "failed"}`);
      }
      if (failures.length === 0) {
        setBulkInviteSummary(`Sent ${ok} invitation${ok === 1 ? "" : "s"}.`);
        setInviteSuccess(null);
      } else {
        setBulkInviteSummary(
          `Sent ${ok}; ${failures.length} failed. ${failures.slice(0, 5).join(" · ")}${failures.length > 5 ? " …" : ""}`
        );
      }
      fetchInviteCandidates();
      fetchUsers();
    } catch {
      setInviteError("Bulk invite failed unexpectedly.");
    } finally {
      setBulkInviteLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail,
          password: addPassword,
          role: addRole,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add user");
        setAddLoading(false);
        return;
      }
      setAddEmail("");
      setAddPassword("");
      setAddRole("employee" as const);
      fetchUsers();
    } catch {
      setAddError("Something went wrong");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveUser(id: string) {
    if (!confirm("Remove this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "Failed to remove user");
        return;
      }
      fetchUsers();
    } catch {
      alert("Something went wrong");
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Users</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Add, remove, and manage users. Change user info here.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Email</th>
              <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Role</th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-2 text-zinc-900 dark:text-zinc-50">{u.email}</td>
                <td className="py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      u.role === "admin"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                        : u.role === "investor"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {u.role}
                  </span>
                  {(u.role === "employee" || u.role === "salesman") && u.hcp_employee_id && (
                    <span className="ml-1.5 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Linked to HCP
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(u.id)}
                      className="text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Invite by email</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Sends an invitation from Home Services Analytics (same sender as pulse emails). They choose a password to join your organization.
        </p>

        <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          From Housecall Pro
        </h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Employees and pros synced from HCP with an email on file. People already in this organization are unchecked. Eligible addresses are pre-selected.
        </p>
        {candidatesLoading ? (
          <p className="mt-3 text-sm text-zinc-500">Loading directory…</p>
        ) : candidatesError ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">{candidatesError}</p>
        ) : candidates.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No employees or pros found. Connect Housecall Pro and run a sync to load people here.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAllInviteable}
                className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Select all eligible
              </button>
              <button
                type="button"
                onClick={clearInviteSelection}
                className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Clear selection
              </button>
              <span className="text-xs text-zinc-500">
                {selectedInviteEmails.size} selected
              </span>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                  <tr className="border-b border-zinc-200 text-left dark:border-zinc-700">
                    <th className="w-8 px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400" />
                    <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">Email</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
                    <th className="px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const eligible = isInviteable(c);
                    const email = c.email ?? "";
                    return (
                      <tr
                        key={c.hcpEmployeeId}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="px-2 py-1.5 align-top">
                          <input
                            type="checkbox"
                            disabled={!eligible}
                            checked={eligible && selectedInviteEmails.has(email)}
                            onChange={(e) => eligible && toggleInviteEmail(email, e.target.checked)}
                            className="rounded border-zinc-300 dark:border-zinc-600"
                            aria-label={`Invite ${c.displayName}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-zinc-900 dark:text-zinc-100">{c.displayName}</td>
                        <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                          {c.email ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 capitalize text-zinc-500">{c.source}</td>
                        <td className="px-2 py-1.5 text-zinc-500">
                          {c.alreadyInOrg
                            ? "Already a user"
                            : c.missingEmail
                              ? "No email in HCP"
                              : "Eligible"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="bulk-invite-role" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Role for selected
                </label>
                <select
                  id="bulk-invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "employee" | "salesman" | "investor")}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="employee">Employee</option>
                  <option value="salesman">Salesman</option>
                  <option value="admin">Admin</option>
                  <option value="investor">Investor</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleBulkInvite()}
                disabled={bulkInviteLoading || selectedInviteEmails.size === 0}
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {bulkInviteLoading
                  ? "Sending…"
                  : `Send ${selectedInviteEmails.size} invitation${selectedInviteEmails.size === 1 ? "" : "s"}`}
              </button>
            </div>
            {bulkInviteSummary && (
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{bulkInviteSummary}</p>
            )}
          </>
        )}

        <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Other email
        </h4>
        <form onSubmit={handleInviteUser} className="mt-2 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label htmlFor="invite-email" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "employee" | "salesman" | "investor")}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="employee">Employee</option>
              <option value="salesman">Salesman</option>
              <option value="admin">Admin</option>
              <option value="investor">Investor</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviteLoading}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {inviteLoading ? "Sending…" : "Send invitation"}
          </button>
        </form>
        {inviteError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{inviteError}</p>
        )}
        {inviteSuccess && (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{inviteSuccess}</p>
        )}
      </div>

      <h3 className="mt-8 text-sm font-medium text-zinc-800 dark:text-zinc-200">Add with password</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Creates the account immediately. Share the password with the user outside the app.
      </p>
      <form onSubmit={handleAddUser} className="mt-3 flex flex-wrap gap-3">
        <input
          type="email"
          placeholder="Email"
          value={addEmail}
          onChange={(e) => setAddEmail(e.target.value)}
          required
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <input
          type="password"
          placeholder="Password"
          value={addPassword}
          onChange={(e) => setAddPassword(e.target.value)}
          required
          minLength={8}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <select
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as "admin" | "employee" | "salesman" | "investor")}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="employee">Employee</option>
          <option value="salesman">Salesman</option>
          <option value="admin">Admin</option>
          <option value="investor">Investor</option>
        </select>
        <button
          type="submit"
          disabled={addLoading}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {addLoading ? "Adding…" : "Add user"}
        </button>
      </form>
      {addError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p>
      )}
    </section>
  );
}
