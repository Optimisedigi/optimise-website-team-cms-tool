import { describe, expect, it, vi } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({ mockRunAgent: vi.fn() }));
vi.mock("@/lib/agents/_shared/base-agent", () => ({ runAgent: mockRunAgent }));

import {
  CONTENTMATE_AGENT,
  createContentMateTools,
  extractLatestProposal,
  extractLatestSaveRequest,
  runContentMateChatTurn,
  SAVE_BLOG_PROMPT_TOOL,
  validateSaveBlogPromptInput,
} from "@/lib/agents/contentmate";
import { hasBlogAccess } from "@/lib/access";

const clients = [{ id: "1", name: "Acme" }, { id: "2", name: "Beta" }];
const ctx = { agentName: "ContentMate", agentRunId: "r", context: {}, log: () => {} };

describe("ContentMate registration", () => {
  it("registers as ContentMate with propose/save-request tools for the LLM and a separate server save tool", () => {
    expect(CONTENTMATE_AGENT).toMatchObject({ key: "contentmate", label: "ContentMate", icon: "/optimate-orb.png" });
    expect(createContentMateTools(clients).map((t) => t.name)).toEqual(["propose_blog_idea", "save_blog_idea", SAVE_BLOG_PROMPT_TOOL]);
  });

  it("is gated on the blog features", () => {
    expect(hasBlogAccess({ role: "admin" })).toBe(true);
    expect(hasBlogAccess({ role: "specialist", featureAccess: ["blog-prompts"] })).toBe(true);
    expect(hasBlogAccess({ role: "specialist", featureAccess: ["clients"] })).toBe(false);
  });

  it("gives the ContentMate agent propose + save_blog_idea (never the server save) and surfaces both", async () => {
    mockRunAgent.mockResolvedValueOnce({
      finalMessage: { role: "assistant", content: [{ type: "text", text: "Saved." }] },
      runId: "run", modelUsed: "m", source: "api-key", totalUsage: {},
      steps: [{ type: "tool-call", toolName: "save_blog_idea", output: { ok: true, data: { draft: { blogIdea: "Idea", mainPoint: "Speed wins", clientId: "1" }, action: "update_current" } } }],
    });
    const result = await runContentMateChatTurn({ messages: [], clients, userId: 1, modelOverride: "m", currentIdea: { id: "7", clientName: "Acme", blogIdea: "Idea" } });
    const call = mockRunAgent.mock.calls.at(-1)?.[0];
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual(["propose_blog_idea", "save_blog_idea"]);
    expect(call.systemPrompt).toContain('update_current');
    expect(call.systemPrompt).toContain('"client":"Acme"');
    expect(result.saveRequest).toMatchObject({ action: "update_current", draft: { blogIdea: "Idea", mainPoint: "Speed wins", clientId: "1", clientName: "Acme" } });
  });

  it("the Blog Prompter panel only gets the propose tool", async () => {
    mockRunAgent.mockResolvedValueOnce({
      finalMessage: { role: "assistant", content: [{ type: "text", text: "Please confirm." }] },
      runId: "run", modelUsed: "m", source: "api-key", totalUsage: {}, steps: [],
    });
    await runContentMateChatTurn({ messages: [], clients, userId: 1, modelOverride: "m", fixedClientName: "Acme" });
    expect(mockRunAgent.mock.calls.at(-1)?.[0].tools.map((t: { name: string }) => t.name)).toEqual(["propose_blog_idea"]);
  });

  it("drops save requests without a known client", () => {
    const steps = [{ type: "tool-call", toolName: "save_blog_idea", output: { data: { draft: { blogIdea: "x", clientId: "9" }, action: "new_idea" } } }];
    expect(extractLatestSaveRequest(steps as never, clients)).toBeUndefined();
  });

  it("surfaces a validated proposal", async () => {
    mockRunAgent.mockResolvedValueOnce({
      finalMessage: { role: "assistant", content: [{ type: "text", text: "Please confirm." }] },
      runId: "run", modelUsed: "m", source: "api-key", totalUsage: {},
      steps: [{ type: "tool-call", toolName: "propose_blog_idea", output: { ok: true, data: { blogIdea: "Idea", clientId: "2" } } }],
    });
    const result = await runContentMateChatTurn({ messages: [], clients, userId: 1, modelOverride: "m" });
    expect(result.proposal).toMatchObject({ blogIdea: "Idea", clientId: "2", clientName: "Beta" });
  });

  it("ignores proposals with unknown clients", () => {
    expect(extractLatestProposal([{ type: "tool-call", toolName: "propose_blog_idea", output: { data: { blogIdea: "x", clientId: "9" } } }] as never, clients)).toBeUndefined();
  });
});

describe("ContentMate save tool", () => {
  const draft = { blogIdea: "Why speed matters", titleIdea: "Speed", clientId: "1" };

  it("refuses to save without explicit confirmation", async () => {
    expect(() => validateSaveBlogPromptInput({ draft }, clients)).toThrow(/confirm/);
    expect(() => validateSaveBlogPromptInput({ draft, confirmed: "yes" }, clients)).toThrow(/confirm/);
  });

  it("requires a known client", () => {
    expect(() => validateSaveBlogPromptInput({ draft: { blogIdea: "x" }, confirmed: true }, clients)).toThrow(/client/);
    expect(() => validateSaveBlogPromptInput({ draft: { ...draft, clientId: "9" }, confirmed: true }, clients)).toThrow(/active client/);
  });

  const empty = { category: "", tag: "", mainPoint: "", keyPoints: "", primaryKeywords: "", secondaryKeywords: "", pointsToAvoid: "", targetAudience: "", supportingContent: "" };

  it("saves a confirmed draft as an idea-phase blog prompt with every field", async () => {
    const store = { create: vi.fn(async () => ({ id: 42 })), update: vi.fn() };
    const save = createContentMateTools(clients, store).find((t) => t.name === SAVE_BLOG_PROMPT_TOOL);
    const args = save?.validate?.({ draft: { ...draft, keyPoints: "Core Web Vitals" }, confirmed: true });
    const result = await save?.execute(args, ctx);
    expect(store.create).toHaveBeenCalledWith({ ...empty, client: "1", blogIdea: "Why speed matters", titleIdea: "Speed", keyPoints: "Core Web Vitals", workflowStatus: "idea_phase" });
    expect(store.update).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, data: { id: 42, clientName: "Acme", updated: false } });
  });

  it("updates the given idea instead of creating one, and refuses when it can no longer be updated", async () => {
    const store = { create: vi.fn(), update: vi.fn(async () => ({ id: 7 })) };
    const save = createContentMateTools(clients, store).find((t) => t.name === SAVE_BLOG_PROMPT_TOOL);
    const result = await save?.execute(save.validate?.({ draft: { ...draft, clientId: "2" }, confirmed: true, ideaId: "7" }), ctx);
    expect(store.update).toHaveBeenCalledWith(7, expect.objectContaining({ client: "2", blogIdea: "Why speed matters" }));
    expect(store.create).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, data: { id: 7, clientName: "Beta", updated: true } });

    store.update.mockResolvedValueOnce(null as never);
    const refused = await save?.execute(save.validate?.({ draft, confirmed: true, ideaId: 7 }), ctx);
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/no longer be updated/) });
    expect(() => save?.validate?.({ draft, confirmed: true, ideaId: "../7" })).toThrow(/ideaId/);
  });
});
