"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Account = { id: string; name: string; account_status?: number; currency?: string; timezone_name?: string };

export default function MetaAccountSelection() {
  const [flow] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("flow") ?? "");
  const [accounts, setAccounts] = useState<Account[]>([]); const [selected, setSelected] = useState(""); const [status, setStatus] = useState(() => flow ? "Loading your ad accounts…" : "This connection link is invalid."); const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!flow) return;
    void fetch(`/api/meta/oauth/complete?flow=${encodeURIComponent(flow)}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { accounts?: Account[]; error?: string };
      if (!response.ok || !result.accounts?.length) { setStatus(result.error || "No Meta ad accounts were found."); return; }
      setAccounts(result.accounts); setSelected(result.accounts[0].id); setStatus("");
    }).catch(() => setStatus("Your Meta ad accounts could not be loaded."));
  }, [flow]);

  async function connect(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setSaving(true);
    const response = await fetch("/api/meta/oauth/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow, adAccountId: selected }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setStatus(result.error || "This ad account could not be connected."); setSaving(false); return; }
    window.location.assign("/?meta=connected");
  }

  return <main className="meta-select-shell"><form className="meta-select-card" onSubmit={connect}>
    <div className="meta-select-brand"><span>MR</span><strong>MoonRift</strong></div>
    <div className="meta-select-icon">f</div><h1>Choose an ad account</h1><p>Select the Meta Ads account MoonRift should use for spend and campaign reporting.</p>
    {status && <div className="meta-select-status">{status}</div>}
    <div className="meta-account-list">{accounts.map((account) => <label className={selected === account.id ? "selected" : ""} key={account.id}><input type="radio" name="ad-account" value={account.id} checked={selected === account.id} onChange={() => setSelected(account.id)} /><span><b>{account.name}</b><small>{account.id} · {account.currency || "Currency unavailable"}{account.timezone_name ? ` · ${account.timezone_name}` : ""}</small></span><i>{selected === account.id ? "✓" : ""}</i></label>)}</div>
    <button type="submit" disabled={!selected || saving}>{saving ? "Connecting…" : "Connect selected account"}</button><Link href="/?meta=cancelled">Cancel</Link>
  </form></main>;
}
