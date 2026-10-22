import { extractEmailAddresses } from "./client-matching";
import { MAIL_PROMPTS } from "./prompts";
import type { MailModelRequest } from "./model-request";
import type { MessageSenderSubject } from "./gmail-mail";

/**
 * On-request inbox triage. Only senders and subject lines are used (plus
 * Gmail's bulk-mail headers as a hint); email bodies are never fetched or sent.
 *
 * To keep tokens low the model sees each SENDER once (with their unread count
 * and two sample subjects), not each email, so 1,000 newsletters from one
 * sender cost one line. Senders matching a client are put in "Clients"
 * without asking the model. Nothing here changes Gmail.
 */

export const TRIAGE_CATEGORIES = [
  { key: "sales_pitch", code: "s", label: "Sales pitches", defaultSelected: true },
  { key: "newsletter", code: "n", label: "Newsletters", defaultSelected: true },
  { key: "promotion", code: "p", label: "Promotions", defaultSelected: true },
  { key: "notification", code: "a", label: "Notifications and receipts", defaultSelected: true },
  { key: "keep", code: "k", label: "Might need a look", defaultSelected: false },
  { key: "clients", code: "", label: "Clients", defaultSelected: false },
] as const;

export type TriageCategoryKey = (typeof TRIAGE_CATEGORIES)[number]["key"];

/** Unread messages read per triage run (each is one metadata call to Gmail). */
export const MAX_TRIAGE_MESSAGES = 3000;
/** Ids per "read" step (/api/mail/triage): about 50 s at Gmail's per-user read rate. */
export const TRIAGE_READ_CHUNK = 200;
/** Senders per model call: keeps each prompt and answer small. */
export const TRIAGE_SENDERS_PER_CALL = 120;
/** Subjects returned to the screen per sender (the model only ever sees two). */
export const MAX_SUBJECTS_PER_SENDER = 50;
const MODEL_SUBJECTS_PER_SENDER = 2;

export interface TriageSender {
  address: string;
  name: string;
  count: number;
  subjects: string[];
  messageIds: string[];
  /** Any message carried List-Id / List-Unsubscribe / bulk Precedence. */
  bulk: boolean;
}

export interface TriageCategory {
  key: TriageCategoryKey;
  label: string;
  count: number;
  defaultSelected: boolean;
  senders: TriageSender[];
}

function oneLine(value: string, max: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function displayName(from: string, address: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>/);
  return oneLine(match?.[1] || "", 80) || address;
}

/** Messages grouped by sender address, biggest senders first (then by address, for a stable order). */
export function groupBySender(messages: MessageSenderSubject[]): TriageSender[] {
  const groups = new Map<string, TriageSender>();
  for (const message of messages) {
    const address = (extractEmailAddresses(message.from)[0] ?? oneLine(message.from, 200)).toLowerCase() || "(unknown sender)";
    let group = groups.get(address);
    if (!group) {
      group = { address, name: displayName(message.from, address), count: 0, subjects: [], messageIds: [], bulk: false };
      groups.set(address, group);
    }
    group.count += 1;
    group.messageIds.push(message.messageId);
    const subject = oneLine(message.subject, 150) || "(no subject)";
    if (group.subjects.length < MAX_SUBJECTS_PER_SENDER && !group.subjects.includes(subject)) group.subjects.push(subject);
    if ((message.listId ?? "").trim() || (message.listUnsubscribe ?? "").trim() || /bulk|list/i.test(message.precedence ?? "")) {
      group.bulk = true;
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
}

/** One model call for a batch of senders: numbered lines of sender, count, bulk flag and two subjects. */
export function buildTriageRequest(senders: TriageSender[]): MailModelRequest {
  const lines = senders.map((sender, i) => {
    const subjects = sender.subjects
      .slice(0, MODEL_SUBJECTS_PER_SENDER)
      .map((subject) => oneLine(subject, 80))
      .join(" / ");
    const name = sender.name === sender.address ? "" : `${oneLine(sender.name, 40)} `;
    return `${i + 1}. ${name}<${sender.address}> | ${sender.count} unread${sender.bulk ? " | bulk" : ""} | ${subjects}`;
  });
  return {
    action: "triage",
    system: MAIL_PROMPTS.triage.system,
    messages: [{ role: "user", text: `Senders:\n${lines.join("\n")}\n\n${MAIL_PROMPTS.triage.defaultInstruction}` }],
    gmailMessageId: null,
    emailCount: senders.reduce((sum, sender) => sum + sender.count, 0),
    suggestSubject: false,
    clientId: null,
    revise: null,
  };
}

const CODE_TO_KEY = new Map<string, TriageCategoryKey>(
  TRIAGE_CATEGORIES.filter((category) => category.code).map((category) => [category.code, category.key]),
);

/** "12 s" lines → sender index (0-based) → category. Anything missing or unreadable stays "keep". */
export function parseTriageAnswer(text: string, senderCount: number): TriageCategoryKey[] {
  const out: TriageCategoryKey[] = Array.from({ length: senderCount }, () => "keep");
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)[.):\-\s]+([a-z])\b/i);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    const key = CODE_TO_KEY.get((match[2] ?? "").toLowerCase());
    if (key && index >= 0 && index < senderCount) out[index] = key;
  }
  return out;
}

/**
 * Sort the senders into categories. `classify` runs one model call and
 * returns its text; `isClient` keeps client senders away from the model.
 * A failed batch leaves its senders in "keep" rather than failing the run.
 */
export async function triageSenders(args: {
  senders: TriageSender[];
  isClient: (address: string) => boolean;
  classify: (request: MailModelRequest) => Promise<string>;
  concurrency?: number;
}): Promise<{ categories: TriageCategory[]; failedBatches: number; batches: number }> {
  const assigned = new Map<string, TriageCategoryKey>();
  const forModel: TriageSender[] = [];
  for (const sender of args.senders) {
    if (args.isClient(sender.address)) assigned.set(sender.address, "clients");
    else forModel.push(sender);
  }

  const batches: TriageSender[][] = [];
  for (let i = 0; i < forModel.length; i += TRIAGE_SENDERS_PER_CALL) batches.push(forModel.slice(i, i + TRIAGE_SENDERS_PER_CALL));
  let failedBatches = 0;
  let next = 0;
  const workers = Array.from({ length: Math.min(args.concurrency ?? 3, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++] ?? [];
      let keys: TriageCategoryKey[];
      try {
        keys = parseTriageAnswer(await args.classify(buildTriageRequest(batch)), batch.length);
      } catch {
        failedBatches += 1;
        keys = batch.map(() => "keep");
      }
      batch.forEach((sender, i) => assigned.set(sender.address, keys[i] ?? "keep"));
    }
  });
  await Promise.all(workers);

  const categories = TRIAGE_CATEGORIES.map((category) => {
    const senders = args.senders.filter((sender) => assigned.get(sender.address) === category.key);
    return {
      key: category.key,
      label: category.label,
      defaultSelected: category.defaultSelected,
      count: senders.reduce((sum, sender) => sum + sender.count, 0),
      senders,
    };
  }).filter((category) => category.senders.length > 0);
  return { categories, failedBatches, batches: batches.length };
}
