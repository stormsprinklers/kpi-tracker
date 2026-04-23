"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "investor") return "Investor";
  return "Employee";
}

function JoinForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [orgName, setOrgName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phoneE164, setPhoneE164] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("Missing invitation link.");
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/users/invite/preview?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as { error?: string; orgName?: string; email?: string; role?: string };
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data.error ?? "Invalid or expired invitation.");
          setLoadingPreview(false);
          return;
        }
        setOrgName(data.orgName ?? null);
        setEmail(data.email ?? null);
        setRole(data.role ?? null);
      } catch {
        if (!cancelled) setPreviewError("Could not load invitation.");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirm) {
      setSubmitError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "start", token, password, phoneE164 }),
      });
      const data = (await res.json()) as {
        error?: string;
        pendingToken?: string;
        maskedEmail?: string;
        maskedPhone?: string;
      };
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not accept invitation");
        setSubmitting(false);
        return;
      }
      if (!data.pendingToken) {
        setSubmitError("Could not start verification. Try again.");
        setSubmitting(false);
        return;
      }
      setPendingToken(data.pendingToken);
      setMaskedEmail(data.maskedEmail ?? "");
      setMaskedPhone(data.maskedPhone ?? "");
    } catch {
      setSubmitError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "complete",
          pendingToken,
          emailCode,
          smsCode,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not complete verification");
        setSubmitting(false);
        return;
      }
      setCompleted(true);
      router.replace("/login");
      router.refresh();
    } catch {
      setSubmitError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
        <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
          <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
            Invalid link
          </h1>
          <p className="mt-2 text-sm text-zinc-600">This invitation link is missing a token.</p>
          <Link href="/login" className="mt-4 block text-center text-sm font-medium underline" style={{ color: "#0B1F33" }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loadingPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
        <p className="text-sm text-zinc-600">Loading invitation…</p>
      </div>
    );
  }

  if (previewError || !email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
        <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
          <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
            Invitation unavailable
          </h1>
          <p className="mt-2 text-sm text-zinc-600">{previewError ?? "This link is no longer valid."}</p>
          <Link href="/login" className="mt-4 block text-center text-sm font-medium underline" style={{ color: "#0B1F33" }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
        <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
          Join {orgName ?? "your team"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">{email}</span>
          {role ? (
            <>
              {" "}
              · Role: <span className="font-medium text-zinc-800">{roleLabel(role)}</span>
            </>
          ) : null}
        </p>
        {completed ? (
          <p className="mt-6 text-sm text-green-700">Account created. Redirecting to sign in…</p>
        ) : pendingToken ? (
          <form onSubmit={handleComplete} className="mt-6 space-y-4">
            <p className="text-sm text-zinc-600">
              <span className="font-medium">{maskedEmail}</span> · <span className="font-medium">{maskedPhone}</span>
            </p>
            <div>
              <label htmlFor="emailCode" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                Email code
              </label>
              <input
                id="emailCode"
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label htmlFor="smsCode" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                SMS code
              </label>
              <input
                id="smsCode"
                type="text"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0B1F33" }}
            >
              {submitting ? "Verifying…" : "Verify and join"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleStart} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label htmlFor="phoneE164" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
              Mobile number (E.164)
            </label>
            <input
              id="phoneE164"
              type="tel"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              required
              placeholder="+15551234567"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#0B1F33" }}
          >
            {submitting ? "Sending verification codes…" : "Continue"}
          </button>
        </form>
        )}
        <p className="mt-4 text-center text-sm opacity-80" style={{ color: "#0B1F33" }}>
          <Link href="/login" className="font-medium underline hover:opacity-80" style={{ color: "#0B1F33" }}>
            Already have an account? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#F8FAFC" }}>
          Loading…
        </div>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
