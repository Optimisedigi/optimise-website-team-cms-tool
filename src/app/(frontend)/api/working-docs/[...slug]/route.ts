import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

import { isKnownWorkingDocSlug, verifyWorkingDocPin } from "@/lib/working-doc-auth";
import {
  loadWorkingDoc,
  saveWorkingDoc,
  WorkingDocValidationError,
} from "@/lib/working-doc-sync";
import config from "@/payload.config";

const CIPHER_SLUG = "cipher/patient-journey-review";
const seedPath = path.join(
  process.cwd(),
  "src/content/cipher-health-patient-journey-review.md",
);
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function slugFromParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join("/");
}

function authenticatedEditorName(user: unknown): string {
  if (!user || typeof user !== "object") return "CMS user";
  const record = user as { name?: string | null; email?: string | null };
  return record.name?.trim() || record.email?.trim() || "CMS user";
}

async function authorize(request: NextRequest, slug: string, pin: string) {
  const payload = await getPayload({ config: await config });
  const authenticated = await payload.auth({ headers: request.headers });
  if (authenticated.user) {
    return { ok: true as const, editorName: authenticatedEditorName(authenticated.user), cms: true };
  }
  const pinResult = await verifyWorkingDocPin({ slug, pin });
  return pinResult.ok
    ? { ok: true as const, editorName: null, cms: false }
    : { ok: false as const, status: pinResult.status, message: pinResult.message };
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
    baseRevision?: number;
    localSubmissionId?: string;
  } | null;
  if (!body) return json({ ok: false, error: "A valid JSON request is required." }, 400);

  const auth = await authorize(request, slug, body.pin?.trim() ?? "");
  if (!auth.ok) return json({ ok: false, error: auth.message }, auth.status);
  // PIN sessions are limited to the whitelist; CMS sessions may reach any existing doc.
  if (!auth.cms && !isKnownWorkingDocSlug(slug)) {
    return json({ ok: false, error: "Document not found" }, 404);
  }

  try {
    const [clientSlug, deckSlug] = slug.split("/", 2);
    const doc = await loadWorkingDoc({
      slug,
      seed:
        slug === CIPHER_SLUG
          ? {
              title: "Cipher Health patient journey review",
              clientSlug,
              deckSlug,
              contentMarkdown: await readFile(seedPath, "utf8"),
            }
          : undefined,
    });

    if (body.action === "save") {
      const result = await saveWorkingDoc({
        slug,
        contentMarkdown: body.contentMarkdown ?? "",
        savedBy: auth.cms ? auth.editorName ?? "CMS user" : body.reviewerName ?? "",
        baseRevision: body.baseRevision,
        localSubmissionId: body.localSubmissionId?.trim() || `legacy-${randomUUID()}`,
        source: auth.cms ? "cms-editor" : "public-editor",
      });
      if (!result.ok) {
        return json(
          {
            ok: false,
            conflict: true,
            error: "A newer shared revision was saved. Your edits were not overwritten.",
            localSubmissionId: result.localSubmissionId,
            ...result.doc,
          },
          409,
        );
      }
      return json({ ok: true, source: result.source, ...result.doc });
    }

    return json({ ok: true, ...doc });
  } catch (error) {
    if (error instanceof WorkingDocValidationError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    console.error("Working document request failed", error);
    return json({ ok: false, error: "Could not synchronize the working document." }, 500);
  }
}
