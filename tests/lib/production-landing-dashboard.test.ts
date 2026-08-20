import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxyProductionLandingDashboard } from "@/lib/production-landing-dashboard";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("proxyProductionLandingDashboard", () => {
  it("uses the production endpoint in development and forwards only the dashboard token", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ pages: [{ key: "real-page", sessions: 12 }] }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const req = new NextRequest(
      "http://localhost:3004/api/dashboard/landing-experiments?slug=away-digital-teams&days=30",
      { headers: { cookie: "dashboard_token=signed%3Atoken; payload-token=do-not-forward" } },
    );

    const response = await proxyProductionLandingDashboard(
      req,
      "/api/dashboard/landing-experiments",
    );

    const [target, init] = fetchMock.mock.calls[0]!;
    expect(String(target)).toBe(
      "https://cms.optimisedigital.online/api/dashboard/landing-experiments?slug=away-digital-teams&days=30",
    );
    expect(init).toMatchObject({
      cache: "no-store",
      headers: { cookie: "dashboard_token=signed%3Atoken" },
    });
    expect(response?.headers.get("x-dashboard-data-source")).toBe("production");
    expect(await response?.json()).toEqual({ pages: [{ key: "real-page", sessions: 12 }] });
  });

  it("does not silently fall back to local analytics when production is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const req = new NextRequest(
      "http://localhost:3004/api/dashboard/landing-pages?slug=away-digital-teams",
      { headers: { cookie: "dashboard_token=valid" } },
    );

    const response = await proxyProductionLandingDashboard(req, "/api/dashboard/landing-pages");

    expect(response?.status).toBe(502);
    expect(await response?.json()).toEqual({ error: "Production landing data is unavailable" });
  });

  it("leaves production and tests on their configured database", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const req = new NextRequest(
      "http://localhost/api/dashboard/landing-pages?slug=away-digital-teams",
      { headers: { cookie: "dashboard_token=valid" } },
    );

    expect(await proxyProductionLandingDashboard(req, "/api/dashboard/landing-pages")).toBeNull();
  });
});
