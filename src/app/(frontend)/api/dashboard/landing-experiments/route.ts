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
  READINESS_CHECKLIST_FORM_ID,
  READINESS_CHECKLIST_GOAL,
  matchesGoal,
  summariseSections,
  summariseSessionTime,
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

/**
 * Conversions worth counting beside the primary goal.
 *
 * These are outcomes, not events: the checklist sign-up is a form_submit from
 * one form. Reported on distinct sessions, and only when the goal is not already
 * the primary one — the same number twice under two names invites the reader to
 * add them together.
 */
const SECONDARY_GOALS: { id: string; label: string }[] = [
  { id: "booking_complete", label: "Bookings completed" },
  { id: READINESS_CHECKLIST_GOAL, label: "Readiness checklist sign-ups" },
];

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
  goalPredicate: string,
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
             COUNT(DISTINCT CASE WHEN ${goalPredicate} THEN \`session_id\` END) AS conversions
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

/**
 * Post-click paid performance per landing page, from the click ids already
 * stored on each session's attribution.
 *
 * This is deliberately only half the picture. Impressions, clicks, CTR and cost
 * live in Google Ads and reach this CMS through the Growth Tools service, which
 * exposes no landing-page endpoint yet, so nothing in this repo can produce
 * them. What is here — sessions that arrived on an ad click, and what they did
 * next — comes from data already collected, and the UI states the missing half
 * rather than implying these are all the numbers there are.
 */
async function loadPaidTraffic(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: number | string,
  since: string,
  goalPredicate: string
): Promise<Segment[]> {
  const escape = (value: string) => value.replace(/'/g, "''");
  // A Google Ads click carries one of these three ids; gbraid/wbraid are what
  // arrives when the click id is restricted for privacy, so reading gclid alone
  // would undercount iOS traffic.
  const paidClause =
    "(json_extract(`attribution`, '$.gclid') IS NOT NULL" +
    " OR json_extract(`attribution`, '$.gbraid') IS NOT NULL" +
    " OR json_extract(`attribution`, '$.wbraid') IS NOT NULL)";

  const statement = `
    SELECT COALESCE(NULLIF(\`page_id\`, ''), '(unset)') AS bucket,
           COUNT(DISTINCT \`session_id\`) AS sessions,
           COUNT(DISTINCT CASE WHEN ${goalPredicate} THEN \`session_id\` END) AS conversions
    FROM \`landing_events\`
    WHERE \`client_id\` = '${escape(String(clientId))}' AND \`occurred_at\` >= '${escape(since)}'
      AND ${paidClause}
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
    console.error("[landing-experiments] paid traffic query failed:", error);
    return [];
  }
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
  const requestedSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

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

  // Reporting baseline. A property can declare a date before which its events
  // are noise (test traffic, a pre-launch build), and the report clamps to it
  // rather than deleting anything: clearing the field restores the full history.
  const properties = await payload.find({
    collection: "landing-properties",
    where: { client: { equals: client.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const rawStart = properties.docs[0]?.dataStartDate;
  const parsedStart = rawStart ? new Date(rawStart) : null;
  const dataStartDate =
    parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart.toISOString() : null;
  const since =
    dataStartDate && dataStartDate > requestedSince ? dataStartDate : requestedSince;
  const baselineApplied = since !== requestedSince;

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

  // The goal is one of the collection's fixed options, never caller input, and
  // the checklist goal is a form_submit narrowed by form_id rather than an event
  // type of its own.
  const goalPredicate =
    primaryGoal === READINESS_CHECKLIST_GOAL
      ? "`event_type` = 'form_submit' AND json_extract(`properties`, '$.form_id') = '" +
        READINESS_CHECKLIST_FORM_ID +
        "'"
      : "`event_type` = '" + primaryGoal.replace(/'/g, "''") + "'";

  const [facets, paidTraffic] = await Promise.all([
    loadFacets(payload, client.id, since, goalPredicate, pageFilter),
    loadPaidTraffic(payload, client.id, since, goalPredicate),
  ]);

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
  // Whole-page time per session, summed across that session's page views. A
  // session's page views are distinct visits to the page, so summing is the
  // session total; the page_view_id guard stops a re-sent beacon counting twice.
  const pageActiveMsBySession = new Map<string, number>();
  const pageTotalMsBySession = new Map<string, number>();
  const pageDwellSeen = new Set<string>();
  // Every session in range, so sessions predating page_dwell can be reported as
  // unmeasured instead of silently disappearing from the denominator.
  const sessionsInRange = new Set<string>();
  const secondaryGoalSessions = new Map<string, Set<string>>();


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
      sessionsInRange.add(sessionId);

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

      for (const goal of SECONDARY_GOALS) {
        if (goal.id === primaryGoal) continue;
        if (!matchesGoal(goal.id, eventType, properties)) continue;
        if (!secondaryGoalSessions.has(goal.id)) secondaryGoalSessions.set(goal.id, new Set());
        secondaryGoalSessions.get(goal.id)!.add(sessionId);
      }

      if (eventType === "page_dwell") {
        const pageViewId = String(event.pageViewId ?? "");
        const dwellKey = `${sessionId}|${pageViewId}`;
        const activeMs = Number(properties.active_ms);
        const totalMs = Number(properties.total_ms);
        if (Number.isFinite(activeMs) && activeMs >= 0 && !pageDwellSeen.has(dwellKey)) {
          pageDwellSeen.add(dwellKey);
          pageActiveMsBySession.set(sessionId, (pageActiveMsBySession.get(sessionId) ?? 0) + activeMs);
          if (Number.isFinite(totalMs) && totalMs >= 0) {
            pageTotalMsBySession.set(sessionId, (pageTotalMsBySession.get(sessionId) ?? 0) + totalMs);
          }
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
      if (matchesGoal(primaryGoal, eventType, properties)) accumulator.convertedSessions.add(sessionId);

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
      // The UI has to be able to explain an empty dashboard, so the baseline is
      // reported whenever it, and not the selected range, decided the start.
      dataStartDate,
      baselineApplied,
      rangeStart: since,
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
      paidTraffic: {
        pages: paidTraffic,
        // Stated in the payload, not only in the UI, so no consumer can read
        // these as complete Google Ads figures.
        preClickAvailable: false,
      },
      secondaryConversions: SECONDARY_GOALS.filter((goal) => goal.id !== primaryGoal).map(
        (goal) => {
          const sessions = secondaryGoalSessions.get(goal.id)?.size ?? 0;
          return {
            id: goal.id,
            label: goal.label,
            sessions,
            rate: sessionsInRange.size > 0 ? sessions / sessionsInRange.size : 0,
          };
        }
      ),
      sections: summariseSections(dwellMs, exitsBySection, lastSectionPerSession.size),
      sessionTime: summariseSessionTime(
        pageActiveMsBySession,
        pageTotalMsBySession,
        sessionsInRange.size
      ),
      behaviourTotals: totals,
      eventsScanned: scanned,
      // The UI must say so when a range was cut short, rather than presenting a
      // partial scan as the full picture.
      truncated,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
