"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  role: string;
  hcp_employee_id?: string | null;
  created_at: string;
}

interface OrgSettings {
  hcp_access_token?: string | null;
  hcp_webhook_secret?: string | null;
  hcp_company_id?: string | null;
}

export function SettingsPageClient({
  organizationId,
  currentUserId,
}: {
  organizationId: string;
  currentUserId: string;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "employee" | "investor">("employee");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [hcpToken, setHcpToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [hcpError, setHcpError] = useState<string | null>(null);
  const [hcpLoading, setHcpLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [csrCandidates, setCsrCandidates] = useState<{ id: string; name: string }[]>([]);
  const [csrSelectedIds, setCsrSelectedIds] = useState<Set<string>>(new Set());
  const [csrSaving, setCsrSaving] = useState(false);

  function fetchUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }

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
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchCsrSelections();
  }, []);

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

  async function handleSaveHcp(e: React.FormEvent) {
    e.preventDefault();
    setHcpError(null);
    setHcpLoading(true);
    try {
      const res = await fetch("/api/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hcp_access_token: hcpToken.trim() || undefined,
          hcp_webhook_secret: webhookSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setHcpError(data.error ?? "Failed to save");
        setHcpLoading(false);
        return;
      }
      setHcpToken("");
      setWebhookSecret("");
    } catch {
      setHcpError("Something went wrong");
    } finally {
      setHcpLoading(false);
    }
  }

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

  async function handleSync() {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error ?? "Sync failed");
      alert("Sync completed");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Users
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Employee users whose email matches a Housecall Pro team member are
          automatically linked for timesheets and other in-app updates.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </th>
                <th className="pb-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                  Role
                </th>
                <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-2 text-zinc-900 dark:text-zinc-50">
                    {u.email}
                  </td>
                  <td className="py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
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
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Linked to HCP
                        </span>
                      )}
                    </span>
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
        <form onSubmit={handleAddUser} className="mt-4 flex flex-wrap gap-3">
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
            {addLoading ? "Adding..." : "Add user"}
          </button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Employee users whose email matches a Housecall Pro team member are
          automatically linked for timesheets and in-app updates.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Employee users whose email matches a Housecall Pro team member are
          automatically linked for timesheets and other in-app updates.
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Employee users whose email matches a Housecall Pro team member are
          automatically linked for timesheets and other in-app updates.
        </p>
        {addError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {addError}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          CSR Selection
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Select which employees appear in CSR KPIs and Call Insights. GHL webhooks match by first name. If empty, office staff role is used.
        </p>
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
                  <span className="text-sm text-zinc-900 dark:text-zinc-50">
                    {c.name}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    ({c.id})
                  </span>
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

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Housecall Pro
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Update access token and webhook secret. Leave blank to keep current.
        </p>
        <form onSubmit={handleSaveHcp} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Access token
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={hcpToken}
              onChange={(e) => setHcpToken(e.target.value)}
              className="mt-1 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Webhook signing secret
            </label>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <strong>Do this first:</strong> In Housecall Pro → My Apps → Webhooks, the signing secret is shown before you add a URL. Copy it, paste here, and Save. Then copy the webhook URL above and add it in HCP. HCP signs the test request with this secret—we need it saved here before HCP tests the URL.
            </p>
            <input
              type="password"
              placeholder="••••••••"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="mt-1 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            disabled={hcpLoading}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {hcpLoading ? "Saving..." : "Save"}
          </button>
        </form>
        {hcpError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {hcpError}
          </p>
        )}
      </section>
    </>
  );
}
