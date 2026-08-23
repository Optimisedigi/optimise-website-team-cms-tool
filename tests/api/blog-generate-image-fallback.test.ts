import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The OAuth path (Codex/gpt-image-2) is best-effort: OpenAI currently strips the
 * `image_generation` tool for ChatGPT accounts, so the route must fall back to
 * Gemini on its own rather than dead-ending. These tests pin that behaviour and
 * the "which path produced this" reporting the admin UI shows.
 */

const generateImageViaCodexOAuth = vi.fn();
const generateImages = vi.fn();
const create = vi.fn();

vi.mock("@/lib/blog/openai-image", () => ({
  generateImageViaCodexOAuth,
  CodexImageError: class extends Error {},
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateImages };
  },
}));
vi.mock("payload", () => ({
  getPayload: async () => ({
    auth: async () => ({ user: { id: 1 } }),
    create,
  }),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: async () => ({
    blogImageGenerationModel: "imagen-4.0-fast-generate-001",
  }),
}));

const { POST } = await import("@/app/(frontend)/api/blog-posts/generate-image/route");

/** A real 8x8 PNG, so sharp does actual image work instead of being mocked. */
const PNG_8X8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4UaGBFTEMLQkAUtVaAV8W4QQAAAAASUVORK5CYII=",
  "base64",
);

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/blog-posts/generate-image", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

const validBody = {
  blogPostId: "1",
  title: "Hello World",
  imagePromptOverride: "a cinematic office desk",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
  create.mockResolvedValue({ id: 7, url: "/media/hello-world.webp" });
  generateImages.mockResolvedValue({
    generatedImages: [{ image: { imageBytes: PNG_8X8.toString("base64") } }],
  });
});

describe("blog generate-image fallback", () => {
  it("falls back to Gemini and still returns an image when OAuth fails", async () => {
    generateImageViaCodexOAuth.mockRejectedValue(new Error("tool stripped by backend"));

    const res = await POST(request(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.url).toBe("/media/hello-world.webp");
    expect(data.source).toBe("api-key");
    expect(data.notice).toContain("API key");
    expect(generateImages).toHaveBeenCalledTimes(1);

    // A real WebP buffer must reach the Media collection, not a placeholder.
    const uploaded = create.mock.calls[0][0].file;
    expect(uploaded.mimetype).toBe("image/webp");
    expect(uploaded.data.length).toBeGreaterThan(0);
  });

  it("uses OAuth and skips Gemini entirely when OAuth works", async () => {
    generateImageViaCodexOAuth.mockResolvedValue(PNG_8X8);

    const res = await POST(request(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.source).toBe("oauth");
    expect(data.notice).toBeUndefined();
    expect(generateImages).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller before spending any credits", async () => {
    const payload = await import("payload");
    vi.spyOn(payload, "getPayload").mockResolvedValueOnce({
      auth: async () => ({ user: null }),
      create,
    } as never);

    const res = await POST(request(validBody));

    expect(res.status).toBe(401);
    expect(generateImageViaCodexOAuth).not.toHaveBeenCalled();
    expect(generateImages).not.toHaveBeenCalled();
  });
});
