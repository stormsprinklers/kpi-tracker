"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "twoFactor">("password");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFactorChannel, setTwoFactorChannel] = useState<"sms" | "email" | null>(null);
  const [preferredChannel, setPreferredChannel] = useState<"sms" | "email">("sms");
  const [availableChannels, setAvailableChannels] = useState<Array<"sms" | "email">>([]);
  const [maskedDestination, setMaskedDestination] = useState("");
  const [otp, setOtp] = useState("");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const oauthError = searchParams.get("error");

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, channel: preferredChannel }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        twoFactorRequired?: boolean;
        pendingToken?: string;
        channel?: "sms" | "email";
        availableChannels?: Array<"sms" | "email">;
        maskedDestination?: string;
      };
      if (!r.ok) {
        setError(data.error || "Invalid email or password");
        setLoading(false);
        return;
      }
      if (data.twoFactorRequired && data.pendingToken) {
        setPendingToken(data.pendingToken);
        setTwoFactorChannel(data.channel ?? null);
        setAvailableChannels(Array.isArray(data.availableChannels) ? data.availableChannels : []);
        setMaskedDestination(data.maskedDestination ?? "");
        setStep("twoFactor");
        setOtp("");
        setLoading(false);
        return;
      }
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        twoFactorPendingToken: pendingToken,
        twoFactorCode: otp.trim(),
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Invalid or expired code. Try again or request a new code.");
        setLoading(false);
        return;
      }
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!pendingToken) return;
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/2fa/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(data.error || "Could not resend code");
      }
    } catch {
      setError("Could not resend code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
        <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
          Sign in to Home Services Analytics
        </h1>
        {step === "password" ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your email and password
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter the verification code sent to{" "}
            {twoFactorChannel === "sms" ? "your phone " : ""}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{maskedDestination}</span>
          </p>
        )}
        {step === "password" && oauthError ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            {decodeURIComponent(oauthError.replace(/\+/g, " "))}
          </p>
        ) : null}

        {step === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium"
                style={{ color: "#0B1F33" }}
              >
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
              <label
                htmlFor="password"
                className="block text-sm font-medium"
                style={{ color: "#0B1F33" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label htmlFor="channel" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                Verification method
              </label>
              <select
                id="channel"
                value={preferredChannel}
                onChange={(e) => setPreferredChannel(e.target.value as "sms" | "email")}
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0B1F33" }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTwoFactorSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium" style={{ color: "#0B1F33" }}>
                Verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
                required
                className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder="Enter code"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !otp.trim()}
              className="w-full rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#0B1F33" }}
            >
              {loading ? "Verifying..." : "Verify and sign in"}
            </button>
            <div className="flex flex-col gap-2 text-center text-sm">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleResend()}
                className="font-medium underline hover:opacity-80 disabled:opacity-50"
                style={{ color: "#0B1F33" }}
              >
                Resend code
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Available methods: {availableChannels.length > 0 ? availableChannels.join(", ") : "current method"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep("password");
                  setPendingToken(null);
                  setAvailableChannels([]);
                  setOtp("");
                  setError(null);
                }}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
              >
                Back to email &amp; password
              </button>
            </div>
          </form>
        )}

        {step === "password" ? (
          <p className="mt-4 text-center text-xs text-zinc-500">
            Use email and password so two-factor verification can be enforced at sign in.
          </p>
        ) : null}
        {step === "password" ? (
          <p className="mt-4 text-center text-sm opacity-80" style={{ color: "#0B1F33" }}>
            <a
              href="/forgot-password"
              className="font-medium underline hover:opacity-80"
              style={{ color: "#0B1F33" }}
            >
              Forgot password?
            </a>
          </p>
        ) : null}
        <p className="mt-2 text-center text-sm opacity-80" style={{ color: "#0B1F33" }}>
          First time?{" "}
          <a
            href="/signup"
            className="font-medium underline hover:opacity-80"
            style={{ color: "#0B1F33" }}
          >
            Sign up
          </a>
          {" · "}
          <a
            href="/setup"
            className="font-medium underline hover:opacity-80"
            style={{ color: "#0B1F33" }}
          >
            Set up your organization
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#F8FAFC" }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
