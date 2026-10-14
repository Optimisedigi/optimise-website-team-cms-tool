import { MAIL_PROMPTS, type MailModelAction } from "./prompts";

/**
 * The only way the Mail view builds model input. It takes at most ONE email
 * (never a list), so the model can never receive the inbox, a thread or other
 * client emails. `reply` and `summarise` require exactly one email; `draft`
 * takes none.
 */

export interface MailModelEmail {
  gmailMessageId: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  date?: string;
  body: string;
}

export interface MailModelRequest {
  action: MailModelAction;
  system: string;
  userText: string;
  /** Gmail id of the one email included, or null for a fresh draft. */
  gmailMessageId: string | null;
  /** Always 0 or 1. Logged with every model call. */
  emailCount: 0 | 1;
}

export const MAX_EMAIL_BODY_CHARS = 20_000;
export const MAX_INSTRUCTION_CHARS = 4_000;

export class MailModelRequestError extends Error {}

export function buildMailModelRequest(args: {
  action: MailModelAction;
  email?: MailModelEmail | null;
  instruction?: string | null;
}): MailModelRequest {
  const prompt = MAIL_PROMPTS[args.action];
  if (!prompt) throw new MailModelRequestError(`Unknown mail action: ${String(args.action)}`);
  if (Array.isArray(args.email)) {
    throw new MailModelRequestError("Only one email can be sent to the model per request.");
  }
  const instruction = (args.instruction ?? "").trim().slice(0, MAX_INSTRUCTION_CHARS);

  if (args.action === "draft") {
    if (args.email) throw new MailModelRequestError("A new draft does not take an email.");
    if (!instruction) throw new MailModelRequestError("Write an instruction for the new email.");
    return {
      action: "draft",
      system: prompt.system,
      userText: `My instruction for the new email:\n${instruction}`,
      gmailMessageId: null,
      emailCount: 0,
    };
  }

  const email = args.email;
  if (!email || !email.gmailMessageId) {
    throw new MailModelRequestError("Select one email first.");
  }
  const parts = [
    "The email:",
    `From: ${email.from}`,
    ...(email.to ? [`To: ${email.to}`] : []),
    ...(email.cc ? [`Cc: ${email.cc}`] : []),
    `Subject: ${email.subject || "(no subject)"}`,
    ...(email.date ? [`Date: ${email.date}`] : []),
    "",
    email.body.slice(0, MAX_EMAIL_BODY_CHARS),
    "",
    `My instruction:\n${instruction || prompt.defaultInstruction}`,
  ];
  return {
    action: args.action,
    system: prompt.system,
    userText: parts.join("\n"),
    gmailMessageId: email.gmailMessageId,
    emailCount: 1,
  };
}
