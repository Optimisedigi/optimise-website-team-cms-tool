/**
 * End-to-end round-trip evidence script for the CMS-bound Client Discovery
 * Briefing flow (goal task 9e3dad4f).
 *
 * What it does:
 *   1. Ensures a local-admin user exists (from LOCAL_ADMIN_EMAIL /
 *      LOCAL_ADMIN_PASSWORD in .env.local) so we have a session cookie.
 *   2. Picks the first row of `clients` and `client-proposals` via the
 *      Payload local API.
 *   3. Logs in via /api/users/login to grab the auth cookie.
 *   4. PUTs a sample DiscoveryBriefingState (scope=client) against
 *      /api/client-discovery-briefings/by-scope.
 *   5. GETs it back and asserts the returned markdown contains the
 *      businessName and at least one canonical "## " section heading.
 *   6. Writes the full log to .gg/evidence/discovery-roundtrip.log
 *
 * Run from a shell that has the dev server up on :3004:
 *   npx tsx scripts/discovery-roundtrip.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getPayload } from "payload";
import config from "../src/payload.config";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingState,
} from "../src/lib/discovery-briefing/types";

const BASE_URL = process.env.DISCOVERY_BASE_URL ?? "http://localhost:3004";
const LOG_PATH = ".gg/evidence/discovery-roundtrip.log";

const ADMIN_EMAIL =
  process.env.LOCAL_ADMIN_EMAIL || "discovery-roundtrip@example.test";
const ADMIN_PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || "Test123!Local";

const logLines: string[] = [];
function log(...parts: unknown[]) {
  const line = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2)))
    .join(" ");
  console.log(line);
  logLines.push(line);
}

async function ensureAdminUser(): Promise<void> {
  const payload = await getPayload({ config });
  const existing = await payload.find({
    collection: "users",
    where: { email: { equals: ADMIN_EMAIL } } as any,
    limit: 1,
    overrideAccess: true,
  });
  if ((existing.docs as any[]).length === 0) {
    await payload.create({
      collection: "users",
      data: {
        email: ADMIN_EMAIL,
        name: "Discovery Roundtrip",
        password: ADMIN_PASSWORD,
        role: "admin",
        setupCompleted: true,
      } as any,
      overrideAccess: true,
    });
    log(`[setup] created admin user ${ADMIN_EMAIL}`);
  } else {
    // Reset the password so we can definitely log in.
    await payload.update({
      collection: "users",
      id: (existing.docs[0] as any).id,
      data: { password: ADMIN_PASSWORD } as any,
      overrideAccess: true,
    });
    log(`[setup] reused admin user ${ADMIN_EMAIL} (password reset)`);
  }
}

async function pickClientAndProposalIds(): Promise<{
  clientId: number | null;
  proposalId: number | null;
}> {
  const payload = await getPayload({ config });
  const clients = await payload.find({
    collection: "clients",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const proposals = await payload.find({
    collection: "client-proposals",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const clientId = (clients.docs?.[0] as any)?.id ?? null;
  const proposalId = (proposals.docs?.[0] as any)?.id ?? null;
  log(`[setup] first client id=${clientId}, first proposal id=${proposalId}`);
  return { clientId, proposalId };
}

async function loginAndGetCookies(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed ${res.status}: ${text}`);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) {
    // Fallback for older runtimes
    const single = res.headers.get("set-cookie");
    if (single) setCookie.push(single);
  }
  if (setCookie.length === 0) throw new Error("login response had no Set-Cookie");
  // Convert "name=value; Path=/; HttpOnly" → "name=value" pairs
  const cookieHeader = setCookie
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
  log(`[setup] obtained auth cookies (${setCookie.length})`);
  return cookieHeader;
}

function sampleState(): DiscoveryBriefingState {
  return {
    ...defaultDiscoveryBriefingState(),
    businessName: "Acme Discovery Round-Trip",
    websiteUrl: "https://acme.example.com",
    oneLiner: "We round-trip discovery briefings for fun and profit.",
    services: [
      { name: "Round-trip auditing", highMargin: true, focus: true },
      { name: "Markdown rendering", highMargin: false, focus: false },
    ],
    revenueSplit: "Round-trip auditing 70%, markdown rendering 30%",
    idealClient: "Engineering teams who care about server/client parity.",
    locations: "Sydney",
    geoFocus: "national",
    industries: ["tech", "other"],
    industryOther: "Developer tooling",
    usp: "We diff every save against the server-built markdown.",
    crm: "hubspot",
    cms: "custom",
    gbpExists: true,
    socialLinkedin: true,
    socialLinkedinHandle: "@acme",
    seoGoal: "leads",
    adsStatus: "active",
    adsBudget: "$1,000/month",
    websiteBudget: "10k-20k",
    seoBudget: "1k-3k",
    additionalNotes: "Generated by scripts/discovery-roundtrip.ts",
  };
}

async function main() {
  log(`[start] ${new Date().toISOString()} base=${BASE_URL}`);
  await ensureAdminUser();
  const { clientId, proposalId } = await pickClientAndProposalIds();
  if (clientId == null) {
    throw new Error(
      "No clients found in the database — create at least one client before running this round-trip.",
    );
  }
  if (proposalId == null) {
    log(`[warn] no client-proposals found; round-trip will only exercise scope=client`);
  }

  const cookie = await loginAndGetCookies();
  const url = `${BASE_URL}/api/client-discovery-briefings/by-scope?scope=client&id=${clientId}`;

  // ── 400 sanity check (bad scope) ────────────────────────────────
  const bad = await fetch(`${BASE_URL}/api/client-discovery-briefings/by-scope?scope=bogus&id=1`, {
    headers: { cookie },
  });
  log(`[validate] bad-scope status=${bad.status} (expected 400)`);
  if (bad.status !== 400) throw new Error(`expected 400 for bad scope, got ${bad.status}`);

  // ── 401 sanity check (no cookie) ────────────────────────────────
  const unauth = await fetch(url);
  log(`[validate] no-cookie status=${unauth.status} (expected 401)`);
  if (unauth.status !== 401) throw new Error(`expected 401 without cookie, got ${unauth.status}`);

  // ── PUT (scope=client) ──────────────────────────────────────────
  const state = sampleState();
  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ data: state }),
  });
  const putBody = await putRes.json();
  log(`[PUT] status=${putRes.status}`);
  log(`[PUT] response.id=${putBody.id} scope=${putBody.scope} scopeId=${putBody.scopeId}`);
  if (!putRes.ok) throw new Error(`PUT failed: ${JSON.stringify(putBody)}`);
  if (typeof putBody.markdown !== "string" || putBody.markdown.length === 0) {
    throw new Error("PUT response markdown was empty");
  }

  // ── GET (round-trip) ─────────────────────────────────────────────
  const getRes = await fetch(url, { headers: { cookie } });
  const getBody = await getRes.json();
  log(`[GET] status=${getRes.status}`);
  log(`[GET] response.id=${getBody.id}`);
  if (!getRes.ok) throw new Error(`GET failed: ${JSON.stringify(getBody)}`);

  // ── Assertions ───────────────────────────────────────────────────
  const md: string = getBody.markdown ?? "";
  const expectedHeadings = [
    "## Business Overview",
    "## Core Services",
    "## Target Audience",
    "## USP & Differentiation",
    "## Tech Stack",
    "## Current SEO & Online Presence",
    "## Social Proof",
    "## SEO Strategy",
    "## Google Ads",
    "## Budget & Timeline",
    "## Discovery Notes",
  ];
  const foundHeadings = expectedHeadings.filter((h) => md.includes(h));
  log(`[assert] markdown length=${md.length}`);
  log(`[assert] expected businessName in markdown: ${md.includes(state.businessName)}`);
  log(`[assert] section headings found: ${foundHeadings.length}/${expectedHeadings.length}`);
  if (!md.includes(state.businessName)) {
    throw new Error("markdown is missing businessName");
  }
  if (foundHeadings.length < 1) {
    throw new Error("markdown contained no canonical section headings");
  }

  // Data round-trips structurally (we check a few key fields).
  const data = getBody.data as DiscoveryBriefingState;
  if (data.businessName !== state.businessName)
    throw new Error("round-trip businessName mismatch");
  if (data.services?.length !== state.services.length)
    throw new Error("round-trip services count mismatch");
  if (data.industries?.join(",") !== state.industries.join(","))
    throw new Error("round-trip industries mismatch");
  log(`[assert] data round-tripped (businessName, services.length=${data.services.length}, industries=${data.industries.join(",")})`);

  // ── Optional: scope=proposal smoke test ─────────────────────────
  if (proposalId != null) {
    const purl = `${BASE_URL}/api/client-discovery-briefings/by-scope?scope=proposal&id=${proposalId}`;
    const pPut = await fetch(purl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ data: { ...state, businessName: "Acme Proposal Round-Trip" } }),
    });
    log(`[PUT scope=proposal] status=${pPut.status}`);
    if (!pPut.ok) {
      const t = await pPut.text();
      throw new Error(`PUT scope=proposal failed: ${t}`);
    }
  }

  log(`[done] ${new Date().toISOString()} — round-trip OK`);
}

main()
  .then(async () => {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await writeFile(LOG_PATH, logLines.join("\n") + "\n", "utf8");
    console.log(`\nLog written to ${LOG_PATH}`);
    process.exit(0);
  })
  .catch(async (err) => {
    logLines.push(`[error] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await writeFile(LOG_PATH, logLines.join("\n") + "\n", "utf8");
    console.error(err);
    process.exit(1);
  });
