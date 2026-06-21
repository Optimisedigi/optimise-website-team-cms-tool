import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";

/**
 * GET /api/optimate/default-model
 *
 * Returns the configured OptiMate default chat model so the chat UI can seed
 * its model picker on first load (before the user has made a per-browser
 * choice). The autonomous default is included for completeness but the chat
 * UI only uses the chat one.
 *
 * Auth: requires a logged-in CMS user (the picker is only shown to them).
 */
export async function GET() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const defaults = await getOptiMateDefaultModels(payload);
  return NextResponse.json({
    defaultChatModel: defaults.defaultChatModel,
    defaultAutonomousModel: defaults.defaultAutonomousModel,
    // Used by the Invoice Assistant chat to seed its model picker. Falls back
    // to the autonomous default when no invoice-specific model is configured.
    invoiceAssistantModel:
      defaults.invoiceAssistantModel ?? defaults.defaultAutonomousModel,
    // Used by GmailMate / OptiMate Gmail. Falls back to the autonomous default
    // when no email-specific model is configured.
    emailAssistantModel:
      defaults.emailAssistantModel ?? defaults.defaultAutonomousModel,
    googleMateStarterQuestions: defaults.googleMateStarterQuestions,
    googleMatePortfolioStarterQuestions: defaults.googleMatePortfolioStarterQuestions,
    invoiceMateStarterQuestions: defaults.invoiceMateStarterQuestions,
  });
}
