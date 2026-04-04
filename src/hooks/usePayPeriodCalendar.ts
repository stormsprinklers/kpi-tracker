"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PAY_PERIOD_START_WEEKDAY,
  DEFAULT_PAY_PERIOD_TIMEZONE,
  type PayPeriodCalendarSettings,
} from "@/lib/payPeriod";

const DEFAULT_CALENDAR: PayPeriodCalendarSettings = {
  payPeriodStartWeekday: DEFAULT_PAY_PERIOD_START_WEEKDAY,
  payPeriodTimezone: DEFAULT_PAY_PERIOD_TIMEZONE,
};

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
        };
        if (cancelled) return;
        const w = data.pay_period_start_weekday;
        const tz = data.pay_period_timezone?.trim();
        if (typeof w === "number" && w >= 0 && w <= 6 && tz) {
          setCal((prev) =>
            prev.payPeriodStartWeekday === w && prev.payPeriodTimezone === tz
              ? prev
              : { payPeriodStartWeekday: w, payPeriodTimezone: tz }
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
