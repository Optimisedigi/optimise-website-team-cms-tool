import { describe, expect, it, vi, beforeEach } from "vitest";

const findGlobal = vi.fn();

vi.mock("payload", () => ({
  getPayload: async () => ({ findGlobal }),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { loadClientEmailCopy } from "@/lib/agents/_shared/client-email-copy";

describe("loadClientEmailCopy", () => {
  beforeEach(() => {
    findGlobal.mockReset();
  });

  it("returns the editor's overrides", async () => {
    findGlobal.mockResolvedValue({
      clientEmailCopy: { greeting: "Hey team,\nHi team,", weeklyBudgetUnder: "  " },
    });

    await expect(loadClientEmailCopy()).resolves.toEqual({ greeting: ["Hey team,", "Hi team,"] });
  });

  it("drops a value that is just its own column name", async () => {
    // SQLite resolves a double-quoted identifier matching no column to a string
    // literal, so a missing column reads back as its own name. That artefact
    // once shipped "client_email_copy_greeting" to a client instead of copy.
    findGlobal.mockResolvedValue({
      clientEmailCopy: {
        greeting: "client_email_copy_greeting",
        weeklyBudgetUnder: "client_email_copy_weekly_budget_under",
      },
    });

    await expect(loadClientEmailCopy()).resolves.toEqual({});
  });

  it("never throws when the settings read fails", async () => {
    findGlobal.mockRejectedValue(new Error("no such column"));

    await expect(loadClientEmailCopy()).resolves.toEqual({});
  });
});
