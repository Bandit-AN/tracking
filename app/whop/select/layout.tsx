import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function WhopSelectLayout({ children }: Readonly<{ children: React.ReactNode }>) { const user = await getAuthenticatedUser(await headers()); if (!user) redirect("/login"); return children; }
