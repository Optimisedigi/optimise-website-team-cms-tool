import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadWorkingDoc = vi.fn();
const saveWorkingDoc = vi.fn();
const payloadAuth = vi.fn();
const verifyWorkingDocPin = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ auth: payloadAuth })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/working-doc-auth", () => ({
  isKnownWorkingDocSlug: vi.fn(() => true),
  verifyWorkingDocPin,
}));
vi.mock("@/lib/working-doc-sync", () => ({
  loadWorkingDoc,
  saveWorkingDoc,
  WorkingDocValidationError: class WorkingDocValidationError extends Error {
    status = 400;
  },
}));

const route = await import("@/app/(frontend)/api/working-docs/[...slug]/route");
const params = Promise.resolve({ slug: ["cipher", "patient-journey-review"] });
const serverDoc = {
  id: 1,
  slug: "cipher/patient-journey-review",
  title: "Journey",
  contentMarkdown: "# Shared\n",
  contentHash: "hash",
  revision: 3,
  lastEditedBy: "Alice",
  lastSavedAt: "2026-07-20T02:00:00.000Z",
  updatedAt: "2026-07-20T02:00:00.000Z",
};

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/working-docs/cipher/patient-journey-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("working document route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payloadAuth.mockResolvedValue({ user: { email: "cms@example.com" } });
    verifyWorkingDocPin.mockResolvedValue({ ok: true });
    loadWorkingDoc.mockResolvedValue(serverDoc);
  });

  it("returns revision/hash with no-store caching for loads", async () => {
    const response = await route.POST(request({ action: "load" }), { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      revision: 3,
      contentHash: "hash",
    });
  });

  it("returns 409 with the untouched submission id and current server content", async () => {
    saveWorkingDoc.mockResolvedValue({
      ok: false,
      conflict: true,
      doc: serverDoc,
      localSubmissionId: "browser-draft-7",
    });
    const response = await route.POST(
      request({
        action: "save",
        contentMarkdown: "# Local\n",
        baseRevision: 2,
        localSubmissionId: "browser-draft-7",
      }),
      { params },
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      conflict: true,
      localSubmissionId: "browser-draft-7",
      revision: 3,
      contentMarkdown: "# Shared\n",
    });
  });

  it("allows PIN editors through the same save service", async () => {
    payloadAuth.mockResolvedValue({ user: null });
    saveWorkingDoc.mockResolvedValue({ ok: true, doc: { ...serverDoc, revision: 4 }, source: "public-editor" });
    const response = await route.POST(
      request({
        action: "save",
        pin: "1234",
        reviewerName: "Partner",
        contentMarkdown: "# Partner\n",
        baseRevision: 3,
        localSubmissionId: "partner-1",
      }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(saveWorkingDoc).toHaveBeenCalledWith(expect.objectContaining({ source: "public-editor", baseRevision: 3 }));
  });
});
