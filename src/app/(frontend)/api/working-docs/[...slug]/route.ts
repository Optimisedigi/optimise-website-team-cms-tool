import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

import config from "@/payload.config";
import { verifyWorkingDocPin } from "@/lib/working-doc-auth";

const seedPath = path.join(
  process.cwd(),
  "src/content/cipher-health-patient-journey-review.md",
);

function slugFromParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join("/");
}

async function seedMarkdown() {
  return readFile(seedPath, "utf8");
}

async function findOrCreateDoc(slug: string) {
  const [clientSlug, deckSlug] = slug.split("/", 2);
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const existing = await payload.find({
    collection: "shared-working-docs",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  const doc = existing.docs[0];
  if (doc) return { payload, doc };

  const created = await payload.create({
    collection: "shared-working-docs",
    data: {
      slug,
      title: "Cipher Health patient journey review",
      clientSlug,
      deckSlug,
      contentMarkdown: await seedMarkdown(),
      lastSavedAt: new Date().toISOString(),
      lastEditedBy: "Seed",
      changeLog: [
        {
          savedAt: new Date().toISOString(),
          savedBy: "Seed",
          summary: "Initial working document created from approved journey review.",
        },
      ],
    },
    overrideAccess: true,
  });

  return { payload, doc: created };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const slug = slugFromParts((await params).slug ?? []);
  const body = (await request.json().catch(() => null)) as {
    pin?: string;
    action?: "load" | "save";
    contentMarkdown?: string;
    reviewerName?: string;
  } | null;

  const pin = body?.pin?.trim() ?? "";
  const auth = await verifyWorkingDocPin({ slug, pin });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.message },
      { status: auth.status },
    );
  }

  const { payload, doc } = await findOrCreateDoc(slug);

  if (body?.action === "save") {
    const contentMarkdown = body.contentMarkdown?.trim();
    if (!contentMarkdown) {
      return NextResponse.json(
        { ok: false, error: "Document content is required" },
        { status: 400 },
      );
    }

    const reviewerName = body.reviewerName?.trim() || "Reviewer";
    const now = new Date().toISOString();
    const previousLog = Array.isArray((doc as any).changeLog)
      ? (doc as any).changeLog
      : [];
    const updated = await payload.update({
      collection: "shared-working-docs",
      id: doc.id,
      data: {
        contentMarkdown,
        lastEditedBy: reviewerName,
        lastSavedAt: now,
        changeLog: [
          {
            savedAt: now,
            savedBy: reviewerName,
            summary: "Saved document edits and reviewer notes.",
          },
          ...previousLog,
        ].slice(0, 50),
      },
      overrideAccess: true,
    });

    return NextResponse.json({
      ok: true,
      contentMarkdown: (updated as any).contentMarkdown,
      updatedAt: updated.updatedAt,
      lastEditedBy: (updated as any).lastEditedBy,
      lastSavedAt: (updated as any).lastSavedAt,
      changeLog: (updated as any).changeLog ?? [],
    });
  }

  return NextResponse.json({
    ok: true,
    title: (doc as any).title,
    contentMarkdown: (doc as any).contentMarkdown,
    updatedAt: doc.updatedAt,
    lastEditedBy: (doc as any).lastEditedBy,
    lastSavedAt: (doc as any).lastSavedAt,
    changeLog: (doc as any).changeLog ?? [],
  });
}
