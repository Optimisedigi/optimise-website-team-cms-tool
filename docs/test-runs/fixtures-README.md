# Test Fixtures (`scripts/test-fixtures.ts`)

Creates clearly-named throwaway records in the **local dev DB only**
(`file:./content-voice-test.db`, used by `npm run dev` on port 3004 via
`.env.local`) and logs every created row to a teardown manifest so they can be
removed later. The script **refuses to run** unless `DATABASE_URL` starts with
`file:` and no `DATABASE_AUTH_TOKEN` is set — it can never touch production Turso.

## What it creates

| Collection | Name | Slug | PIN | Notes |
|---|---|---|---|---|
| `clients` | `ZZ Test Client` | `zz-test-client` | `4729` (`clientPin`) | `googleAdsCustomerId` = `659-101-3898` (whitelisted read account, stored as `6591013898`); GSC/GA4 left disconnected |
| `client-proposals` | `ZZ Test Proposal` | `zz-test-proposal` | `5836` (`proposalPin`) | linked to the test client via `client` |

These PINs are **local-only test values, not real secrets** — they only work
against `content-voice-test.db`.

Existing records with the same slug are **reused** (not duplicated). Every
newly-created record is appended to:

```
docs/test-runs/fixtures-manifest.jsonl
```

(one JSON object per line: `collection`, `id`, `slug`, `createdAt`).

## Run — create

```bash
npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts
```

`.env` is loaded first (for `PAYLOAD_SECRET` etc.), then `.env.local` so its
local-file `DATABASE_URL` wins — the same precedence Next.js uses for `npm run dev`.

## Run — teardown

Deletes everything recorded in the manifest (proposals before clients) and then
clears the manifest:

```bash
npx tsx --env-file=.env --env-file=.env.local scripts/test-fixtures.ts --teardown
```
