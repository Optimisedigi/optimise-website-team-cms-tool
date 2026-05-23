import type { ApplyHandler, ApplyHandlerResult } from "@/lib/agents/_shared/apply-dispatcher";

export const applyCampaignTargetRoasUpdate: ApplyHandler = async (): Promise<ApplyHandlerResult> => {
  throw new Error(
    "campaign-target-roas-update is not enabled: Growth Tools target ROAS request fields and conversion-value snapshots are not verified yet.",
  );
};
