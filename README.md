# MoonRift Media Client Portal

Production multi-client offer, sales, revenue, team, and payout portal for
MoonRift Media.

## Architecture

- Next.js 16 App Router deployed to Vercel
- Neon Postgres with Drizzle ORM and forward-only SQL migrations
- Neon Auth for email/password identity, HTTP-only sessions, password reset, and administrator-created users
- Server-side role and client-subaccount authorization for all portal reads and writes
- Agency-wide aggregate performance plus isolated client offer views
- Administrator-only Google Sheets ingestion into normalized Neon records
- Native workspace-level Meta Ads OAuth with encrypted tokens and daily reporting sync

The production application URL is `https://app.moonriftmedia.com`. The Vercel
project domain `https://tracking-five-beta.vercel.app` remains available as the
underlying deployment URL.

## Local setup

1. Use Node.js 22.13 or newer.
2. Copy `.env.example` to `.env.local` and fill the development values from the
   Vercel and Neon dashboards. Never commit `.env.local`.
3. Install and validate:

```bash
npm ci
npm run db:migrate
npm run dev
```

## Database migrations

Migrations live in `drizzle/` and are applied by `npm run db:migrate`. The
Vercel build runs migrations before compiling Next.js. Migrations are
idempotent and forward-only; development seed data is not included and nothing
seeds automatically in production.

Generate the next migration after editing `db/schema.ts`:

```bash
npm run db:generate
```

Review generated SQL before applying it to any shared environment.

## Account bootstrap

Public registration is blocked. Create the first identity in Neon Console,
assign its Better Auth role to `admin`, and add the same email to the
server-only `PORTAL_ADMIN_EMAILS` Vercel variable. On first successful login,
the portal creates the matching application authorization record. Thereafter,
portal administrators can create users and assign roles/client subaccounts from the
Users page.

Configure a production email provider in Neon Auth before relying on password
reset delivery.

## Custom domain

`app.moonriftmedia.com` is attached to the Vercel `tracking` project. Vercel's
project-specific DNS verification requires this record at GoDaddy:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `app` | `a1779d405be8349f.vercel-dns-017.com` | 1 hour |

Do not change the `@` or `www` records; those continue to serve the main
MoonRift Media site. After saving the CNAME, verify with:

```bash
vercel domains verify app.moonriftmedia.com --scope avcodeprojects-projects
```

The migration in `0003_auth_trusted_origins.sql` adds both the custom URL and
the underlying `tracking-five-beta.vercel.app` URL to Neon Auth without
removing any existing trusted origins.

## Data synchronization

Google Sheets imports run only when an administrator selects **Sync data**.
They upsert normalized live records into Neon and do not automatically delete
database rows that disappear from a later sheet export. No sample or seed data
runs in production.

## Calendly booking synchronization

All bookings for the configured Calendly event type can enter the Sales CRM,
including meetings scheduled manually by a team member. Calendly sends
`invitee.created` events to:

```text
https://app.moonriftmedia.com/api/integrations/calendly?secret=YOUR_RANDOM_SECRET
```

The route validates its secret, retrieves the invitee and scheduled event from
Calendly with a server-only token, filters by the exact
`CALENDLY_EVENT_TYPE_URI`, then forwards the normalized booking to the Google
Apps Script web app. The Apps Script upserts both `Booked Calls` and `Sales CRM`
by Calendly invitee URI, so webhook retries and the legacy browser callback do
not create duplicate alerts.

The funnel Calendly URL must include:

```text
utm_source=seller_syndicate_funnel&utm_campaign=self_booked_lead
```

Those bookings are labeled **Self booked lead**. A booking for the same event
without that marker is labeled **Team booked lead**.

Production requires these server-only Vercel variables:

- `CALENDLY_ACCESS_TOKEN`
- `CALENDLY_EVENT_TYPE_URI`
- `CALENDLY_WEBHOOK_SECRET` (a long random value used in the subscription URL)
- `GOOGLE_SHEETS_BOOKING_WEBHOOK_URL`

Create an organization-scoped Calendly webhook subscription for
`invitee.created` if every team member's bookings should be captured. Calendly
requires an owner/admin token and an eligible paid Calendly plan for this
organization-wide webhook. Never expose the token or webhook secret to browser
code.

## Native Meta Ads connection

Each client workspace has a **Settings → Meta Ads** integration. An
administrator clicks **Connect Meta**, completes Facebook OAuth, selects one
authorized ad account, and imports the previous 90 days of daily campaign
insights. Vercel then refreshes the most recent 30 days every day. The Media
page reports spend, impressions, reach, clicks, CTR, CPC, Meta leads, CPL,
purchases, purchase value, ROAS, and campaign performance. Agency view combines
all connected workspaces.

Create a Meta Business app and configure this exact OAuth redirect URI:

```text
https://app.moonriftmedia.com/api/integrations/meta/callback
```

Use these public app-review URLs:

- Privacy Policy: `https://app.moonriftmedia.com/privacy`
- Data deletion instructions: `https://app.moonriftmedia.com/data-deletion`

Request read-only `ads_read` access. Client-owned ad accounts require Advanced
Access and Meta App Review before general onboarding. Add the privacy-policy
and data-deletion URLs required by Meta, complete MoonRift business
verification, and keep the app in Development mode until review testing is
complete.

Production requires these server-only Vercel variables:

- `APP_URL=https://app.moonriftmedia.com`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_LOGIN_CONFIG_ID` when using Facebook Login for Business
- `META_GRAPH_API_VERSION` (currently configured as `v24.0`; update deliberately when Meta versions change)
- `META_TOKEN_ENCRYPTION_KEY` (32 random bytes as base64, or 64 hex characters)
- `CRON_SECRET`

Never prefix these values with `NEXT_PUBLIC_`. OAuth access tokens are encrypted
with AES-256-GCM before database storage, are never returned by portal APIs,
and are deleted with their workspace or when an administrator disconnects
Meta. OAuth state is bound to the authenticated administrator and expires after
10 minutes.

The production cron invokes `/api/cron/meta-ads` daily at 09:15 UTC. Manual
sync remains available from workspace settings.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```
