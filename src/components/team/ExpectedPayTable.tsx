"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ExpectedPayResult } from "@/lib/performancePay";
import { MetricTooltip } from "../MetricTooltip";

type ExpectedPayTableProps = {
  /**
   * When both are set, the table uses this range and hides its own date inputs
   * (e.g. Time Insights main date preset).
   */
  syncedStartDate?: string;
  syncedEndDate?: string;
  avgJobsPerDayByEmployee?: Record<string, number>;
  /** Omit rows with no timesheet hours in the selected range (Time Insights). */
  excludeZeroHours?: boolean;
  /**
   * When true, replaces a single Hours column with Reg. hrs and OT hrs (40h per 7-day block within the date range).
   * Used by Time Insights.
   */
  splitRegularOvertimeHours?: boolean;
  /**
   * When true, requests everyone with timesheet rows in range (including employees without a Performance Pay plan).
   * Admin API only; no effect for non-admin sessions.
   */
  includeTimesheetEmployees?: boolean;
  /** Omit rows where expected pay is effectively zero. */
  excludeZeroExpectedPay?: boolean;
  /** Optional map of employee id -> crew name (used for grouped display in Time Insights). */
  crewNameByEmployeeId?: Record<string, string>;
  /** Split field section into stand-alone technicians and crews. */
  splitTechniciansAndCrews?: boolean;
};

function regOtFromResult(r: ExpectedPayResult): { reg: number; ot: number } {
  const p = r.payrollExport;
  if (p) return { reg: p.regularHours, ot: p.overtimeHours };
  const h = typeof r.hoursWorked === "number" && !Number.isNaN(r.hoursWorked) ? r.hoursWorked : 0;
  return { reg: h, ot: 0 };
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function ExpectedPayTableRow({
  r,
  avgJobsPerDayByEmployee,
  splitRegularOvertimeHours,
}: {
  r: ExpectedPayResult;
  avgJobsPerDayByEmployee?: Record<string, number>;
  splitRegularOvertimeHours?: boolean;
}) {
  const { reg, ot } = regOtFromResult(r);
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-2 pl-4 text-zinc-900 dark:text-zinc-50">
        {r.employeeName ?? r.hcpEmployeeId}
      </td>
      {splitRegularOvertimeHours ? (
        <>
          <td className="py-2 pr-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
            {reg.toFixed(2)}
          </td>
          <td className="py-2 pr-6 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
            {ot.toFixed(2)}
          </td>
        </>
      ) : (
        <td className="py-2 pr-6 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
          {r.hoursWorked != null ? r.hoursWorked.toFixed(2) : "—"}
        </td>
      )}
      <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {typeof avgJobsPerDayByEmployee?.[r.hcpEmployeeId] === "number"
          ? avgJobsPerDayByEmployee[r.hcpEmployeeId].toFixed(2)
          : "—"}
      </td>
      <td className="py-2 pl-1 text-zinc-700 dark:text-zinc-300">{r.payTypeLabel ?? "—"}</td>
      <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {formatMoney(r.totalRevenue ?? 0)}
      </td>
      <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {typeof r.reviews === "number" ? r.reviews : 0}
      </td>
      <td className="py-2 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
        {r.effectiveHourlyRate != null ? formatMoney(r.effectiveHourlyRate) : "—"}
      </td>
      <td className="py-2 pr-4 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
        {formatMoney(r.expectedPay)}
      </td>
    </tr>
  );
}

export function ExpectedPayTable({
  syncedStartDate,
  syncedEndDate,
  avgJobsPerDayByEmployee,
  excludeZeroHours = false,
  splitRegularOvertimeHours = false,
  includeTimesheetEmployees = false,
  excludeZeroExpectedPay = false,
  crewNameByEmployeeId,
  splitTechniciansAndCrews = false,
}: ExpectedPayTableProps = {}) {
  const isSynced =
    typeof syncedStartDate === "string" &&
    syncedStartDate.length > 0 &&
    typeof syncedEndDate === "string" &&
    syncedEndDate.length > 0;

  const [results, setResults] = useState<ExpectedPayResult[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getDefaultDates() {
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay();
    const mon = 1;
    let daysBack = (day - mon + 7) % 7;
    if (day < mon) daysBack += 7;
    d.setDate(d.getDate() - daysBack);
    const start = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 13);
    const end = d.toISOString().slice(0, 10);
    return [start, end];
  }

  const fetchExpected = useCallback(async () => {
    let s = isSynced ? syncedStartDate! : startDate;
    let e = isSynced ? syncedEndDate! : endDate;
    if (!s || !e) {
      const [a, b] = getDefaultDates();
      s = a;
      e = b;
      if (!isSynced) {
        setStartDate(a);
        setEndDate(b);
      }
    }
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      if (includeTimesheetEmployees) params.set("includeTimesheetEmployees", "1");
      const res = await fetch(`/api/performance-pay/expected?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load");
      }
      const data = (await res.json()) as { results: ExpectedPayResult[]; startDate: string; endDate: string };
      setResults(data.results ?? []);
      if (!isSynced) {
        setStartDate(data.startDate ?? s);
        setEndDate(data.endDate ?? e);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [isSynced, syncedStartDate, syncedEndDate, startDate, endDate, includeTimesheetEmployees]);

  useEffect(() => {
    fetchExpected();
  }, [fetchExpected]);

  const visibleResults = useMemo(() => {
    return results.filter((r) => {
      if (excludeZeroHours && (typeof r.hoursWorked === "number" ? r.hoursWorked : 0) <= 0) {
        return false;
      }
      if (excludeZeroExpectedPay && Math.abs(r.expectedPay ?? 0) < 0.005) {
        return false;
      }
      return true;
    });
  }, [results, excludeZeroHours, excludeZeroExpectedPay]);

  const { fieldRows, csrRows } = useMemo(() => {
    const field: ExpectedPayResult[] = [];
    const csr: ExpectedPayResult[] = [];
    for (const r of visibleResults) {
      if (r.structureType === "csr_hourly_booking_rate") csr.push(r);
      else field.push(r);
    }
    return { fieldRows: field, csrRows: csr };
  }, [visibleResults]);

  const {
    nonCrewFieldRows,
    crewFieldRowsByName,
    crewFieldNames,
  } = useMemo(() => {
    const nonCrew: ExpectedPayResult[] = [];
    const byCrew = new Map<string, ExpectedPayResult[]>();
    for (const r of fieldRows) {
      const crewName = crewNameByEmployeeId?.[r.hcpEmployeeId];
      if (!crewName) {
        nonCrew.push(r);
        continue;
      }
      const list = byCrew.get(crewName) ?? [];
      list.push(r);
      byCrew.set(crewName, list);
    }
    const names = Array.from(byCrew.keys()).sort((a, b) => a.localeCompare(b));
    return {
      nonCrewFieldRows: nonCrew,
      crewFieldRowsByName: byCrew,
      crewFieldNames: names,
    };
  }, [fieldRows, crewNameByEmployeeId]);

  const totals = useMemo(() => {
    let totalHours = 0;
    let totalReg = 0;
    let totalOt = 0;
    let totalPay = 0;
    for (const r of visibleResults) {
      totalHours += typeof r.hoursWorked === "number" ? r.hoursWorked : 0;
      const { reg, ot } = regOtFromResult(r);
      totalReg += reg;
      totalOt += ot;
      totalPay += typeof r.expectedPay === "number" ? r.expectedPay : 0;
    }
    const blendedEffective =
      totalHours > 0 ? Math.round((totalPay / totalHours) * 100) / 100 : null;
    return { totalHours, totalReg, totalOt, totalPay, blendedEffective };
  }, [visibleResults]);

  const tableColSpan = splitRegularOvertimeHours ? 9 : 8;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Expected pay</h3>
        {!isSynced && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span className="text-zinc-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={fetchExpected}
              disabled={loading || !startDate || !endDate}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading…" : "Apply"}
            </button>
          </div>
        )}
        {isSynced && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {syncedStartDate} → {syncedEndDate}
          </p>
        )}
      </div>
      {error && (
        <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 pl-4 text-left font-medium text-zinc-700 dark:text-zinc-300">
                Employee
              </th>
              {splitRegularOvertimeHours ? (
                <>
                  <th className="pb-2 pr-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                    <MetricTooltip
                      label="Reg. hrs"
                      tooltip="Straight-time from timesheets: up to 40 hours in each consecutive 7-day slice of this date range, starting at range start (same rule as payroll export)."
                    />
                  </th>
                  <th className="pb-2 pr-6 text-right font-medium text-zinc-700 dark:text-zinc-300">
                    <MetricTooltip
                      label="OT hrs"
                      tooltip="Hours beyond 40 in each 7-day slice of this range (from timesheets). Overtime *pay* in Performance Pay still uses Mon–Sun workweeks for hourly-or-commission only."
                    />
                  </th>
                </>
              ) : (
                <th className="pb-2 pr-6 text-right font-medium text-zinc-700 dark:text-zinc-300">
                  <MetricTooltip
                    label="Hours"
                    tooltip="Total hours from timesheets in this period."
                  />
                </th>
              )}
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Avg Jobs/Day"
                  tooltip="Average jobs completed per working day in this pay period."
                />
              </th>
              <th className="pb-2 pl-1 text-left font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Pay type"
                  tooltip="How this period is paid: hourly, commission, or combined structures. For hourly-or-commission plans, shows which side actually pays (higher of the two)."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Total revenue"
                  tooltip="Total technician revenue attributed in this period from Technician KPI calculations."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Reviews"
                  tooltip="Google reviews assigned to this employee in this period."
                />
              </th>
              <th className="pb-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Effective $/hr"
                  tooltip="Expected pay divided by hours worked. Shows — if no hours are logged."
                />
              </th>
              <th className="pb-2 pr-4 text-right font-medium text-zinc-700 dark:text-zinc-300">
                <MetricTooltip
                  label="Expected pay"
                  tooltip="Estimated pay from Performance Pay config: timesheets × rate, revenue × commission, or metrics-based tiers."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {!splitTechniciansAndCrews &&
              fieldRows.map((r) => (
                <ExpectedPayTableRow
                  key={r.hcpEmployeeId}
                  r={r}
                  avgJobsPerDayByEmployee={avgJobsPerDayByEmployee}
                  splitRegularOvertimeHours={splitRegularOvertimeHours}
                />
              ))}
            {splitTechniciansAndCrews && nonCrewFieldRows.length > 0 && (
              <>
                <tr className="border-b border-zinc-200 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <td
                    colSpan={tableColSpan}
                    className="py-2 pl-4 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                  >
                    Technicians
                  </td>
                </tr>
                {nonCrewFieldRows.map((r) => (
                  <ExpectedPayTableRow
                    key={r.hcpEmployeeId}
                    r={r}
                    avgJobsPerDayByEmployee={avgJobsPerDayByEmployee}
                    splitRegularOvertimeHours={splitRegularOvertimeHours}
                  />
                ))}
              </>
            )}
            {splitTechniciansAndCrews && crewFieldNames.length > 0 && (
              <>
                <tr className="border-b border-zinc-200 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <td
                    colSpan={tableColSpan}
                    className="py-2 pl-4 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                  >
                    Crews
                  </td>
                </tr>
                {crewFieldNames.map((crewName) => {
                  const rows = crewFieldRowsByName.get(crewName) ?? [];
                  return (
                    <Fragment key={`crew-group-${crewName}`}>
                      <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/60">
                        <td
                          colSpan={tableColSpan}
                          className="py-2 pl-6 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                        >
                          {crewName}
                        </td>
                      </tr>
                      {rows.map((r) => (
                        <ExpectedPayTableRow
                          key={`${crewName}:${r.hcpEmployeeId}`}
                          r={r}
                          avgJobsPerDayByEmployee={avgJobsPerDayByEmployee}
                          splitRegularOvertimeHours={splitRegularOvertimeHours}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </>
            )}
            {csrRows.length > 0 && (
              <>
                <tr className="border-b border-zinc-200 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-800/80">
                  <td
                    colSpan={tableColSpan}
                    className="py-2 pl-4 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                  >
                    Office staff (CSR pay)
                  </td>
                </tr>
                {csrRows.map((r) => (
                  <ExpectedPayTableRow
                    key={r.hcpEmployeeId}
                    r={r}
                    avgJobsPerDayByEmployee={avgJobsPerDayByEmployee}
                    splitRegularOvertimeHours={splitRegularOvertimeHours}
                  />
                ))}
              </>
            )}
          </tbody>
          {visibleResults.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-zinc-50/80 dark:border-zinc-600 dark:bg-zinc-900/80">
                <td className="py-2.5 pl-4 font-semibold text-zinc-900 dark:text-zinc-50">
                  Total
                </td>
                {splitRegularOvertimeHours ? (
                  <>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {totals.totalReg.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-6 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {totals.totalOt.toFixed(2)}
                    </td>
                  </>
                ) : (
                  <td className="py-2.5 pr-6 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {totals.totalHours.toFixed(2)}
                  </td>
                )}
                <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  —
                </td>
                <td className="py-2.5 pl-1" />
                <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatMoney(
                    visibleResults.reduce((sum, r) => sum + (typeof r.totalRevenue === "number" ? r.totalRevenue : 0), 0)
                  )}
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {visibleResults.reduce((sum, r) => sum + (typeof r.reviews === "number" ? r.reviews : 0), 0)}
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {totals.blendedEffective != null ? formatMoney(totals.blendedEffective) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatMoney(totals.totalPay)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {visibleResults.length === 0 && !loading && !error && (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {(excludeZeroHours || excludeZeroExpectedPay) && results.length > 0
            ? "No employees matching the current Time Insights filters."
            : "No expected pay data for this period. Set up Performance Pay first."}
        </p>
      )}
    </div>
  );
}
