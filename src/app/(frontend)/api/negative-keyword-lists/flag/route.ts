import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

/**
 * POST /api/negative-keyword-lists/flag
 * Allows clients to flag a keyword for removal via the PIN-protected page.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config });

    const body = await request.json();
    const { clientId, listId, keywordIndex, pin, unflag } = body as {
      clientId: number;
      listId: number;
      keywordIndex: number;
      pin: string;
      unflag?: boolean;
    };

    if (!clientId || !listId || keywordIndex == null || !pin) {
      return NextResponse.json(
        { error: "clientId, listId, keywordIndex, and pin are required" },
        { status: 400 },
      );
    }

    // Validate PIN against client
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    const pinResult = await checkPinWithLockout(
      `nkl-flag:${clientId}`,
      pin,
      ((client as { clientPin?: string } | null)?.clientPin) ?? "",
    );
    if (!pinResult.ok) {
      return NextResponse.json(
        { error: pinResult.message },
        { status: pinResult.status === 401 ? 403 : pinResult.status },
      );
    }

    // Get the list
    const list = await payload.findByID({
      collection: "negative-keyword-lists",
      id: listId,
      overrideAccess: true,
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Verify the list belongs to this client
    const listClientId = typeof (list as any).client === "object"
      ? (list as any).client.id
      : (list as any).client;
    if (Number(listClientId) !== Number(clientId)) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Update the keyword's flaggedForRemoval
    const keywords = [...((list as any).keywords || [])];
    if (keywordIndex < 0 || keywordIndex >= keywords.length) {
      return NextResponse.json({ error: "Invalid keyword index" }, { status: 400 });
    }

    keywords[keywordIndex] = {
      ...keywords[keywordIndex],
      flaggedForRemoval: !unflag,
    };

    await payload.update({
      collection: "negative-keyword-lists",
      id: listId,
      overrideAccess: true,
      data: { keywords },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[negative-keyword-lists/flag] error:", err);
    return NextResponse.json(
      { error: "Failed to flag keyword", details: String(err) },
      { status: 500 },
    );
  }
}
