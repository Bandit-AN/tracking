import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { metaOauthStates, workspaces } from "@/db/schema";
import {
  canAccessWorkspace,
  requireAdmin,
  requireApiUser,
} from "@/lib/auth/authorization";
import {
  metaCallbackUrl,
  metaConfiguration,
  metaStateHash,
} from "@/lib/meta";

export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if ("response" in authResult) return authResult.response;
  const denied = requireAdmin(authResult.context);
  if (denied) return denied;

  const workspaceId = Number(new URL(request.url).searchParams.get("workspaceId"));
  if (!(await canAccessWorkspace(authResult.context, workspaceId))) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }
  const [workspace] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return Response.json({ error: "Workspace not found" }, { status: 404 });

  try {
    const { appId, version } = metaConfiguration();
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await getDb().delete(metaOauthStates).where(lt(metaOauthStates.expiresAt, new Date()));
    await getDb().insert(metaOauthStates).values({
      stateHash: metaStateHash(state),
      workspaceId,
      userId: authResult.context.portalUser.id,
      expiresAt,
    });

    const callback = metaCallbackUrl(new URL(request.url).origin);
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "ads_read");
    url.searchParams.set("auth_type", "rerequest");
    const configId = process.env.META_LOGIN_CONFIG_ID?.trim();
    if (configId && configId !== "[SENSITIVE]") {
      url.searchParams.set("config_id", configId);
      url.searchParams.set("override_default_response_type", "true");
    }
    return Response.redirect(url);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Meta is not configured." },
      { status: 503 },
    );
  }
}
