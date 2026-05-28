import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact | Home Services Analytics",
  description: "Get in touch with Home Services Analytics — questions, demos, and support.",
};

const NAV = "#0B1F33";
const OFF_WHITE = "#F8FAFC";

export default function ContactPage() {
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: OFF_WHITE, color: NAV }}>
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-12 md:px-8 md:py-16">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Contact us</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            Questions about Home Services Analytics, pricing, or a live walkthrough? We would love to hear from you.
          </p>
        </div>
        <div className="mt-10 w-full flex justify-center">
          <ContactForm />
        </div>
        <p className="mt-8 text-center text-sm text-slate-600">
          <Link href="/" className="font-medium underline hover:opacity-80" style={{ color: NAV }}>
            ← Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
