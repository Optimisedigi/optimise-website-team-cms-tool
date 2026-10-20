/**
 * Every AI-written email body starts with "Hi" (Gmail-house style), followed
 * by the recipient's first name when it is known. The prompt asks for this;
 * these helpers make it true even when the model opens differently.
 */

const OTHER_GREETING_RE = /^(?:hello|hey|hiya|dear|greetings|g'?day|good\s+(?:morning|afternoon|evening|day))\b/i;
const HI_RE = /^hi\b/i;

/**
 * First name from a From/To header such as `"Sam Lee" <sam@x.com>`. Returns
 * '' when there is no display name (a bare address says nothing reliable).
 */
export function greetingName(header: string): string {
  const first = header.split(",")[0] ?? "";
  const angle = first.indexOf("<");
  if (angle < 0) return "";
  const display = first.slice(0, angle).replace(/["']/g, "").trim();
  if (!display || display.includes("@")) return "";
  // "Lee, Sam" style is split on the comma above, so take the first word.
  const word = display.split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]*$/u.test(word) ? word : "";
}

/** Make the body open with "Hi": rewrite another greeting word, or add "Hi <name>," when there is none. */
export function ensureHiGreeting(text: string, name: string): string {
  const body = text.replace(/^\s+/, "");
  if (!body) return text;
  if (HI_RE.test(body)) return body;
  if (OTHER_GREETING_RE.test(body)) return body.replace(OTHER_GREETING_RE, "Hi");
  return `${name ? `Hi ${name},` : "Hi,"}\n\n${body}`;
}

/** Subject line the model suggested: one line, no quotes or "Subject:" prefix, capped. */
export function cleanSuggestedSubject(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^\s*subject\s*:\s*/i, "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim()
    .slice(0, 200);
}
