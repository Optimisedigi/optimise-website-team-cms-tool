/**
 * Memory + soul tools (Optimate-Google-Ads).
 *
 * Mocks `payload` + `payload.config` so the tools' DB calls are observable.
 * Verifies:
 *   - `remember` upserts by (scope, clientId, subject) and falls back to
 *     ctx.context.clientId when scope=client without explicit clientId.
 *   - `memory_search` builds the right where filter for client / global /
 *     mixed scopes and stamps lastAccessedAt on returned rows.
 *   - `soul_set` upserts by aspect and validates the kebab-case rule.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks: payload's getPayload returns a fake payload with the
// methods we exercise.
const mockFind = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({
    find: mockFind,
    update: mockUpdate,
    create: mockCreate,
  })),
}));

// Stub the payload config import so the module graph resolves under test.
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { remember } from "@/lib/agents/optimate-google-ads/tools/remember";
import { memorySearch } from "@/lib/agents/optimate-google-ads/tools/memory-search";
import { soulSet } from "@/lib/agents/optimate-google-ads/tools/soul-set";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_1",
  context: { clientId: 7, userId: 42, ...extra },
  log: vi.fn(),
});

beforeEach(() => {
  mockFind.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();
});

describe("remember", () => {
  it("creates a new client fact when none exists, using ctx clientId fallback", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] });
    mockCreate.mockResolvedValueOnce({ id: 99 });

    const args = remember.validate!({
      scope: "client",
      category: "preference",
      subject: "PMax stance",
      content: "Hates PMax — never propose it.",
    });
    const result = await remember.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { action: string }).action).toBe("created");
    expect(mockCreate).toHaveBeenCalledOnce();
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.collection).toBe("agent-memory");
    expect(createCall.data).toMatchObject({
      scope: "client",
      client: 7,
      category: "preference",
      subject: "PMax stance",
      content: "Hates PMax — never propose it.",
      importance: 50,
      createdBy: 42,
      agentRunId: "run_test_1",
    });
  });

  it("updates an existing fact when (scope, clientId, subject) already exists", async () => {
    mockFind.mockResolvedValueOnce({ docs: [{ id: 33 }] });
    mockUpdate.mockResolvedValueOnce({ id: 33 });

    const args = remember.validate!({
      scope: "client",
      clientId: 7,
      category: "preference",
      subject: "PMax stance",
      content: "Now neutral on PMax — open to a small test in 2027.",
      importance: 80,
    });
    const result = await remember.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { action: string }).action).toBe("updated");
    expect(mockCreate).not.toHaveBeenCalled();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.id).toBe(33);
    expect(updateCall.data.content).toBe(
      "Now neutral on PMax — open to a small test in 2027.",
    );
    expect(updateCall.data.importance).toBe(80);
  });

  it("returns an error when scope=client and no clientId is available (args or ctx)", async () => {
    const args = remember.validate!({
      scope: "client",
      category: "preference",
      subject: "X",
      content: "Y",
    });
    const ctx = baseCtx({ clientId: undefined });
    const result = await remember.execute(args, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/clientId/);
  });

  it("validate clamps importance to 0–100 and rounds", () => {
    const a = remember.validate!({
      scope: "global",
      category: "policy",
      subject: "no PMax under $5k",
      content: "Never propose PMax for accounts under $5k/mo spend.",
      importance: 250,
    });
    expect(a.importance).toBe(100);
    const b = remember.validate!({
      scope: "global",
      category: "policy",
      subject: "x",
      content: "y",
      importance: -10,
    });
    expect(b.importance).toBe(0);
    const c = remember.validate!({
      scope: "global",
      category: "policy",
      subject: "x",
      content: "y",
      importance: 50.7,
    });
    expect(c.importance).toBe(51);
  });

  it("validate rejects empty required fields", () => {
    expect(() =>
      remember.validate!({ scope: "client", category: "", subject: "x", content: "y" }),
    ).toThrow(/category/);
    expect(() =>
      remember.validate!({ scope: "client", category: "p", subject: "", content: "y" }),
    ).toThrow(/subject/);
  });
});

describe("memory_search", () => {
  it("client scope uses ctx clientId when none provided, returns formatted facts", async () => {
    mockFind.mockResolvedValueOnce({
      docs: [
        {
          id: 1,
          scope: "client",
          client: 7,
          category: "preference",
          subject: "PMax stance",
          content: "Neutral on PMax.",
          importance: 80,
          updatedAt: "2026-05-01T00:00:00Z",
        },
      ],
    });

    const args = memorySearch.validate!({ scope: "client" });
    const result = await memorySearch.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { count: number }).count).toBe(1);
    const find = mockFind.mock.calls[0][0];
    expect(find.collection).toBe("agent-memory");
    expect(find.sort).toBe("-importance,-updatedAt");
    // The where should include client equals 7 from ctx.
    expect(JSON.stringify(find.where)).toContain('"client":{"equals":7}');
  });

  it("no scope and no ctx client falls back to global only", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] });

    const args = memorySearch.validate!({});
    await memorySearch.execute(args, baseCtx({ clientId: undefined }));

    const find = mockFind.mock.calls[0][0];
    const wj = JSON.stringify(find.where);
    expect(wj).toContain('"scope":{"equals":"global"}');
    expect(wj).not.toContain('"scope":{"equals":"client"}');
  });

  it("query filter ANDs against scope filter", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] });
    const args = memorySearch.validate!({ scope: "global", query: "PMax" });
    await memorySearch.execute(args, baseCtx());

    const find = mockFind.mock.calls[0][0];
    const wj = JSON.stringify(find.where);
    expect(wj).toContain('"contains":"PMax"');
    expect(wj).toContain('"scope":{"equals":"global"}');
  });

  it("clamps limit to 1..50", () => {
    const a = memorySearch.validate!({ limit: 9999 });
    expect(a.limit).toBe(50);
    const b = memorySearch.validate!({ limit: 0 });
    expect(b.limit).toBe(1);
    const c = memorySearch.validate!({ limit: 7.4 });
    expect(c.limit).toBe(7);
  });

  it("stamps lastAccessedAt on every returned row", async () => {
    mockFind.mockResolvedValueOnce({
      docs: [
        { id: 1, scope: "client", client: 7, category: "p", subject: "a", content: "x", importance: 50, updatedAt: "2026-05-01T00:00:00Z" },
        { id: 2, scope: "global", client: null, category: "p", subject: "b", content: "y", importance: 50, updatedAt: "2026-05-01T00:00:00Z" },
      ],
    });
    mockUpdate.mockResolvedValue({ id: 1 });

    const args = memorySearch.validate!({});
    await memorySearch.execute(args, baseCtx());

    // Updates fire async; await a microtask flush so the assertions see them.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[0][0].data).toHaveProperty("lastAccessedAt");
  });
});

describe("soul_set", () => {
  it("creates a new aspect when none exists", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] });
    mockCreate.mockResolvedValueOnce({ id: 1 });

    const args = soulSet.validate!({
      aspect: "tone",
      content: "Be direct. No apologetic language.",
    });
    const result = await soulSet.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { action: string }).action).toBe("created");
    expect(mockCreate.mock.calls[0][0].data).toEqual({
      aspect: "tone",
      content: "Be direct. No apologetic language.",
    });
  });

  it("updates the existing aspect when one exists (upsert by aspect)", async () => {
    mockFind.mockResolvedValueOnce({ docs: [{ id: 5 }] });
    mockUpdate.mockResolvedValueOnce({ id: 5 });

    const args = soulSet.validate!({
      aspect: "tone",
      content: "Even more direct than before.",
    });
    const result = await soulSet.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { action: string }).action).toBe("updated");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][0].id).toBe(5);
  });

  it("validate rejects non-kebab aspect keys", () => {
    expect(() =>
      soulSet.validate!({ aspect: "Tone Style", content: "x" }),
    ).toThrow(/kebab/);
    expect(() =>
      soulSet.validate!({ aspect: "tone_style", content: "x" }),
    ).toThrow(/kebab/);
    // Lowercase + hyphens OK.
    expect(soulSet.validate!({ aspect: "tone-style", content: "x" })).toEqual({
      aspect: "tone-style",
      content: "x",
    });
  });

  it("validate lowercases the aspect", () => {
    const a = soulSet.validate!({ aspect: "TONE", content: "x" });
    expect(a.aspect).toBe("tone");
  });
});
