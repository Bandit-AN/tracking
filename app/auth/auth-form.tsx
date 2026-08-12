"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function AuthForm({ path, token }: { path: string; token?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (path === "sign-in") {
        const result = await authClient.signIn.email({
          email: String(formData.get("email")).trim().toLowerCase(),
          password: String(formData.get("password")),
          rememberMe: true,
          callbackURL: "/dashboard",
        });
        if (result.error) throw new Error("The email or password is incorrect.");
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      if (path === "forgot-password" || path === "recover-account") {
        const result = await authClient.requestPasswordReset({
          email: String(formData.get("email")).trim().toLowerCase(),
          redirectTo: "/auth/reset-password",
        });
        if (result.error) throw new Error("Password reset email could not be sent.");
        setMessage(
          "If an active account matches that email, password reset instructions are on the way.",
        );
        return;
      }

      if (path === "reset-password") {
        if (!token) throw new Error("This password reset link is invalid or expired.");
        const password = String(formData.get("password"));
        if (password !== String(formData.get("confirmPassword"))) {
          throw new Error("The passwords do not match.");
        }
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) throw new Error("This password reset link is invalid or expired.");
        router.replace("/auth/sign-in?reset=success");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  const isReset = path === "reset-password";
  const isForgot = path === "forgot-password" || path === "recover-account";
  return (
    <div className="portal-auth-card">
      <div className="portal-auth-heading">
        <p className="auth-kicker">MOONRIFT MEDIA</p>
        <h2>{isReset ? "Choose a new password" : isForgot ? "Reset your password" : "Welcome back"}</h2>
        <p>{isReset ? "Use at least 12 characters for your new password." : isForgot ? "Enter your account email and we’ll send a secure reset link." : "Sign in with the account created by your administrator."}</p>
      </div>
      <form action={(formData) => void submit(formData)}>
        {!isReset && <><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required /></>}
        {!isForgot && <><label htmlFor="password">{isReset ? "New password" : "Password"}</label><input id="password" name="password" type="password" minLength={isReset ? 12 : undefined} autoComplete={isReset ? "new-password" : "current-password"} required /></>}
        {isReset && <><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" required /></>}
        {error && <div className="auth-alert error" role="alert">{error}</div>}
        {message && <div className="auth-alert success" role="status">{message}</div>}
        <button type="submit" disabled={pending}>{pending ? "Please wait…" : isReset ? "Update password" : isForgot ? "Send reset link" : "Sign in"}</button>
      </form>
      <div className="auth-card-footer">
        {isForgot || isReset ? <Link href="/auth/sign-in">Back to sign in</Link> : <Link href="/auth/forgot-password">Forgot password?</Link>}
        {!isForgot && !isReset && <small>No account? Contact your MoonRift Media administrator.</small>}
      </div>
    </div>
  );
}
