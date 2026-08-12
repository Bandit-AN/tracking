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
      "db/index.ts",
      "app/api/workspaces/route.ts",
    ].map((path) => readFile(new URL(path, root), "utf8")),
  );
  const source = files.join("\n");
  assert.doesNotMatch(source, /NEXT_PUBLIC_(DATABASE|POSTGRES|NEON_AUTH_COOKIE)/);
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
  const dashboard = await readFile(
    new URL("app/dashboard.tsx", root),
    "utf8",
  );
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
});
