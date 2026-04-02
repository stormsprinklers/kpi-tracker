import Link from "next/link";

const NAV = "#0B1F33";
const OFF_WHITE = "#F8FAFC";

export default function TermsOfServicePage() {
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
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Terms of Service (End User License Agreement)
        </h1>
        <p className="mt-4 text-sm opacity-80">
          <strong>Effective Date:</strong> April 1, 2026
          <br />
          <strong>Last Updated:</strong> April 1, 2026
        </p>

        <div className="mt-10 max-w-none space-y-8 text-[15px] leading-relaxed text-slate-800 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_a]:text-slate-900 [&_a]:underline [&_strong]:font-semibold">
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              These Terms of Service (“Terms”) constitute a legally binding agreement between you (“User,” “you,” or “your”)
              and <strong>Home Services Analytics</strong> (“Company,” “we,” “us,” or “our”) governing your access to and
              use of our website, applications, and related services (collectively, the “Services”).
            </p>
            <p>
              By accessing or using the Services, you agree to be bound by these Terms. If you do not agree, you must not
              use the Services.
            </p>
          </section>

          <section>
            <h2>2. Definitions</h2>
            <ul>
              <li>
                <strong>“Services”</strong> means the Company’s software platform, including dashboards, analytics tools,
                integrations, and related features.
              </li>
              <li>
                <strong>“User Data”</strong> means any data provided by you or accessed through authorized integrations.
              </li>
              <li>
                <strong>“Third-Party Services”</strong> means external platforms integrated with the Services, including
                but not limited to Intuit and Google.
              </li>
            </ul>
          </section>

          <section>
            <h2>3. Description of Services</h2>
            <p>
              Home Services Analytics provides analytics, reporting, and performance insights for home service businesses
              using integrated data sources.
            </p>
            <p>The Services are provided for informational and operational purposes only and do not constitute professional advice.</p>
          </section>

          <section>
            <h2>4. Eligibility</h2>
            <p>You must be at least 18 years old and capable of entering into a legally binding agreement.</p>
          </section>

          <section>
            <h2>5. Account Registration and Security</h2>
            <p>You agree to:</p>
            <ul>
              <li>Provide accurate and complete information</li>
              <li>Maintain the confidentiality of credentials</li>
              <li>Accept responsibility for all account activity</li>
            </ul>
          </section>

          <section>
            <h2>6. License Grant</h2>
            <p>
              Subject to these Terms, the Company grants you a limited, non-exclusive, non-transferable, non-sublicensable,
              revocable license to use the Services for internal business purposes.
            </p>
            <p>You may not:</p>
            <ul>
              <li>Copy, modify, or distribute the Services</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Use the Services to build a competing product</li>
              <li>Use the Services for unlawful purposes</li>
            </ul>
          </section>

          <section>
            <h2>7. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Attempt unauthorized access to systems or data</li>
              <li>Interfere with or disrupt the integrity of the Services</li>
              <li>Upload or transmit malicious code</li>
              <li>Scrape, extract, or harvest data at scale</li>
              <li>Use the Services to replicate or compete with the platform</li>
            </ul>
          </section>

          <section>
            <h2>8. Third-Party Integrations and Data</h2>
            <p>The Services integrate with Third-Party Services.</p>
            <p>By connecting integrations:</p>
            <ul>
              <li>You authorize access via secure OAuth protocols</li>
              <li>You grant access only to approved scopes</li>
            </ul>
            <p>The Company does not control Third-Party Services and is not responsible for:</p>
            <ul>
              <li>Data accuracy or completeness</li>
              <li>Service availability or interruptions</li>
              <li>Changes to third-party APIs</li>
            </ul>
            <p>
              The Company does not guarantee the accuracy, completeness, or timeliness of data obtained from Third-Party
              Services.
            </p>
          </section>

          <section>
            <h2>9. Data Usage and Restrictions</h2>
            <p>
              We process User Data solely as described in our{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
            <p>We do not:</p>
            <ul>
              <li>Sell or monetize user data</li>
              <li>Use data for advertising</li>
              <li>Use data to train artificial intelligence or machine learning models</li>
            </ul>
            <p>Google user data is handled in accordance with the Google API Services User Data Policy.</p>
          </section>

          <section>
            <h2>10. Financial and Analytical Disclaimer</h2>
            <p>The Services provide analytics and informational outputs only.</p>
            <p>You acknowledge and agree that:</p>
            <ul>
              <li>The Services are not a substitute for professional accounting, tax, or legal advice</li>
              <li>Data may be incomplete, delayed, or inaccurate</li>
              <li>You will not rely solely on the Services for financial or business decisions</li>
            </ul>
            <p>You are solely responsible for verifying information and making decisions.</p>
          </section>

          <section>
            <h2>11. Service Availability</h2>
            <p>The Company does not guarantee that the Services will be uninterrupted, secure, or error-free.</p>
          </section>

          <section>
            <h2>12. Beta Features</h2>
            <p>
              From time to time, the Company may offer beta or experimental features. Such features are provided “as is”
              and may be modified or discontinued at any time.
            </p>
          </section>

          <section>
            <h2>13. No Warranty</h2>
            <p>
              To the fullest extent permitted by law, the Services are provided “as is” and “as available” without warranties
              of any kind, including:
            </p>
            <ul>
              <li>Accuracy or reliability</li>
              <li>Availability or uptime</li>
              <li>Fitness for a particular purpose</li>
            </ul>
          </section>

          <section>
            <h2>14. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law:</p>
            <p>
              The Company shall not be liable for any indirect, incidental, special, consequential, or punitive damages,
              including:
            </p>
            <ul>
              <li>Loss of profits</li>
              <li>Loss of data</li>
              <li>Loss of goodwill</li>
              <li>Business interruption</li>
            </ul>
            <p>even if the Company has been advised of the possibility of such damages.</p>
            <p>
              The Company’s total liability shall not exceed the amount paid by you for the Services in the twelve (12)
              months preceding the claim.
            </p>
          </section>

          <section>
            <h2>15. Indemnification</h2>
            <p>You agree to indemnify and hold harmless the Company from any claims, damages, or liabilities arising from:</p>
            <ul>
              <li>Your use of the Services</li>
              <li>Your violation of these Terms</li>
              <li>Your misuse of User Data or Third-Party Services</li>
            </ul>
          </section>

          <section>
            <h2>16. Termination</h2>
            <p>The Company may suspend or terminate access at its discretion for violations of these Terms.</p>
            <p>You may discontinue use at any time.</p>
          </section>

          <section>
            <h2>17. Force Majeure</h2>
            <p>
              The Company shall not be liable for failure or delay in performance due to events beyond its reasonable
              control, including outages, natural disasters, or failures of third-party providers.
            </p>
          </section>

          <section>
            <h2>18. Assignment</h2>
            <p>
              The Company may assign or transfer these Terms in connection with a merger, acquisition, or sale of assets
              without restriction.
            </p>
          </section>

          <section>
            <h2>19. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Utah.</p>
          </section>

          <section>
            <h2>20. Dispute Resolution</h2>
            <p>Any dispute shall be resolved through binding arbitration under the rules of the American Arbitration Association.</p>
            <p>You agree to waive any right to participate in a class action lawsuit or class-wide arbitration.</p>
          </section>

          <section>
            <h2>21. Severability</h2>
            <p>If any provision of these Terms is found unenforceable, the remaining provisions shall remain in full force and effect.</p>
          </section>

          <section>
            <h2>22. Waiver</h2>
            <p>Failure to enforce any provision of these Terms shall not constitute a waiver.</p>
          </section>

          <section>
            <h2>23. Entire Agreement</h2>
            <p>
              These Terms, together with the{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              , constitute the entire agreement between you and the Company and supersede all prior agreements.
            </p>
          </section>

          <section>
            <h2>24. Changes to Terms</h2>
            <p>
              The Company may update these Terms from time to time. Continued use of the Services constitutes acceptance of
              the updated Terms.
            </p>
          </section>

          <section>
            <h2>25. Compliance with Laws</h2>
            <p>You agree to comply with all applicable laws, including U.S. export control and sanctions laws.</p>
          </section>

          <section>
            <h2>26. Contact Information</h2>
            <p>
              <strong>Home Services Analytics</strong>
            </p>
            <p>
              Email:{" "}
              <a href="mailto:support@homeservicesanalytics.com">support@homeservicesanalytics.com</a>
            </p>
          </section>

          <section>
            <h2>27. Compliance Statement</h2>
            <p>The Services are designed to comply with platform requirements, including:</p>
            <ul>
              <li>Proper handling of Google API data under Limited Use policies</li>
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
          <Link href="/privacy" className="underline hover:opacity-100">
            Privacy Policy
          </Link>
        </p>
      </main>
    </div>
  );
}
