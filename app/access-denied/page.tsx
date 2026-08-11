import { auth } from "@/lib/auth/server";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const { data } = await auth.getSession();
  if (!data?.user) redirect("/auth/sign-in");

  return (
    <main className="access-shell">
      <section>
        <Image src="/moonrift-logo.png" alt="Seller Syndicate" width={58} height={58} />
        <p className="auth-kicker">ACCESS PENDING</p>
        <h1>Your sign-in worked, but portal access is not active.</h1>
        <p>
          Ask a Seller Syndicate administrator to activate your account and
          assign the correct role and workspace.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
