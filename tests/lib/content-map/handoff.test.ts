import { afterEach, describe, expect, it, vi } from "vitest";
import { cmsOrigin, handOffInsights, INSIGHTS_RUN_PATH, sendInsightsJob } from "@/lib/content-map/handoff";

afterEach(() => vi.restoreAllMocks());

describe("insights handoff to the 300 s route", () => {
  it("uses the production domain in production and the deployment URL elsewhere", () => {
    expect(cmsOrigin({ VERCEL_ENV: "production", NEXT_PUBLIC_SERVER_URL: "https://cms.optimisedigital.online/" } as never)).toBe("https://cms.optimisedigital.online");
    expect(cmsOrigin({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "cms.optimisedigital.online" } as never)).toBe("https://cms.optimisedigital.online");
    expect(cmsOrigin({ VERCEL_ENV: "preview", VERCEL_URL: "abc.vercel.app", NEXT_PUBLIC_SERVER_URL: "https://cms.optimisedigital.online" } as never)).toBe("https://abc.vercel.app");
    expect(cmsOrigin({} as never)).toBeNull();
  });

  it("POSTs { kind, id } with the cron secret", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 202 }));
    const ok = await sendInsightsJob("research", "1", { fetch: f as never, env: { VERCEL_ENV: "production", NEXT_PUBLIC_SERVER_URL: "https://cms.test", CRON_SECRET: "s" } as never });
    expect(ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://cms.test${INSIGHTS_RUN_PATH}`);
    expect(init.headers).toMatchObject({ Authorization: "Bearer s" });
    expect(JSON.parse(String(init.body))).toEqual({ kind: "research", id: "1" });
  });

  it("falls back to running here when it can't hand off (no secret, rejected, network error)", async () => {
    const fallback = vi.fn();
    handOffInsights("citations", "2", fallback, { env: { NEXT_PUBLIC_SERVER_URL: "https://cms.test" } as never });
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
    const rejected = vi.fn();
    handOffInsights("citations", "2", rejected, { fetch: vi.fn(async () => new Response("", { status: 401 })) as never, env: { NEXT_PUBLIC_SERVER_URL: "https://cms.test", CRON_SECRET: "s" } as never });
    await vi.waitFor(() => expect(rejected).toHaveBeenCalledTimes(1));
    const handed = vi.fn();
    handOffInsights("citations", "2", handed, { fetch: vi.fn(async () => new Response("{}", { status: 202 })) as never, env: { NEXT_PUBLIC_SERVER_URL: "https://cms.test", CRON_SECRET: "s" } as never });
    await new Promise((r) => setTimeout(r, 20));
    expect(handed).not.toHaveBeenCalled();
  });
});
