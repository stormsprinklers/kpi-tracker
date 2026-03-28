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
  org: {
    setup_completed: boolean;
    bonus_per_five_star_review?: number | null;
  };
  roles: { id: string; name: string }[];
  configs: Config[];
  employees: { id: string; name: string }[];
}

export function PerformancePayPageClient() {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fiveStarBonusInput, setFiveStarBonusInput] = useState("");
  const [fiveStarSaving, setFiveStarSaving] = useState(false);
  const [fiveStarError, setFiveStarError] = useState<string | null>(null);
  const [fiveStarSaved, setFiveStarSaved] = useState(false);

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

  useEffect(() => {
    const v = setup?.org?.bonus_per_five_star_review;
    if (typeof v === "number" && !Number.isNaN(v)) {
      setFiveStarBonusInput(String(v));
    } else {
      setFiveStarBonusInput("");
    }
  }, [setup?.org?.bonus_per_five_star_review]);

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

  async function saveFiveStarBonus() {
    setFiveStarError(null);
    setFiveStarSaved(false);
    const trimmed = fiveStarBonusInput.trim();
    let payload: number | null;
    if (trimmed === "") {
      payload = null;
    } else {
      const n = parseFloat(trimmed.replace(/,/g, ""));
      if (Number.isNaN(n) || n < 0) {
        setFiveStarError("Enter a valid dollar amount or leave blank to disable.");
        return;
      }
      payload = n;
    }
    setFiveStarSaving(true);
    try {
      const res = await fetch("/api/performance-pay/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bonus_per_five_star_review: payload,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setFiveStarSaved(true);
      await fetchSetup();
    } catch (e) {
      setFiveStarError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setFiveStarSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Review bonuses
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Flat bonus per <strong>5-star</strong> Google review assigned to an employee in Team →
          Reviews. Counts use the review&apos;s posted date within each pay period. Added automatically
          to expected pay (including Time Insights).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              $ per 5★ review
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={fiveStarBonusInput}
              onChange={(e) => {
                setFiveStarBonusInput(e.target.value);
                setFiveStarSaved(false);
              }}
              className="mt-1 w-36 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveFiveStarBonus()}
            disabled={fiveStarSaving}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {fiveStarSaving ? "Saving…" : "Save"}
          </button>
        </div>
        {fiveStarError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fiveStarError}</p>
        )}
        {fiveStarSaved && !fiveStarError && (
          <p className="mt-2 text-sm text-green-700 dark:text-green-400">Saved.</p>
        )}
      </section>

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
