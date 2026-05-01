import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

/**
 * Keyword Deep Dive — client-facing save endpoint.
 *
 * The Google Ads dashboard's Keyword Deep Dive tab lets the client mark
 * search terms they want added as negatives. When they hit "Save Selection"
 * we persist their list to a single Negative Keyword List per client where
 * `source = "deep_dive"`. The agency reviews this list in the CMS and
 * promotes terms into the live, synced NKLs as appropriate.
 *
 *   POST  → find-or-create the deep-dive list, replace keywords with the
 *           selected terms (each as { keyword, matchType: "exact",
 *           flaggedForRemoval: false }).
 *   GET   → return the saved keywords (for hydrating the dashboard on load).
 */

interface DeepDiveKeyword {
  keyword: string;
  matchType?: string;
  flaggedForRemoval?: boolean;
}

interface DeepDiveListDoc {
  id: number | string;
  keywords?: DeepDiveKeyword[];
}

async function findDeepDiveList(
  payload: Awaited<ReturnType<typeof getPayload>>,
  clientId: string | number,
): Promise<DeepDiveListDoc | undefined> {
  const result = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      and: [
        { client: { equals: clientId } },
        { source: { equals: "deep_dive" } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (result.docs as unknown as DeepDiveListDoc[])[0];
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("dashboard_token")?.value;
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const clientId = searchParams.get("clientId");

  if (!slug || !clientId || !validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const doc = await findDeepDiveList(payload, clientId);
  const allDeepDiveSelections: string[] = (doc?.keywords ?? [])
    .map((k) => k?.keyword)
    .filter((k): k is string => typeof k === "string" && k.length > 0);

  // Pull every keyword from any *real* (non-deep-dive) active NKL for this
  // client. These are terms the agency has already promoted into a synced
  // negative list — the dashboard renders them in an "Added as Negative"
  // disabled state so the client sees their reviewed picks have landed.
  const realLists = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      and: [
        { client: { equals: clientId } },
        { isActive: { equals: true } },
        { source: { not_equals: "deep_dive" } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });

  const addedSet = new Set<string>();
  for (const list of realLists.docs as unknown as DeepDiveListDoc[]) {
    for (const kw of list?.keywords ?? []) {
      if (typeof kw?.keyword === "string" && kw.keyword) {
        addedSet.add(kw.keyword.toLowerCase());
      }
    }
  }

  // Pending = saved-for-review but not yet promoted. Added = promoted into
  // a synced NKL. We split the deep-dive list into the two buckets so the
  // dashboard can render them differently without a second round-trip.
  const pendingSelections: string[] = [];
  const addedSelections: string[] = [];
  for (const term of allDeepDiveSelections) {
    if (addedSet.has(term.toLowerCase())) {
      addedSelections.push(term);
    } else {
      pendingSelections.push(term);
    }
  }

  // Also include terms that are negatives but were never in the deep-dive
  // list (e.g. agency added them directly via the CMS). These show as
  // "Added as Negative" too if they happen to appear in the dashboard's
  // current search-term lists.
  const addedNegatives: string[] = Array.from(addedSet);

  return NextResponse.json({
    keywords: pendingSelections,           // legacy field — still the source for the saved-for-review checkbox state
    pendingSelections,
    addedSelections,
    addedNegatives,
    listId: doc?.id ?? null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("dashboard_token")?.value;
    const body = await req.json();
    const { clientId, slug, selectedTerms } = body as {
      clientId?: string | number;
      slug?: string;
      customerId?: string;
      selectedTerms?: unknown;
    };

    if (!clientId || !slug || !Array.isArray(selectedTerms)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!validateDashboardToken(token, slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Normalise & dedupe within the submitted batch (case-insensitive).
    const seen = new Set<string>();
    const cleanTerms: string[] = [];
    for (const raw of selectedTerms) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleanTerms.push(trimmed);
    }

    const keywords = cleanTerms.map((term) => ({
      keyword: term,
      matchType: "exact" as const,
      flaggedForRemoval: false,
    }));

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const existing = await findDeepDiveList(payload, clientId);

    if (existing) {
      // Update — replace the keywords array with the latest selection.
      await payload.update({
        collection: "negative-keyword-lists",
        id: existing.id,
        data: { keywords },
        overrideAccess: true,
      });
    } else {
      // Create — first save for this client.
      await payload.create({
        collection: "negative-keyword-lists",
        data: {
          client: typeof clientId === "string" ? Number(clientId) : clientId,
          name: "Deep Dive Selections",
          scope: "account",
          source: "deep_dive",
          isActive: true,
          keywords,
        },
        overrideAccess: true,
      });
    }

    return NextResponse.json({
      success: true,
      count: keywords.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save keyword selections";
    console.error("[keyword-selections POST] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
