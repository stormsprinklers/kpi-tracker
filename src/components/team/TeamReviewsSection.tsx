"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Candidate {
  id: string;
  name: string;
}

interface ReviewRow {
  review_id: string;
  reviewer_name: string | null;
  star_rating: number | null;
  comment: string | null;
  create_time: string | null;
  update_time: string | null;
  assigned_hcp_employee_id: string | null;
  assigned_hcp_employee_ids?: string[];
}

interface Profile {
  account_id: string | null;
  location_id: string | null;
  location_name: string | null;
  google_account_connected: boolean;
}

interface Payload {
  profile: Profile | null;
  reviews: ReviewRow[];
  candidates: Candidate[];
}

interface CatalogAccount {
  accountId: string;
  accountName: string;
  locations: { locationId: string; title: string }[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export function TeamReviewsSection() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [catalog, setCatalog] = useState<CatalogAccount[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locationNameOverride, setLocationNameOverride] = useState("");

  const [selectedByReview, setSelectedByReview] = useState<Record<string, string>>({});

  const candidateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) m.set(c.id, c.name);
    return m;
  }, [candidates]);

  const locationsForAccount = useMemo(() => {
    if (!selectedAccountId || !catalog) return [];
    const acc = catalog.find((a) => a.accountId === selectedAccountId);
    return acc?.locations ?? [];
  }, [catalog, selectedAccountId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/reviews");
      if (!res.ok) throw new Error("Failed to load reviews");
      const data = (await res.json()) as Payload;
      setProfile(data.profile);
      setReviews(data.reviews ?? []);
      setCandidates(data.candidates ?? []);
      const p = data.profile;
      setSelectedAccountId(p?.account_id?.trim() ?? "");
      setSelectedLocationId(p?.location_id?.trim() ?? "");
      setLocationNameOverride(p?.location_name?.trim() ?? "");
      setSelectedByReview(
        Object.fromEntries(
          (data.reviews ?? []).map((r) => {
            const ids = r.assigned_hcp_employee_ids?.length
              ? r.assigned_hcp_employee_ids
              : r.assigned_hcp_employee_id
                ? [r.assigned_hcp_employee_id]
                : [];
            return [r.review_id, ids.length === 1 ? ids[0] : ""];
          })
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    const reason = params.get("reason");
    if (google === "connected") {
      setSuccess("Google account connected. Choose your Business Profile location below.");
      void fetchData();
    } else if (google === "error") {
      const label =
        reason === "no_refresh_token"
          ? "Google did not return a refresh token. Try again and ensure you grant access when prompted."
          : reason === "invalid_state"
            ? "Session expired. Please try connecting again."
            : reason
              ? `Connection failed (${reason}).`
              : "Connection failed.";
      setError(label);
    }
    if (google) {
      const u = new URL(window.location.href);
      u.searchParams.delete("google");
      u.searchParams.delete("reason");
      window.history.replaceState({}, "", u.pathname + (u.search || ""));
    }
  }, [fetchData]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const res = await fetch("/api/team/reviews/google/catalog");
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        accounts?: CatalogAccount[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load Google locations");
      setCatalog(data.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load locations");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.google_account_connected) return;
    let cancelled = false;
    (async () => {
      setLoadingCatalog(true);
      try {
        const res = await fetch("/api/team/reviews/google/catalog");
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          accounts?: CatalogAccount[];
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load Google locations");
        if (!cancelled) setCatalog(data.accounts ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load locations");
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.google_account_connected]);

  const onAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedLocationId("");
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setSuccess(null);
    const accountId = selectedAccountId.trim();
    const locationId = selectedLocationId.trim();
    const fromCatalog = locationsForAccount.find((l) => l.locationId === locationId);
    const locationName =
      locationNameOverride.trim() ||
      fromCatalog?.title ||
      profile?.location_name ||
      null;
    try {
      const res = await fetch("/api/team/reviews/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          locationId,
          locationName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save profile");
      setSuccess("Business Profile location saved.");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingProfile(false);
    }
  };

  const disconnectGoogle = async () => {
    setDisconnecting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/team/reviews/profile", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect");
      setCatalog(null);
      setSelectedAccountId("");
      setSelectedLocationId("");
      setLocationNameOverride("");
      setSuccess("Google account disconnected.");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const syncReviews = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/team/reviews/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        synced?: number;
        autoAssigned?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const auto =
        typeof data.autoAssigned === "number" && data.autoAssigned > 0
          ? ` Auto-assigned ${data.autoAssigned} review(s).`
          : "";
      setSuccess(`Synced ${data.synced ?? 0} reviews.${auto}`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const assignReview = async (reviewId: string) => {
    const hcpEmployeeId = (selectedByReview[reviewId] ?? "").trim() || null;
    setAssigningId(reviewId);
    setError(null);
    try {
      const res = await fetch(`/api/team/reviews/${encodeURIComponent(reviewId)}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hcpEmployeeId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to assign review");
      setReviews((prev) =>
        prev.map((r) =>
          r.review_id === reviewId
            ? {
                ...r,
                assigned_hcp_employee_id: hcpEmployeeId,
                assigned_hcp_employee_ids: hcpEmployeeId ? [hcpEmployeeId] : [],
              }
            : r
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign review");
    } finally {
      setAssigningId(null);
    }
  };

  const canSaveLocation =
    profile?.google_account_connected &&
    selectedAccountId.trim() &&
    selectedLocationId.trim();

  const canSync =
    profile?.google_account_connected &&
    profile.account_id?.trim() &&
    profile.location_id?.trim();

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Google Business Profile
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Connect the Google account that manages your Business Profile, then pick the location to
          sync reviews. Reviews are fetched with OAuth (not an API key).
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!profile?.google_account_connected ? (
            <a
              href="/api/team/reviews/google/oauth/start"
              className="inline-flex rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Connect Google account
            </a>
          ) : (
            <>
              <span className="text-sm text-green-700 dark:text-green-400">
                Google account connected
              </span>
              <button
                type="button"
                onClick={() => void loadCatalog()}
                disabled={loadingCatalog}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {loadingCatalog ? "Loading locations…" : "Refresh location list"}
              </button>
              <button
                type="button"
                onClick={() => void disconnectGoogle()}
                disabled={disconnecting}
                className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect Google"}
              </button>
            </>
          )}
        </div>

        {profile?.google_account_connected && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Business account</span>
              <select
                value={selectedAccountId}
                onChange={(e) => onAccountChange(e.target.value)}
                disabled={loadingCatalog || !catalog?.length}
                className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">
                  {loadingCatalog ? "Loading…" : catalog?.length ? "Select account" : "No accounts"}
                </option>
                {(catalog ?? []).map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Location</span>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={!selectedAccountId || !locationsForAccount.length}
                className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">
                  {!selectedAccountId
                    ? "Choose an account first"
                    : locationsForAccount.length
                      ? "Select location"
                      : "No locations"}
                </option>
                {locationsForAccount.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-zinc-600 dark:text-zinc-400">
                Display name (optional override)
              </span>
              <input
                value={locationNameOverride}
                onChange={(e) => setLocationNameOverride(e.target.value)}
                placeholder="Defaults to the location title from Google"
                className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={savingProfile || !canSaveLocation}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {savingProfile ? "Saving…" : "Save location"}
          </button>
          <button
            type="button"
            onClick={() => void syncReviews()}
            disabled={syncing || !canSync}
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {syncing ? "Syncing…" : "Sync reviews"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="mt-2 text-sm text-green-700 dark:text-green-400">{success}</p>}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Reviews</h3>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
        ) : reviews.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No synced reviews yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Reviewer</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Stars</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Date</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Comment</th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">
                    Assigned technician(s)
                  </th>
                  <th className="pb-2 font-medium text-zinc-700 dark:text-zinc-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.review_id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      {r.reviewer_name || "Anonymous"}
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-300">
                      {r.star_rating != null ? `${r.star_rating}★` : "—"}
                    </td>
                    <td className="py-2 text-zinc-700 dark:text-zinc-300">
                      {formatDate(r.update_time ?? r.create_time)}
                    </td>
                    <td className="max-w-[320px] py-2 text-zinc-700 dark:text-zinc-300">
                      <span title={r.comment ?? ""} className="line-clamp-2">
                        {r.comment || "—"}
                      </span>
                    </td>
                    <td className="py-2">
                      {(() => {
                        const ids =
                          r.assigned_hcp_employee_ids?.length
                            ? r.assigned_hcp_employee_ids
                            : r.assigned_hcp_employee_id
                              ? [r.assigned_hcp_employee_id]
                              : [];
                        const assignedLabels = ids
                          .map((id) => candidateMap.get(id) ?? id)
                          .filter(Boolean);
                        return (
                          <div className="flex flex-col gap-1">
                            {assignedLabels.length > 1 && (
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {assignedLabels.join(", ")}
                              </span>
                            )}
                            <select
                              value={selectedByReview[r.review_id] ?? ""}
                              onChange={(e) =>
                                setSelectedByReview((prev) => ({
                                  ...prev,
                                  [r.review_id]: e.target.value,
                                }))
                              }
                              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              <option value="">
                                {ids.length > 1 ? "Multiple — choose one to replace all" : "Unassigned"}
                              </option>
                              {candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => assignReview(r.review_id)}
                        disabled={assigningId === r.review_id}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        {assigningId === r.review_id ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reviews.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Unassigned reviews are auto-matched from recent jobs (reviewer vs customer name, then names
            mentioned in the text) on each sync and hourly. Manual selection replaces all auto assignments
            for that review. Assigned counts feed the Technician KPI review metric.
          </p>
        )}
      </section>
    </div>
  );
}
