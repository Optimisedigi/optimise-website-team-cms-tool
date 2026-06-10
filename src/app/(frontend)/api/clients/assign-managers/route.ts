import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

type ManagerInput = {
  name?: unknown;
  email?: unknown;
};

type AssignBody = {
  clientIds?: unknown;
  managers?: unknown;
  mode?: unknown;
};

type CleanManager = { name: string; email: string };

/** Keep only well-formed `{ name, email }` rows (both required, deduped). */
function cleanManagers(raw: unknown): CleanManager[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CleanManager[] = [];
  for (const item of raw as ManagerInput[]) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const email = typeof item?.email === "string" ? item.email.trim() : "";
    if (!name || !email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, email });
  }
  return out;
}

/**
 * Bulk-assign account managers to multiple clients from the Clients list view.
 *
 * Body: `{ clientIds, managers: [{name,email}], mode: 'replace' | 'append' }`.
 * `append` merges the managers into each client's existing list (deduped by
 * email); `replace` overwrites it. Updates run through the Payload local API so
 * collection access control and hooks apply.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AssignBody;
    const clientIds = Array.isArray(body.clientIds)
      ? (body.clientIds as (string | number)[]).filter(
          (id) => id !== null && id !== undefined && id !== "",
        )
      : [];
    const managers = cleanManagers(body.managers);
    const mode = body.mode === "append" ? "append" : "replace";

    if (clientIds.length === 0) {
      return NextResponse.json(
        { error: "No clients selected" },
        { status: 400 },
      );
    }
    if (managers.length === 0) {
      return NextResponse.json(
        { error: "No valid account managers provided" },
        { status: 400 },
      );
    }

    let updated = 0;
    const failures: (string | number)[] = [];

    for (const id of clientIds) {
      try {
        let next = managers;
        if (mode === "append") {
          const existingDoc = await payload.findByID({
            collection: "clients",
            id,
            depth: 0,
            overrideAccess: false,
            user,
          });
          const existing = cleanManagers(
            (existingDoc as { accountManagers?: unknown })?.accountManagers,
          );
          next = cleanManagers([...existing, ...managers]);
        }

        await payload.update({
          collection: "clients",
          id,
          data: { accountManagers: next },
          overrideAccess: false,
          user,
        });
        updated += 1;
      } catch (err) {
        console.error(`[clients/assign-managers] update failed for ${id}:`, err);
        failures.push(id);
      }
    }

    return NextResponse.json({ updated, failures });
  } catch (err) {
    console.error("[clients/assign-managers] error:", err);
    return NextResponse.json(
      { error: "Failed to assign account managers" },
      { status: 500 },
    );
  }
}
