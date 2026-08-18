import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { metaAdInsights, metaConnections } from "@/db/schema";

const DEFAULT_GRAPH_VERSION = "v24.0";

type MetaApiError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

type MetaPage<T> = MetaApiError & {
  data?: T[];
  paging?: { next?: string };
};

export type MetaAdAccount = {
  id: string;
  name: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: { id?: string; name?: string };
};

type MetaInsightRow = {
  date_start?: string;
  account_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
  action_values?: Array<{ action_type?: string; value?: string }>;
};

function required(name: string) {
  const value = process.env[name];
  if (!value || value === "[SENSITIVE]") {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function metaConfiguration() {
  const version = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("META_GRAPH_API_VERSION is invalid.");
  }
  return {
    appId: required("META_APP_ID"),
    appSecret: required("META_APP_SECRET"),
    tokenKey: required("META_TOKEN_ENCRYPTION_KEY"),
    version,
  };
}

export function metaIsConfigured() {
  try {
    metaConfiguration();
    return true;
  } catch {
    return false;
  }
}

export function metaCallbackUrl(origin: string) {
  const configured = process.env.APP_URL?.trim();
  const base = configured && configured !== "[SENSITIVE]" ? configured : origin;
  return new URL("/api/integrations/meta/callback", base).toString();
}

function encryptionKey() {
  const raw = metaConfiguration().tokenKey;
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32 && base64.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")) {
    return base64;
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  throw new Error("META_TOKEN_ENCRYPTION_KEY must be 32-byte base64 or 64-character hex.");
}

export function encryptMetaToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMetaToken(payload: string) {
  const [version, iv, tag, encrypted] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Stored Meta credential is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function metaStateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function appSecretProof(token: string) {
  return createHmac("sha256", metaConfiguration().appSecret)
    .update(token)
    .digest("hex");
}

function graphUrl(path: string, params: Record<string, string> = {}) {
  const { version } = metaConfiguration();
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function metaFetch<T>(url: URL | string, token: string): Promise<T> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "graph.facebook.com") {
    throw new Error("Meta returned an unsafe pagination URL.");
  }
  parsed.searchParams.set("appsecret_proof", appSecretProof(token));
  const response = await fetch(parsed, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await response.json()) as T & MetaApiError;
  if (!response.ok || body.error) {
    const message = body.error?.message || `Meta returned ${response.status}`;
    throw new Error(`Meta API: ${message}`);
  }
  return body;
}

async function paginated<T>(url: URL, token: string, maxPages = 30) {
  const rows: T[] = [];
  let next: string | undefined = url.toString();
  for (let page = 0; next && page < maxPages; page += 1) {
    const result: MetaPage<T> = await metaFetch<MetaPage<T>>(next, token);
    rows.push(...(result.data ?? []));
    next = result.paging?.next;
  }
  if (next) throw new Error("Meta response exceeded the safe pagination limit.");
  return rows;
}

export async function exchangeMetaCode(code: string, redirectUri: string) {
  const { appId, appSecret, version } = metaConfiguration();
  const shortResponse = await fetch(
    `https://graph.facebook.com/${version}/oauth/access_token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const shortBody = (await shortResponse.json()) as MetaApiError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!shortResponse.ok || !shortBody.access_token) {
    throw new Error(`Meta OAuth: ${shortBody.error?.message || "code exchange failed"}`);
  }

  const longResponse = await fetch(
    `https://graph.facebook.com/${version}/oauth/access_token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortBody.access_token,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const longBody = (await longResponse.json()) as MetaApiError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!longResponse.ok || !longBody.access_token) {
    throw new Error(`Meta OAuth: ${longBody.error?.message || "long-lived token exchange failed"}`);
  }
  return {
    token: longBody.access_token,
    expiresAt: longBody.expires_in
      ? new Date(Date.now() + longBody.expires_in * 1000)
      : null,
  };
}

export async function getMetaProfile(token: string) {
  return metaFetch<{ id: string; name?: string }>(
    graphUrl("me", { fields: "id,name" }),
    token,
  );
}

export async function listMetaAdAccounts(token: string) {
  return paginated<MetaAdAccount>(
    graphUrl("me/adaccounts", {
      fields: "id,name,account_status,currency,timezone_name,business{id,name}",
      limit: "200",
    }),
    token,
  );
}

function actionValue(
  actions: MetaInsightRow["actions"],
  preferredTypes: string[],
) {
  for (const type of preferredTypes) {
    const match = actions?.find((action) => action.action_type === type);
    if (match) return Number(match.value || 0) || 0;
  }
  return 0;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function syncMetaAdsForWorkspace(workspaceId: number, days = 90) {
  const db = getDb();
  const [connection] = await db
    .select()
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId))
    .limit(1);
  if (!connection?.adAccountId) throw new Error("Select a Meta ad account first.");
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) {
    await db
      .update(metaConnections)
      .set({ status: "reauthorization_required", lastError: "Meta access expired.", updatedAt: new Date() })
      .where(eq(metaConnections.id, connection.id));
    throw new Error("Meta access expired. Reconnect the workspace.");
  }

  const token = decryptMetaToken(connection.accessTokenEncrypted);
  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(1, Math.min(days, 730)) + 1);
  const accountId = connection.adAccountId.replace(/^act_/, "");

  try {
    const rows = await paginated<MetaInsightRow>(
      graphUrl(`act_${accountId}/insights`, {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since: isoDay(since), until: isoDay(until) }),
        fields: "date_start,account_id,campaign_id,campaign_name,impressions,reach,clicks,spend,actions,action_values",
        action_report_time: "conversion",
        limit: "500",
      }),
      token,
    );
    const syncedAt = new Date();
    const values = rows.flatMap((row) => {
      if (!row.date_start || !row.campaign_id) return [];
      return [{
        workspaceId,
        adAccountId: accountId,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name || "Untitled campaign",
        date: row.date_start,
        impressions: Number(row.impressions || 0) || 0,
        reach: Number(row.reach || 0) || 0,
        clicks: Number(row.clicks || 0) || 0,
        spend: Number(row.spend || 0) || 0,
        leads: actionValue(row.actions, [
          "lead",
          "onsite_conversion.lead_grouped",
          "offsite_conversion.fb_pixel_lead",
        ]),
        purchases: actionValue(row.actions, [
          "purchase",
          "omni_purchase",
          "offsite_conversion.fb_pixel_purchase",
        ]),
        purchaseValue: actionValue(row.action_values, [
          "purchase",
          "omni_purchase",
          "offsite_conversion.fb_pixel_purchase",
        ]),
        syncedAt,
      }];
    });
    const unique = new Map<string, (typeof values)[number]>();
    values.forEach((value) => unique.set(`${value.campaignId}:${value.date}`, value));

    await db
      .delete(metaAdInsights)
      .where(
        and(
          eq(metaAdInsights.workspaceId, workspaceId),
          eq(metaAdInsights.adAccountId, accountId),
          gte(metaAdInsights.date, isoDay(since)),
          lte(metaAdInsights.date, isoDay(until)),
        ),
      );
    const imported = [...unique.values()];
    for (let index = 0; index < imported.length; index += 250) {
      await db.insert(metaAdInsights).values(imported.slice(index, index + 250));
    }
    await db
      .update(metaConnections)
      .set({ status: "active", lastSyncedAt: syncedAt, lastError: null, updatedAt: syncedAt })
      .where(eq(metaConnections.id, connection.id));
    return { recordsImported: imported.length, lastSyncedAt: syncedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Meta sync failed.";
    await db
      .update(metaConnections)
      .set({ status: "error", lastError: message, updatedAt: new Date() })
      .where(eq(metaConnections.id, connection.id));
    throw error;
  }
}

export async function saveSelectedMetaAccount(
  workspaceId: number,
  account: MetaAdAccount,
) {
  const accountId = account.id.replace(/^act_/, "");
  await getDb()
    .update(metaConnections)
    .set({
      adAccountId: accountId,
      adAccountName: account.name,
      currency: account.currency || "USD",
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(metaConnections.workspaceId, workspaceId));
}

export async function metaConnectionCount() {
  const result = await getDb().select({ count: sql<number>`count(*)` }).from(metaConnections);
  return Number(result[0]?.count ?? 0);
}
