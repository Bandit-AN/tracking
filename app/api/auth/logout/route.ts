import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const response = Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.headers.append("set-cookie", clearSessionCookie(request));
  return response;
}
