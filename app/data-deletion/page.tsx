import Link from "next/link";

export const metadata = { title: "Data Deletion | MoonRift Media" };

export default function DataDeletionPage() {
  return (
    <main className="legal-page">
      <article>
        <Link className="legal-brand" href="/">MoonRift Media Client Portal</Link>
        <p className="legal-kicker">DATA DELETION</p>
        <h1>Request deletion of portal or Meta data</h1>
        <p>Workspace administrators can immediately remove a Meta connection and its imported advertising insights from <b>Settings → Meta Ads → Disconnect</b>.</p>
        <h2>Submit a deletion request</h2>
        <ol>
          <li>Email <a href="mailto:moonriftmedia@gmail.com?subject=Portal%20data%20deletion%20request">moonriftmedia@gmail.com</a> from the address associated with your portal or client organization.</li>
          <li>Use the subject “Portal data deletion request” and identify the client workspace and connected Facebook ad account.</li>
          <li>MoonRift Media will verify that the requester is authorized for the affected workspace before deleting data.</li>
          <li>After verification, the applicable connection credentials and imported Meta insight records will be removed. A confirmation will be sent when the request is complete.</li>
        </ol>
        <p>Deletion requests are normally completed within 30 days, subject to records that must be retained for security, legal, fraud-prevention, or contractual purposes.</p>
        <h2>What disconnecting Meta removes</h2>
        <p>Disconnecting deletes the encrypted Meta access token, connected ad-account selection, synchronization status, and imported campaign insight rows for that workspace. It does not delete campaigns or advertising data held inside the client&apos;s Meta account.</p>
        <p><Link href="/privacy">Read the Privacy Policy</Link></p>
      </article>
    </main>
  );
}
