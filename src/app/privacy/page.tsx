import Link from "next/link";

const NAV = "#0B1F33";
const OFF_WHITE = "#F8FAFC";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: OFF_WHITE, color: NAV }}>
      <header className="border-b px-6 py-6 md:px-12" style={{ borderColor: "rgba(11,31,51,0.12)", backgroundColor: OFF_WHITE }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm font-semibold hover:opacity-80" style={{ color: NAV }}>
            Home Services Analytics
          </Link>
          <Link href="/login" className="text-sm opacity-80 hover:opacity-100" style={{ color: NAV }}>
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 md:px-8 md:py-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-sm opacity-80">
          <strong>Effective Date:</strong> April 1, 2026
          <br />
          <strong>Last Updated:</strong> April 1, 2026
        </p>

        <div className="mt-10 max-w-none space-y-8 text-[15px] leading-relaxed text-slate-800 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_a]:text-slate-900 [&_a]:underline">
          <section>
            <h2>1. Introduction</h2>
            <p>
              This Privacy Policy describes how Home Services Analytics (“Company,” “we,” “us,” or “our”) collects, uses,
              discloses, and safeguards information when you access or use our website, applications, and related services
              (collectively, the “Services”).
            </p>
            <p>
              This Privacy Policy is intended to comply with applicable data protection laws and the requirements of
              third-party platforms, including Google and Intuit.
            </p>
            <p>By using the Services, you agree to the collection and use of information in accordance with this Privacy Policy.</p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect only the information necessary to provide and improve the Services.</p>
            <h3>A. Personal Information</h3>
            <ul>
              <li>Name</li>
              <li>Email address</li>
              <li>Phone number (if provided)</li>
              <li>Account credentials</li>
            </ul>
            <h3>B. Business and Financial Data</h3>
            <p>Through authorized integrations (e.g., QuickBooks), we access:</p>
            <ul>
              <li>Transaction data (income, expenses, invoices, payments)</li>
              <li>Chart of accounts</li>
              <li>Financial reports (e.g., profit and loss, balance sheet)</li>
              <li>Customer and vendor data</li>
            </ul>
            <p>
              We access QuickBooks data in a read-only manner unless explicitly authorized by the user, and solely to generate
              financial analytics, reports, and performance insights.
            </p>
            <h3>C. Usage and Technical Data</h3>
            <ul>
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Pages visited and interaction data</li>
              <li>Referring URLs and UTM parameters</li>
              <li>Session timestamps</li>
            </ul>
            <h3>D. Cookies and Tracking Technologies</h3>
            <p>We use cookies and similar technologies to maintain sessions, analyze usage, and improve performance.</p>
          </section>

          <section>
            <h2>3. How We Collect Information</h2>
            <p>We collect information through:</p>
            <ul>
              <li>Direct user input</li>
              <li>Secure OAuth authorization flows</li>
              <li>Automated technologies (cookies, logs)</li>
              <li>Third-party integrations with explicit user consent</li>
            </ul>
          </section>

          <section>
            <h2>4. Authorized Access, Scope Limitation, and Data Minimization</h2>
            <p>
              When you connect third-party services, we request access only to the minimum scopes and data necessary to provide
              the Services.
            </p>
            <p>
              We collect and process only the data required for core functionality and do not collect information unrelated to
              the Services.
            </p>
          </section>

          <section>
            <h2>5. How We Use Information</h2>
            <p>We use information strictly to:</p>
            <ul>
              <li>Provide and maintain the Services</li>
              <li>Generate dashboards, analytics, and financial insights</li>
              <li>Calculate KPIs and performance metrics</li>
              <li>Improve system performance and reliability</li>
              <li>Communicate with users</li>
              <li>Ensure security and prevent fraud</li>
            </ul>
            <p>We do not access or process data beyond what is necessary to provide the Services.</p>
          </section>

          <section>
            <h2>6. Google User Data Compliance</h2>
            <p>
              Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including
              the Limited Use requirements.
            </p>
            <p>Specifically:</p>
            <ul>
              <li>Google user data is used only to provide user-facing features</li>
              <li>Google user data is never used for advertising, marketing profiling, or resale</li>
              <li>Google user data is not transferred to third parties except as necessary to operate the Services</li>
              <li>
                Google user data is not used to develop, improve, or train artificial intelligence (AI) or machine learning
                (ML) models
              </li>
            </ul>
          </section>

          <section>
            <h2>7. Artificial Intelligence and Data Usage</h2>
            <p>
              We do not use customer data, including data obtained through integrations, to train or improve artificial
              intelligence or machine learning models.
            </p>
          </section>

          <section>
            <h2>8. Third-Party Services and Subprocessors</h2>
            <p>We use trusted third-party providers to operate the Services, including but not limited to:</p>
            <ul>
              <li>Hosting: Vercel</li>
              <li>Database: Neon or Supabase</li>
              <li>Communications: Twilio</li>
              <li>Payments: Stripe (if applicable)</li>
            </ul>
            <p>These providers act as subprocessors and are contractually obligated to safeguard data.</p>
            <p>We access third-party platform data (e.g., Google, QuickBooks) only with your explicit authorization.</p>
          </section>

          <section>
            <h2>9. Data Sharing and Disclosure</h2>
            <p>We do not sell, rent, trade, or otherwise monetize personal or financial data.</p>
            <p>We may share data only:</p>
            <ul>
              <li>With service providers necessary to operate the Services</li>
              <li>To comply with legal obligations</li>
              <li>To protect rights, safety, or property</li>
              <li>In connection with a business transaction (e.g., merger or acquisition)</li>
            </ul>
            <p>
              Customer data is processed on a per-account basis and is not combined across users except in aggregated,
              anonymized form.
            </p>
          </section>

          <section>
            <h2>10. Data Retention</h2>
            <p>We retain data only as long as necessary to:</p>
            <ul>
              <li>Provide the Services</li>
              <li>Comply with legal obligations</li>
              <li>Resolve disputes and enforce agreements</li>
            </ul>
          </section>

          <section>
            <h2>11. User Rights and Data Control</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Disconnect integrations at any time</li>
            </ul>
            <p>Users may revoke access at any time through their Google or QuickBooks account settings.</p>
            <p>
              To exercise rights, contact:{" "}
              <a href="mailto:support@homeservicesanalytics.com">support@homeservicesanalytics.com</a>
            </p>
          </section>

          <section>
            <h2>12. Data Deletion</h2>
            <p>You may request deletion by:</p>
            <ul>
              <li>
                Email: <a href="mailto:support@homeservicesanalytics.com">support@homeservicesanalytics.com</a>
              </li>
              <li>
                Web:{" "}
                <a href="https://homeservicesanalytics.com/data-deletion" rel="noopener noreferrer">
                  https://homeservicesanalytics.com/data-deletion
                </a>
              </li>
            </ul>
            <p>We will process requests within a reasonable timeframe, subject to legal obligations.</p>
          </section>

          <section>
            <h2>13. Data Security</h2>
            <p>We implement industry-standard safeguards, including:</p>
            <ul>
              <li>Encryption in transit (TLS/HTTPS)</li>
              <li>Secure API authentication</li>
              <li>Role-based access controls</li>
              <li>Logging and monitoring systems</li>
            </ul>
            <p>While we take reasonable measures, no system is completely secure.</p>
          </section>

          <section>
            <h2>14. Data Breach Notification</h2>
            <p>We will notify affected users of any data breach as required by applicable law.</p>
          </section>

          <section>
            <h2>15. Children’s Privacy</h2>
            <p>The Services are not intended for individuals under 13. We do not knowingly collect data from children.</p>
          </section>

          <section>
            <h2>16. International Data Transfers</h2>
            <p>Data may be processed in the United States or other jurisdictions where our service providers operate.</p>
          </section>

          <section>
            <h2>17. California Privacy Rights (CCPA)</h2>
            <p>California residents may have rights including:</p>
            <ul>
              <li>Access to personal data</li>
              <li>Request deletion of personal data</li>
            </ul>
          </section>

          <section>
            <h2>18. Data Processing Roles</h2>
            <p>We act as:</p>
            <ul>
              <li>A data controller for account and usage data</li>
              <li>A data processor for customer data obtained via integrations</li>
            </ul>
          </section>

          <section>
            <h2>19. Changes to This Privacy Policy</h2>
            <p>We may update this Privacy Policy periodically. Material changes will be communicated where required.</p>
          </section>

          <section>
            <h2>20. Contact Information</h2>
            <p>Home Services Analytics</p>
            <p>
              Email: <a href="mailto:support@homeservicesanalytics.com">support@homeservicesanalytics.com</a>
            </p>
          </section>

          <section>
            <h2>21. Compliance Statement</h2>
            <p>This application complies with applicable platform requirements, including:</p>
            <ul>
              <li>Strict adherence to Google API Limited Use policies</li>
              <li>Secure handling of financial data from QuickBooks</li>
              <li>No sale or unauthorized use of user data</li>
            </ul>
          </section>
        </div>

        <p className="mt-12 flex flex-wrap items-center justify-center gap-4 text-center text-sm opacity-70">
          <Link href="/" className="underline hover:opacity-100">
            ← Back to home
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link href="/terms" className="underline hover:opacity-100">
            Terms of Service
          </Link>
        </p>
      </main>
    </div>
  );
}
