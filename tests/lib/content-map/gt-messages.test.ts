import { afterEach, describe, expect, it, vi } from "vitest";
import { startGtAnalysis } from "@/lib/content-map/gt";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Growth Tools rejections", () => {
  it("shows GT's own reason instead of a bare HTTP status", async () => {
    vi.stubEnv("GROWTH_TOOLS_URL", "https://gt.test");
    vi.stubEnv("INTERNAL_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Invalid request", issues: [{ path: ["siteUrl"], message: "Invalid url" }] }), { status: 400 })));
    const res = await startGtAnalysis({} as never);
    expect(res).toEqual({ ok: false, error: "Growth Tools rejected the analysis: Invalid request (siteUrl: Invalid url)", status: 400 });
  });
});
