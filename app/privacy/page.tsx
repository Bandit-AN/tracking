import Link from "next/link";

export const metadata = { title: "Privacy Policy | MoonRift Media" };

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <Link className="legal-brand" href="/">MoonRift Media Client Portal</Link>
        <p className="legal-kicker">PRIVACY POLICY</p>
        <h1>How portal information is handled</h1>
        <p className="legal-updated">Effective August 17, 2026</p>
        <p>This policy describes information processed through the MoonRift Media client portal at app.moonriftmedia.com. The portal is an administrator-invited service and does not offer public account registration.</p>
        <h2>Information we process</h2>
        <p>We process account identity and access information, client workspace settings, sales and application records supplied by authorized client data sources, Calendly booking information, payout records, and advertising performance imported from connected Meta ad accounts. Meta access tokens are encrypted before database storage and are never displayed to portal users.</p>
        <h2>How information is used</h2>
        <p>Information is used to authenticate authorized users, operate client workspaces, provide sales and advertising reporting, synchronize authorized integrations, secure the service, diagnose errors, and respond to support or deletion requests. MoonRift Media does not sell portal information.</p>
        <h2>Service providers and connected platforms</h2>
        <p>The portal uses service providers such as Vercel for application hosting and Neon for database and authentication services. Information is sent to or received from Google Sheets, Calendly, and Meta only when an authorized administrator configures those integrations. Those platforms process information under their own terms and privacy policies.</p>
        <h2>Access and security</h2>
        <p>Access is limited by workspace and role. Protected operations are authorized on the server. Passwords are handled by the authentication provider and are not stored in portal application tables. Integration secrets remain server-only, and Meta credentials are protected with authenticated encryption.</p>
        <h2>Retention and deletion</h2>
        <p>Records are retained while needed to provide the portal, satisfy legitimate business requirements, or comply with applicable obligations. An administrator can disconnect Meta at any time, which removes the workspace&apos;s stored Meta connection and imported Meta insight records. Individuals and clients may also follow the <Link href="/data-deletion">data deletion instructions</Link>.</p>
        <h2>Contact</h2>
        <p>Privacy questions may be sent to <a href="mailto:moonriftmedia@gmail.com">moonriftmedia@gmail.com</a>.</p>
        <p className="legal-note">This operational policy should be reviewed by qualified counsel for MoonRift Media&apos;s jurisdiction and business requirements before external app-review submission.</p>
      </article>
    </main>
  );
}
