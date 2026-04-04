"use client";

import { useCallback, useEffect, useState } from "react";

interface SetupData {
  org: {
    setup_completed: boolean;
    pay_period_start_weekday: number;
    pay_period_timezone?: string;
  };
  roles: { id: string; name: string; source: string }[];
  assignments: { hcp_employee_id: string; role_id: string | null; overridden: boolean }[];
  configs: { scope_type: string; scope_id: string; structure_type: string; config_json: Record<string, unknown>; bonuses_json: Record<string, unknown>[] }[];
  employees: { id: string; name: string; hcpRole: "technician" | "office_staff" }[];
  hcpRoleIds: { technician: string | null; officeStaff: string | null };
}

type StructureType =
  | "pure_hourly"
  | "hourly_commission_tiers"
  | "hourly_to_commission"
  | "pure_commission"
  | "hourly_metrics"
  | "csr_hourly_booking_rate";

const STRUCTURE_LABELS: Record<StructureType, string> = {
  pure_hourly: "Pure hourly",
  hourly_commission_tiers: "Hourly + commission tiers",
  hourly_to_commission: "Base or commission (whichever is higher)",
  pure_commission: "Pure commission",
  hourly_metrics: "Hourly tied to metrics",
  csr_hourly_booking_rate: "CSR base + booking rate increase",
};

const BONUS_TYPES = [
  { type: "5_star_review", label: "5-Star Reviews" },
  { type: "memberships_sold", label: "Memberships Sold" },
  { type: "booking_rate", label: "Booking Rate" },
  { type: "attendance", label: "Attendance" },
  { type: "revenue_per_hour", label: "Revenue per Hour" },
  { type: "avg_billable_hours", label: "Avg Billable Hours" },
] as const;

export function PerformancePayWizard({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [scopeType, setScopeType] = useState<"role" | "employee">("role");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [structureType, setStructureType] = useState<StructureType>("pure_hourly");
  const [selectedBonuses, setSelectedBonuses] = useState<string[]>([]);

  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchSetup = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/performance-pay/setup");
      if (!res.ok) throw new Error("Failed to load setup");
      const data = await res.json();
      setSetup(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetup();
  }, [fetchSetup]);

  if (loading || !setup) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const scopeId = scopeType === "role" ? selectedRoleId : selectedEmployeeId;
  const canProceedStep1 = !!scopeId;
  const canProceedStep2 = true;

  async function handleSave(addAnother: boolean) {
    if (!scopeId) return;
    setSaveError(null);
    setSaveLoading(true);
    try {
      const bonusesJson = selectedBonuses.map((t) => ({ type: t }));
      const res = await fetch("/api/performance-pay/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_type: scopeType,
          scope_id: scopeId,
          structure_type: structureType,
          config_json: config,
          bonuses_json: bonusesJson,
          setup_completed: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (addAnother) {
        setStep(1);
        setScopeType("role");
        setSelectedRoleId(null);
        setSelectedEmployeeId(null);
        setStructureType("pure_hourly");
        setSelectedBonuses([]);
        setConfig({});
        fetchSetup();
      } else {
        onComplete();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex gap-2">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`rounded px-3 py-1 text-sm font-medium ${
              step === s
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            Step {s}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Choose role or employee</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scopeType === "role"}
                onChange={() => {
                  setScopeType("role");
                  setSelectedEmployeeId(null);
                }}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Apply to a role</span>
            </label>
            {scopeType === "role" && (
              <div className="ml-6 flex flex-wrap gap-2">
                {setup.roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      selectedRoleId === r.id
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scopeType === "employee"}
                onChange={() => {
                  setScopeType("employee");
                  setSelectedRoleId(null);
                }}
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Individual employee</span>
            </label>
            {scopeType === "employee" && (
              <div className="ml-6">
                <select
                  value={selectedEmployeeId ?? ""}
                  onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
                  className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Select employee…</option>
                  {setup.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Choose pay structure</h3>
          <div className="space-y-2">
            {(Object.keys(STRUCTURE_LABELS) as StructureType[]).map((st) => (
              <label key={st} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="structure"
                  checked={structureType === st}
                  onChange={() => setStructureType(st)}
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {STRUCTURE_LABELS[st]}
                </span>
              </label>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Add-on bonuses (optional)</p>
            <div className="flex flex-wrap gap-3">
              {BONUS_TYPES.map((b) => (
                <label key={b.type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedBonuses.includes(b.type)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedBonuses((prev) => [...prev, b.type]);
                      else setSelectedBonuses((prev) => prev.filter((x) => x !== b.type));
                    }}
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{b.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">Configure pay details</h3>

          {structureType === "pure_hourly" && (
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400">Hourly rate ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.hourly_rate as number) ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    hourly_rate: e.target.value ? parseFloat(e.target.value) : 0,
                  }))
                }
                className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}

          {structureType === "hourly_commission_tiers" && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Base hourly rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(config.hourly_rate as number) ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      hourly_rate: e.target.value ? parseFloat(e.target.value) : 0,
                    }))
                  }
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Add a single tier for now: min revenue ($), commission %
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Min revenue"
                  value={((config.tiers as { min_revenue?: number }[])?.[0]?.min_revenue) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : 0;
                    setConfig((c) => {
                      const tiers = (c.tiers as { min_revenue?: number; max_revenue?: number; rate_pct?: number }[]) ?? [{ min_revenue: 0, rate_pct: 0 }];
                      tiers[0] = { ...tiers[0], min_revenue: v };
                      return { ...c, tiers };
                    });
                  }}
                  className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Commission %"
                  value={((config.tiers as { rate_pct?: number }[])?.[0]?.rate_pct) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : 0;
                    setConfig((c) => {
                      const tiers = (c.tiers as { min_revenue?: number; max_revenue?: number; rate_pct?: number }[]) ?? [{ min_revenue: 0, rate_pct: 0 }];
                      tiers[0] = { ...tiers[0], rate_pct: v };
                      return { ...c, tiers };
                    });
                  }}
                  className="w-28 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {structureType === "hourly_to_commission" && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Tech earns base hourly or commission on revenue, whichever is higher.
              </p>
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Base hourly rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(config.hourly_rate as number) ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, hourly_rate: e.target.value ? parseFloat(e.target.value) : 0 }))
                  }
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Commission % of revenue</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(config.commission_rate_pct as number) ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      commission_rate_pct: e.target.value ? parseFloat(e.target.value) : 0,
                    }))
                  }
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {structureType === "pure_commission" && (
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400">Commission %</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.commission_rate_pct as number) ?? ""}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    commission_rate_pct: e.target.value ? parseFloat(e.target.value) : 0,
                  }))
                }
                className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          )}

          {structureType === "csr_hourly_booking_rate" && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Base hourly plus increase for booking rate above 50%: +$X/hr per 10% above threshold (prorated).
                Uses 2‑week rolling period.
              </p>
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Base hourly rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(config.base_hourly as number) ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      base_hourly: e.target.value ? parseFloat(e.target.value) : 0,
                    }))
                  }
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Booking rate threshold (%)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="50"
                  value={(config.threshold_pct as number) ?? 50}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      threshold_pct: e.target.value ? parseInt(e.target.value, 10) : 50,
                    }))
                  }
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">$ per hour added per 10% above threshold</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(config.increment_per_10_pct as number) ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      increment_per_10_pct: e.target.value ? parseFloat(e.target.value) : 0,
                    }))
                  }
                  placeholder="2"
                  className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  e.g. 2 → 51% = +$0.20/hr, 60% = +$2/hr
                </p>
              </div>
            </div>
          )}

          {structureType === "hourly_metrics" && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm text-zinc-600 dark:text-zinc-400">Metric</label>
                <select
                  value={(config.metric as string) ?? "revenue_per_hour"}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, metric: e.target.value }))
                  }
                  className="mt-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="revenue_per_hour">Revenue per hour</option>
                  <option value="booking_rate">Booking rate</option>
                </select>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Min value, hourly rate ($)</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Min value"
                  value={((config.tiers as { min_value?: number }[])?.[0]?.min_value) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : 0;
                    setConfig((c) => {
                      const tiers = (c.tiers as { min_value?: number; hourly_rate?: number }[]) ?? [{ min_value: 0, hourly_rate: 0 }];
                      tiers[0] = { ...tiers[0], min_value: v };
                      return { ...c, tiers };
                    });
                  }}
                  className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Hourly $"
                  value={((config.tiers as { hourly_rate?: number }[])?.[0]?.hourly_rate) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? parseFloat(e.target.value) : 0;
                    setConfig((c) => {
                      const tiers = (c.tiers as { min_value?: number; hourly_rate?: number }[]) ?? [{ min_value: 0, hourly_rate: 0 }];
                      tiers[0] = { ...tiers[0], hourly_rate: v };
                      return { ...c, tiers };
                    });
                  }}
                  className="w-28 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saveLoading}
              className="rounded bg-zinc-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-700"
            >
              {saveLoading ? "Saving…" : "Save and add another"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saveLoading}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saveLoading ? "Saving…" : "Finish setup"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
