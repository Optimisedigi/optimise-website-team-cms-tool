import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { callLLM } from "@/lib/agents/_shared/llm";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { DEFAULT_AUTONOMOUS_FALLBACKS } from "@/lib/agents/_shared/llm/registry";

/**
 * Generate an AI image-generation prompt for a blog post hero banner.
 *
 * Model selection follows the OptiMate settings: the "Blog AI model"
 * (`blogPrompterModel`) drives this when set, otherwise it falls back to the
 * autonomous default model. This is the same resolution the Blog Prompter AI
 * Suggest / generate-blog routes use, so all blog-AI features share one model
 * setting. Routing through `callLLM` means provider credentials and the
 * fallback chain are handled centrally instead of calling a vendor directly.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; excerpt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, excerpt } = body;
  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const systemPrompt = [
      "You are an expert at writing image generation prompts.",
      "Given a blog post title and optional excerpt, write a single vivid, detailed prompt for an AI image generator.",
      "The prompt should describe a visually striking, professional image suitable as a 16:9 landscape blog hero banner.",
      "Focus on composition, lighting, colors, mood, and visual elements — NOT text or typography.",
      "The prompt MUST instruct the image generator to not include any text, words, letters, numbers, watermarks, logos, or typography in the image.",
      "Return ONLY the prompt text, nothing else. No quotes, no explanation, no preamble.",
    ].join(" ");

    const userMessage = excerpt?.trim()
      ? `Blog title: "${title.trim()}"\nExcerpt: "${excerpt.trim()}"`
      : `Blog title: "${title.trim()}"`;

    const { defaultAutonomousModel, blogPrompterModel } =
      await getOptiMateDefaultModels(payload);

    const runGeneration = async (
      model: typeof defaultAutonomousModel,
      useFallbackChain: boolean,
    ): Promise<{ prompt: string; model: string }> => {
      const response = await callLLM({
        model,
        ...(useFallbackChain ? { fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS } : {}),
        maxTokens: 300,
        temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
      });
      const prompt = response.message.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .trim();
      if (!prompt) {
        throw new Error(`Model ${response.model} returned an empty prompt.`);
      }
      return { prompt, model: response.model };
    };

    let result: Awaited<ReturnType<typeof runGeneration>>;
    let warning: string | undefined;
    if (blogPrompterModel && blogPrompterModel !== defaultAutonomousModel) {
      try {
        result = await runGeneration(blogPrompterModel, false);
      } catch (err) {
        warning = `Blog AI model ${blogPrompterModel} failed (${(err as Error).message}); fell back to autonomous default ${defaultAutonomousModel}.`;
        console.warn("[generate-prompt]", warning);
        result = await runGeneration(defaultAutonomousModel, true);
      }
    } else {
      result = await runGeneration(defaultAutonomousModel, true);
    }

    return NextResponse.json({ ok: true, prompt: result.prompt, model: result.model, warning });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Prompt generation failed";
    console.error("[generate-prompt]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
