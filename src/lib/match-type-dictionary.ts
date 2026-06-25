import { canonMatchTypeToken } from "@/lib/match-type-synonyms";

// Compact local dictionary for match-type confidence. This intentionally covers
// common service/job/marketing words we expect in relevant searches without
// trying to be a full English dictionary in the browser bundle.
const ENGLISH_WORDS = [
  "accountant", "accounting", "admin", "administrator", "agency", "american", "assistant",
  "attack", "best", "bookkeeper", "bookkeeping", "boost", "business", "buy", "campaign",
  "company", "consultant", "consultants", "content", "cost", "costs", "digital", "easy",
  "finance", "financial", "firm", "firms", "growth", "help", "hire", "hiring", "internet",
  "integrated", "management", "managed", "manager", "marketing", "media", "outsourced",
  "outsource", "outsourcing", "panel", "personal", "price", "pricing", "provider", "quote",
  "receptionist", "recruit", "recruitment", "service", "services", "social", "software",
  "specialist", "staff", "staffing", "support", "system", "systems", "target", "tool", "tools",
  "virtual", "westminster",
];

const ENGLISH_WORD_SET = new Set(ENGLISH_WORDS.map(canonMatchTypeToken));

export function isKnownEnglishWord(word: string): boolean {
  const normalised = canonMatchTypeToken(word);
  if (!normalised) return true;
  if (ENGLISH_WORD_SET.has(normalised)) return true;

  // Conservative suffix handling so simple forms don't need every variant.
  if (normalised.endsWith("ing") && ENGLISH_WORD_SET.has(normalised.slice(0, -3))) return true;
  if (normalised.endsWith("er") && ENGLISH_WORD_SET.has(normalised.slice(0, -2))) return true;
  if (normalised.endsWith("ed") && ENGLISH_WORD_SET.has(normalised.slice(0, -2))) return true;
  return false;
}

export const matchTypeDictionary = {
  has: isKnownEnglishWord,
};
