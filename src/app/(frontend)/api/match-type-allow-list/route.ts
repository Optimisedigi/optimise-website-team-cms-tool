import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { normaliseAllowListTerm } from "@/lib/match-type-allow-list";
import { contentWords } from "@/lib/match-type-synonyms";

const VALID_CATEGORIES = new Set(["acronym", "job_title", "industry_term", "client_jargon", "other"]);

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await (payload.find as any)({
    collection: "match-type-allow-list-terms",
    where: { active: { equals: true } },
    depth: 0,
    limit: 500,
    sort: "term",
    overrideAccess: true,
  });

  return NextResponse.json({ docs: result.docs, totalDocs: result.totalDocs });
}

function parseId(value: unknown): string | number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function parseAllowListInput(body: any) {
  const rawTerm = clean(body.term);
  const termWords = contentWords(rawTerm);
  const term = normaliseAllowListTerm(rawTerm);
  if (!term) return { error: "term is required" } as const;
  if (termWords.length !== 1) return { error: "Only single terms are supported" } as const;

  return {
    term,
    category: VALID_CATEGORIES.has(body.category) ? body.category : "acronym",
    notes: String(body.notes ?? "").trim(),
    sourceSearchTerm: clean(body.sourceSearchTerm),
    sourceTriggeringKeyword: clean(body.sourceTriggeringKeyword),
  } as const;
}

async function findDuplicate(payload: any, term: string, excludeId?: string | number | null) {
  const existing = await payload.find({
    collection: "match-type-allow-list-terms",
    where: { term: { equals: term } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const duplicate = existing.docs?.[0];
  if (!duplicate) return null;
  return String(duplicate.id) === String(excludeId ?? "") ? null : duplicate;
}

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const input = parseAllowListInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const duplicate = await findDuplicate(payload, input.term);
  if (duplicate) return NextResponse.json({ doc: duplicate, duplicate: true });

  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  const doc = await (payload.create as any)({
    collection: "match-type-allow-list-terms",
    data: {
      ...input,
      active: true,
      createdBy: userId,
    },
    overrideAccess: true,
  });

  await logActivity(payload, {
    type: "match_type_allow_list_term_created",
    title: `Match type allow-list term added: ${input.term}`,
    description: input.notes || `Category: ${input.category}`,
    user: userId,
  });

  return NextResponse.json({ doc, duplicate: false }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = parseId(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const input = parseAllowListInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const duplicate = await findDuplicate(payload, input.term, id);
  if (duplicate) return NextResponse.json({ doc: duplicate, duplicate: true }, { status: 409 });

  const { sourceSearchTerm, sourceTriggeringKeyword, ...editableInput } = input;
  const doc = await (payload.update as any)({
    collection: "match-type-allow-list-terms",
    id,
    data: body.sourceSearchTerm !== undefined || body.sourceTriggeringKeyword !== undefined ? input : editableInput,
    overrideAccess: true,
  });

  return NextResponse.json({ doc, duplicate: false });
}

export async function DELETE(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = parseId(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await (payload.delete as any)({
    collection: "match-type-allow-list-terms",
    id,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}
