import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

interface ApplyPayload {
  nklId: string;
  keywords: Array<{
    keyword: string;
    matchType: "exact" | "broad" | "phrase";
    flaggedForRemoval?: boolean;
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body: ApplyPayload = await req.json();
  const { nklId, keywords } = body;

  if (!nklId || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json(
      { error: "nklId and keywords are required" },
      { status: 400 }
    );
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Fetch the session
  const session = await payload.findByID({
    collection: "keyword-deep-dive-sessions",
    id: sessionId,
    overrideAccess: true,
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Fetch the target NKL
  const nkl = await payload.findByID({
    collection: "negative-keyword-lists",
    id: nklId,
    overrideAccess: true,
  });

  if (!nkl) {
    return NextResponse.json({ error: "NKL not found" }, { status: 404 });
  }

  // Merge keywords — skip duplicates (same keyword + matchType)
  const nklData = nkl as unknown as Record<string, unknown>;
  const existingSet = new Set(
    ((nklData.keywords as Array<{ keyword: string; matchType: string }>) ?? []).map(
      (k) => `${k.keyword.toLowerCase()}|${k.matchType}`
    )
  );

  const newKeywords = keywords
    .filter(
      (kw) => !existingSet.has(`${kw.keyword.toLowerCase()}|${kw.matchType}`)
    )
    .map((kw) => ({
      keyword: kw.keyword,
      matchType: kw.matchType,
      flaggedForRemoval: false,
    }));

  const currentKeywords: Array<{
    keyword: string;
    matchType: "exact" | "broad" | "phrase";
    flaggedForRemoval: boolean;
  }> = (nklData.keywords as Array<{
    keyword: string;
    matchType: "exact" | "broad" | "phrase";
    flaggedForRemoval: boolean;
  }>) ?? [];

  await payload.update({
    collection: "negative-keyword-lists",
    id: nklId,
    data: {
      keywords: [...currentKeywords, ...newKeywords],
    },
    overrideAccess: true,
  });

  // Mark session as applied — appliedToNKL expects a number (DB id)
  const nklIdNum = typeof nkl.id === "string" ? parseInt(nkl.id, 10) : nkl.id;
  await payload.update({
    collection: "keyword-deep-dive-sessions",
    id: sessionId,
    data: {
      status: "applied",
      appliedToNKL: nklIdNum,
    },
    overrideAccess: true,
  });

  return NextResponse.json({
    success: true,
    applied: newKeywords.length,
    skipped: keywords.length - newKeywords.length,
  });
}
