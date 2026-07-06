import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { researchSearchTerms } from "@/lib/search-term-research";

// Serper + LLM round-trips can take a while for a full group of terms.
export const maxDuration = 120;

const MAX_TERMS = 60;

/**
 * Batch-research unfamiliar search terms from the Match Type Violations view.
 * Each term is grounded in its top Google result and summarised in one sentence
 * describing what the company/business/thing is, so reviewers don't have to
 * copy-paste every term into Google by hand.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { terms } = body as { terms?: unknown };

  if (!Array.isArray(terms) || terms.length === 0) {
    return NextResponse.json(
      { error: "terms must be a non-empty array" },
      { status: 400 },
    );
  }

  const cleaned = terms
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_TERMS);

  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "No valid search terms provided" },
      { status: 400 },
    );
  }

  try {
    const { results, grounded } = await researchSearchTerms(cleaned);
    return NextResponse.json({ results, grounded });
  } catch (err: any) {
    console.error("[match-type-violations/research-terms] failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to research search terms" },
      { status: 500 },
    );
  }
}
