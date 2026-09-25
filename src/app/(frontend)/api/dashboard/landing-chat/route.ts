import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "drizzle-orm";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import { proxyProductionLandingDashboard } from "@/lib/production-landing-dashboard";
import { resolveLandingDateRange } from "@/lib/landing-date-range";
import { clampToLayout, hasLayouts, parseLayout } from "@/lib/landing-layouts";
import { CHAT_REPORT_EVENT_TYPES, summariseChat, type ChatEventRow } from "@/lib/landing-chat-report";

/**
 * Guided chat depth for the landing dashboard: the step funnel, how the chat
 * was opened, which path visitors took and where they stopped.
 *
 * Auth matches its siblings: a client PIN token for this slug, else a Payload
 * admin session. Scoped to the client's own events by numeric id.
 */

/** Chat traffic is small; this bounds memory if that ever stops being true. */
const MAX_ROWS = 50_000;

const GOOGLE_ADS_ROW_PREDICATE =
  "(json_extract(`attribution`, '$.gclid') IS NOT NULL" +
  " OR json_extract(`attribution`, '$.gbraid') IS NOT NULL" +
  " OR json_extract(`attribution`, '$.wbraid') IS NOT NULL)";

function sanitiseFilter(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return /^[A-Za-z0-9_/-]+$/.test(trimmed) ? trimmed : null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    const payloadForAuth = await getPayload({ config });
    const { user } = await payloadForAuth.auth({ headers: req.headers });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productionData = await proxyProductionLandingDashboard(req, "/api/dashboard/landing-chat");
  if (productionData) return productionData;

  const range = resolveLandingDateRange(req.nextUrl.searchParams);
  if (!range) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  const pageFilter = sanitiseFilter(req.nextUrl.searchParams.get("page"), 60);
  const pageSetFilter = (req.nextUrl.searchParams.get("pages") ?? "")
    .split(",")
    .map((value) => sanitiseFilter(value, 60))
    .filter((value): value is string => Boolean(value))
    .slice(0, 200);
  const pageScope = pageFilter ? [pageFilter] : pageSetFilter;
  const deviceFilter = sanitiseFilter(req.nextUrl.searchParams.get("device"), 20);
  const marketFilter = sanitiseFilter(req.nextUrl.searchParams.get("market"), 12);

  const payload = await getPayload({ config });
  const client = (
    await payload.find({ collection: "clients", where: { slug: { equals: slug } }, depth: 0, limit: 1, overrideAccess: true })
  ).docs[0] as { id?: number | string } | undefined;
  if (!client?.id) return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  const clientId = Number(client.id);
  if (!Number.isSafeInteger(clientId)) return NextResponse.json({ error: "Unknown client" }, { status: 404 });

  // Same reporting baseline as the main report, so the two agree on totals.
  const properties = await payload.find({
    collection: "landing-properties",
    where: { client: { equals: client.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const rawStart = (properties.docs[0] as { dataStartDate?: string | null } | undefined)?.dataStartDate;
  const parsedStart = rawStart ? new Date(rawStart) : null;
  const dataStartDate =
    parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart.toISOString() : null;
  const baselineSince = dataStartDate && dataStartDate > range.since ? dataStartDate : range.since;

  const layout = hasLayouts(slug) ? parseLayout(req.nextUrl.searchParams.get("layout")) : null;
  const layoutWindow = layout
    ? clampToLayout(layout, baselineSince, range.until)
    : { since: baselineSince, until: range.until, empty: false };

  // Every interpolated value is a numeric id, a constant, an ISO string from the
  // range resolver, or a filter restricted to [A-Za-z0-9_/-] - and still escaped.
  const escape = (value: string) => value.replace(/'/g, "''");
  const types = CHAT_REPORT_EVENT_TYPES.map((type) => `'${type}'`).join(", ");
  const filters = [
    pageScope.length ? `\`page_id\` IN (${pageScope.map((id) => `'${escape(id)}'`).join(", ")})` : "",
    marketFilter ? `\`market\` = '${escape(marketFilter)}'` : "",
    deviceFilter ? `\`device_class\` = '${escape(deviceFilter)}'` : "",
  ].filter(Boolean);
  const filterClause = filters.length ? ` AND ${filters.join(" AND ")}` : "";

  let rows: ChatEventRow[] = [];
  let truncated = false;
  let trackingSince: string | null = null;

  try {
    if (!layoutWindow.empty) {
      const statement = `
        SELECT \`session_id\` AS session_id,
               \`event_type\` AS event_type,
               \`occurred_at\` AS occurred_at,
               CASE WHEN ${GOOGLE_ADS_ROW_PREDICATE} THEN 1 ELSE 0 END AS paid,
               json_extract(\`properties\`, '$.trigger') AS trigger_kind,
               json_extract(\`properties\`, '$.node') AS node,
               json_extract(\`properties\`, '$.choice') AS choice,
               json_extract(\`properties\`, '$.step') AS step,
               json_extract(\`properties\`, '$.booking_id') AS booking_id
        FROM \`landing_events\`
        WHERE \`client_id\` = ${clientId}
          AND \`occurred_at\` >= '${escape(layoutWindow.since)}' AND \`occurred_at\` < '${escape(layoutWindow.until)}'
          AND \`event_type\` IN (${types})${filterClause}
        ORDER BY \`occurred_at\` DESC
        LIMIT ${MAX_ROWS + 1}`;
      const result = await payload.db.drizzle.run(sql.raw(statement));
      const raw = (result as { rows?: Record<string, unknown>[] })?.rows ?? [];
      truncated = raw.length > MAX_ROWS;
      rows = raw.slice(0, MAX_ROWS).map((row) => ({
        sessionId: String(row.session_id ?? ""),
        eventType: String(row.event_type ?? ""),
        occurredAt: String(row.occurred_at ?? ""),
        paid: Number(row.paid) === 1,
        trigger: text(row.trigger_kind),
        node: text(row.node),
        choice: text(row.choice),
        step: row.step == null ? null : Number(row.step),
        bookingId: text(row.booking_id),
      }));
    }

    const first = await payload.db.drizzle.run(
      sql.raw(
        `SELECT MIN(\`occurred_at\`) AS first_open FROM \`landing_events\` WHERE \`client_id\` = ${clientId} AND \`event_type\` = 'chat_open'`,
      ),
    );
    trackingSince = text((first as { rows?: Record<string, unknown>[] })?.rows?.[0]?.first_open);
  } catch (error) {
    console.error("[landing-chat] query failed:", error instanceof Error ? error.message.slice(0, 200) : error);
    return NextResponse.json({ error: "Chat data is unavailable" }, { status: 502 });
  }

  // A session is paid if any of its events carries a Google Ads click id.
  const paidSessions = new Set(rows.filter((row) => row.paid).map((row) => row.sessionId));

  return NextResponse.json(
    {
      all: summariseChat(rows),
      paid: summariseChat(rows.filter((row) => paidSessions.has(row.sessionId))),
      trackingSince,
      truncated,
      rangeLabel: range.label,
      layout,
      layoutSince: layout ? layoutWindow.since : null,
      layoutUntil: layout ? layoutWindow.until : null,
      layoutEmpty: layoutWindow.empty,
      filters: { pages: pageScope, market: marketFilter, device: deviceFilter },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
