import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { contentWords } from "@/lib/match-type-synonyms";

function cleanTerm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normaliseTerm(value: unknown): string {
  return contentWords(cleanTerm(value)).join(" ");
}

function normaliseContext(value: unknown): string {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((part) => contentWords(part).join(" "))
    .filter(Boolean)
    .sort()
    .join(",");
}

function sameRule(a: { termA?: unknown; termB?: unknown; contextTerms?: unknown }, b: { termA?: unknown; termB?: unknown; contextTerms?: unknown }): boolean {
  const aTermA = normaliseTerm(a.termA);
  const aTermB = normaliseTerm(a.termB);
  const bTermA = normaliseTerm(b.termA);
  const bTermB = normaliseTerm(b.termB);
  if (!aTermA || !aTermB || !bTermA || !bTermB) return false;

  const sameDirection = aTermA === bTermA && aTermB === bTermB;
  const reverseDirection = aTermA === bTermB && aTermB === bTermA;
  return (sameDirection || reverseDirection) && normaliseContext(a.contextTerms) === normaliseContext(b.contextTerms);
}

export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await (payload.find as any)({
    collection: "match-type-synonym-rules",
    where: { active: { equals: true } },
    depth: 0,
    limit: 500,
    sort: "-updatedAt",
    overrideAccess: true,
  });

  return NextResponse.json({ docs: result.docs, totalDocs: result.totalDocs });
}

function parseId(value: unknown): string | number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function parseSynonymInput(body: any) {
  const termA = cleanTerm(body.termA);
  const termB = cleanTerm(body.termB);
  const contextTerms = String(body.contextTerms ?? "").trim();
  const sourceSearchTerm = cleanTerm(body.sourceSearchTerm);
  const sourceTriggeringKeyword = cleanTerm(body.sourceTriggeringKeyword);
  const notes = String(body.notes ?? "").trim();

  if (!normaliseTerm(termA) || !normaliseTerm(termB)) {
    return { error: "termA and termB are required" } as const;
  }
  if (normaliseTerm(termA) === normaliseTerm(termB)) {
    return { error: "termA and termB must be different" } as const;
  }

  return { termA, termB, contextTerms, sourceSearchTerm, sourceTriggeringKeyword, notes } as const;
}

async function findDuplicate(payload: any, input: { termA: string; termB: string; contextTerms?: string }, excludeId?: string | number | null) {
  const existing = await payload.find({
    collection: "match-type-synonym-rules",
    where: { active: { equals: true } },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  });
  return (existing.docs as any[]).find((doc) => String(doc.id) !== String(excludeId ?? "") && sameRule(doc, input)) ?? null;
}

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const input = parseSynonymInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const duplicate = await findDuplicate(payload, input);
  if (duplicate) {
    return NextResponse.json({ doc: duplicate, duplicate: true });
  }

  const userId = typeof user.id === "object" ? (user.id as any).id : user.id;
  const doc = await (payload.create as any)({
    collection: "match-type-synonym-rules",
    data: {
      ...input,
      active: true,
      createdBy: userId,
    },
    overrideAccess: true,
  });

  await logActivity(payload, {
    type: "match_type_synonym_rule_created",
    title: `Match type synonym added: ${input.termA} ↔ ${input.termB}`,
    description: input.contextTerms ? `Context: ${input.contextTerms}` : "Global synonym rule",
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

  const input = parseSynonymInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const duplicate = await findDuplicate(payload, input, id);
  if (duplicate) return NextResponse.json({ doc: duplicate, duplicate: true }, { status: 409 });

  const { sourceSearchTerm, sourceTriggeringKeyword, ...editableInput } = input;
  const doc = await (payload.update as any)({
    collection: "match-type-synonym-rules",
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
    collection: "match-type-synonym-rules",
    id,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}
