"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PAY_PERIOD_CALENDAR,
  type PayPeriodCalendarSettings,
} from "@/lib/payPeriod";

const DEFAULT_CALENDAR = DEFAULT_PAY_PERIOD_CALENDAR;

/** Loads org pay period weekday + IANA timezone from the server (falls back to UTC / Monday). */
export function usePayPeriodCalendar(): PayPeriodCalendarSettings {
  const [cal, setCal] = useState<PayPeriodCalendarSettings>(DEFAULT_CALENDAR);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/performance-pay/period-settings");
        if (!res.ok) return;
        const data = (await res.json()) as {
          pay_period_start_weekday?: number;
          pay_period_timezone?: string;
          pay_period_anchor_date?: string | null;
        };
        if (cancelled) return;
        const w = data.pay_period_start_weekday;
        const tz = data.pay_period_timezone?.trim();
        const anchorRaw = data.pay_period_anchor_date;
        const anchor =
          anchorRaw != null && String(anchorRaw).trim() !== ""
            ? String(anchorRaw).trim().slice(0, 10)
            : null;
        if (typeof w === "number" && w >= 0 && w <= 6 && tz) {
          setCal((prev) =>
            prev.payPeriodStartWeekday === w &&
            prev.payPeriodTimezone === tz &&
            prev.payPeriodAnchorDate === anchor
              ? prev
              : { payPeriodStartWeekday: w, payPeriodTimezone: tz, payPeriodAnchorDate: anchor }
          );
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return cal;
}
