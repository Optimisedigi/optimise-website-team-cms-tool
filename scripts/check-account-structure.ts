/**
 * check-account-structure.ts — per-client readiness check for the
 * account-structure feature (see the partners/[clientSlug]/account-structure
 * proxy + Growth Tools fetchLiveAccountStructure).
 *
 * It validates the TWO real prerequisites WITHOUT needing the new CMS/Growth
 * Tools code to be deployed:
 *
 *   1. (local CMS DB) does the client have a valid 10-digit googleAdsCustomerId?
 *   2. (live, already-deployed Growth Tools) does
 *      GET /api/google-ads/account-structure/:customerId — the exact same
 *      googleAdsService.query path the new code uses — return campaigns?
 *
 * So a PASS here means the new slug route WILL work for that client once
 * deployed; a FAIL isolates whether it's a missing customer id (#1) or an
 * MCC-access / API issue (#2).
 *
 * Run:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/check-account-structure.ts
 *   # optional: only the first N clients
 *   npx tsx --env-file=.env --env-file=.env.local scripts/check-account-structure.ts --limit 5
 *
 * Read-only: no writes to the CMS or to Google Ads.
 */

import { getPayload } from "payload";
import config from "../src/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface ClientRow {
  id: number | string;
  name?: string | null;
  slug?: string | null;
  googleAdsCustomerId?: string | null;
}

type Outcome = "PASS" | "NO_CUSTOMER_ID" | "BAD_CUSTOMER_ID" | "UPSTREAM_FAIL" | "ERROR";

interface Result {
  slug: string;
  name: string;
  customerId: string | null;
  outcome: Outcome;
  detail: string;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function checkLive(customerId: string): Promise<{ ok: boolean; detail: string }> {
  if (!GROWTH_TOOLS_URL) return { ok: false, detail: "GROWTH_TOOLS_URL not set" };
  const url = `${GROWTH_TOOLS_URL.replace(/\/$/, "")}/api/google-ads/account-structure/${customerId}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(INTERNAL_API_KEY ? { "x-internal-key": INTERNAL_API_KEY } : {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    }
    let count = "?";
    try {
      const json = JSON.parse(text) as { campaignCount?: number };
      count = String(json.campaignCount ?? "?");
    } catch {
      /* non-JSON success — leave count unknown */
    }
    return { ok: true, detail: `campaignCount=${count}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const limit = Number(arg("--limit") ?? "0") || 0;

  const payload = await getPayload({ config: await config });
  const found = await payload.find({
    collection: "clients",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  let clients = found.docs as unknown as ClientRow[];
  clients = clients
    .filter((c) => typeof c.slug === "string" && c.slug.length > 0)
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  if (limit > 0) clients = clients.slice(0, limit);

  console.log(
    `Checking ${clients.length} client(s) against ${GROWTH_TOOLS_URL ?? "(no GROWTH_TOOLS_URL)"}\n`,
  );

  const results: Result[] = [];
  for (const c of clients) {
    const slug = String(c.slug);
    const name = c.name ?? slug;
    const digits = typeof c.googleAdsCustomerId === "string" ? c.googleAdsCustomerId.replace(/\D/g, "") : "";

    if (!digits) {
      results.push({ slug, name, customerId: null, outcome: "NO_CUSTOMER_ID", detail: "no googleAdsCustomerId set" });
      continue;
    }
    if (digits.length !== 10) {
      results.push({ slug, name, customerId: digits, outcome: "BAD_CUSTOMER_ID", detail: `${digits.length} digits (need 10)` });
      continue;
    }

    const live = await checkLive(digits);
    results.push({
      slug,
      name,
      customerId: digits,
      outcome: live.ok ? "PASS" : "UPSTREAM_FAIL",
      detail: live.detail,
    });
  }

  // Per-client lines
  for (const r of results) {
    const tag = r.outcome.padEnd(15);
    const cid = r.customerId ? ` [${r.customerId}]` : "";
    console.log(`${tag} ${r.slug}${cid} — ${r.detail}`);
  }

  // Summary
  const by = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(
    `\nSummary of ${results.length}: ` +
      `PASS ${by("PASS")}, ` +
      `NO_CUSTOMER_ID ${by("NO_CUSTOMER_ID")}, ` +
      `BAD_CUSTOMER_ID ${by("BAD_CUSTOMER_ID")}, ` +
      `UPSTREAM_FAIL ${by("UPSTREAM_FAIL")}.`,
  );
  console.log(
    "\nNote: PASS = will work once the new slug route is deployed. " +
      "UPSTREAM_FAIL on a valid id usually means the account isn't reachable via the agency MCC (or the API key/creds differ in this env).",
  );

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
