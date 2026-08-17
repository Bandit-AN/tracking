import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the MoonRift dashboard shell", async () => {
  const response = await render(); assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>MoonRift/); assert.match(html, />MoonRift</); assert.match(html, />Dashboard</); assert.match(html, /Refresh data/); assert.match(html, /PAID AD METRICS/); assert.match(html, /Cash collected by lead source/); assert.match(html, /Message MoonRift Media/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("keeps requested data integrations and views in source", async () => {
  const [dashboard, sheets, meta, support] = await Promise.all([
    readFile(new URL("../app/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/meta/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /Close rate/); assert.match(dashboard, /Application → booking/); assert.match(dashboard, /CRM ROAS/); assert.match(dashboard, /Agency Inbox/); assert.match(dashboard, /Co-owner/);
  assert.match(sheets, /Payouts/); assert.match(sheets, /Booked Calls/); assert.match(meta, /graph\.facebook\.com/); assert.match(support, /support_messages/);
});
