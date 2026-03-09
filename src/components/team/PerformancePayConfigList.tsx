"use client";

import { useCallback, useEffect, useState } from "react";

interface Config {
  scope_type: string;
  scope_id: string;
  structure_type: string;
  config_json: Record<string, unknown>;
  bonuses_json: Record<string, unknown>[];
}

const STRUCTURE_LABELS: Record<string, string> = {
  pure_hourly: "Pure hourly",
  hourly_commission_tiers: "Hourly + commission tiers",
  hourly_to_commission: "Hourly → commission",
  pure_commission: "Pure commission",
  hourly_metrics: "Hourly tied to metrics",
};

export function PerformancePayConfigList({
  configs,
  roleNames,
  employeeNames,
  onEdit,
  onDelete,
  onRefresh,
}: {
  configs: Config[];
  roleNames: Map<string, string>;
  employeeNames: Map<string, string>;
  onEdit?: (config: Config) => void;
  onDelete?: (config: Config) => void;
  onRefresh: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(config: Config) {
    const key = `${config.scope_type}:${config.scope_id}`;
    if (!confirm("Remove this pay config?")) return;
    setDeleting(key);
    try {
      const res = await fetch(
        `/api/performance-pay/config?scope_type=${encodeURIComponent(config.scope_type)}&scope_id=${encodeURIComponent(config.scope_id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "Failed to delete");
        return;
      }
      onRefresh();
      onDelete?.(config);
    } catch {
      alert("Something went wrong");
    } finally {
      setDeleting(null);
    }
  }

  function getScopeLabel(c: Config): string {
    if (c.scope_type === "role") return roleNames.get(c.scope_id) ?? c.scope_id;
    return employeeNames.get(c.scope_id) ?? c.scope_id;
  }

  if (configs.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Existing pay configs</h3>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {configs.map((c) => {
          const key = `${c.scope_type}:${c.scope_id}`;
          const label = getScopeLabel(c);
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {c.scope_type === "role" ? "Role" : "Employee"}: {label}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {STRUCTURE_LABELS[c.structure_type] ?? c.structure_type}
                </p>
              </div>
              <div className="flex gap-2">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(c)}
                    className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(c)}
                  disabled={deleting === key}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  {deleting === key ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
