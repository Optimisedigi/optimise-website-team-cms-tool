import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isProposalAuditStuck, failStuckProposalAudit } from "@/lib/proposal-audit-watchdog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });

    let p = proposal as any;

    // Self-heal: if the background function was killed before writing the final
    // status, the proposal is stranded at "running". Flip it to "failed" here so
    // the polling UI stops waiting and re-runs are unblocked immediately.
    if (isProposalAuditStuck(p)) {
      await failStuckProposalAudit(payload, id);
      p = {
        ...p,
        auditStatus: "failed",
        auditProgress: "Timed out|100",
        auditError:
          "Audit timed out \u2014 the background job was terminated before it could finish (likely exceeded the function time limit). Safely re-run the audit.",
      };
    }

    const progressRaw = p.auditProgress as string | null;
    let stage = "";
    let percent = 0;

    if (progressRaw && progressRaw.includes("|")) {
      const [s, pStr] = progressRaw.split("|");
      stage = s;
      percent = parseInt(pStr, 10) || 0;
    }

    return NextResponse.json({
      status: p.auditStatus || "pending",
      stage,
      percent,
      error: p.auditError || null,
      metaAdsStatus: p.metaAdsStatus || "idle",
      metaAdsError: p.metaAdsError || null,
      metaAdsUpdatedAt: p.metaAdsUpdatedAt || null,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
