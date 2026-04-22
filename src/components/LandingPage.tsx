"use client";

import { useState, useEffect } from "react";

const NAV = "#0B1F33";
const OFF_WHITE = "#F8FAFC";
const NAVY_LIGHT = "rgba(11, 31, 51, 0.06)";

/** True when it's 9:00pm–6:00am EST */
function useIsNightShift() {
  const [isNight, setIsNight] = useState(false);
  useEffect(() => {
    const check = () => {
      const hour = parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()),
        10
      );
      setIsNight(hour >= 21 || hour < 6);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);
  return isNight;
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function IconCheck({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconX({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const NIGHT = {
  bg: "#0f172a",
  bgCard: "#1e293b",
  text: "#f8fafc",
  textMuted: "rgba(248,250,252,0.8)",
  border: "rgba(248,250,252,0.12)",
  accent: "#38bdf8",
};

function CtaPrimary({ children, href = "#", night = false }: { children: React.ReactNode; href?: string; night?: boolean }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
      style={{ backgroundColor: night ? NIGHT.accent : NAV }}
    >
      {children}
    </a>
  );
}

function CtaSecondary({ children, href = "#", night = false }: { children: React.ReactNode; href?: string; night?: boolean }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-lg border-2 px-6 py-3 text-sm font-semibold transition hover:opacity-90"
      style={{ borderColor: night ? NIGHT.text : NAV, color: night ? NIGHT.text : NAV, backgroundColor: night ? "transparent" : undefined }}
    >
      {children}
    </a>
  );
}

export function LandingPage() {
  const night = useIsNightShift();
  const bg = night ? NIGHT.bg : OFF_WHITE;
  const text = night ? NIGHT.text : NAV;
  const cardBg = night ? NIGHT.bgCard : "white";
  const border = night ? NIGHT.border : "rgba(11,31,51,0.1)";
  const borderLight = night ? NIGHT.border : "rgba(11,31,51,0.12)";
  const sectionAlt = night ? "rgba(30,41,59,0.5)" : NAVY_LIGHT;
  const heroGradient = night
    ? "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, rgba(56,189,248,0.05) 100%)"
    : "linear-gradient(160deg, #F8FAFC 0%, #F4F6F9 50%, rgba(11,31,51,0.03) 100%)";

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: bg, color: text }}>
      {/* 1. Header / Nav - rendered by AppHeader when on landing */}
      {/* Sections 2–13 are below */}

      {/* 2. Hero */}
      <section
        className="relative overflow-hidden px-6 pt-16 pb-24 md:px-12 lg:px-24"
        style={{ background: heroGradient }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-[3rem]" style={{ color: text }}>
                Know your numbers. Grow with confidence.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-90" style={{ color: text }}>
                A simple analytics dashboard for home service businesses that turns your CRM data into clear insights on revenue, booking rate, conversion rate, average ticket, lead source ROI, and team performance.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <CtaPrimary night={night}>Book a demo</CtaPrimary>
                <CtaSecondary night={night}>Join the waitlist</CtaSecondary>
              </div>
              <p className="mt-4 text-sm opacity-90" style={{ color: text }}>
                Questions?{" "}
                <a
                  href="mailto:support@homeservicesanalytics.com"
                  className="font-medium underline decoration-1 underline-offset-2 hover:opacity-100"
                  style={{ color: text }}
                >
                  support@homeservicesanalytics.com
                </a>
              </p>
              <p className="mt-4 text-sm opacity-75" style={{ color: text }}>
                Built for home service companies that want clarity, accountability, and smarter growth.
              </p>
            </div>
            <div className="relative flex items-center justify-center">
              <div
                className="w-full overflow-hidden rounded-xl border shadow-xl"
                style={{ borderColor: borderLight, backgroundColor: cardBg }}
              >
                <img
                  src="/hero-dashboard.png"
                  alt="Home Services Analytics dashboard showing key metrics and technician KPIs"
                  className="w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Trust strip */}
      <section className="border-y py-6" style={{ borderColor: borderLight, backgroundColor: night ? "rgba(30,41,59,0.3)" : "rgba(11,31,51,0.02)" }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-6 text-center text-sm md:gap-12">
          <span className="font-medium" style={{ color: text }}>Built for home service businesses</span>
          <span className="opacity-70" style={{ color: text }}>Housecall Pro integration available now</span>
          <span className="opacity-70" style={{ color: text }}>Jobber and more integrations coming soon</span>
        </div>
      </section>

      {/* 4. Problem */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Most home service owners are flying blind.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-90" style={{ color: text }}>
            Your CRM collects data, but it usually doesn&apos;t show it in a way that helps you make better decisions. Owners end up digging through reports, guessing at marketing performance, and struggling to clearly see what their CSRs, technicians, and lead sources are actually producing.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Scattered reports", desc: "Your numbers live in too many places and are hard to interpret." },
              { title: "Unclear ROI", desc: "It's difficult to know which lead sources are actually making you money." },
              { title: "Weak accountability", desc: "You can't improve what you can't clearly measure." },
              { title: "Delayed decisions", desc: "By the time you spot a problem, it has already cost you revenue." },
            ].map(({ title, desc }) => (
              <div
                key={title}
                className="rounded-xl border p-6"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                <h3 className="font-semibold" style={{ color: text }}>{title}</h3>
                <p className="mt-2 text-sm opacity-80" style={{ color: text }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Features */}
      <section id="features" className="px-6 py-20 md:px-12 lg:px-24" style={{ backgroundColor: sectionAlt }}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Everything you need to see the health of your business.
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Revenue dashboard — Track revenue by day, week, month, and year.",
              "Booking rate — See how often your office is turning opportunities into booked jobs.",
              "Conversion rate — Measure how well estimates and opportunities turn into revenue.",
              "Average ticket — Understand job value and trends over time.",
              "Lead source ROI — Compare spend and return across your marketing channels.",
              "Technician performance — Track production, efficiency, and revenue metrics by tech.",
              "CSR performance — Monitor booking outcomes and office performance.",
              "Trend visibility — Spot issues early and make decisions faster.",
            ].map((text) => {
              const [title, desc] = text.split(" — ");
              return (
                <div
                  key={title}
                  className="rounded-xl border p-6"
                  style={{ backgroundColor: cardBg, borderColor: border }}
                >
                  <h3 className="font-semibold" style={{ color: text }}>{title}</h3>
                  <p className="mt-2 text-sm opacity-80" style={{ color: text }}>{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. KPI / Insights */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Turn raw CRM data into decisions.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-90" style={{ color: text }}>
            Instead of hunting through reports, get a clean view of the numbers that matter most. See what is improving, what is slipping, and where to focus next.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Which lead sources are generating the best return",
              "Whether your booking rate is rising or falling",
              "Which technicians are driving the most revenue",
              "Whether average ticket is improving",
              "How your team is performing over time",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <IconCheck className="h-5 w-5 shrink-0" />
                <span style={{ color: text }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. Housecall Pro */}
      <section className="px-6 py-20 md:px-12 lg:px-24" style={{ backgroundColor: sectionAlt }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Housecall Pro integration available now.
          </h2>
          <p className="mt-6 text-lg leading-relaxed opacity-90" style={{ color: text }}>
            Connect your Housecall Pro account and start pulling key business data into one dashboard. No more piecing together reports manually.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Pull core business performance data into one place",
              "Track trends over time",
              "View metrics in a cleaner, more actionable format",
              "Build accountability across office and field teams",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <IconCheck className="h-5 w-5 shrink-0" />
                <span style={{ color: text }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. Coming soon integrations */}
      <section id="integrations" className="px-6 py-20 md:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            More integrations are on the way.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed opacity-90" style={{ color: text }}>
            Housecall Pro is live now. Jobber is coming soon, with additional major home service CRMs planned after that.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { name: "Housecall Pro", status: "Available now", available: true },
              { name: "Jobber", status: "Coming soon", available: false },
              { name: "More major CRMs", status: "Planned", available: false },
            ].map(({ name, status, available }) => (
              <div
                key={name}
                className="rounded-xl border p-6"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                <h3 className="font-semibold" style={{ color: text }}>{name}</h3>
                <p className={`mt-1 text-sm ${available ? "font-medium" : "opacity-70"}`} style={{ color: text }}>
                  {status}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. How it works */}
      <section className="px-6 py-20 md:px-12 lg:px-24" style={{ backgroundColor: sectionAlt }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Get set up in three simple steps.
          </h2>
          <div className="mt-12 space-y-8">
            {[
              { step: 1, title: "Connect your CRM", desc: "Start with Housecall Pro today." },
              { step: 2, title: "Sync your business data", desc: "Pull the numbers that matter into one clean dashboard." },
              { step: 3, title: "Track, improve, and grow", desc: "Use real visibility to make smarter business decisions." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-6">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ backgroundColor: night ? NIGHT.accent : NAV }}
                >
                  {step}
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: text }}>{title}</h3>
                  <p className="mt-1 opacity-80" style={{ color: text }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. Pricing */}
      <section id="pricing" className="px-6 py-20 md:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Simple, transparent pricing.
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed opacity-90" style={{ color: text }}>
            Choose the plan that fits your business. Upgrade anytime as you grow.
          </p>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse" style={{ borderColor: borderLight }}>
              <thead>
                <tr>
                  <th className="border-b-2 pb-4 text-left font-semibold" style={{ color: text, borderColor: borderLight }}>Feature</th>
                  <th className="border-b-2 pb-4 text-center font-semibold" style={{ color: text, borderColor: borderLight }}>
                    <div>Base</div>
                    <div className="mt-2 text-2xl" style={{ color: text }}>$39<span className="text-base font-normal opacity-75">/mo</span></div>
                  </th>
                  <th className="border-b-2 pb-4 text-center font-semibold" style={{ color: text, borderColor: borderLight }}>
                    <div>Essential</div>
                    <div className="mt-2 text-2xl" style={{ color: text }}>$199<span className="text-base font-normal opacity-75">/mo</span></div>
                  </th>
                  <th className="border-b-2 pb-4 text-center font-semibold" style={{ color: text, borderColor: borderLight }}>
                    <div>Pro</div>
                    <div className="mt-2 text-2xl" style={{ color: text }}>$499<span className="text-base font-normal opacity-75">/mo</span></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Technician & global insights", base: true, essential: true, pro: true },
                  { feature: "AI-powered suggestions", base: true, essential: true, pro: true },
                  { feature: "Call tracking", base: false, essential: true, pro: true },
                  { feature: "Marketing + SEO insights", base: false, essential: true, pro: true },
                  { feature: "Timesheets & performance pay", base: false, essential: true, pro: true },
                  { feature: "Multiple locations", base: false, essential: false, pro: true },
                  { feature: "Crews", base: false, essential: false, pro: true },
                  { feature: "Salesmen", base: false, essential: false, pro: true },
                  { feature: "Custom integrations", base: false, essential: false, pro: true },
                  { feature: "Exclusive community of elite fast-growing home services business owners", base: false, essential: false, pro: true },
                ].map(({ feature, base, essential, pro }) => (
                  <tr key={feature} className="border-b" style={{ borderColor: border }}>
                    <td className="py-4 pr-4" style={{ color: text }}>{feature}</td>
                    <td className="py-4 text-center">
                      {base ? <IconCheck className="mx-auto h-5 w-5" style={{ color: "#059669" }} /> : <IconX className="mx-auto h-5 w-5 opacity-40" style={{ color: text }} />}
                    </td>
                    <td className="py-4 text-center">
                      {essential ? <IconCheck className="mx-auto h-5 w-5" style={{ color: "#059669" }} /> : <IconX className="mx-auto h-5 w-5 opacity-40" style={{ color: text }} />}
                    </td>
                    <td className="py-4 text-center">
                      {pro ? <IconCheck className="mx-auto h-5 w-5" style={{ color: "#059669" }} /> : <IconX className="mx-auto h-5 w-5 opacity-40" style={{ color: text }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <CtaPrimary href="#" night={night}>Get started — Base</CtaPrimary>
            <CtaPrimary href="#" night={night}>Get started — Essential</CtaPrimary>
            <CtaSecondary href="#" night={night}>Contact for Pro</CtaSecondary>
          </div>
        </div>
      </section>

      {/* 11. Testimonials */}
      <section className="px-6 py-20 md:px-12 lg:px-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Built for operators who care about the numbers.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              "Finally, a dashboard that shows me what actually matters.",
              "This gives us a much clearer picture of booking rate and team performance.",
              "Way easier than trying to piece everything together manually.",
            ].map((quote, i) => (
              <div
                key={i}
                className="rounded-xl border p-6"
                style={{ backgroundColor: cardBg, borderColor: border }}
              >
                <p className="italic opacity-90" style={{ color: text }}>&ldquo;{quote}&rdquo;</p>
                <p className="mt-4 text-sm opacity-60" style={{ color: text }}>— Placeholder testimonial</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 12. FAQ */}
      <section id="faq" className="px-6 py-20 md:px-12 lg:px-24" style={{ backgroundColor: sectionAlt }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            Frequently asked questions
          </h2>
          <dl className="mt-12 space-y-8">
            {[
              { q: "What does the app do?", a: "It gives home service business owners a cleaner, simpler way to track the KPIs that matter most." },
              { q: "Who is it for?", a: "It is designed for home service businesses that want better visibility into revenue, sales, marketing, and team performance." },
              { q: "Which CRMs do you support?", a: "Housecall Pro is supported now. Jobber and additional major CRMs are coming soon." },
              { q: "Do I need to be technical?", a: "No. The goal is to make business analytics easier, not more complicated." },
              { q: "What metrics can I track?", a: "Metrics can include revenue, booking rate, conversion rate, average ticket, lead source ROI, and team performance." },
              { q: "Can I join if my CRM is not supported yet?", a: "Yes. Add a waitlist form for businesses that want updates when new integrations launch." },
            ].map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold" style={{ color: text }}>{q}</dt>
                <dd className="mt-2 opacity-80" style={{ color: text }}>{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 13. Final CTA */}
      <section className="px-6 py-24 md:px-12 lg:px-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl" style={{ color: text }}>
            See your business more clearly.
          </h2>
          <p className="mt-6 text-lg opacity-90" style={{ color: text }}>
            Stop guessing and start managing with better numbers.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <CtaPrimary night={night}>Book a demo</CtaPrimary>
            <CtaSecondary night={night}>Join the waitlist</CtaSecondary>
          </div>
        </div>
      </section>

      {/* 14. Footer */}
      <footer className="border-t px-6 py-12 md:px-12 lg:px-24" style={{ borderColor: borderLight, backgroundColor: sectionAlt }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <p className="font-semibold" style={{ color: text }}>Home Services Analytics</p>
            <p className="mt-1 text-sm opacity-70" style={{ color: text }}>
              Analytics and insights for home service businesses.
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-6 text-sm">
            <a href="#features" className="opacity-80 hover:opacity-100" style={{ color: text }}>Features</a>
            <a href="#pricing" className="opacity-80 hover:opacity-100" style={{ color: text }}>Pricing</a>
            <a href="#integrations" className="opacity-80 hover:opacity-100" style={{ color: text }}>Integrations</a>
            <a href="#faq" className="opacity-80 hover:opacity-100" style={{ color: text }}>FAQ</a>
            <a href="mailto:support@homeservicesanalytics.com" className="opacity-80 hover:opacity-100" style={{ color: text }}>
              Contact
            </a>
            <a href="/privacy" className="opacity-80 hover:opacity-100" style={{ color: text }}>
              Privacy Policy
            </a>
            <a href="/terms" className="opacity-80 hover:opacity-100" style={{ color: text }}>
              Terms of Service
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
