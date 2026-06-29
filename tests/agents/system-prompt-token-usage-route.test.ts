import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ auth: authMock })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("@/app/(frontend)/api/xero/chat/route", () => ({
  tools: [],
}));

import { GET } from "@/app/(frontend)/api/agent/system-prompt-token-usage/route";

type TokenUsageResponse = {
  prompts: Array<{ label: string; sourcePaths: string[]; estimatedTokens: number; characters: number }>;
  toolSchemas: Array<{ label: string; sourcePaths: string[]; toolCount: number; estimatedTokens: number; characters: number }>;
};

function rowByLabel<T extends { label: string }>(rows: T[], label: string): T {
  const row = rows.find((candidate) => candidate.label === label);
  expect(row, `missing token usage row: ${label}`).toBeDefined();
  return row as T;
}

describe("system-prompt-token-usage route", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "admin", role: "admin" } });
  });

  it("returns generic, conditional, and legacy GoogleMate prompt rows", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as TokenUsageResponse;

    const generic = rowByLabel(body.prompts, "GoogleMate normal chat");
    const geo = rowByLabel(body.prompts, "GoogleMate geo/campaign workflow");
    const scheduled = rowByLabel(body.prompts, "GoogleMate scheduled/deck workflow");
    const legacy = rowByLabel(body.prompts, "GoogleMate all guides legacy");

    expect(generic.estimatedTokens).toBeGreaterThan(0);
    expect(generic.sourcePaths).toContain("src/lib/agents/optimate-google-ads/config.ts");
    expect(generic.characters).toBeLessThan(geo.characters);
    expect(generic.characters).toBeLessThan(scheduled.characters);
    expect(legacy.characters).toBeGreaterThan(generic.characters);
  });

  it("reports lean blank GoogleMate tools separately from full audit tools", async () => {
    const response = await GET();
    const body = (await response.json()) as TokenUsageResponse;

    const blankInitial = rowByLabel(body.toolSchemas, "GoogleMate normal chat initial tool schemas");
    const geoInitial = rowByLabel(body.toolSchemas, "GoogleMate geo/campaign initial tool schemas");
    const scheduledDeckInitial = rowByLabel(body.toolSchemas, "GoogleMate scheduled/deck initial tool schemas");
    const fullAudit = rowByLabel(body.toolSchemas, "GoogleMate full audit tool schemas");

    expect(blankInitial.toolCount).toBe(4);
    expect(blankInitial.sourcePaths).toContain("src/lib/agents/optimate-google-ads/index.ts");
    expect(blankInitial.estimatedTokens).toBeGreaterThan(0);
    expect(geoInitial.toolCount).toBeGreaterThan(blankInitial.toolCount);
    expect(scheduledDeckInitial.toolCount).toBeGreaterThan(blankInitial.toolCount);
    expect(blankInitial.toolCount).toBeLessThan(fullAudit.toolCount);
    expect(blankInitial.characters).toBeLessThan(fullAudit.characters);
  });

  it("blocks non-admin users", async () => {
    authMock.mockResolvedValue({ user: { id: "editor", role: "editor" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });
});
