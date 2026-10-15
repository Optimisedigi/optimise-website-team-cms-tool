import { MAIL_PROMPTS, type MailModelAction } from "./prompts";

/**
 * The only way the Mail view builds model input. It takes at most ONE email
 * (never a list), so the model can never receive the inbox, a thread or other
 * client emails. `reply` and `summarise` require exactly one email; `draft`
 * takes none.
 *
 * Refining a draft (OptiMate-style "keep prompting") is a short conversation:
 * the earlier instructions and drafts the user already saw, plus the current
 * draft text as the user may have edited it. That history is the user's own
 * text, not mailbox content, so the one-email rule still holds.
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

/** One earlier round: what the user asked for and the draft that came back. */
export interface MailDraftTurn {
  instruction: string;
  draft: string;
}

export interface MailModelMessage {
  role: "user" | "assistant";
  text: string;
}

export interface MailModelRequest {
  action: MailModelAction;
  system: string;
  messages: MailModelMessage[];
  /** Gmail id of the one email included, or null for a fresh draft. */
  gmailMessageId: string | null;
  /** Always 0 or 1. Logged with every model call. */
  emailCount: 0 | 1;
}

export const MAX_EMAIL_BODY_CHARS = 20_000;
export const MAX_INSTRUCTION_CHARS = 4_000;
export const MAX_DRAFT_CHARS = 12_000;
/** Earlier refine rounds kept in the conversation (oldest dropped first). */
export const MAX_HISTORY_TURNS = 8;

export class MailModelRequestError extends Error {}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Validate and trim client-supplied refine history. Bad entries are dropped. */
export function cleanDraftHistory(raw: unknown): MailDraftTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: MailDraftTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const instruction = clean((item as { instruction?: unknown }).instruction, MAX_INSTRUCTION_CHARS);
    const draft = clean((item as { draft?: unknown }).draft, MAX_DRAFT_CHARS);
    if (draft) turns.push({ instruction, draft });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

function emailBlock(email: MailModelEmail): string {
  return [
    "The email:",
    `From: ${email.from}`,
    ...(email.to ? [`To: ${email.to}`] : []),
    ...(email.cc ? [`Cc: ${email.cc}`] : []),
    `Subject: ${email.subject || "(no subject)"}`,
    ...(email.date ? [`Date: ${email.date}`] : []),
    "",
    email.body.slice(0, MAX_EMAIL_BODY_CHARS),
  ].join("\n");
}

export function buildMailModelRequest(args: {
  action: MailModelAction;
  email?: MailModelEmail | null;
  instruction?: string | null;
  /** Earlier refine rounds (reply/draft only). */
  history?: MailDraftTurn[];
  /** The draft as it stands now, including the user's own edits. */
  currentDraft?: string | null;
}): MailModelRequest {
  const prompt = MAIL_PROMPTS[args.action];
  if (!prompt) throw new MailModelRequestError(`Unknown mail action: ${String(args.action)}`);
  if (Array.isArray(args.email)) {
    throw new MailModelRequestError("Only one email can be sent to the model per request.");
  }
  const instruction = clean(args.instruction, MAX_INSTRUCTION_CHARS);
  const history = args.action === "summarise" ? [] : cleanDraftHistory(args.history);
  const currentDraft = args.action === "summarise" ? "" : clean(args.currentDraft, MAX_DRAFT_CHARS);
  const refining = history.length > 0 || currentDraft.length > 0;

  let email: MailModelEmail | null = null;
  if (args.action === "draft") {
    if (args.email) throw new MailModelRequestError("A new draft does not take an email.");
    if (!instruction && !refining) throw new MailModelRequestError("Write an instruction for the new email.");
  } else {
    if (!args.email || !args.email.gmailMessageId) throw new MailModelRequestError("Select one email first.");
    email = args.email;
  }
  if (refining && !instruction) throw new MailModelRequestError("Say what to change in the draft.");

  const opening = (firstInstruction: string) =>
    args.action === "draft"
      ? `My instruction for the new email:\n${firstInstruction}`
      : `${emailBlock(email!)}\n\nMy instruction:\n${firstInstruction || prompt.defaultInstruction}`;

  const messages: MailModelMessage[] = [];
  if (!refining) {
    messages.push({ role: "user", text: opening(instruction) });
  } else {
    // Replay earlier rounds so the model keeps the context of what was asked.
    const [first, ...rest] = history;
    if (first) {
      messages.push({ role: "user", text: opening(first.instruction) });
      messages.push({ role: "assistant", text: first.draft });
      for (const turn of rest) {
        messages.push({ role: "user", text: turn.instruction || "Revise the draft." });
        messages.push({ role: "assistant", text: turn.draft });
      }
    } else {
      // The user wrote a draft by hand and now wants it improved.
      messages.push({ role: "user", text: opening("") });
      messages.push({ role: "assistant", text: currentDraft });
    }
    const latestDraft = currentDraft || history[history.length - 1]?.draft || "";
    messages.push({
      role: "user",
      text: [
        "Here is the current draft, including any edits I made myself. Keep my edits unless I ask otherwise:",
        "",
        latestDraft,
        "",
        `Change: ${instruction}`,
        "",
        "Return the full revised email body only.",
      ].join("\n"),
    });
  }

  return {
    action: args.action,
    system: prompt.system,
    messages,
    gmailMessageId: email?.gmailMessageId ?? null,
    emailCount: email ? 1 : 0,
  };
}
