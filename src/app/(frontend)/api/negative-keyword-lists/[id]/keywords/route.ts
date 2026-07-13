import { NextRequest, NextResponse } from "next/server";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

type Keyword = {
  id?: string | null;
  keyword?: string;
  matchType?: "broad" | "phrase" | "exact";
  flaggedForRemoval?: boolean | null;
  negatedAt?: string | null;
};

const MATCH_TYPES = new Set(["broad", "phrase", "exact"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!userHasFeature(user, "negative-keyword-lists")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const operation = body?.operation;
  if (operation !== "delete" && operation !== "update") {
    return NextResponse.json({ error: "operation must be delete or update" }, { status: 400 });
  }

  const transactionID = await payload.db.beginTransaction();
  if (transactionID === null) {
    return NextResponse.json({ error: "Could not start a safe keyword update" }, { status: 503 });
  }
  const payloadReq = await createLocalReq({ user }, payload);
  payloadReq.transactionID = transactionID;
  const reject = async (data: Record<string, unknown>, status: number) => {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
    return NextResponse.json(data, { status });
  };

  let list!: {
    id: string | number;
    client?: string | number | { id?: string | number } | null;
    name?: string | null;
    keywords?: Keyword[] | null;
    updatedAt?: string | null;
  };
  let currentKeywords: Keyword[] = [];
  let changedCount = 0;
  let updated!: { keywords?: Keyword[] | null; updatedAt?: string | null; keywordCount?: number | null };

  try {
    list = await payload.findByID({
      collection: "negative-keyword-lists",
      id,
      depth: 0,
      overrideAccess: true,
      req: payloadReq,
    }) as unknown as typeof list;
    currentKeywords = Array.isArray(list.keywords) ? list.keywords : [];
    const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
    const expectedKeywordCount = Number(body?.expectedKeywordCount);

    if (
      !expectedUpdatedAt ||
      expectedUpdatedAt !== String(list.updatedAt || "") ||
      !Number.isInteger(expectedKeywordCount) ||
      expectedKeywordCount !== currentKeywords.length
    ) {
      return reject({
        error: "This list changed after the page loaded. Reloaded data is required before editing.",
        code: "STALE_LIST",
        updatedAt: list.updatedAt,
        keywordCount: currentKeywords.length,
        keywords: currentKeywords,
      }, 409);
    }

    let nextKeywords: Keyword[];
    if (operation === "delete") {
      const keywordIds = Array.isArray(body?.keywordIds)
        ? body.keywordIds.map(String).filter(Boolean)
        : [];
      if (keywordIds.length === 0) {
        return reject({ error: "keywordIds is required" }, 400);
      }
      const requestedIds = new Set(keywordIds);
      const foundIds = new Set(
        currentKeywords
          .filter((keyword) => keyword.id !== undefined && requestedIds.has(String(keyword.id)))
          .map((keyword) => String(keyword.id)),
      );
      if (foundIds.size !== requestedIds.size) {
        return reject({
          error: "One or more keywords changed after the page loaded. Reload before deleting.",
          code: "STALE_KEYWORDS",
        }, 409);
      }
      nextKeywords = currentKeywords.filter((keyword) => !requestedIds.has(String(keyword.id)));
      changedCount = currentKeywords.length - nextKeywords.length;
    } else {
      const keywordId = body?.keywordId === undefined ? "" : String(body.keywordId);
      const patch = body?.patch && typeof body.patch === "object"
        ? body.patch as Record<string, unknown>
        : null;
      const keywordIndex = currentKeywords.findIndex((keyword) => String(keyword.id) === keywordId);
      if (!keywordId || keywordIndex < 0 || !patch) {
        return reject({ error: "A current keywordId and patch are required" }, 409);
      }

      const nextKeyword = { ...currentKeywords[keywordIndex] };
      if (patch.keyword !== undefined) {
        const keyword = typeof patch.keyword === "string" ? patch.keyword.trim() : "";
        if (!keyword) return reject({ error: "keyword cannot be blank" }, 400);
        nextKeyword.keyword = keyword;
      }
      if (patch.matchType !== undefined) {
        const matchType = String(patch.matchType).toLowerCase();
        if (!MATCH_TYPES.has(matchType)) {
          return reject({ error: "Invalid matchType" }, 400);
        }
        nextKeyword.matchType = matchType as Keyword["matchType"];
      }
      if (patch.flaggedForRemoval !== undefined) {
        if (typeof patch.flaggedForRemoval !== "boolean") {
          return reject({ error: "flaggedForRemoval must be boolean" }, 400);
        }
        nextKeyword.flaggedForRemoval = patch.flaggedForRemoval;
      }
      nextKeywords = [...currentKeywords];
      nextKeywords[keywordIndex] = nextKeyword;
      changedCount = 1;
    }

    updated = await payload.update({
      collection: "negative-keyword-lists",
      id,
      depth: 0,
      data: { keywords: nextKeywords },
      overrideAccess: true,
      req: payloadReq,
    }) as unknown as typeof updated;
    await payload.db.commitTransaction(transactionID);
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID).catch(() => undefined);
    throw error;
  }

  const updatedKeywords = Array.isArray(updated.keywords) ? updated.keywords : currentKeywords;
  try {
    const clientId = typeof list.client === "object" ? list.client?.id : list.client;
    await logActivity(payload, {
      type: "negative_keyword_list_updated",
      title: operation === "delete"
        ? `Removed ${changedCount} negative keyword${changedCount === 1 ? "" : "s"}`
        : "Updated 1 negative keyword",
      description: `List: ${list.name || id}. Count: ${currentKeywords.length} → ${updatedKeywords.length}.`,
      user: typeof user.id === "object" ? (user.id as { id: string | number }).id : user.id,
      ...(clientId ? { client: clientId } : {}),
    });
  } catch (error) {
    payload.logger?.warn?.(`[negative-keyword-lists/keywords] activity log failed: ${error}`);
  }

  return NextResponse.json({
    success: true,
    keywords: updatedKeywords,
    keywordCount: updated.keywordCount ?? updatedKeywords.length,
    updatedAt: updated.updatedAt,
  });
}
