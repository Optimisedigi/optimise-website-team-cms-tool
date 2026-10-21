import { NextResponse } from "next/server";
import { createContentMateTools, SAVE_BLOG_PROMPT_TOOL, type BlogPromptStore } from "@/lib/agents/contentmate";
import { hasBlogAccess } from "@/lib/access";
import { activeContentMateClients, authenticateBlogUser } from "@/lib/contentmate/server";

/**
 * POST /api/optimate/contentmate/save
 *
 * Runs ContentMate's save_blog_prompt tool once the user has said the plan is
 * final (by voice, chat or the Save button). Body:
 *   { draft: BlogIdeaDraft (with clientId), confirmed: true, ideaId? }
 * Without ideaId it creates an idea-phase blog prompt. With ideaId it updates
 * that prompt, but only while it is still an unarchived idea, so a request can
 * never overwrite a prompt that has moved on to drafting or publishing.
 */
export async function POST(request: Request) {
  try {
    const { payload, user } = await authenticateBlogUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasBlogAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body: unknown = await request.json().catch(() => null);
    const clients = await activeContentMateClients(payload);
    const store: BlogPromptStore = {
      create: async (data) => {
        const doc = await payload.create({ collection: "blog-prompts", data: { ...data, client: Number(data.client) }, overrideAccess: true });
        return { id: doc.id };
      },
      update: async (id, data) => {
        const existing = await payload.findByID({ collection: "blog-prompts", id, depth: 0, overrideAccess: true, disableErrors: true });
        if (!existing || existing.archivedAt || (existing.workflowStatus && existing.workflowStatus !== "idea_phase")) return null;
        const doc = await payload.update({ collection: "blog-prompts", id, data: { ...data, client: Number(data.client) }, overrideAccess: true });
        return { id: doc.id };
      },
    };
    const tool = createContentMateTools(clients, store).find((candidate) => candidate.name === SAVE_BLOG_PROMPT_TOOL);
    if (!tool?.validate) return NextResponse.json({ error: "Save is unavailable" }, { status: 500 });

    let args: unknown;
    try {
      args = tool.validate(body);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
    }
    const result = await tool.execute(args, {
      agentName: "ContentMate",
      agentRunId: `contentmate-save-${Date.now()}`,
      context: { userId: user.id },
      log: () => {},
    });
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Save failed" }, { status: 409 });
    return NextResponse.json({ ok: true, saved: result.data });
  } catch (error) {
    console.error("[contentmate/save] error:", error);
    return NextResponse.json({ error: "Failed to save blog prompt" }, { status: 500 });
  }
}
