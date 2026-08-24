/**
 * Client-facing email copy slots.
 *
 * Every sentence in a weekly or monthly Google Ads report email comes from one
 * of these slots. A slot holds a list of interchangeable phrasings; the account
 * + period seed picks one (see `_email-copy-variants.ts`), so the same account
 * and period always reproduces the same wording while a batch of accounts reads
 * differently.
 *
 * The lists live here as defaults and are overridable from OptiMate Settings →
 * Client Email Copy. Overrides are plain text, one phrasing per line, with
 * `{token}` placeholders for the figures. Numbers are never authored here - the
 * report code computes them and substitutes them in, so an edited phrase can
 * change the wording but never the data.
 *
 * A slot whose override is missing, empty, or references an unknown token falls
 * back to the defaults below, so a bad edit degrades to today's copy rather than
 * shipping a broken sentence to a client.
 */

/** Figures a slot template may reference. Unknown tokens invalidate an override. */
export interface EmailCopyTokens {
  /** Reporting period label, e.g. "17th Aug - 23rd Aug" or "August". */
  period?: string;
  conversions?: string;
  prevConversions?: string;
  cpa?: string;
  prevCpa?: string;
  spend?: string;
  /** Pre-built CPA clause used by the mixed-direction sentences. */
  cpaClause?: string;
  /** "improved" or "rose", for the flat-volume sentences. */
  direction?: string;
  /** "efficient" / "steady" / "heavier than target", monthly single-period only. */
  cpaTone?: string;
}

export interface EmailCopySlot {
  /** Human label for the settings field. */
  label: string;
  /** When this phrasing is used, shown as the field description. */
  description: string;
  /** Tokens legal in this slot's templates. */
  tokens: ReadonlyArray<keyof EmailCopyTokens>;
  /** Shipped phrasings, one per entry. Non-empty. */
  defaults: readonly [string, ...string[]];
}

const PERIOD = ["period"] as const;
const COMPARISON = ["period", "conversions", "prevConversions", "cpa", "prevCpa"] as const;
const COMPARISON_CLAUSE = ["period", "conversions", "prevConversions", "cpaClause"] as const;

export const CLIENT_EMAIL_COPY_SLOTS = {
  greeting: {
    label: "Greeting",
    description: "Opening line of every weekly and monthly report email.",
    tokens: [],
    defaults: ["Hey team,", "Hi team,", "Hey all,", "Hi all,", "Morning team,"],
  },

  // ── Weekly ──
  "weekly-performance-up-efficient": {
    label: "Weekly — conversions up, CPA down",
    description: "Best case: more conversions than the prior week, at a lower CPA.",
    tokens: COMPARISON,
    defaults: [
      "{period} was a strong week: conversions rose to {conversions} from {prevConversions} while CPA improved to {cpa} from {prevCpa}.",
      "{period} performed well, lifting conversions to {conversions} from {prevConversions} and bringing CPA down to {cpa} from {prevCpa}.",
      "A strong {period}: {conversions} conversions against {prevConversions} the week prior, with CPA tightening to {cpa} from {prevCpa}.",
      "{period} moved in the right direction on both counts, with conversions up to {conversions} from {prevConversions} and CPA down to {cpa} from {prevCpa}.",
      "Both volume and efficiency improved in {period}: {conversions} conversions from {prevConversions}, at {cpa} against {prevCpa}.",
      "{period} delivered more for less, with conversions at {conversions} from {prevConversions} and CPA at {cpa} from {prevCpa}.",
      "A productive {period}, lifting conversions to {conversions} from {prevConversions} while CPA fell to {cpa} from {prevCpa}.",
      "Week-on-week {period} improved on both fronts: {conversions} conversions versus {prevConversions}, CPA {cpa} versus {prevCpa}.",
    ],
  },
  "weekly-performance-up": {
    label: "Weekly — conversions up, CPA flat or higher",
    description: "More conversions than the prior week, without an efficiency gain.",
    tokens: COMPARISON_CLAUSE,
    defaults: [
      "{period} lifted conversions to {conversions} from {prevConversions}{cpaClause}.",
      "Conversions grew across {period} to {conversions} from {prevConversions}{cpaClause}.",
      "{period} came in ahead of the prior week on volume, at {conversions} conversions against {prevConversions}{cpaClause}.",
      "Volume improved in {period}, with {conversions} conversions versus {prevConversions} the week before{cpaClause}.",
      "{period} built on the prior week, reaching {conversions} conversions from {prevConversions}{cpaClause}.",
      "The account converted {conversions} times in {period}, up from {prevConversions}{cpaClause}.",
      "{period} pushed volume higher, to {conversions} conversions from {prevConversions}{cpaClause}.",
      "Week-on-week, {period} added volume at {conversions} conversions against {prevConversions}{cpaClause}.",
    ],
  },
  "weekly-performance-down-efficient": {
    label: "Weekly — conversions down, CPA down",
    description: "Fewer conversions than the prior week, but cheaper acquisition.",
    tokens: COMPARISON,
    defaults: [
      "{period} traded volume for efficiency: conversions eased to {conversions} from {prevConversions}, while CPA improved to {cpa} from {prevCpa}.",
      "Conversions softened across {period} to {conversions} from {prevConversions}, though CPA came down to {cpa} from {prevCpa}.",
      "{period} saw {conversions} conversions against {prevConversions} the week prior, with CPA tightening to {cpa} from {prevCpa}.",
      "Volume dipped in {period} to {conversions} from {prevConversions}, but each conversion came cheaper at {cpa} versus {prevCpa}.",
    ],
  },
  "weekly-performance-down": {
    label: "Weekly — conversions down, no efficiency gain",
    description: "Fewer conversions than the prior week, with CPA flat or higher.",
    tokens: COMPARISON_CLAUSE,
    defaults: [
      "{period} eased back to {conversions} conversions from {prevConversions}{cpaClause}.",
      "Conversions softened across {period} to {conversions} from {prevConversions}{cpaClause}.",
      "{period} came in behind the prior week, at {conversions} conversions against {prevConversions}{cpaClause}.",
      "Volume slipped in {period} to {conversions} from {prevConversions}{cpaClause}.",
      "{period} finished below the week prior, with {conversions} conversions against {prevConversions}{cpaClause}.",
      "The account converted {conversions} times in {period}, down from {prevConversions}{cpaClause}.",
      "Week-on-week, {period} gave back some volume at {conversions} conversions from {prevConversions}{cpaClause}.",
      "{period} tracked lower on volume, at {conversions} conversions versus {prevConversions}{cpaClause}.",
    ],
  },
  "weekly-performance-flat-cpa-move": {
    label: "Weekly — volume flat, CPA moved",
    description: "Same conversions as the prior week, so the sentence leads on CPA.",
    tokens: ["period", "conversions", "cpa", "prevCpa", "direction"],
    defaults: [
      "{period} held conversions at {conversions}, with CPA {direction} to {cpa} from {prevCpa}.",
      "Conversions were steady across {period} at {conversions}, while CPA {direction} to {cpa} from {prevCpa}.",
      "{period} matched the prior week at {conversions} conversions, and CPA {direction} to {cpa} from {prevCpa}.",
      "Volume held flat in {period} at {conversions} conversions, with CPA {direction} to {cpa} from {prevCpa}.",
    ],
  },
  "weekly-intro-converting": {
    label: "Weekly — no prior week, account converted",
    description: "First reported week: describes the week on its own.",
    tokens: ["period", "conversions", "cpa", "spend"],
    defaults: [
      "{period} delivered {conversions} conversions at a CPA of {cpa}, with {spend} in spend.",
      "{period} brought in {conversions} conversions from {spend} in spend, at a CPA of {cpa}.",
      "Across {period}, {spend} in spend produced {conversions} conversions at {cpa} each.",
      "{period} closed out with {conversions} conversions, {spend} in spend and a CPA of {cpa}.",
    ],
  },
  "weekly-intro-spend": {
    label: "Weekly — no prior week, spend only",
    description: "First reported week with spend but no conversions.",
    tokens: ["period", "spend"],
    defaults: [
      "{period} recorded {spend} in Google Ads spend, with the completed-week trend included below for context.",
      "Google Ads spend for {period} came in at {spend}, and the completed-week trend is below for context.",
      "{period} used {spend} in spend, with the completed-week trend set out below.",
      "Spend across {period} was {spend}, and the completed-week trend follows below.",
    ],
  },
  "weekly-intro-flat": {
    label: "Weekly — no spend, no conversions",
    description: "Fallback when the week has nothing to report.",
    tokens: PERIOD,
    defaults: [
      "{period} is included as the completed-week view, with the budget tracker below for current pacing context.",
      "{period} is the completed-week view, and the budget tracker below covers current pacing.",
      "Below is the completed week for {period}, along with the budget tracker for current pacing.",
    ],
  },
  "weekly-budget-under": {
    label: "Weekly — pacing under budget",
    description: "Closing pacing sentence when spend is at or below the month-to-date target.",
    tokens: [],
    defaults: [
      "Spend stayed controlled, keeping the account under budget and giving us a strong base for the rest of the month.",
      "Spend is tracking under budget for the month, which leaves room to lean into what is working.",
      "Budget pacing is comfortable, with the account sitting under target and the rest of the month still to run.",
      "Spend remains below the month-to-date target, so there is headroom left for the back half of the month.",
      "Pacing is sitting under the month-to-date target, leaving budget available for the weeks ahead.",
      "The account is running below budget for the month, so there is room to scale what is performing.",
    ],
  },
  "weekly-budget-over": {
    label: "Weekly — pacing over budget",
    description: "Closing pacing sentence when spend is ahead of the month-to-date target.",
    tokens: [],
    defaults: [
      "Spend is currently ahead of the month-to-date target, so we\u2019ll keep pacing closely through the rest of the month.",
      "Spend is running ahead of the month-to-date target, so we\u2019re watching pacing closely for the remainder of the month.",
      "The account is tracking ahead of the month-to-date budget target, so we\u2019ll manage pacing tightly through month end.",
      "Month-to-date spend sits above target, so pacing is being adjusted for the rest of the month.",
      "Pacing is ahead of the month-to-date target, so we\u2019re moderating delivery through the back half of the month.",
      "The account is above its month-to-date budget target, so spend is being reined in for the rest of the month.",
    ],
  },

  // ── Monthly ──
  "monthly-performance-up-efficient": {
    label: "Monthly — conversions up, CPA down",
    description: "Best case: more conversions than the prior month, at a lower CPA.",
    tokens: COMPARISON,
    defaults: [
      "{period} was a strong month: conversions rose to {conversions} from {prevConversions} while CPA improved to {cpa} from {prevCpa}.",
      "{period} performed well, lifting conversions to {conversions} from {prevConversions} and bringing CPA down to {cpa} from {prevCpa}.",
      "A strong {period}: {conversions} conversions against {prevConversions} the month prior, with CPA tightening to {cpa} from {prevCpa}.",
      "Both volume and efficiency improved in {period}: {conversions} conversions from {prevConversions}, at {cpa} against {prevCpa}.",
      "{period} delivered more for less, with conversions at {conversions} from {prevConversions} and CPA at {cpa} from {prevCpa}.",
      "Month-on-month {period} improved on both fronts: {conversions} conversions versus {prevConversions}, CPA {cpa} versus {prevCpa}.",
    ],
  },
  "monthly-performance-up": {
    label: "Monthly — conversions up, CPA flat or higher",
    description: "More conversions than the prior month, without an efficiency gain.",
    tokens: COMPARISON_CLAUSE,
    defaults: [
      "{period} lifted conversions to {conversions} from {prevConversions}{cpaClause}.",
      "Conversions grew across {period} to {conversions} from {prevConversions}{cpaClause}.",
      "{period} came in ahead of the prior month on volume, at {conversions} conversions against {prevConversions}{cpaClause}.",
      "Volume improved in {period}, with {conversions} conversions versus {prevConversions} the month before{cpaClause}.",
      "{period} built on the prior month, reaching {conversions} conversions from {prevConversions}{cpaClause}.",
      "Month-on-month, {period} added volume at {conversions} conversions against {prevConversions}{cpaClause}.",
    ],
  },
  "monthly-performance-down-efficient": {
    label: "Monthly — conversions down, CPA down",
    description: "Fewer conversions than the prior month, but cheaper acquisition.",
    tokens: COMPARISON,
    defaults: [
      "{period} traded volume for efficiency: conversions eased to {conversions} from {prevConversions}, while CPA improved to {cpa} from {prevCpa}.",
      "Conversions softened across {period} to {conversions} from {prevConversions}, though CPA came down to {cpa} from {prevCpa}.",
      "{period} saw {conversions} conversions against {prevConversions} the month prior, with CPA tightening to {cpa} from {prevCpa}.",
      "Volume dipped in {period} to {conversions} from {prevConversions}, but each conversion came cheaper at {cpa} versus {prevCpa}.",
    ],
  },
  "monthly-performance-down": {
    label: "Monthly — conversions down, no efficiency gain",
    description: "Fewer conversions than the prior month, with CPA flat or higher.",
    tokens: COMPARISON_CLAUSE,
    defaults: [
      "{period} eased back to {conversions} conversions from {prevConversions}{cpaClause}.",
      "Conversions softened across {period} to {conversions} from {prevConversions}{cpaClause}.",
      "{period} came in behind the prior month, at {conversions} conversions against {prevConversions}{cpaClause}.",
      "Volume slipped in {period} to {conversions} from {prevConversions}{cpaClause}.",
      "The account converted {conversions} times in {period}, down from {prevConversions}{cpaClause}.",
      "Month-on-month, {period} gave back some volume at {conversions} conversions from {prevConversions}{cpaClause}.",
    ],
  },
  "monthly-performance-flat-cpa-move": {
    label: "Monthly — volume flat, CPA moved",
    description: "Same conversions as the prior month, so the sentence leads on CPA.",
    tokens: ["period", "conversions", "cpa", "prevCpa", "direction"],
    defaults: [
      "{period} held conversions at {conversions}, with CPA {direction} to {cpa} from {prevCpa}.",
      "Conversions were steady across {period} at {conversions}, while CPA {direction} to {cpa} from {prevCpa}.",
      "{period} matched the prior month at {conversions} conversions, and CPA {direction} to {cpa} from {prevCpa}.",
      "Volume held flat in {period} at {conversions} conversions, with CPA {direction} to {cpa} from {prevCpa}.",
    ],
  },
  "monthly-performance-converting": {
    label: "Monthly — no prior month, account converted",
    description: "First reported month: describes the month on its own.",
    tokens: ["period", "conversions", "cpa", "spend", "cpaTone"],
    defaults: [
      "{period} delivered {conversions} conversions from {spend} in spend, with CPA {cpaTone} at {cpa}.",
      "Across {period}, {spend} in spend produced {conversions} conversions, with CPA {cpaTone} at {cpa}.",
      "{period} finished with {conversions} conversions on {spend} of spend, and CPA {cpaTone} at {cpa}.",
      "In {period} the account converted {conversions} times off {spend} in spend, keeping CPA {cpaTone} at {cpa}.",
    ],
  },
  "monthly-performance-spend": {
    label: "Monthly — no prior month, spend only",
    description: "First reported month with spend but no conversions.",
    tokens: ["period", "spend"],
    defaults: [
      "{period} recorded {spend} in Google Ads spend, with the monthly trend included below for context.",
      "Google Ads spend for {period} came in at {spend}, and the monthly trend is below for context.",
      "{period} used {spend} in spend, with the monthly trend set out below.",
      "Spend across {period} was {spend}, and the monthly trend follows below.",
    ],
  },
  "monthly-performance-flat": {
    label: "Monthly — no spend, no conversions",
    description: "Fallback when the month has nothing to report.",
    tokens: PERIOD,
    defaults: [
      "{period} is included as the completed-month view, with the trend below for context.",
      "{period} is the completed-month view, and the trend below covers recent performance.",
      "Below is the completed month for {period}, along with the recent performance trend.",
    ],
  },
} as const satisfies Record<string, EmailCopySlot>;

export type EmailCopySlotKey = keyof typeof CLIENT_EMAIL_COPY_SLOTS;

export const EMAIL_COPY_SLOT_KEYS = Object.keys(CLIENT_EMAIL_COPY_SLOTS) as EmailCopySlotKey[];

/** Settings field name for a slot, e.g. "weekly-budget-under" -> "weeklyBudgetUnder". */
export function copyFieldName(slot: EmailCopySlotKey): string {
  return slot.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

/** Editor overrides, keyed by slot. Absent or empty entries use the defaults. */
export type ClientEmailCopy = Partial<Record<EmailCopySlotKey, readonly string[]>>;

const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/g;

/**
 * An override line is usable only when every `{token}` it references is legal
 * for that slot. Anything else would render a literal "{foo}" into a client
 * email, so the whole slot falls back to the shipped defaults instead.
 */
function templateIsValid(template: string, slot: EmailCopySlot): boolean {
  const allowed = new Set<string>(slot.tokens);
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    if (!allowed.has(match[1]!)) return false;
  }
  return true;
}

/** Parses a settings textarea into trimmed, non-empty phrasings. */
export function parseCopyLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The phrasings actually in play for a slot: valid overrides, else defaults. */
export function resolveSlotVariants(
  slot: EmailCopySlotKey,
  copy?: ClientEmailCopy,
): readonly [string, ...string[]] {
  const definition = CLIENT_EMAIL_COPY_SLOTS[slot];
  const overrides = copy?.[slot];
  if (!overrides || overrides.length === 0) return definition.defaults;
  const usable = overrides.filter((template) => templateIsValid(template, definition));
  if (usable.length === 0) {
    console.warn(`[email-copy] slot "${slot}" overrides reference unknown tokens; using defaults`);
    return definition.defaults;
  }
  return usable as [string, ...string[]];
}

/** Substitutes the computed figures into a chosen phrasing. */
export function renderCopyTemplate(template: string, tokens: EmailCopyTokens): string {
  return template.replace(TOKEN_PATTERN, (_match, name: string) => {
    const value = tokens[name as keyof EmailCopyTokens];
    return value === undefined ? "" : value;
  });
}
