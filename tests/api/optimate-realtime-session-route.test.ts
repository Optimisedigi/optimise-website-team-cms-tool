import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { auth: vi.fn(), findByID: vi.fn(), find: vi.fn() };

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from "@/app/(frontend)/api/optimate/realtime-session/route";

const adminMateRequest = () => new Request("http://localhost/api/optimate/realtime-session?mode=adminmate");

describe("OptiMate realtime session route — AdminMate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns speech-only AdminMate instructions with no tools for admins", async () => {
    payload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    const res = await GET(adminMateRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { instructions: string; tools: unknown[] };
    expect(body.instructions).toContain("ADMINMATE SPEECH-ONLY MODE");
    expect(body.tools).toEqual([]);
    expect(payload.findByID).not.toHaveBeenCalled();
  });

  it("rejects non-admin users like the AdminMate chat route", async () => {
    payload.auth.mockResolvedValue({ user: { id: 2, role: "editor" } });
    const res = await GET(adminMateRequest());
    expect(res.status).toBe(403);
  });
});
