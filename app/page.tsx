import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data } = await auth.getSession();
  redirect(data?.user ? "/dashboard" : "/auth/sign-in");
}
