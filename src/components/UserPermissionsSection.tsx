"use client";

import { useEffect, useState } from "react";
import type { UserPermissions } from "@/lib/db/queries";

interface User {
  id: string;
  email: string;
  role: string;
  hcp_employee_id?: string | null;
  created_at: string;
  permissions: UserPermissions;
}

const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  dashboard: "Dashboard",
  timesheets: "Timesheets",
  call_insights: "CSR call detail pages",
  time_insights: "Time Insights",
  profit: "Profit",
  marketing: "Marketing",
  performance_pay: "Performance Pay",
  users: "Users",
  settings: "Settings",
  billing: "Billing",
  developer_console: "Developer Console",
  can_edit: "Can edit",
};

const PERMISSION_ORDER: (keyof UserPermissions)[] = [
  "dashboard",
  "timesheets",
  "call_insights",
  "time_insights",
  "profit",
  "marketing",
  "performance_pay",
  "users",
  "settings",
  "billing",
  "developer_console",
  "can_edit",
];

export function UserPermissionsSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function fetchUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handlePermissionChange(
    userId: string,
    key: keyof UserPermissions,
    value: boolean
  ) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    setSaving(userId);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = (await res.json()) as UserPermissions;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, permissions: updated } : u))
      );
    } catch {
      alert("Failed to save permissions");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        User permissions
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Control what each user can see. Defaults: technicians = dashboard + timesheets; CSR = + call insights; investor = all (read-only, no settings).
      </p>
      <div className="mt-4 space-y-2">
        {users.map((u) => {
          const isExpanded = expandedId === u.id;
          return (
            <div
              key={u.id}
              className="rounded border border-zinc-200 dark:border-zinc-700"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : u.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:text-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span className="flex items-center gap-2">
                  {u.email}
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
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isExpanded && (
                <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                    {PERMISSION_ORDER.map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={u.permissions?.[key] ?? false}
                          onChange={(e) =>
                            handlePermissionChange(u.id, key, e.target.checked)
                          }
                          disabled={saving === u.id}
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                        {PERMISSION_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No users found.
          </p>
        )}
      </div>
    </section>
  );
}
