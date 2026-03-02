import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  extractSpreadsheetId,
  readSheetLists,
  readExistingKeywords,
  appendToList,
} from "@/lib/sheets-service";
import { logActivity } from "@/lib/activity-log";

/**
 * POST /api/negative-sweep/sync-sheet
 * Write approved candidates to the client's Google Sheet.
 * Body: { clientId: string }
 */
export async function POST(request: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({
    headers: request.headers,
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
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

    // Get the shared refresh token
    const sheetsAuth = await payload.findGlobal({
      slug: "sheets-auth" as any,
      overrideAccess: true,
    });
    const refreshToken = (sheetsAuth as any).refreshToken;
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Sheets not connected" },
        { status: 400 }
      );
    }

    // Find approved candidates not yet written to sheet
    const candidates = await payload.find({
      collection: "negative-sweep-candidates" as any,
      where: {
        client: { equals: clientId },
        status: { equals: "approved" },
        writtenToSheet: { not_equals: true },
      },
      limit: 1000,
      overrideAccess: true,
    });

    if (candidates.docs.length === 0) {
      return NextResponse.json({
        ok: true,
        written: 0,
        message: "No approved candidates to write",
      });
    }

    // Read available lists from the sheet
    const lists = await readSheetLists(refreshToken, spreadsheetId);
    const listMap = new Map(lists.map((l) => [l.name, l.column]));

    // Group candidates by their assigned/suggested list
    const byList = new Map<string, { id: string; keyword: string }[]>();

    for (const doc of candidates.docs as any[]) {
      const listName = doc.assignedList || doc.suggestedList;
      if (!listName || !listMap.has(listName)) {
        // If no valid list, skip (will need manual assignment)
        continue;
      }
      if (!byList.has(listName)) byList.set(listName, []);
      byList.get(listName)!.push({
        id: doc.id,
        keyword: doc.searchTerm,
      });
    }

    let totalWritten = 0;
    const writtenIds: string[] = [];

    for (const [listName, items] of byList) {
      const column = listMap.get(listName)!;

      // Read existing keywords to avoid duplicates
      const existing = await readExistingKeywords(
        refreshToken,
        spreadsheetId,
        column
      );
      const existingSet = new Set(existing);

      const newKeywords = items.filter(
        (item) => !existingSet.has(item.keyword.toLowerCase().trim())
      );

      if (newKeywords.length > 0) {
        await appendToList(
          refreshToken,
          spreadsheetId,
          column,
          newKeywords.map((item) => item.keyword)
        );
        totalWritten += newKeywords.length;
        writtenIds.push(...newKeywords.map((item) => item.id));
      }

      // Mark all items in this list as written (including duplicates that were already there)
      for (const item of items) {
        writtenIds.push(item.id);
      }
    }

    // Mark candidates as written
    const now = new Date().toISOString();
    for (const id of [...new Set(writtenIds)]) {
      await payload.update({
        collection: "negative-sweep-candidates" as any,
        id,
        data: {
          writtenToSheet: true,
          writtenAt: now,
        } as any,
        overrideAccess: true,
      });
    }

    logActivity(payload, {
      type: "negative_sweep_synced" as any,
      title: `Synced ${totalWritten} negative keywords to sheet`,
      description: `Client: ${(client as any).name}`,
      user: user.id,
      client: clientId,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      written: totalWritten,
      markedWritten: [...new Set(writtenIds)].length,
      lists: Object.fromEntries(
        [...byList].map(([name, items]) => [name, items.length])
      ),
    });
  } catch (err: any) {
    console.error("[negative-sweep/sync-sheet]", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Failed to sync to sheet" },
      { status: 500 }
    );
  }
}
