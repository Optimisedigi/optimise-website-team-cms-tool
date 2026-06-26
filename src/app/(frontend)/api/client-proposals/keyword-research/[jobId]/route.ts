import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getKeywordResearchJob } from "../jobs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getKeywordResearchJob(payload, jobId);

  if (!job) {
    return NextResponse.json({ error: "Keyword research job not found or expired" }, { status: 404 });
  }

  return NextResponse.json(job);
}
