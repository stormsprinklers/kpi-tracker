"use client";

import { useCallback, useEffect, useState } from "react";
import { PerformancePayWizard } from "@/components/team/PerformancePayWizard";
import { PerformancePayConfigList } from "@/components/team/PerformancePayConfigList";

interface Config {
  scope_type: string;
  scope_id: string;
  structure_type: string;
  config_json: Record<string, unknown>;
  bonuses_json: Record<string, unknown>[];
}

interface SetupData {
  org: { setup_completed: boolean };
  roles: { id: string; name: string }[];
  configs: Config[];
  employees: { id: string; name: string }[];
}

export function PerformancePayPageClient() {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSetup = useCallback(async () => {
    try {
      const res = await fetch("/api/performance-pay/setup");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSetup(data);
    } catch {
      setSetup(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetup();
  }, [fetchSetup]);

  const roleNames = new Map(setup?.roles?.map((r) => [r.id, r.name]) ?? []);
  const employeeNames = new Map(setup?.employees?.map((e) => [e.id, e.name]) ?? []);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  const configs = setup?.configs ?? [];
  const setupComplete = setup?.org?.setup_completed ?? configs.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {showWizard || !setupComplete ? (
        <PerformancePayWizard
          onComplete={() => {
            setShowWizard(false);
            fetchSetup();
          }}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Add pay config
          </button>
        </div>
      )}

      {configs.length > 0 && (
        <PerformancePayConfigList
          configs={configs}
          roleNames={roleNames}
          employeeNames={employeeNames}
          onRefresh={fetchSetup}
        />
      )}
    </div>
  );
}
