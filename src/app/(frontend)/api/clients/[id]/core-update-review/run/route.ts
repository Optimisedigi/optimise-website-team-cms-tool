import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

type RecipientRow = { email?: string | null };

const readEmails = (rows: unknown): string[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row === "object" && row ? (row as RecipientRow).email : null))
    .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
    .map((email) => email.trim());
};

const readBrandKeywords = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 },
    );
  }

  let client: any;
  try {
    client = await payload.findByID({
      collection: "clients",
      id,
      depth: 0,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const siteUrl = typeof client.websiteUrl === "string" ? client.websiteUrl.trim() : "";
  if (!siteUrl) {
    return NextResponse.json(
      { error: "Client needs a Website URL before running a Core Update Review" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${GROWTH_TOOLS_URL}/api/core-update/audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        clientId: String(client.id),
        clientName: client.name || undefined,
        siteUrl,
        gscSiteUrl: client.gscPropertyUrl || undefined,
        brandKeywords: readBrandKeywords(client.brandKeywords),
        maxPages: client.coreUpdateReviewMaxPages || 50,
        includeUpdateTypes: Array.isArray(client.coreUpdateReviewIncludeUpdateTypes)
          ? client.coreUpdateReviewIncludeUpdateTypes
          : ["core_update"],
        recipients: readEmails(client.coreUpdateReviewRecipientEmails),
        sendEmail: false,
      }),
    });

    const data = await response.json().catch(async () => ({ message: await response.text() }));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || `Growth Tools returned ${response.status}` },
        { status: 502 },
      );
    }

    const audit = data?.audit || {};
    const updateName = audit.updateName || data?.updates?.[0]?.updateName;
    const statusData: Record<string, string> = {
      coreUpdateReviewLastCheckedAt: new Date().toISOString(),
    };
    if (typeof updateName === "string" && updateName.trim()) {
      statusData.coreUpdateReviewLastUpdateName = updateName;
    }
    await payload.update({
      collection: "clients",
      id,
      data: statusData,
      overrideAccess: true,
    });

    return NextResponse.json({
      summary: {
        message: "Manual Core Update Review completed.",
        updateName,
        riskScore: audit.overallRiskScore,
        emailSent: data?.emailSent === true,
      },
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run Core Update Review";
    console.error(`[CoreUpdateReview] Failed for client ${id}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
