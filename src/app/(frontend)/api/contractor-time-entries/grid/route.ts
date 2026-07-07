import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { getEffectiveFeatures } from "@/lib/access";

const ENTRY_SELECT = {
  user: true,
  contractor: true,
  weekCommencing: true,
  hours: true,
  status: true,
  notes: true,
  clientAllocations: true,
  totalFee: true,
} as const;

function hasTimeEntryAccess(user: any): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "manager" || user.role === "specialist" || getEffectiveFeatures(user).size > 0;
}

function relationshipId(value: unknown) {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function monthRange(month: string) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { safeMonth, startIso: start.toISOString(), endIso: end.toISOString() };
}

async function getAuthedPayload() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  return { payload, user };
}

function normalizeAllocations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((allocation) => {
      const row = allocation as Record<string, unknown>;
      const client = relationshipId(row.client);
      const hours = Number(row.hours || 0);
      if (!client || !Number.isFinite(hours) || hours <= 0) return null;
      return { client, hours: Math.round(hours * 100) / 100 };
    })
    .filter(Boolean);
}

function serializeEntry(entry: any) {
  return {
    ...entry,
    user: typeof entry.user === "object" ? entry.user?.id : entry.user,
    contractor: typeof entry.contractor === "object" ? entry.contractor?.id : entry.contractor,
    clientAllocations: (entry.clientAllocations || []).map((allocation: any) => ({
      client: typeof allocation.client === "object" ? allocation.client?.id : allocation.client,
      hours: Number(allocation.hours || 0),
    })).filter((allocation: any) => allocation.client),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !hasTimeEntryAccess(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const { startIso, endIso } = monthRange(searchParams.get("month") || "");
    const selectedUser = searchParams.get("user") || "";

    const and: any[] = [
      { weekCommencing: { greater_than_equal: startIso } },
      { weekCommencing: { less_than: endIso } },
    ];
    if (user.role === "admin") {
      if (selectedUser) and.push({ user: { equals: selectedUser } });
    } else {
      and.push({ user: { equals: user.id } });
    }

    const [entriesResult, clientsResult, usersWithTimeResult] = await Promise.all([
      payload.find({
        collection: "contractor-time-entries" as any,
        where: { and },
        sort: "weekCommencing",
        limit: 500,
        depth: 1,
        select: ENTRY_SELECT as any,
        overrideAccess: true,
      }),
      payload.find({
        collection: "clients",
        where: { isActive: { not_equals: false } },
        sort: "name",
        limit: 500,
        depth: 0,
        select: { name: true } as any,
        overrideAccess: true,
      }),
      user.role === "admin"
        ? payload.find({
            collection: "contractor-time-entries" as any,
            where: { user: { exists: true } },
            sort: "user",
            limit: 1000,
            depth: 1,
            select: { user: true } as any,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] }),
    ]);

    const clientNameById = new Map((clientsResult.docs as any[]).map((client) => [String(client.id), client.name || `Client ${client.id}`]));
    const totalByClient = new Map<string, number>();
    for (const entry of entriesResult.docs as any[]) {
      for (const allocation of entry.clientAllocations || []) {
        const clientId = String(typeof allocation.client === "object" ? allocation.client?.id : allocation.client);
        if (!clientId) continue;
        totalByClient.set(clientId, (totalByClient.get(clientId) || 0) + Number(allocation.hours || 0));
      }
    }

    const monthlyTotals = (clientsResult.docs as any[]).map((client) => ({
      clientId: String(client.id),
      clientName: client.name || `Client ${client.id}`,
      hours: Math.round((totalByClient.get(String(client.id)) || 0) * 100) / 100,
    }));

    const seenUserIds = new Set<string>();
    const timeUserIds = user.role === "admin"
      ? (usersWithTimeResult.docs as any[])
          .map((entry) => typeof entry.user === "object" ? entry.user?.id : entry.user)
          .filter((id) => id != null)
          .map((id) => String(id))
          .filter((id) => !seenUserIds.has(id) && seenUserIds.add(id))
      : [String(user.id)];
    const usersResult = timeUserIds.length > 0
      ? await payload.find({
          collection: "users",
          where: { id: { in: timeUserIds } },
          sort: "name",
          limit: 500,
          depth: 0,
          select: { name: true, email: true } as any,
          overrideAccess: true,
        })
      : { docs: [] };
    const users = (usersResult.docs as any[]).map((timeUser) => ({
      id: timeUser.id,
      name: timeUser.name || timeUser.email || `User ${timeUser.id}`,
      email: timeUser.email,
    }));

    return NextResponse.json({
      entries: (entriesResult.docs as any[]).map(serializeEntry),
      clients: (clientsResult.docs as any[]).map((client) => ({ id: client.id, name: client.name })),
      users,
      currentUser: { id: user.id, name: user.name || user.email || `User ${user.id}`, email: user.email },
      isAdmin: user.role === "admin",
      monthlyTotals: monthlyTotals.filter((total) => total.hours > 0 || clientNameById.has(total.clientId)),
      canDelete: user.role === "admin",
    });
  } catch (error) {
    console.error("[contractor-time-entries/grid] GET error:", error);
    return NextResponse.json({ error: "Failed to load contractor time entries" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !hasTimeEntryAccess(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const owner = user.role === "admin" ? relationshipId(body.user) : user.id;
    if (!owner) return NextResponse.json({ error: "User is required" }, { status: 400 });
    const contractor = relationshipId(body.contractor);

    const entry = await payload.create({
      collection: "contractor-time-entries" as any,
      overrideAccess: true,
      data: {
        user: owner,
        contractor,
        weekCommencing: body.weekCommencing || new Date().toISOString(),
        hours: Number(body.hours || 0),
        status: body.status || "draft",
        clientAllocations: normalizeAllocations(body.clientAllocations) as any,
      } as any,
      depth: 1,
    });

    return NextResponse.json({ entry: serializeEntry(entry) });
  } catch (error) {
    console.error("[contractor-time-entries/grid] POST error:", error);
    return NextResponse.json({ error: "Failed to create contractor time entry" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || !hasTimeEntryAccess(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Missing entry id" }, { status: 400 });

    const current = await payload.findByID({ collection: "contractor-time-entries" as any, id: body.id, depth: 0, overrideAccess: true });
    if (user.role !== "admin" && String((current as any).user) !== String(user.id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((current as any).status === "paid") {
      return NextResponse.json({ error: "Paid entries are locked" }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "user") && user.role === "admin") data.user = relationshipId(body.user) ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "contractor") && user.role === "admin") data.contractor = relationshipId(body.contractor) ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "weekCommencing")) data.weekCommencing = body.weekCommencing;
    if (Object.prototype.hasOwnProperty.call(body, "hours")) data.hours = Math.max(0, Number(body.hours || 0));
    if (Object.prototype.hasOwnProperty.call(body, "status")) data.status = body.status || "draft";
    if (Object.prototype.hasOwnProperty.call(body, "notes")) data.notes = body.notes || null;
    if (Object.prototype.hasOwnProperty.call(body, "clientAllocations")) data.clientAllocations = normalizeAllocations(body.clientAllocations);

    const entry = await payload.update({
      collection: "contractor-time-entries" as any,
      id: body.id,
      data: data as any,
      depth: 1,
      overrideAccess: true,
    });

    return NextResponse.json({ entry: serializeEntry(entry) });
  } catch (error) {
    console.error("[contractor-time-entries/grid] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update contractor time entry" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { payload, user } = await getAuthedPayload();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing entry id" }, { status: 400 });

    const current = await payload.findByID({ collection: "contractor-time-entries" as any, id, depth: 0, overrideAccess: true });
    if ((current as any).status === "paid") {
      return NextResponse.json({ error: "Paid entries are locked" }, { status: 409 });
    }

    await payload.delete({ collection: "contractor-time-entries" as any, id, overrideAccess: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[contractor-time-entries/grid] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete contractor time entry" }, { status: 500 });
  }
}
