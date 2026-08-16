# Landing custom-domain mapping — runbook

The settings area of `/landing-pages-dashboard` (Payload admin session required)
maps client hostnames onto the landing Vercel project and manages each
property's `allowedOrigins`. It replaces the manual CLI + email flow first used
for `hire.awaydigitalteams.com`.

## One-time setup

- `VERCEL_TOKEN` must be set in the CMS Vercel project env (create at
  vercel.com → Account Settings → Tokens). Without it every domain route
  returns 503 and nothing is stored.
- **Scope warning:** Vercel has no per-project tokens — this token controls
  every project in the account. It is server-only, never logged, never included
  in a response. Rotate it if there is any doubt.
- `VERCEL_TEAM_ID` only if the landing project moves into a team scope.

## Mapping a new client domain

1. Open `/landing-pages-dashboard`, select the client, find the property in
   **Settings**.
2. Enter the hostname (bare, lowercase, e.g. `hire.clientdomain.com`) and an
   optional path hint, then **Register domain**. This attaches the hostname to
   the `od-landing-page-adt` Vercel project and caches the DNS record Vercel
   answered with.
3. Click **Copy client instructions** and send the text to the client. The
   record value is project-specific (`*.vercel-dns-0xx.com`) — never substitute
   the generic `cname.vercel-dns.com`; it fails verification on newer projects.
   If the domain's apex lives in another Vercel account, the instructions
   automatically include the TXT verification row.
4. When the client confirms, click **Check now**. When Vercel reports the DNS
   configured, the mapping flips to **Live** and `https://{hostname}` is
   appended to the property's `allowedOrigins` automatically (idempotent,
   recorded in the domain's audit log). Events start flowing the moment DNS
   resolves — no manual origin step.

Status checks are on-demand (the button), not scheduled: nobody is notified
when DNS lands until someone clicks. Upgrade path: a cron route + notification.

## Allowed origins

The origins editor edits the property's `allowedOrigins` directly (exact
`scheme://host[:port]`, one row per origin). A property must keep at least one
origin (`minRows: 1`); removing the last row is refused. A missing origin row
is the top operational failure this feature exists to prevent — prefer letting
the domain check append it.

## API surface (all Payload-admin auth)

| Route | Purpose |
| --- | --- |
| `GET /api/landing-admin/overview` | Clients × properties × 30-day stats × domain status |
| `POST /api/landing-admin/domains` | Register hostname, cache DNS record, return instructions |
| `POST /api/landing-admin/domains/[id]/check` | Re-check DNS; flip to live + append origin |
| `GET /api/landing-admin/domains/[id]/instructions` | Plain-text client email (no Vercel call) |
