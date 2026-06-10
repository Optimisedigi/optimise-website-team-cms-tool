import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * Returns team members eligible to be account managers as `{ name, email }`
 * options. "Managers" = users granted admin-level access, i.e. role `admin`
 * or `manager` (specialists are excluded). Used by the AccountManagersField
 * combobox (client profile) and the Clients list bulk-assign control.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await payload.find({
      collection: "users",
      where: { role: { in: ["admin", "manager"] } },
      sort: "name",
      limit: 500,
      depth: 0,
      select: { name: true, email: true } as never,
    });

    const managers = result.docs
      .map((u: { name?: string | null; email?: string | null }) => ({
        name: (u.name || "").trim(),
        email: (u.email || "").trim(),
      }))
      .filter((m) => m.email);

    return NextResponse.json({ managers });
  } catch (err) {
    console.error("[users/managers] error:", err);
    return NextResponse.json(
      { error: "Failed to load managers" },
      { status: 500 },
    );
  }
}
