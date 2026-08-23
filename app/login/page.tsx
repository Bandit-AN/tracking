import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedUser(await headers());
  if (user) redirect("/");
  return <main className="login-shell"><div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" /><LoginForm /></main>;
}
