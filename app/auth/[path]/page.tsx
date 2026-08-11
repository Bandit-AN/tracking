import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { AuthForm } from "../auth-form";

const allowedPaths = new Set([
  "sign-in",
  "forgot-password",
  "reset-password",
  "recover-account",
]);

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { path } = await params;
  const { token } = await searchParams;
  if (path === "sign-up") redirect("/auth/sign-in");
  if (!allowedPaths.has(path)) notFound();

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-wordmark">
          <Image src="/moonrift-logo.png" alt="" width={38} height={38} priority />
          <span>Seller Syndicate</span>
        </div>
        <div>
          <p className="auth-kicker">MOONRIFT MEDIA</p>
          <h1>Your sales operation, in one secure view.</h1>
          <p>
            Track revenue, team performance, closed deals, and payouts with
            access tailored to your role.
          </p>
        </div>
        <small>Authorized Seller Syndicate members only.</small>
      </section>
      <section className="auth-form-panel">
        <AuthForm path={path} token={token} />
      </section>
    </main>
  );
}
