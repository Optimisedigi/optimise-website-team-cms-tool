import { after, NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  completeKeywordResearchJob,
  createKeywordResearchJob,
  failKeywordResearchJob,
  pruneKeywordResearchJobs,
} from "./jobs";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const GROWTH_TOOLS_INTERNAL_KEY = process.env.GROWTH_TOOLS_INTERNAL_KEY || process.env.INTERNAL_API_KEY;

async function getAuthorizedPayload(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  return user ? payload : null;
}

async function runKeywordResearch(input: { websiteUrl: string; businessName?: string; location: string }) {
  if (!GROWTH_TOOLS_URL || !GROWTH_TOOLS_INTERNAL_KEY) {
    throw new Error("Server misconfigured: missing GROWTH_TOOLS_URL or GROWTH_TOOLS_INTERNAL_KEY");
  }

  const res = await fetch(`${GROWTH_TOOLS_URL.replace(/\/+$/, "")}/api/google-ads/page-build-keyword-research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": GROWTH_TOOLS_INTERNAL_KEY,
    },
    body: JSON.stringify({
      websiteUrl: input.websiteUrl,
      businessName: input.businessName,
      location: input.location,
      maxCategories: 12,
      maxKeywordsPerCategory: 30,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Keyword research failed (${res.status})`);
  }

  return data;
}

export async function POST(req: NextRequest) {
  const payload = await getAuthorizedPayload(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const websiteUrl = typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : undefined;
  const location = typeof body?.location === "string" && body.location.trim() ? body.location.trim() : "us";

  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  try {
    const parsed = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Website URL must start with http:// or https://" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  await pruneKeywordResearchJobs(payload);
  const job = await createKeywordResearchJob(payload);

  after(async () => {
    try {
      const result = await runKeywordResearch({ websiteUrl, businessName, location });
      await completeKeywordResearchJob(payload, job.id, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ClientProposalKeywordResearch] Job failed:", message);
      await failKeywordResearchJob(payload, job.id, message || "Keyword research failed");
    }
  });

  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}
