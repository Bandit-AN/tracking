# Seller Syndicate Portal

Production Seller Syndicate sales, revenue, team, and payout portal for MoonRift Media.

## Architecture

- Next.js 16 App Router deployed to Vercel
- Neon Postgres with Drizzle ORM and forward-only SQL migrations
- Neon Auth for email/password identity, HTTP-only sessions, password reset, and administrator-created users
- Server-side role and workspace authorization for all portal reads and writes
- Administrator-only Google Sheets ingestion into normalized Neon records

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
portal administrators can create users and assign roles/workspaces from the
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

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```
