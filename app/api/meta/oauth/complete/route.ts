import { META_OAUTH_COOKIE, oauthCookie, readCookie } from "@/lib/meta-oauth";
import { deleteMetaOauthSession, getMetaOauthSession, saveMetaConnection } from "@/lib/meta-store";

async function validSession(request: Request, flowId: string) {
  if (!/^[a-zA-Z0-9_-]{32,}$/.test(flowId)) return null;
  const session = await getMetaOauthSession(flowId); const nonce = readCookie(request, META_OAUTH_COOKIE);
  return session && nonce && session.browserNonce === nonce ? session : null;
}

export async function GET(request: Request) {
  const flowId = new URL(request.url).searchParams.get("flow") ?? ""; const session = await validSession(request, flowId);
  if (!session) return Response.json({ error: "This Meta connection session expired. Please start again." }, { status: 410 });
  return Response.json({ accounts: session.accounts.map(({ id, name, account_status, currency, timezone_name }) => ({ id, name, account_status, currency, timezone_name })) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json() as { flow?: string; adAccountId?: string }; const session = await validSession(request, body.flow ?? "");
  if (!session) return Response.json({ error: "This Meta connection session expired. Please start again." }, { status: 410 });
  const account = session.accounts.find((item) => item.id === body.adAccountId);
  if (!account) return Response.json({ error: "Choose one of the authorized ad accounts." }, { status: 400 });

  await saveMetaConnection(session.workspaceId, account.id, session.accessToken); await deleteMetaOauthSession(session.id);
  const response = Response.json({ ok: true, account: { id: account.id, name: account.name } }); response.headers.append("set-cookie", oauthCookie("", request, 0)); return response;
}
