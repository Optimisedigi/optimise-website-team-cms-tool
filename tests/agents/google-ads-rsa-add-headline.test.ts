import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import { getGoogleMateInitialTools } from "@/lib/agents/optimate-google-ads";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA } from "@/lib/agents/optimate-google-ads/change-previews-schema";
import {
  applyChangePreview,
  changePreviewDb,
  listChangePreviewsForRun,
  type ChangePreviewDb,
} from "@/lib/agents/optimate-google-ads/change-previews";
import { createGoogleAdsRsaAddHeadlineTool } from "@/lib/agents/optimate-google-ads/tools/google-ads-rsa-add-headline";

const NOW = new Date("2026-10-20T02:00:00.000Z");
const ctx = {
  agentName: "optimate-google-ads",
  agentRunId: "run-rsa",
  context: { customerId: "123-456-7890", clientId: 42, auditId: 99, userId: 1 },
  log: () => undefined,
};
const AD = "customers/1234567890/adGroupAds/222~333";
const input = {
  targets: [{ campaignId: "111", adGroupId: "222" }],
  headline: "Same Day Plumbers",
  headlinePinnedField: "HEADLINE_1",
  summary: "Add a same-day headline to the Plumbing ad group",
};
const previewOk = {
  ok: true,
  data: {
    fingerprint: "fp-1",
    sourceFingerprint: "src-1",
    warnings: ["Replacement changes the Google Ads resource name and historical reporting association."],
    ads: [
      {
        campaignName: "Services",
        adGroupId: "222",
        adGroupName: "Plumbing",
        adGroupAdResourceName: AD,
        headlines: [{ text: "Local Plumbers" }],
        resultingHeadlines: [{ text: "Local Plumbers" }, { text: "Same Day Plumbers", pinnedField: "HEADLINE_1" }],
        requiresReplacement: false,
      },
    ],
  },
};

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

let client: Client;
let db: ChangePreviewDb;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("create table users (id integer primary key)");
  await client.execute("insert into users (id) values (1)");
  for (const [, statement] of GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA) await client.execute(statement);
  db = changePreviewDb({ db: { drizzle: drizzle(client) } } as unknown as Payload);
});

afterEach(() => {
  client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("google_ads_rsa_add_headline", () => {
  it("rejects bad input before calling Growth Tools", () => {
    const tool = createGoogleAdsRsaAddHeadlineTool(async () => db, vi.fn(), () => NOW);
    expect(() => tool.validate!({ ...input, headline: "x".repeat(31) })).toThrow(/1 to 30/);
    expect(() => tool.validate!({ ...input, targets: [{ campaignId: "abc", adGroupId: "222" }] })).toThrow(/numeric/);
    expect(() => tool.validate!({ ...input, headlinePinnedField: "DESCRIPTION_1" })).toThrow(/HEADLINE_1/);
    expect(() => tool.validate!({ ...input, removeHeadlineByAdGroupAdResourceName: { "not-a-resource": "Old" } })).toThrow(/resource name/);
  });

  it("previews with the selected client and stores exactly the apply request", async () => {
    const send = vi.fn(async () => previewOk);
    const tool = createGoogleAdsRsaAddHeadlineTool(async () => db, send, () => NOW);

    const result = await tool.execute(tool.validate!({ ...input, targets: [{ campaignId: "111", adGroupId: "222" }] }), ctx);

    expect(send).toHaveBeenCalledWith({
      customerId: "1234567890",
      targets: [{ campaignId: "111", adGroupId: "222" }],
      headline: "Same Day Plumbers",
      headlinePinnedField: "HEADLINE_1",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        previewed: true,
        applied: false,
        ads: [{ adGroup: "Plumbing", resultingHeadlines: ["Local Plumbers", "Same Day Plumbers [HEADLINE_1]"] }],
      },
    });

    const [card] = await listChangePreviewsForRun(db, "run-rsa", 1);
    expect(card?.action).toBe("rsa_add_headline");
    // Fingerprints are sent but not shown on the card.
    expect(card?.details).toEqual({
      targets: [{ campaignId: "111", adGroupId: "222" }],
      headline: "Same Day Plumbers",
      headlinePinnedField: "HEADLINE_1",
    });

    const live = vi.fn(async () => ({ ok: true, data: { success: true } }));
    expect((await applyChangePreview(db, card!.id, 1, { now: () => NOW, send: live })).status).toBe("applied");
    expect(live).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/google-ads/rsa/apply",
      body: {
        customerId: "1234567890",
        targets: [{ campaignId: "111", adGroupId: "222" }],
        headline: "Same Day Plumbers",
        headlinePinnedField: "HEADLINE_1",
        fingerprint: "fp-1",
        sourceFingerprint: "src-1",
        confirm: true,
      },
    });
  });

  it("stores nothing when the preview fails", async () => {
    const tool = createGoogleAdsRsaAddHeadlineTool(async () => db, vi.fn(async () => ({ ok: false, error: "Growth Tools 400: No enabled responsive search ads matched" })), () => NOW);

    const result = await tool.execute(tool.validate!(input), ctx);

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("nothing was saved") });
    expect(await listChangePreviewsForRun(db, "run-rsa", 1)).toEqual([]);
  });

  it("asks which headline to drop when an ad already has 15, and stores nothing", async () => {
    const full = {
      ok: true,
      data: { ...previewOk.data, ads: [{ ...previewOk.data.ads[0], requiresReplacement: true, resultingHeadlines: [] }] },
    };
    const tool = createGoogleAdsRsaAddHeadlineTool(async () => db, vi.fn(async () => full), () => NOW);

    const result = await tool.execute(tool.validate!(input), ctx);

    expect(result).toMatchObject({ ok: true, data: { previewed: false, needsHeadlineRemoval: [{ adGroupAdResourceName: AD }] } });
    expect(await listChangePreviewsForRun(db, "run-rsa", 1)).toEqual([]);
  });

  it("refuses without a signed-in user and never calls Growth Tools", async () => {
    const send = vi.fn();
    const tool = createGoogleAdsRsaAddHeadlineTool(async () => db, send, () => NOW);

    const result = await tool.execute(tool.validate!(input), { ...ctx, context: { customerId: "1234567890" } });

    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("loads for headline requests and is hidden when an untrusted email is attached", () => {
    const names = (opts?: { restrictExternalContextActions: boolean }) =>
      getGoogleMateInitialTools([userMessage("add a new headline to the plumbing ads")], opts).map((tool) => tool.name);
    expect(names()).toContain("google_ads_rsa_add_headline");
    expect(names({ restrictExternalContextActions: true })).not.toContain("google_ads_rsa_add_headline");
  });
});
