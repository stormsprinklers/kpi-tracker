/** Heuristic: online scheduler / thank-you views without an explicit `booking` event. */
export function isLikelyBookingCompletionUrl(pageUrl: string | null | undefined): boolean {
  if (!pageUrl?.trim()) return false;
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    return (
      path.includes("/schedule/success") ||
      path.includes("/booking/success") ||
      path.includes("/appointment/confirmed") ||
      path.includes("thank-you") ||
      path.includes("thank_you") ||
      path.includes("/thankyou")
    );
  } catch {
    const low = pageUrl.toLowerCase();
    return (
      low.includes("/schedule/success") ||
      low.includes("/booking/success") ||
      low.includes("/appointment/confirmed") ||
      low.includes("thank-you") ||
      low.includes("thank_you") ||
      low.includes("/thankyou")
    );
  }
}
