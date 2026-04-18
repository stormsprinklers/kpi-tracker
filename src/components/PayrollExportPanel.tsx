"use client";

import { useCallback, useState } from "react";
import type { ExpectedPayResult } from "@/lib/performancePay";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: ExpectedPayResult[], startDate: string, endDate: string): string {
  const headers = [
    "Employee",
    "Guide",
    "Regular hours",
    "OT hours",
    "Base hourly rate",
    "Hourly rate used for pay",
    "Google reviews",
    "5-star reviews",
    "Review bonus",
    "Commission %",
    "Commission $",
    "Commission in gross",
    "Expected gross pay",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const p = r.payrollExport;
    if (!p) continue;
    lines.push(
      [
        escapeCsvCell(r.employeeName ?? r.hcpEmployeeId),
        escapeCsvCell(p.guide.join(" ")),
        String(p.regularHours),
        String(p.overtimeHours),
        p.baseHourlyRate != null ? String(p.baseHourlyRate) : "",
        p.appliedHourlyRate != null ? String(p.appliedHourlyRate) : "",
        String(p.googleReviewsCount),
        String(p.fiveStarReviewsCount),
        String(p.reviewBonusAmount),
        p.commissionRatePct != null ? String(p.commissionRatePct) : "",
        String(p.commissionDollars),
        p.commissionCountsTowardGross ? "yes" : "no",
        String(r.expectedPay),
      ].join(",")
    );
  }
  return `Payroll summary ${startDate} to ${endDate}\n${lines.join("\n")}`;
}

export function PayrollExportPanel({
  startDate,
  endDate,
  excludeZeroHours,
}: {
  startDate: string;
  endDate: string;
  excludeZeroHours: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExpectedPayResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      params.set("includeTimesheetEmployees", "1");
      const res = await fetch(`/api/performance-pay/expected?${params}`);
      const data = (await res.json()) as { results?: ExpectedPayResult[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      let list = data.results ?? [];
      if (excludeZeroHours) {
        list = list.filter((r) => (typeof r.hoursWorked === "number" ? r.hoursWorked : 0) > 0);
      }
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, excludeZeroHours]);

  const openPanel = () => {
    setOpen(true);
    void load();
  };

  const downloadCsv = () => {
    const csv = toCsv(rows, startDate, endDate);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-export-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openPanel()}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Export payroll summary
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Admin only. Estimated from Performance Pay rules—not payroll advice.
        </p>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:static print:bg-transparent print:p-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payroll-export-title"
        >
          <div className="my-4 w-full max-w-[min(100%,1200px)] rounded-lg border border-zinc-200 bg-white shadow-xl print:my-0 print:max-w-none print:border-0 print:shadow-none dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 print:border-zinc-300 dark:border-zinc-800">
              <div>
                <h2
                  id="payroll-export-title"
                  className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  Payroll summary
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {startDate} → {endDate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={rows.length === 0}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={rows.length === 0}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[min(70vh,800px)] overflow-auto p-4 print:max-h-none print:overflow-visible">
              {loading && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {!loading && !error && rows.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No rows for this range
                  {excludeZeroHours ? " (only employees with hours logged)." : "."}
                </p>
              )}
              {!loading && rows.length > 0 && (
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="sticky top-0 bg-white py-2 pr-3 font-medium dark:bg-zinc-950">
                        Employee
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-3 font-medium dark:bg-zinc-950">
                        Guide
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        Reg hrs
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        OT hrs
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        Base $/hr
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        Pay $/hr
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        Reviews
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        5★ / bonus
                      </th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right font-medium dark:bg-zinc-950">
                        Commission
                      </th>
                      <th className="sticky top-0 bg-white py-2 pl-2 text-right font-medium dark:bg-zinc-950">
                        Gross pay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const p = r.payrollExport;
                      if (!p) return null;
                      const base = p.baseHourlyRate;
                      const appl = p.appliedHourlyRate;
                      return (
                        <tr
                          key={r.hcpEmployeeId}
                          className="border-b border-zinc-100 align-top dark:border-zinc-800"
                        >
                          <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">
                            {r.employeeName ?? r.hcpEmployeeId}
                          </td>
                          <td className="max-w-[min(28rem,40vw)] py-2 pr-3 text-zinc-600 dark:text-zinc-300">
                            <ul className="list-inside list-disc space-y-0.5">
                              {p.guide.map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{p.regularHours.toFixed(2)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{p.overtimeHours.toFixed(2)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {base != null ? formatMoney(base) : "—"}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                            {appl != null ? formatMoney(appl) : "—"}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{p.googleReviewsCount}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {p.fiveStarReviewsCount} / {formatMoney(p.reviewBonusAmount)}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {p.commissionRatePct != null || p.commissionDollars > 0.005 ? (
                              <div
                                className={
                                  p.commissionCountsTowardGross
                                    ? "inline-block rounded-md border-2 border-emerald-500 bg-emerald-50 px-2 py-1 text-right dark:border-emerald-400 dark:bg-emerald-950/40"
                                    : "inline-block rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-right text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300"
                                }
                              >
                                <span className="tabular-nums">
                                  {p.commissionRatePct != null ? `${p.commissionRatePct}%` : "—"} →{" "}
                                  {formatMoney(p.commissionDollars)}
                                </span>
                                {!p.commissionCountsTowardGross && p.commissionDollars > 0.005 && (
                                  <span className="mt-0.5 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                    Not in gross (hourly higher)
                                  </span>
                                )}
                                {p.commissionCountsTowardGross && (
                                  <span className="mt-0.5 block text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                                    In gross pay
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="py-2 pl-2 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                            {formatMoney(r.expectedPay)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
