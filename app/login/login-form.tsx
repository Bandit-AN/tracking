"use client";

import { useState } from "react";
import Image from "next/image";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error || "Sign in failed"); setLoading(false); return; }
      window.location.replace("/");
    } catch {
      setError("MoonRift could not be reached. Try again."); setLoading(false);
    }
  }

  return <form className="login-card" onSubmit={submit}>
    <div className="login-brand"><Image src="/moonriftmedia-logo.jpg" alt="" width={42} height={32} priority /><div><strong>MoonRift</strong><span>Client Revenue Intelligence</span></div></div>
    <div className="login-copy"><span>SECURE WORKSPACE</span><h1>Sign in to MoonRift</h1><p>Client revenue, payout, and advertising data are restricted to approved accounts.</p></div>
    {error ? <div className="login-error" role="alert">{error}</div> : null}
    <label htmlFor="login-email">Email address</label>
    <input id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
    <label htmlFor="login-password">Password</label>
    <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    <button type="submit" disabled={loading}>{loading ? "Verifying…" : "Sign in securely"}</button>
    <small>Access is logged and sessions expire automatically. Contact MoonRift Media if you need an account.</small>
  </form>;
}
