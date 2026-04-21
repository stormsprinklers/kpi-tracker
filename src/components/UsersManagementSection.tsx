"use client";

import { useEffect, useState } from "react";

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
  const [addRole, setAddRole] = useState<"admin" | "employee" | "investor">("employee");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee" | "investor">("employee");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  function fetchUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
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
    } catch {
      setInviteError("Something went wrong");
    } finally {
      setInviteLoading(false);
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
                  {u.role === "employee" && u.hcp_employee_id && (
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
        <form onSubmit={handleInviteUser} className="mt-3 flex flex-wrap items-end gap-3">
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
              onChange={(e) => setInviteRole(e.target.value as "admin" | "employee" | "investor")}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="employee">Employee</option>
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
          onChange={(e) => setAddRole(e.target.value as "admin" | "employee" | "investor")}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="employee">Employee</option>
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
