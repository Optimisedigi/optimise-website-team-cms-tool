/**
 * Sentence case for AI-written titles, questions and outline headings
 * ("What is a good quality score in Google Ads?"). Brand/product names,
 * acronyms, places, months and days keep their capitals. Never used on the
 * client's own page or published-article titles.
 */

/** Prompt line for every Content Map prompt that writes titles. */
export const SENTENCE_CASE_RULE =
  "Write every title, question and outline heading in sentence case (capitalise only the first word, the first word after a colon, and proper nouns). Brand/product names and acronyms keep their capitals: Google, Google Ads, Meta, Facebook, Instagram, ChatGPT, Perplexity, Gemini, SEO, GEO, AI, PPC, CPC, ROI, GA4, Australia, Australian and city names.";

/** Multi-word names kept as written (checked before single words). */
const PROTECTED_PHRASES: readonly string[][] = [
  ["Meta", "Ads", "Manager"],
  ["Google", "Ads"],
  ["Google", "Analytics"],
  ["Google", "Search", "Console"],
  ["Search", "Console"],
  ["Google", "Business", "Profile"],
  ["Google", "Tag", "Manager"],
  ["Google", "Merchant", "Center"],
  ["Google", "AI", "Overviews"],
  ["AI", "Overviews"],
  ["Performance", "Max"],
  ["Gold", "Coast"],
  ["Sunshine", "Coast"],
  ["New", "Zealand"],
  ["New", "South", "Wales"],
];

const PROTECTED_WORDS = new Set(
  [
    "I", "Google", "Meta", "Facebook", "Instagram", "ChatGPT", "Perplexity", "Gemini", "Claude", "Copilot", "OpenAI", "Bing", "Microsoft", "LinkedIn", "YouTube", "TikTok",
    "Pinterest", "Shopify", "WordPress", "Webflow", "HubSpot", "Apple", "Android", "Amazon", "Canva", "Wix", "Squarespace", "Excel",
    "Australia", "Australian", "Australians", "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Hobart", "Darwin", "Newcastle", "Geelong", "Wollongong",
    "Queensland", "Victoria", "Tasmania", "Vietnam", "Vietnamese", "Asia", "Europe",
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  ].map((w) => w.toLowerCase()),
);
const CANONICAL = new Map(
  ["ChatGPT", "OpenAI", "LinkedIn", "YouTube", "TikTok", "WordPress", "HubSpot"].map((w) => [w.toLowerCase(), w]),
);

const LETTERS = /[\p{L}\p{N}]/u;
/** Split a token into leading punctuation, core word, trailing punctuation. */
function parts(token: string): [string, string, string] {
  let a = 0;
  let b = token.length;
  while (a < b && !LETTERS.test(token[a] ?? "")) a++;
  while (b > a && !LETTERS.test(token[b - 1] ?? "")) b--;
  return [token.slice(0, a), token.slice(a, b), token.slice(b)];
}

/** Acronym (≥ 2 capitals, digits allowed: SEO, GA4, KPIs, Q&A) or inner capitals (ChatGPT, iPhone). */
function keepsCaps(word: string): boolean {
  return word.split("-").some((w) => {
    const letters = w.replace(/[^\p{L}]/gu, "");
    if (/^\p{Lu}{2,}s?$/u.test(letters) && /\p{Lu}.*\p{Lu}/u.test(letters)) return true;
    return /\p{Ll}\p{Lu}/u.test(w);
  });
}

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);

export function sentenceCase(text: string): string {
  const tokens = text.split(/(\s+)/);
  const words = tokens.map((t, i) => ({ i, core: parts(t)[1] })).filter((w) => w.core && !/^\s+$/.test(tokens[w.i] ?? ""));
  if (words.length < 2) return text;

  // Mark protected positions.
  const keep = new Set<number>();
  for (let w = 0; w < words.length; w++) {
    for (const phrase of PROTECTED_PHRASES) {
      if (phrase.every((p, j) => words[w + j]?.core.toLowerCase() === p.toLowerCase())) {
        for (let j = 0; j < phrase.length; j++) keep.add(w + j);
      }
    }
    const core = words[w]?.core ?? "";
    if (keepsCaps(core) || PROTECTED_WORDS.has(core.toLowerCase())) keep.add(w);
  }

  // Leave titles that are already mostly lower case alone.
  let upper = 0;
  let lower = 0;
  for (let w = 1; w < words.length; w++) {
    if (keep.has(w)) continue;
    const c = words[w]?.core.charAt(0) ?? "";
    if (c !== c.toLowerCase()) upper++;
    else if (c !== c.toUpperCase()) lower++;
  }
  if (upper <= lower) return text;

  const out = [...tokens];
  for (let w = 0; w < words.length; w++) {
    const entry = words[w];
    if (!entry) continue;
    const [lead, core, trail] = parts(tokens[entry.i] ?? "");
    const prevTrail = w > 0 ? parts(tokens[words[w - 1]?.i ?? 0] ?? "")[2] : "";
    const starts = w === 0 || /[:?]$/.test(prevTrail);
    let next: string;
    if (keep.has(w)) next = CANONICAL.get(core.toLowerCase()) ?? (PROTECTED_WORDS.has(core.toLowerCase()) && !keepsCaps(core) ? cap(core.toLowerCase()) : core);
    else next = starts ? cap(core.toLowerCase()) : core.toLowerCase();
    if (starts) next = cap(next);
    out[entry.i] = `${lead}${next}${trail}`;
  }
  return out.join("");
}

/** Sentence-case the AI-written text of a brief / plan item (title, question, outline). */
export function sentenceCaseRec<T extends { title: string; question: string; outline: string[] }>(rec: T): T {
  return { ...rec, title: sentenceCase(rec.title), question: sentenceCase(rec.question), outline: rec.outline.map(sentenceCase) };
}
