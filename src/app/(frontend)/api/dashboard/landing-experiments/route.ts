import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "drizzle-orm";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import {
  FUNNEL_STEPS,
  buildFunnel,
  compareVariants,
  createAccumulator,
  summariseSections,
  summariseVariant,
  type VariantAccumulator,
} from "@/lib/landing-experiment-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/landing-experiments?slug=<client-slug>&days=30
 *
 * Landing A/B results and behaviour counts for one client.
 *
 * The client is resolved from the slug the dashboard token was issued for, and
 * every event query is filtered by that client's id, so a token for one client
 * cannot read another's landing data.
 *
 * Two independent ways in: the client-facing dashboard token (PIN flow,
 * unchanged), or an authenticated Payload admin session — which lets the
 * internal /landing-pages-dashboard reuse this report for any client without
 * minting client tokens. An admin session is cross-tenant by definition; the
 * token path stays scoped to its slug exactly as before.
 */

/** Hard ceiling on rows scanned per request, so one busy client cannot stall the dashboard. */
const MAX_EVENTS_SCANNED = 20000;
const PAGE_SIZE = 1000;
const MAX_DAYS = 365;

/**
 * Attribution bucket: source / medium / campaign, the three fields that answer
 * "which ad spend produced this". Read out of the sanitised `attribution` JSON,
 * which ingest already restricts to the ATTRIBUTION_KEYS allowlist, so no free
 * text can reach this label.
 *
 * A missing source reads as `(direct)` rather than `(unset)`: an untagged visit
 * is a real bucket, not absent data.
 */
const ATTRIBUTION_BUCKET = `(
  COALESCE(NULLIF(json_extract(\`attribution\`, '$.utm_source'), ''), '(direct)') || ' / ' ||
  COALESCE(NULLIF(json_extract(\`attribution\`, '$.utm_medium'), ''), '(none)') || ' / ' ||
  COALESCE(NULLIF(json_extract(\`attribution\`, '$.utm_campaign'), ''), '(none)')
)`;

/**
 * Human labels for the known forms. An unrecognised form_id is shown as-is
 * rather than dropped, so a newly added form appears in the report instead of
 * silently vanishing into a pooled total.
 */
const FORM_LABELS: Record<string, string> = {
  qualification: "Qualification form",
  "readiness-checklist": "Readiness checklist (PDF)",
  "(unset)": "Unlabelled form",
};

export interface FormSubmissionSplit {
  formId: string;
  label: string;
  sessions: number;
}

/** Distinct sessions per form, busiest first. */
function summariseFormSubmissions(byForm: Map<string, Set<string>>): FormSubmissionSplit[] {
  return [...byForm.entries()]
    .map(([formId, sessions]) => ({
      formId,
      label: FORM_LABELS[formId] ?? formId,
      sessions: sessions.size,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.formId.localeCompare(b.formId));
}

/** Filters reach a database query, so anything outside this shape is ignored. */
function sanitiseFilter(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return /^[A-Za-z0-9_/-]+$/.test(trimmed) ? trimmed : null;
}

interface Segment {
  key: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

/**
 * Which pages, markets and devices exist in this range, and how each performs.
 *
 * Computed by one grouped query rather than from the scanned events, for two
 * reasons. The scan is capped, so deriving facets from it would offer a filter
 * list that silently omits a quiet page. And once a page filter is applied the
 * scan only contains that page, which would remove every other option from the
 * selector and leave no way back.
 *
 * The page and market lists stay global on purpose: they are how you move
 * between pages and how AU is compared with US, so narrowing them by the
 * current page would remove the only route back. The device split does follow
 * the selected page, because it sits directly above that page's own funnel and
 * two different totals in one view read as a bug.
 */
async function loadFacets(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number | string,
  since: string,
  primaryGoal: string,
  pageFilter: string | null
): Promise<{ pages: Segment[]; markets: Segment[]; devices: Segment[]; attribution: Segment[] }> {
  // Values are numeric ids or already-validated constants, and the two strings
  // are escaped, so this cannot carry caller-controlled SQL.
  const escape = (value: string) => value.replace(/'/g, "''");

  // `bucketExpr` is always one of the constants at the call site below, never
  // caller input.
  async function group(bucketExpr: string, scopeToPage = false): Promise<Segment[]> {
    const pageClause =
      scopeToPage && pageFilter ? ` AND \`page_id\` = '${escape(pageFilter)}'` : "";
    const statement = `
      SELECT COALESCE(NULLIF(${bucketExpr}, ''), '(unset)') AS bucket,
             COUNT(DISTINCT \`session_id\`) AS sessions,
             COUNT(DISTINCT CASE WHEN \`event_type\` = '${escape(primaryGoal)}' THEN \`session_id\` END) AS conversions
      FROM \`landing_events\`
      WHERE \`client_id\` = '${escape(String(clientId))}' AND \`occurred_at\` >= '${escape(since)}'${pageClause}
      GROUP BY bucket
      ORDER BY sessions DESC
      LIMIT 50`;

    try {
      const result = await payload.db.drizzle.run(sql.raw(statement));
      const rows = (result as { rows?: Record<string, unknown>[] })?.rows ?? [];
      return rows.map((row) => {
        const sessions = Number(row.sessions ?? 0);
        const conversions = Number(row.conversions ?? 0);
        return {
          key: String(row.bucket ?? "(unset)"),
          sessions,
          conversions,
          conversionRate: sessions > 0 ? conversions / sessions : 0,
        };
      });
    } catch (error) {
      // Facets are navigation, not the report. Losing them must not take the
      // whole dashboard down with them.
      console.error(`[landing-experiments] facet query failed for ${bucketExpr}:`, error);
      return [];
    }
  }

  const [pages, markets, devices, attribution] = await Promise.all([
    group("`page_id`"),
    group("`market`"),
    group("`device_class`", true),
    group(ATTRIBUTION_BUCKET),
  ]);
  return { pages, markets, devices, attribution };
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    // No valid client token — fall back to a Payload admin session, so the
    // internal dashboard can read any client's report without a minted token.
    const payloadForAuth = await getPayload({ config });
    const { user } = await payloadForAuth.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const requestedDays = Number(req.nextUrl.searchParams.get("days") || "30");
  const days = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_DAYS)
    : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Optional filters. Each landing page has its own sections and its own
  // funnel, and behaviour on a phone is not behaviour on a desktop, so
  // reporting everything together averages away the thing worth seeing.
  const pageFilter = sanitiseFilter(req.nextUrl.searchParams.get("page"), 60);
  const deviceFilter = sanitiseFilter(req.nextUrl.searchParams.get("device"), 20);
  const marketFilter = sanitiseFilter(req.nextUrl.searchParams.get("market"), 12);

  const payload = await getPayload({ config });

  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const client = clients.docs[0];
  if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 404 });

  const experiments = await payload.find({
    collection: "landing-experiments",
    where: { client: { equals: client.id } },
    depth: 0,
    limit: 50,
    overrideAccess: true,
    sort: "-createdAt",
  });

  const running = experiments.docs.find((doc) => doc.status === "running") ?? experiments.docs[0];
  const primaryGoal = (running?.primaryGoal as string) ?? "booking_complete";

  // Control is the first configured variant; comparisons are made against it.
  const configuredVariants = Array.isArray(running?.variants)
    ? running.variants
        .map((row: { variantId?: string | null }) => (typeof row?.variantId === "string" ? row.variantId : ""))
        .filter(Boolean)
    : [];
  const controlVariantId = configuredVariants[0] ?? "a";

  const facets = await loadFacets(payload, client.id, since, primaryGoal, pageFilter);

  const accumulators = new Map<string, VariantAccumulator>();
  for (const variantId of configuredVariants) accumulators.set(variantId, createAccumulator(variantId));

  const totals: Record<string, number> = {};

  // Funnel and dwell are tracked per variant as well as overall, so a variant
  // that converts worse can be traced to the step where it loses people.
  const funnelSteps = new Set<string>(FUNNEL_STEPS.map((step) => step.key));
  const stepSessions = new Map<string, Set<string>>();
  const stepSessionsByVariant = new Map<string, Map<string, Set<string>>>();
  const dwellMs = new Map<string, number[]>();
  const exitsBySection = new Map<string, number>();
  const lastSectionPerSession = new Map<string, string>();
  // One dwell figure per session per section: a repeat visit to a section must
  // not count as another reader.
  const dwellSeen = new Set<string>();
  // `form_submit` covers two unrelated intents: the qualification form (a lead)
  // and the readiness-checklist PDF download (an email capture). Pooled into a
  // single funnel step they are indistinguishable, so the checklist can inflate
  // what looks like lead volume. Split by form_id, on distinct sessions.
  const formSubmitSessions = new Map<string, Set<string>>();


  let scanned = 0;
  let page = 1;
  let truncated = false;

  // Paginate rather than pulling the whole table: bounded memory, bounded time.
  for (;;) {
    const batch = await payload.find({
      collection: "landing-events",
      where: {
        client: { equals: client.id },
        occurredAt: { greater_than_equal: since },
        ...(running?.experimentId ? { experimentId: { equals: running.experimentId } } : {}),
        // Only the page filter narrows the query. Device and market are
        // applied in memory below, because their summaries have to show the
        // whole split even while one of them is selected — a device toggle that
        // hides the other device's share is not a toggle, it is a dead end.
        ...(pageFilter ? { pageId: { equals: pageFilter } } : {}),
      },
      depth: 0,
      limit: PAGE_SIZE,
      page,
      sort: "occurredAt",
      overrideAccess: true,
    });

    for (const event of batch.docs) {
      const eventType = String(event.eventType ?? "");
      const sessionId = String(event.sessionId ?? "");
      const variantId = String(event.variantId ?? "");
      if (!eventType || !sessionId) continue;

      const pageId = String(event.pageId ?? "") || "(unset)";
      const market = String(event.market ?? "") || "(unset)";
      const device = String(event.deviceClass ?? "") || "(unset)";
      void pageId;
      void market;

      if (deviceFilter && device !== deviceFilter) continue;
      if (marketFilter && market !== marketFilter) continue;

      totals[eventType] = (totals[eventType] ?? 0) + 1;

      // Dwell and exit points are read from every session, with or without a
      // variant: knowing where people stop reading is useful even when no
      // experiment is running.
      const properties = (event.properties ?? {}) as Record<string, unknown>;
      const sectionId = typeof properties.section_id === "string" ? properties.section_id : "";

      if (sectionId) {
        if (eventType === "section_dwell") {
          const activeMs = Number(properties.active_ms);
          const key = `${sessionId}|${sectionId}`;
          if (Number.isFinite(activeMs) && activeMs > 0 && !dwellSeen.has(key)) {
            dwellSeen.add(key);
            if (!dwellMs.has(sectionId)) dwellMs.set(sectionId, []);
            dwellMs.get(sectionId)!.push(activeMs);
          }
        }
        // Only section_view marks progress through the page. Dwell events are
        // emitted together as the page is left, in whatever order the sections
        // were recorded, so letting them set this would pick an arbitrary
        // section as the exit point rather than the one reached last.
        if (eventType === "section_view") {
          lastSectionPerSession.set(sessionId, sectionId);
        }
      }

      if (eventType === "form_submit") {
        const formId = typeof properties.form_id === "string" && properties.form_id
          ? properties.form_id
          : "(unset)";
        if (!formSubmitSessions.has(formId)) formSubmitSessions.set(formId, new Set());
        formSubmitSessions.get(formId)!.add(sessionId);
      }

      // Events recorded before an experiment existed carry no variant; they
      // still count toward behaviour totals but cannot join the comparison.
      if (!variantId) continue;
      let accumulator = accumulators.get(variantId);
      if (!accumulator) {
        accumulator = createAccumulator(variantId);
        accumulators.set(variantId, accumulator);
      }

      accumulator.sessions.add(sessionId);
      accumulator.eventCounts[eventType] = (accumulator.eventCounts[eventType] ?? 0) + 1;
      // A session converts at most once, however many goal events it fires.
      if (eventType === primaryGoal) accumulator.convertedSessions.add(sessionId);

      if (funnelSteps.has(eventType)) {
        if (!stepSessions.has(eventType)) stepSessions.set(eventType, new Set());
        stepSessions.get(eventType)!.add(sessionId);

        if (!stepSessionsByVariant.has(variantId)) stepSessionsByVariant.set(variantId, new Map());
        const perVariant = stepSessionsByVariant.get(variantId)!;
        if (!perVariant.has(eventType)) perVariant.set(eventType, new Set());
        perVariant.get(eventType)!.add(sessionId);
      }
    }

    scanned += batch.docs.length;
    if (!batch.hasNextPage) break;
    if (scanned >= MAX_EVENTS_SCANNED) {
      truncated = true;
      break;
    }
    page += 1;
  }

  const variants = [...accumulators.values()]
    .map(summariseVariant)
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  // Tally exits only after every page has been scanned, so the last section is
  // genuinely the last one for that session and not merely the last in a batch.
  for (const sectionId of lastSectionPerSession.values()) {
    exitsBySection.set(sectionId, (exitsBySection.get(sectionId) ?? 0) + 1);
  }

  return NextResponse.json(
    {
      experiment: running
        ? {
            id: running.experimentId,
            name: running.name,
            status: running.status,
            allocationVersion: running.allocationVersion,
            primaryGoal,
            startedAt: running.startedAt ?? null,
          }
        : null,
      rangeDays: days,
      filters: { page: pageFilter, device: deviceFilter, market: marketFilter },
      ...facets,
      controlVariantId,
      variants,
      comparisons: compareVariants(variants, controlVariantId),
      funnel: buildFunnel(stepSessions),
      funnelByVariant: Object.fromEntries(
        [...stepSessionsByVariant.entries()]
          .filter(([variantId]) => variantId)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([variantId, steps]) => [variantId, buildFunnel(steps)])
      ),
      formSubmissions: summariseFormSubmissions(formSubmitSessions),
      sections: summariseSections(dwellMs, exitsBySection, lastSectionPerSession.size),
      behaviourTotals: totals,
      eventsScanned: scanned,
      // The UI must say so when a range was cut short, rather than presenting a
      // partial scan as the full picture.
      truncated,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
