import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { callLLM } from "@/lib/agents/_shared/llm";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { DEFAULT_AUTONOMOUS_FALLBACKS } from "@/lib/agents/_shared/llm/registry";

/**
 * POST /api/blog-prompts/suggest
 *
 * Given a Blog Idea (and optional client context), returns AI recommendations
 * for every other Blog Prompter field — EXCLUDING client and category, which
 * the user controls. Used by the "AI Suggest" button on the Blog Prompter.
 *
 * Uses the OptiMate default autonomous model (configured in OptiMate Settings)
 * with the standard autonomous fallback chain, so it shares the same provider
 * failover OptiMate already relies on.
 */

const MAX_IDEA_LEN = 4000;

interface SuggestBody {
  blogIdea?: string;
  clientName?: string;
  servicePages?: string;
  existingTags?: string[];
}

/** The fields we ask the model to populate. Deliberately omits client + category. */
interface Suggestion {
  titleIdea: string;
  tag: string;
  mainPoint: string;
  keyPoints: string;
  primaryKeywords: string;
  secondaryKeywords: string;
  pointsToAvoid: string;
  targetAudience: string;
  supportingContent: string;
}

const SUGGESTION_KEYS: ReadonlyArray<keyof Suggestion> = [
  "titleIdea",
  "tag",
  "mainPoint",
  "keyPoints",
  "primaryKeywords",
  "secondaryKeywords",
  "pointsToAvoid",
  "targetAudience",
  "supportingContent",
];

function buildSystemPrompt(): string {
  return [
    "You are an expert SEO content strategist for a digital marketing agency.",
    "Given a blog idea and client context, produce the strongest possible brief for a single SEO-optimised blog post.",
    "Use Australian English spelling. No em dashes or en dashes.",
    "",
    "Return ONLY a JSON object (no markdown fences, no prose) with exactly these string keys:",
    "- titleIdea: an intent-led working title (describes what the reader learns + who it's for).",
    "- tag: ONE topic/authority cluster this article belongs to. If a list of existing client tags is provided, pick the single best match from that list verbatim; otherwise propose a concise topic label.",
    "- mainPoint: the single most important takeaway, 1-2 sentences.",
    "- keyPoints: the key points that must be covered, one per line (newline-separated).",
    "- primaryKeywords: primary target keywords, one per line.",
    "- secondaryKeywords: supporting/secondary keywords, one per line.",
    "- pointsToAvoid: angles, claims, or topics to exclude, one per line (empty string if none).",
    "- targetAudience: who this post is written for, 1 sentence.",
    "- supportingContent: data points, stats, examples, or internal pages worth referencing, one per line.",
    "",
    "Every value must be a string. Use empty string for anything you genuinely cannot infer. Do not invent fake statistics.",
  ].join("\n");
}

function buildUserMessage(body: SuggestBody): string {
  const lines: string[] = [`Blog idea: ${body.blogIdea?.trim()}`];
  if (body.clientName?.trim()) lines.push(`Client: ${body.clientName.trim()}`);
  if (body.servicePages?.trim()) {
    lines.push(`Client service/product pages (for internal linking context):\n${body.servicePages.trim()}`);
  }
  if (body.existingTags && body.existingTags.length > 0) {
    lines.push(`Existing client tags to choose the tag from:\n${body.existingTags.join("\n")}`);
  }
  return lines.join("\n\n");
}

/** Pull the first balanced JSON object out of a model reply, tolerating fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model reply");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Thinking-capable models (kimi-k2.6, minimax-m2.7) sometimes emit the JSON
 * answer inside their reasoning channel rather than the visible content,
 * especially when the token budget is tight. Try the visible text first, then
 * fall back to the reasoning text so a JSON object anywhere in the reply still
 * parses instead of 502ing.
 */
export function extractJsonFromReply(visible: string, reasoning: string | undefined): unknown {
  try {
    return extractJson(visible);
  } catch (err) {
    if (reasoning && reasoning.trim().length > 0) {
      return extractJson(reasoning);
    }
    throw err;
  }
}

function normaliseSuggestion(raw: unknown): Suggestion {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Suggestion;
  for (const key of SUGGESTION_KEYS) {
    const value = obj[key];
    out[key] = typeof value === "string" ? value.trim() : "";
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: SuggestBody;
    try {
      body = (await request.json()) as SuggestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const blogIdea = body.blogIdea?.trim();
    if (!blogIdea) {
      return NextResponse.json({ error: "blogIdea is required" }, { status: 400 });
    }
    if (blogIdea.length > MAX_IDEA_LEN) {
      return NextResponse.json({ error: "Blog idea is too long" }, { status: 413 });
    }

    const { defaultAutonomousModel, blogPrompterModel } = await getOptiMateDefaultModels(payload);

    const runSuggestion = async (model: typeof defaultAutonomousModel, useFallbackChain: boolean) => {
      const response = await callLLM({
        model,
        ...(useFallbackChain ? { fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS } : {}),
        // Generous budget: the autonomous defaults (kimi-k2.6, minimax-m2.7) are
        // thinking models that spend tokens on a reasoning pass BEFORE emitting
        // the visible JSON. At 1500 they routinely exhausted the budget mid-
        // reasoning and returned empty content, surfacing as "AI returned an
        // unexpected format". 6000 leaves room for reasoning + the JSON answer.
        maxTokens: 6000,
        temperature: 0.7,
        system: buildSystemPrompt(),
        messages: [
          { role: "user", content: [{ type: "text", text: buildUserMessage(body) }] },
        ],
      });

      const text = response.message.content
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("")
        .trim();

      try {
        return {
          suggestion: normaliseSuggestion(
            extractJsonFromReply(text, response.message.reasoningContent),
          ),
          model: response.model,
        };
      } catch (err) {
        console.error(
          "[blog-prompts/suggest] parse error:",
          (err as Error).message,
          "model=",
          response.model,
          "stopReason=",
          response.stopReason,
          "visibleLen=",
          text.length,
          "preview=",
          text.slice(0, 300),
        );
        throw new Error(`Model ${response.model} returned an unexpected format.`);
      }
    };

    let result: Awaited<ReturnType<typeof runSuggestion>>;
    let warning: string | undefined;
    if (blogPrompterModel && blogPrompterModel !== defaultAutonomousModel) {
      try {
        result = await runSuggestion(blogPrompterModel, false);
      } catch (err) {
        warning = `Blog Prompter AI model ${blogPrompterModel} failed (${(err as Error).message}); fell back to autonomous default ${defaultAutonomousModel}.`;
        console.warn("[blog-prompts/suggest]", warning);
        result = await runSuggestion(defaultAutonomousModel, true);
      }
    } else {
      result = await runSuggestion(defaultAutonomousModel, true);
    }

    return NextResponse.json({ ok: true, ...result, warning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggestion failed";
    console.error("[blog-prompts/suggest] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
