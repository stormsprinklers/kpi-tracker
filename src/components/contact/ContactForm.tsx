"use client";

import { useState } from "react";
import Link from "next/link";
import { CONTACT_INBOX_EMAIL, SMS_BRAND_NAME, isValidUsPhone } from "@/lib/contact";

const NAV = "#0B1F33";

const TOPIC_OPTIONS = [
  { value: "general", label: "General inquiry" },
  { value: "sales", label: "Sales / demo" },
  { value: "support", label: "Product support" },
  { value: "billing", label: "Billing" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
] as const;

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<(typeof TOPIC_OPTIONS)[number]["value"]>("general");
  const [message, setMessage] = useState("");
  const [smsCustomerCareConsent, setSmsCustomerCareConsent] = useState(false);
  const [smsMarketingConsent, setSmsMarketingConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const phoneTrimmed = phone.trim();
    const smsOptIn = smsCustomerCareConsent || smsMarketingConsent;

    if (phoneTrimmed && !isValidUsPhone(phoneTrimmed)) {
      setError("Enter a valid 10-digit US mobile number, or leave phone blank.");
      return;
    }
    if (smsOptIn && !phoneTrimmed) {
      setError("A mobile phone number is required when opting in to text messages.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          phone: phoneTrimmed || undefined,
          topic,
          message,
          website,
          smsCustomerCareConsent,
          smsMarketingConsent,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send your message");
        setLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  const inputClass =
    "mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

  const checkboxClass = "mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#0B1F33] focus:ring-[#0B1F33]";

  return (
    <div className="w-full max-w-lg rounded-xl border bg-white p-6 shadow-sm md:p-8" style={{ borderColor: "rgba(11,31,51,0.15)" }}>
      {sent ? (
        <div>
          <h2 className="text-lg font-semibold" style={{ color: NAV }}>
            Message sent
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Thanks for reaching out. We will reply to the email you provided as soon as we can.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            <Link href="/" className="font-medium underline hover:opacity-80" style={{ color: NAV }}>
              Back to home
            </Link>
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold" style={{ color: NAV }}>
            Send us a message
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Fill out the form below or email us at{" "}
            <a href={`mailto:${CONTACT_INBOX_EMAIL}`} className="font-medium underline" style={{ color: NAV }}>
              {CONTACT_INBOX_EMAIL}
            </a>
            .
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium" style={{ color: NAV }}>
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium" style={{ color: NAV }}>
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contact-company" className="block text-sm font-medium" style={{ color: NAV }}>
                Company <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="contact-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-sm font-medium" style={{ color: NAV }}>
                Mobile phone <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 555-5555"
                className={inputClass}
              />
            </div>
            <fieldset
              className="rounded-lg border border-slate-200 bg-slate-50/80 p-4"
              aria-describedby="contact-sms-disclosure"
            >
              <legend className="px-1 text-sm font-medium" style={{ color: NAV }}>
                Text message preferences <span className="font-normal text-slate-500">(optional)</span>
              </legend>
              <p id="contact-sms-disclosure" className="mt-1 text-xs leading-relaxed text-slate-600">
                If you provide a mobile number, you may opt in below to receive SMS from {SMS_BRAND_NAME}.
                Message frequency varies. Message and data rates may apply. Reply{" "}
                <span className="font-medium">STOP</span> to opt out or{" "}
                <span className="font-medium">HELP</span> for help. See our{" "}
                <Link href="/privacy" className="underline" style={{ color: NAV }}>
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="underline" style={{ color: NAV }}>
                  Terms of Service
                </Link>
                .
              </p>
              <div className="mt-4 space-y-4">
                <label htmlFor="contact-sms-care" className="flex cursor-pointer gap-3 text-sm leading-relaxed text-slate-700">
                  <input
                    id="contact-sms-care"
                    type="checkbox"
                    checked={smsCustomerCareConsent}
                    onChange={(e) => setSmsCustomerCareConsent(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>
                    I consent to receive informational and customer care text messages from {SMS_BRAND_NAME} at
                    the mobile number provided above, including replies to this inquiry, account updates, and
                    service-related notifications.
                  </span>
                </label>
                <label htmlFor="contact-sms-marketing" className="flex cursor-pointer gap-3 text-sm leading-relaxed text-slate-700">
                  <input
                    id="contact-sms-marketing"
                    type="checkbox"
                    checked={smsMarketingConsent}
                    onChange={(e) => setSmsMarketingConsent(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>
                    I consent to receive marketing and promotional text messages from {SMS_BRAND_NAME} at the
                    mobile number provided above, including product updates, demos, and offers. Consent is not a
                    condition of purchase.
                  </span>
                </label>
              </div>
            </fieldset>
            <div>
              <label htmlFor="contact-topic" className="block text-sm font-medium" style={{ color: NAV }}>
                Topic
              </label>
              <select
                id="contact-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value as (typeof TOPIC_OPTIONS)[number]["value"])}
                className={inputClass}
              >
                {TOPIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium" style={{ color: NAV }}>
                Message
              </label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
                rows={5}
                className={inputClass}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: NAV }}
            >
              {loading ? "Sending…" : "Send message"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
