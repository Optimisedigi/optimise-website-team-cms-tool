/**
 * POST /api/optimate/google-ads-changes/:id/apply — the only path that sends a
 * live Google Ads change OptiMate prepared. Signed-in admins only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPayload = { auth: vi.fn() };
const applySpy = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/agents/optimate-google-ads/change-previews", () => ({
  applyChangePreview: (...args: unknown[]) => applySpy(...args),
  changePreviewDb: () => ({}),
}));

import { POST } from "@/app/(frontend)/api/optimate/google-ads-changes/[id]/apply/route";

function call(id: string) {
  return POST(new Request(`http://localhost/api/optimate/google-ads-changes/${id}/apply`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockPayload.auth.mockReset();
  applySpy.mockReset();
});

describe("apply Google Ads change route", () => {
  it("rejects unauthenticated requests", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    expect((await call("5")).status).toBe(401);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("rejects non-admin users before touching the change", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 3, role: "editor" } });

    expect((await call("5")).status).toBe(403);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed id", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });

    expect((await call("5;drop")).status).toBe(400);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("applies as the signed-in admin and reports a change that is no longer pending as 409", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    applySpy.mockResolvedValueOnce({ status: "applied", result: { changed: 1 } });

    const ok = await call("5");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, result: { changed: 1 } });
    expect(applySpy).toHaveBeenCalledWith({}, 5, 1, expect.any(Object));

    applySpy.mockResolvedValueOnce({ status: "unavailable", reason: "This change was already applied." });
    expect((await call("5")).status).toBe(409);
  });
});
