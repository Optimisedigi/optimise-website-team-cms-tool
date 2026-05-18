/**
 * Stakeholder deck tool + apply handler tests.
 *
 * Covers:
 *   - propose_stakeholder_deck validator rejects em-dashes anywhere in
 *     user-supplied prose.
 *   - validator rejects payloads whose keyword-stats Spend÷Leads tile
 *     drifts from the Account CPA tile by more than $1.
 *   - generateDeckTsx round-trips an MTP-like payload deterministically
 *     (same input → same output, twice).
 *   - apply handler errors on slug collision (folder already exists).
 *   - apply handler errors out in production NODE_ENV.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

// Mock queueProposal so the validator can run without touching the DB.
// We stub the entire helpers module rather than spread the real one,
// because importing the real module pulls in approval-queue.ts which
// in turn loads payload.config (PAYLOAD_SECRET is not set under test).
const { mockQueueProposal } = vi.hoisted(() => ({
  mockQueueProposal: vi.fn(async () => 4242),
}));
vi.mock("@/lib/agents/optimate-google-ads/tools/_propose-helpers", () => ({
  queueProposal: mockQueueProposal,
  resetProposalCounter: vi.fn(),
  buildInternalMarkdown: vi.fn(() => ""),
  mdTable: vi.fn(() => ""),
}));

import { proposeStakeholderDeck } from "@/lib/agents/optimate-google-ads/tools/propose-stakeholder-deck";
import {
  generateDeckTsx,
  slugToComponentName,
  daysSinceLaunch,
  type DeckPayload,
} from "@/lib/agents/optimate-google-ads/apply-handlers/_deck-templates";
import { applyStakeholderDeck } from "@/lib/agents/optimate-google-ads/apply-handlers/stakeholder-deck";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_deck_1",
  context: { clientId: 7, auditId: 11, customerId: "1840834992" },
  log: vi.fn(),
});

function mtpLikePayload(overrides: Partial<DeckPayload & { summary: string }> = {}): Record<string, unknown> {
  return {
    clientName: "Malcolm Thompson Pumps",
    shortName: "MTP",
    slug: "may-2026-mtp-recap",
    launchDate: "2026-04-10",
    reviewDate: "2026-05-06",
    shippedDid: [
      "Audited every top landing page and the search intent feeding it",
      "Rebuilt the campaign structure end to end (Brand and Generic split)",
      "Rebuilt lead tracking, phone calls and form submissions, verified",
    ],
    shippedProduced: [
      "**29 leads** since 10 April (14 form, 15 phone)",
      "**Account level cost per lead, $81 in April 2026**",
      "**Lead tracking firing correctly**, the first trustworthy baseline the account has had",
    ],
    formsLeads: 14,
    phonesLeads: 15,
    leadsCopy:
      "29 leads since the new structure went live on 10 April, the first clean baseline the account has had.",
    keywordsSubtitle:
      "The people clicking on MTP ads are searching for the brands MTP stocks and the services MTP provides.",
    keywordStats: [
      { value: "760", label: "Distinct searches" },
      { value: "$3,159", label: "Spend (April)" },
      { value: "449", label: "Clicks" },
      { value: "39", label: "Leads (April)" },
      { value: "$81", label: "Account CPA" },
    ],
    keywordRows: [
      { term: "grundfos", clicks: 71, spend: 527, leads: 10 },
      { term: "water pump repairs near me", clicks: 27, spend: 249, leads: 0 },
      { term: "grundfos pumps", clicks: 44, spend: 227, leads: 7 },
      { term: "grundfos australia", clicks: 15, spend: 149, leads: 1 },
      { term: "southern cross pumps", clicks: 18, spend: 108, leads: 0 },
    ],
    nextItems: [
      {
        headline: "Landing page fixes",
        what: "Fixing the top problem pages.",
        why: "Biggest single lift available.",
      },
      {
        headline: "New ad copy",
        what: "Fresh ad copy aligned to landing page intent.",
        why: "Captures emerging intent.",
      },
      {
        headline: "Negative keyword pruning",
        what: "Weekly review of search terms.",
        why: "Keeps spend on commercial intent only.",
      },
      {
        headline: "Budget reallocation",
        what: "Shift spend from zero converting campaigns.",
        why: "Headroom in brand campaigns.",
      },
      {
        headline: "SEO recovery",
        what: "Free SEO audit across the site.",
        why: "Biggest long term lever.",
      },
      {
        headline: "Lead validation",
        what: "Confirm leads are landing in inboxes.",
        why: "Validates the reporting baseline.",
      },
    ],
    summary: "First-month recap for MTP, 29 leads at $81 CPL, ready to share with the owner.",
    ...overrides,
  };
}

beforeEach(() => {
  mockQueueProposal.mockClear();
});

describe("propose_stakeholder_deck — validator", () => {
  it("accepts an MTP-like payload and queues it", async () => {
    const raw = mtpLikePayload();
    const args = proposeStakeholderDeck.validate!(raw);
    const result = await proposeStakeholderDeck.execute(
      args as Parameters<typeof proposeStakeholderDeck.execute>[0],
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(mockQueueProposal).toHaveBeenCalledOnce();
    const call = mockQueueProposal.mock.calls[0][0] as Record<string, unknown>;
    expect(call.proposalType).toBe("stakeholder-deck");
    expect(call.title).toContain("Malcolm Thompson Pumps");
    expect(call.title).toContain("29 leads");
  });

  it("rejects em-dash anywhere in user prose", () => {
    const raw = mtpLikePayload({
      leadsCopy: "29 leads since 10 April \u2014 the first clean baseline.",
    });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/em-dash|en-dash/);
  });

  it("rejects en-dash in shippedDid", () => {
    const raw = mtpLikePayload({
      shippedDid: [
        "Audited every top landing page \u2013 includes the search intent feeding it",
      ],
    });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/em-dash|en-dash/);
  });

  it("rejects payload where Spend\u00f7Leads drifts from Account CPA tile by >$1", () => {
    const raw = mtpLikePayload({
      keywordStats: [
        { value: "760", label: "Distinct searches" },
        { value: "$3,900", label: "Spend (April)" }, // 3900/39 = $100, vs $81 tile
        { value: "449", label: "Clicks" },
        { value: "39", label: "Leads (April)" },
        { value: "$81", label: "Account CPA" },
      ],
    });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/do not reconcile/);
  });

  it("rejects invalid slug", () => {
    const raw = mtpLikePayload({ slug: "May 2026 MTP Recap" });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/slug/);
  });

  it("rejects reviewDate before launchDate", () => {
    const raw = mtpLikePayload({ launchDate: "2026-05-01", reviewDate: "2026-04-10" });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/reviewDate must be on or after/);
  });

  it("rejects nextItems with not exactly 6 entries", () => {
    const raw = mtpLikePayload({
      nextItems: [
        { headline: "Only one", what: "thing", why: "reason" },
      ],
    });
    expect(() => proposeStakeholderDeck.validate!(raw)).toThrow(/exactly 6/);
  });
});

describe("generateDeckTsx — deterministic round-trip", () => {
  it("produces identical output for the same payload, twice", () => {
    const payload = mtpLikePayload() as unknown as DeckPayload;
    const a = generateDeckTsx(payload);
    const b = generateDeckTsx(payload);
    expect(a).toBe(b);
  });

  it("imports the 5 slide primitives and lists 5 slide ids", () => {
    const payload = mtpLikePayload() as unknown as DeckPayload;
    const tsx = generateDeckTsx(payload);
    expect(tsx).toContain('import "./globals.css"');
    expect(tsx).toContain("CoverSlide");
    expect(tsx).toContain("ShippedSlide");
    expect(tsx).toContain("LeadsSlide");
    expect(tsx).toContain("SearchTermsSlide");
    expect(tsx).toContain("NextSlide");
    // The SLIDES array should hold 5 strings.
    expect(tsx).toMatch(/"cover",\s+"shipped",\s+"leads",\s+"keywords",\s+"next"/);
  });

  it("renders **bold** in shippedProduced as <strong>", () => {
    const payload = mtpLikePayload() as unknown as DeckPayload;
    const tsx = generateDeckTsx(payload);
    expect(tsx).toContain("<strong>{\"29 leads\"}</strong>");
  });

  it("encodes leads totals from forms+phones", () => {
    const payload = mtpLikePayload({ formsLeads: 14, phonesLeads: 15 }) as unknown as DeckPayload;
    const tsx = generateDeckTsx(payload);
    expect(tsx).toContain("forms={14}");
    expect(tsx).toContain("phones={15}");
    expect(tsx).toContain("total={29}");
  });
});

describe("daysSinceLaunch + slugToComponentName", () => {
  it("computes days inclusive of partial day boundaries", () => {
    expect(daysSinceLaunch("2026-04-10", "2026-05-06")).toBe(26);
    expect(daysSinceLaunch("2026-04-10", "2026-04-10")).toBe(0);
  });

  it("returns 0 for invalid dates", () => {
    expect(daysSinceLaunch("not-a-date", "2026-05-06")).toBe(0);
  });

  it("builds a PascalCase component name from a slug", () => {
    expect(slugToComponentName("may-2026-mtp-recap")).toBe("May2026MtpRecapDeckPage");
    expect(slugToComponentName("2026-mtp")).toBe("Deck2026MtpDeckPage");
  });
});

describe("apply handler — slug collision + production gate", () => {
  const tmpRoots: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Clean up any sandbox directories we created.
    for (const root of tmpRoots) {
      await fs.rm(root, { recursive: true, force: true });
    }
    tmpRoots.length = 0;
  });

  it("refuses to run in production NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      applyStakeholderDeck(mtpLikePayload(), {
        payload: {} as never,
        approvalId: 1,
        userId: 1,
      }),
    ).rejects.toThrow(/disabled in production/);
  });

  it("errors when the slug folder already exists", async () => {
    // Run inside a temp directory with the (frontend)/partners path pre-created
    // so the collision branch is exercised without touching the real project.
    vi.stubEnv("NODE_ENV", "development");
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deck-collision-"));
    tmpRoots.push(tmpRoot);
    const deckDir = path.join(
      tmpRoot,
      "src",
      "app",
      "(frontend)",
      "partners",
      "google-ads-audit",
      "may-2026-mtp-recap",
    );
    await fs.mkdir(deckDir, { recursive: true });

    const origCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      await expect(
        applyStakeholderDeck(mtpLikePayload(), {
          payload: {} as never,
          approvalId: 1,
          userId: 1,
        }),
      ).rejects.toThrow(/folder already exists/);
    } finally {
      process.chdir(origCwd);
    }
  });

  it("writes page.tsx and globals.css when the slug is free", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deck-write-"));
    tmpRoots.push(tmpRoot);

    const origCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      const result = await applyStakeholderDeck(mtpLikePayload(), {
        payload: {} as never,
        approvalId: 1,
        userId: 1,
      });
      expect(result.detail?.slug).toBe("may-2026-mtp-recap");
      const pageTsxPath = path.join(
        tmpRoot,
        "src",
        "app",
        "(frontend)",
        "partners",
        "google-ads-audit",
        "may-2026-mtp-recap",
        "page.tsx",
      );
      const globalsCssPath = path.join(
        tmpRoot,
        "src",
        "app",
        "(frontend)",
        "partners",
        "google-ads-audit",
        "may-2026-mtp-recap",
        "globals.css",
      );
      const pageContents = await fs.readFile(pageTsxPath, "utf8");
      const globalsContents = await fs.readFile(globalsCssPath, "utf8");
      expect(pageContents).toContain('"use client"');
      expect(pageContents).toContain("Malcolm Thompson Pumps");
      expect(globalsContents).toContain("@import \"tailwindcss\"");
    } finally {
      process.chdir(origCwd);
    }
  });
});
