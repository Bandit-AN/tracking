import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  return Response.json({ user }, { headers: { "cache-control": "no-store" } });
}
