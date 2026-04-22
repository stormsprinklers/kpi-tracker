"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "start", email, password, orgName, phoneE164 }),
      });
      const data = (await res.json()) as {
        error?: string;
        pendingToken?: string;
        maskedEmail?: string;
        maskedPhone?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        setLoading(false);
        return;
      }
      if (!data.pendingToken) {
        setError("Could not start verification. Try again.");
        setLoading(false);
        return;
      }
      setPendingToken(data.pendingToken);
      setMaskedEmail(data.maskedEmail ?? "");
      setMaskedPhone(data.maskedPhone ?? "");
      setLoading(false);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
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
        setError(data.error ?? "Could not finish signup");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
        <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
          Create your account
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create an organization and admin account with required 2FA setup
        </p>
        {success ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-green-600">Account created. Sign in to continue.</p>
            <Link href="/login" className="inline-block text-sm font-medium underline" style={{ color: "#0B1F33" }}>
              Go to sign in
            </Link>
          </div>
        ) : pendingToken ? (
          <form onSubmit={handleComplete} className="mt-6 space-y-4">
            <p className="text-sm text-zinc-600">
              Enter both verification codes sent to <span className="font-medium">{maskedEmail}</span> and{" "}
              <span className="font-medium">{maskedPhone}</span>.
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
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0B1F33" }}
            >
              {loading ? "Verifying..." : "Verify and create account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingToken(null);
                setEmailCode("");
                setSmsCode("");
                setError(null);
              }}
              className="w-full text-sm underline opacity-80 hover:opacity-100"
              style={{ color: "#0B1F33" }}
            >
              Start over
            </button>
          </form>
        ) : (
          <form onSubmit={handleStart} className="mt-6 space-y-4">
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                Organization name
              </label>
              <input
                id="orgName"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
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
              <p className="mt-1 text-xs text-zinc-500">At least 8 characters</p>
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
              <p className="mt-1 text-xs text-zinc-500">Required for SMS verification.</p>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0B1F33" }}
            >
              {loading ? "Sending verification codes..." : "Continue"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm opacity-80" style={{ color: "#0B1F33" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline hover:opacity-80" style={{ color: "#0B1F33" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
