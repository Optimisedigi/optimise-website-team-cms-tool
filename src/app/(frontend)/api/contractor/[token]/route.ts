import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Token-gated contractor portal API. Never returns money values to the
 * client — only week + hours + status.
 *
 * GET  /api/contractor/[token]?weeks=8 — returns the last N weeks of
 *      time entries for the contractor (existing entries + placeholder
 *      empty entries for weeks not yet logged).
 *
 * POST /api/contractor/[token] body: { weekCommencing: ISO, hours, notes?, action: 'save' | 'submit' }
 *      Upserts the entry. `submit` flips status to submitted.
 *      Refuses to modify entries already approved or paid.
 */
function mondayOf(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = out.getUTCDay(); // 0 sun, 1 mon
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

function fmtIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function authContractor(token: string) {
  if (!token || token.length < 16) return null;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const result = await payload.find({
    collection: "contractors",
    where: { portalToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const c = result.docs[0] as any;
  if (!c || !c.isActive) return null;
  return { payload, contractor: c };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const auth = await authContractor(token);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { payload, contractor } = auth;

  const weeksParam = Math.min(
    24,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("weeks") || "8", 10) || 8),
  );

  // Build week list ending on the current Monday (oldest first).
  const today = mondayOf(new Date());
  const weeks: string[] = [];
  for (let i = weeksParam - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(fmtIso(d));
  }

  const earliest = weeks[0];
  const latest = weeks[weeks.length - 1];

  const entries = await payload.find({
    collection: "contractor-time-entries",
    where: {
      and: [
        { contractor: { equals: contractor.id } },
        { weekCommencing: { greater_than_equal: earliest } },
        { weekCommencing: { less_than_equal: latest } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
    sort: "weekCommencing",
  });

  const byWeek = new Map<string, any>();
  for (const e of entries.docs as any[]) {
    const k = String(e.weekCommencing || "").slice(0, 10);
    if (k) byWeek.set(k, e);
  }

  const rows = weeks.map((w) => {
    const e = byWeek.get(w);
    return {
      weekCommencing: w,
      hours: e ? Number(e.hours || 0) : null,
      status: e ? String(e.status || "draft") : "empty",
      notes: e ? String(e.notes || "") : "",
      locked: e ? ["approved", "paid"].includes(String(e.status)) : false,
    };
  });

  return NextResponse.json({
    success: true,
    contractor: {
      name: contractor.name,
      defaultWeeklyHours: Number(contractor.defaultWeeklyHours || 16),
    },
    weeks: rows,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const auth = await authContractor(token);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { payload, contractor } = auth;

  let body: { weekCommencing?: string; hours?: number; notes?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const wc = String(body.weekCommencing || "").slice(0, 10);
  if (!wc || !/^\d{4}-\d{2}-\d{2}$/.test(wc)) {
    return NextResponse.json({ error: "weekCommencing required (YYYY-MM-DD)" }, { status: 400 });
  }
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
    return NextResponse.json({ error: "hours must be between 0 and 168" }, { status: 400 });
  }
  const action = body.action === "submit" ? "submit" : "save";
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined;

  const existing = await payload.find({
    collection: "contractor-time-entries",
    where: {
      and: [
        { contractor: { equals: contractor.id } },
        { weekCommencing: { equals: wc } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const current = existing.docs[0] as any;
  if (current && ["approved", "paid"].includes(String(current.status))) {
    return NextResponse.json(
      { error: "This week is locked (already approved or paid)." },
      { status: 409 },
    );
  }

  const targetStatus =
    action === "submit"
      ? "submitted"
      : current?.status === "submitted"
        ? "submitted"
        : "draft";

  if (current) {
    await payload.update({
      collection: "contractor-time-entries",
      id: current.id,
      data: { hours, status: targetStatus, ...(notes != null ? { notes } : {}) },
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: "contractor-time-entries",
      data: {
        contractor: contractor.id,
        weekCommencing: wc,
        hours,
        status: targetStatus,
        ...(notes != null ? { notes } : {}),
      },
      overrideAccess: true,
    });
  }

  return NextResponse.json({ success: true, status: targetStatus });
}
