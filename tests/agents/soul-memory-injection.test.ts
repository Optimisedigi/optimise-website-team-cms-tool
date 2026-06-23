/**
 * Soul + memory injection verification.
 *
 * Proves the chain that puts agent-soul (and pinned memory) into every
 * GoogleMate system prompt actually fires:
 *
 *   computeMemoryTokenUsage  -> reads agent-memory + agent-soul from the DB
 *   loadPinnedMemoryBlock    -> joins them into one block string
 *   buildSystemPromptForAudit-> embeds the block + the "soul rules are
 *                               ABSOLUTE" precedence note in the system prompt
 *
 * runChatTurn (index.ts) is a straight pass-through of these two functions, so
 * if the block lands in the prompt here, it lands in the prompt sent to the
 * model at runtime.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFind = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ find: mockFind })),
}));

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import {
  computeMemoryTokenUsage,
  loadPinnedMemoryBlock,
} from "@/lib/agents/optimate-google-ads/memory-loader";
import { buildSystemPromptForAudit } from "@/lib/agents/optimate-google-ads/config";

const SOUL_ROWS = [
  { id: 1, aspect: "tone", content: "Casual, fun, sharp.", appliesTo: "all" },
  { id: 2, aspect: "spelling", content: "Use Australian English spelling everywhere.", appliesTo: "all" },
  { id: 3, aspect: "google-ads-jargon", content: "Avoid GCLID and impression share unless defined.", appliesTo: "google-ads" },
  { id: 4, aspect: "email-signoff", content: "Sign emails off warmly.", appliesTo: "email" },
];

const PINNED_FACTS = [
  { scope: "client", client: { id: 7 }, category: "preference", subject: "PMax stance", content: "Hates PMax." },
];

/**
 * memory-loader calls find twice: first agent-memory (pinned facts), then
 * agent-soul. Route by collection so both lookups return realistic data.
 */
function routeFind(args: { collection: string }) {
  if (args.collection === "agent-memory") return Promise.resolve({ docs: PINNED_FACTS });
  if (args.collection === "agent-soul") return Promise.resolve({ docs: SOUL_ROWS });
  return Promise.resolve({ docs: [] });
}

const AUDIT = {
  id: 999,
  businessName: "Test Co",
  customerId: "123-456-7890",
  monthlySpend: 5000,
  brandTerms: "",
};

beforeEach(() => {
  mockFind.mockReset();
  mockFind.mockImplementation(routeFind as never);
});

describe("computeMemoryTokenUsage reads agent-soul + agent-memory", () => {
  it("builds a soul block from the agent-soul rows and counts aspects", async () => {
    const usage = await computeMemoryTokenUsage([7]);

    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ collection: "agent-soul" }));
    expect(usage.soulText).toContain("Working with this team");
    expect(usage.soulText).toContain("**tone**: Casual, fun, sharp.");
    expect(usage.soulText).toContain("**spelling**:");
    expect(usage.soulAspectCount).toBeGreaterThan(0);
    expect(usage.soulTokens).toBeGreaterThan(0);
  });

  it("filters soul rows by soulAgentKeys so other agents' rows are excluded", async () => {
    const googleAds = await computeMemoryTokenUsage([7], { soulAgentKeys: ["google-ads"] });

    // 'all' rows + google-ads row load; the email-only row must not.
    expect(googleAds.soulText).toContain("**google-ads-jargon**:");
    expect(googleAds.soulText).not.toContain("email-signoff");
  });

  it("loads pinned facts into the memory block", async () => {
    const usage = await computeMemoryTokenUsage([7]);

    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ collection: "agent-memory" }));
    expect(usage.memoryText).toContain("Known about this account");
    expect(usage.memoryText).toContain("PMax stance");
    expect(usage.pinnedFactCount).toBe(1);
  });
});

describe("loadPinnedMemoryBlock joins memory + soul", () => {
  it("returns a single block containing both sections", async () => {
    const block = await loadPinnedMemoryBlock([7], { soulAgentKeys: ["google-ads"] });

    expect(block.text).toContain("Known about this account");
    expect(block.text).toContain("Working with this team");
    expect(block.text).toContain("**tone**:");
  });
});

describe("buildSystemPromptForAudit injects the soul/memory block into the prompt", () => {
  it("embeds the loaded block and the ABSOLUTE precedence note", async () => {
    const block = await loadPinnedMemoryBlock([7], { soulAgentKeys: ["google-ads"] });

    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      pinnedMemoryBlock: block.text,
      recentMessages: [],
    });

    // The exact soul content reaches the system prompt.
    expect(prompt).toContain("**tone**: Casual, fun, sharp.");
    expect(prompt).toContain("**spelling**:");
    expect(prompt).toContain("**google-ads-jargon**:");
    // The pinned fact reaches the system prompt.
    expect(prompt).toContain("PMax stance");
    // The precedence note that makes soul win over later prompt examples.
    expect(prompt).toContain("The soul rules above are ABSOLUTE.");
  });

  it("omits the precedence note when there is no memory/soul block", async () => {
    const prompt = buildSystemPromptForAudit(AUDIT, null, undefined, {
      pinnedMemoryBlock: "",
      recentMessages: [],
    });
    expect(prompt).not.toContain("The soul rules above are ABSOLUTE.");
  });
});
