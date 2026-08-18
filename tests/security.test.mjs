import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("protected data routes require server authorization", async () => {
  const routes = await Promise.all(
    [
      "app/api/dashboard/route.ts",
      "app/api/workspaces/route.ts",
      "app/api/workspaces/[id]/sync/route.ts",
      "app/api/admin/users/route.ts",
      "app/api/integrations/meta/route.ts",
      "app/api/integrations/meta/connect/route.ts",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );
  routes.forEach((route) => assert.match(route, /requireApiUser\(\)/));
});

test("public registration and mock dashboard records are absent", async () => {
  const [authRoute, dashboard] = await Promise.all([
    readFile(new URL("app/api/auth/[...path]/route.ts", root), "utf8"),
    readFile(new URL("app/dashboard.tsx", root), "utf8"),
  ]);
  assert.match(authRoute, /rejectPublicRegistration/);
  assert.doesNotMatch(dashboard, /fallbackPeople|clientsSeed|Dillon Reed|Zain Carter/);
});

test("secret environment variables are server-only", async () => {
  const files = await Promise.all(
    [
      "lib/auth/server.ts",
      "lib/calendly.ts",
      "db/index.ts",
      "app/api/workspaces/route.ts",
      "lib/meta.ts",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );
  const source = files.join("\n");
  assert.doesNotMatch(source, /NEXT_PUBLIC_(DATABASE|POSTGRES|NEON_AUTH_COOKIE)/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_(CALENDLY|GOOGLE_SHEETS_BOOKING)/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_META_/);
});

test("Meta OAuth is workspace-bound, encrypted, read-only, and cron protected", async () => {
  const [connect, callback, integration, meta, cron] = await Promise.all([
    readFile(new URL("app/api/integrations/meta/connect/route.ts", root), "utf8"),
    readFile(new URL("app/api/integrations/meta/callback/route.ts", root), "utf8"),
    readFile(new URL("app/api/integrations/meta/route.ts", root), "utf8"),
    readFile(new URL("lib/meta.ts", root), "utf8"),
    readFile(new URL("app/api/cron/meta-ads/route.ts", root), "utf8"),
  ]);
  assert.match(connect, /scope", "ads_read"/);
  assert.match(connect, /randomBytes\(32\)/);
  assert.match(callback, /metaOauthStates/);
  assert.match(callback, /encryptMetaToken/);
  assert.doesNotMatch(`${connect}\n${callback}\n${integration}`, /access_token.*Response\.json/i);
  assert.match(meta, /aes-256-gcm/);
  assert.match(meta, /appsecret_proof/);
  assert.match(integration, /requireAdmin/);
  assert.match(cron, /Bearer \$\{cronSecret\}/);
});

test("Calendly webhook authenticates, validates resources, and filters event type", async () => {
  const [route, integration] = await Promise.all([
    readFile(new URL("app/api/integrations/calendly/route.ts", root), "utf8"),
    readFile(new URL("lib/calendly.ts", root), "utf8"),
  ]);
  assert.match(route, /CALENDLY_WEBHOOK_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(integration, /CALENDLY_ACCESS_TOKEN/);
  assert.match(integration, /scheduledEvent\.event_type !== expectedEventTypeUri/);
  assert.match(integration, /bookingLabel = selfBooked \? "Self booked lead" : "Team booked lead"/);
});

test("agency-wide aggregation is restricted to portal administrators", async () => {
  const dashboardRoute = await readFile(
    new URL("app/api/dashboard/route.ts", root),
    "utf8",
  );
  assert.match(
    dashboardRoute,
    /workspaceId === 0 && authResult\.context\.portalUser\.role === "admin"/,
  );
});

test("authenticated dashboard retains its responsive layout hooks", async () => {
  const [dashboard, sheetImport, adminUsers] = await Promise.all([
    readFile(new URL("app/dashboard.tsx", root), "utf8"),
    readFile(new URL("lib/google-sheets.ts", root), "utf8"),
    readFile(new URL("app/api/admin/users/route.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /className={`sidebar/);
  assert.match(dashboard, /<main className="content">/);
  assert.match(dashboard, /<header className="topbar">/);
  assert.equal((dashboard.match(/<article className="kpi">/g) ?? []).length, 8);
  assert.doesNotMatch(dashboard, /className="kpi">[^<]*<span>[^<]+<\/span><strong>[^<]+<\/strong><small>/);
  assert.doesNotMatch(dashboard, /Database current/);
  assert.doesNotMatch(dashboard, /Secure offer intelligence/);
  assert.match(dashboard, /Agency Overview/);
  assert.match(dashboard, /AttributionSection/);
  assert.match(dashboard, /chart-tooltip/);
  assert.match(dashboard, /drop-off/);
  assert.match(dashboard, /className="performance-layout"/);
  assert.match(dashboard, /className="leaderboard-stack"/);
  assert.match(dashboard, /Top closers/);
  assert.match(dashboard, /Top setters/);
  assert.match(dashboard, /ConversionFunnel/);
  assert.match(dashboard, /AgencyWorkspacePerformance/);
  assert.match(dashboard, /MetaAdsDashboard/);
  assert.match(dashboard, /MetaIntegrationSettings/);
  assert.match(dashboard, /title="Cash collected"/);
  assert.match(dashboard, /title="Revenue"/);
  assert.doesNotMatch(dashboard, /by payment date/i);
  assert.match(dashboard, /Applications from the Applications tab/);
  assert.match(dashboard, /isClosedOutcome\(meeting\.status\)/);
  assert.match(sheetImport, /applicationEvents/);
  assert.match(sheetImport, /fetchSheet\(spreadsheetId, "Applications"\)/);
  assert.match(adminUsers, /setUserPassword/);
  assert.doesNotMatch(`${dashboard}\n${adminUsers}`, /Pandaseeke123!/);
});
