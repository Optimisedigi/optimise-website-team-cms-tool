import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

/**
 * Returns CMS users as `{ name, email }` options for account-manager pickers.
 * A signed-in CMS user can still manually enter a non-user manager in the field,
 * but the dropdown should show people created in the CMS.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "manager") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await payload.find({
      collection: "users",
      sort: "name",
      limit: 500,
      depth: 0,
      where: { role: { in: ["admin", "manager"] } },
      overrideAccess: true,
      select: { name: true, email: true } as never,
    });

    const managers = result.docs
      .map((u: { name?: string | null; email?: string | null }) => {
        const email = (u.email || "").trim();
        return {
          name: (u.name || email).trim(),
          email,
        };
      })
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
