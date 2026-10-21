import type { CanonicalTool } from "../_shared/tool";
import {
  BLOG_IDEA_FIELDS,
  BLOG_IDEA_PROPOSAL_SCHEMA,
  BLOG_IDEA_SAVE_SCHEMA,
  PROPOSE_BLOG_IDEA_TOOL,
  SAVE_BLOG_IDEA_TOOL,
  validateBlogIdeaDraft,
  validateBlogIdeaSaveRequest,
  type BlogIdeaClient,
  type BlogIdeaDraft,
  type BlogIdeaFields,
  type BlogIdeaSaveRequest,
} from "../../contentmate/blog-idea";

export type { BlogIdeaClient as ContentMateClient, BlogIdeaDraft } from "../../contentmate/blog-idea";

/** Server-side save, run by /api/optimate/contentmate/save. Never given to the LLM. */
export const SAVE_BLOG_PROMPT_TOOL = "save_blog_prompt";

export interface SaveBlogPromptInput {
  draft: BlogIdeaDraft & { clientId: string; clientName: string };
  confirmed: true;
  /** Set when updating the idea saved earlier in this conversation. */
  ideaId?: number;
}

export type BlogPromptData = BlogIdeaFields & { client: string };

/** Persists a final plan as a `blog-prompts` record (same collection the Blog Prompter saves to). */
export interface BlogPromptStore {
  create: (data: BlogPromptData & { workflowStatus: "idea_phase" }) => Promise<{ id: string | number }>;
  /** Updates an idea-phase prompt; resolves null when it is missing or already past the idea phase. */
  update: (id: number, data: BlogPromptData) => Promise<{ id: string | number } | null>;
}

function parseIdeaId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const id = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ideaId must be a positive integer");
  return id;
}

/** Validate a save request. Throws unless the plan was confirmed and the client is known. */
export function validateSaveBlogPromptInput(raw: unknown, clients: BlogIdeaClient[]): SaveBlogPromptInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("input must be an object");
  const input = raw as Record<string, unknown>;
  if (input.confirmed !== true) throw new Error("The user must confirm the blog idea before it is saved");
  const result = validateBlogIdeaDraft(input.draft, clients);
  if (!result.ok) throw new Error(result.error);
  const { clientId, clientName } = result.value;
  if (!clientId || !clientName) throw new Error("Choose the client this blog idea belongs to before saving");
  const ideaId = parseIdeaId(input.ideaId);
  return { draft: { ...result.value, clientId, clientName }, confirmed: true, ...(ideaId ? { ideaId } : {}) };
}

function promptData(draft: SaveBlogPromptInput["draft"]): BlogPromptData {
  const data = { client: draft.clientId } as BlogPromptData;
  for (const { key } of BLOG_IDEA_FIELDS) data[key] = draft[key];
  return data;
}

/**
 * ContentMate tools.
 * - propose_blog_idea (LLM): stages the plan on screen, no side effects.
 * - save_blog_idea (LLM): stages a save request, no side effects on the server.
 *   The browser runs it through the save route once the user said the plan is final.
 * - save_blog_prompt: NOT given to the LLM. Only the save route runs it; it
 *   creates the blog prompt, or updates the conversation's current idea.
 */
export function createContentMateTools(clients: BlogIdeaClient[], store?: BlogPromptStore): CanonicalTool<unknown>[] {
  const propose: CanonicalTool<BlogIdeaDraft> = {
    name: PROPOSE_BLOG_IDEA_TOOL,
    description:
      "Show the blog plan on screen for the user to review. Has no side effects. Include clientId only from the client list.",
    inputSchema: BLOG_IDEA_PROPOSAL_SCHEMA,
    validate: (raw) => {
      const result = validateBlogIdeaDraft(raw, clients);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
    execute: async (args) => ({ ok: true, data: args }),
  };
  const requestSave: CanonicalTool<BlogIdeaSaveRequest> = {
    name: SAVE_BLOG_IDEA_TOOL,
    description:
      "Fill every field with the final plan and save it under the named client. Only after the user says the plan is final or asks to save/update it. ideaAction update_current changes the idea already saved in this conversation; new_idea starts the next one.",
    inputSchema: BLOG_IDEA_SAVE_SCHEMA,
    validate: (raw) => {
      const result = validateBlogIdeaSaveRequest(raw, clients);
      if (!result.ok) throw new Error(result.error);
      if (!result.value.draft.clientId) throw new Error("clientId is required: ask the user which client this idea is for");
      return result.value;
    },
    execute: async (args) => ({ ok: true, data: args }),
  };
  const save: CanonicalTool<SaveBlogPromptInput> = {
    name: SAVE_BLOG_PROMPT_TOOL,
    description: "Save a final blog plan as a blog prompt for the chosen client, or update the conversation's current idea.",
    inputSchema: {
      type: "object",
      properties: { draft: BLOG_IDEA_PROPOSAL_SCHEMA, confirmed: { type: "boolean", const: true }, ideaId: { type: "integer" } },
      required: ["draft", "confirmed"],
      additionalProperties: false,
    },
    sideEffect: true,
    validate: (raw) => validateSaveBlogPromptInput(raw, clients),
    execute: async ({ draft, ideaId }) => {
      if (!store) return { ok: false, error: "Saving is not available here" };
      const data = promptData(draft);
      if (ideaId) {
        const doc = await store.update(ideaId, data);
        if (!doc) return { ok: false, error: "That blog idea can no longer be updated. Start a new idea instead." };
        return { ok: true, data: { id: doc.id, clientName: draft.clientName, updated: true } };
      }
      const doc = await store.create({ ...data, workflowStatus: "idea_phase" });
      return { ok: true, data: { id: doc.id, clientName: draft.clientName, updated: false } };
    },
  };
  return [propose as CanonicalTool<unknown>, requestSave as CanonicalTool<unknown>, save as CanonicalTool<unknown>];
}
