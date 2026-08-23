import { authenticateCredentials, createSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try { body = await request.json() as { email?: string; password?: string }; }
  catch { return Response.json({ error: "Enter your email and password" }, { status: 400 }); }

  const user = await authenticateCredentials(body.email ?? "", body.password ?? "");
  if (!user) {
    // Keep invalid-account and invalid-password responses indistinguishable.
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: "Email or password is incorrect" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const response = Response.json({ ok: true, user: { email: user.email, displayName: user.displayName, role: user.role } }, { headers: { "cache-control": "no-store" } });
    response.headers.append("set-cookie", await createSessionCookie(user, request));
    return response;
  } catch {
    return Response.json({ error: "Login is temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
