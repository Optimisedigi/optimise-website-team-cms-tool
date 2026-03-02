import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  extractSpreadsheetId,
  readSheetLists,
} from "@/lib/sheets-service";

/**
 * GET /api/negative-sweep/lists?clientId=...
 * Returns available negative keyword lists from the client's Google Sheet.
 */
export async function GET(request: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({
    headers: request.headers,
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    const sheetUrl = (client as any).gadsAuto?.negativeSweepSheetUrl;
    if (!sheetUrl) {
      return NextResponse.json(
        { error: "Client has no negative sweep sheet URL configured" },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Invalid Google Sheets URL" },
        { status: 400 }
      );
    }

    // Get the shared refresh token from the global
    const sheetsAuth = await payload.findGlobal({
      slug: "sheets-auth" as any,
      overrideAccess: true,
    });
    const refreshToken = (sheetsAuth as any).refreshToken;
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Sheets not connected. Connect via Settings > Google Sheets Auth." },
        { status: 400 }
      );
    }

    const lists = await readSheetLists(refreshToken, spreadsheetId);

    return NextResponse.json({ ok: true, lists });
  } catch (err: any) {
    console.error("[negative-sweep/lists]", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to read sheet lists" },
      { status: 500 }
    );
  }
}
