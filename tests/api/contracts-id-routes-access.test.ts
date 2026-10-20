import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

type RouteModule = Record<string, (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>>;

const routes: Array<{ name: string; method: "GET" | "POST"; load: () => Promise<RouteModule> }> = [
  { name: "preview-pdf", method: "GET", load: () => import("@/app/(frontend)/api/contracts/[id]/preview-pdf/route") },
  { name: "download-pdf", method: "GET", load: () => import("@/app/(frontend)/api/contracts/[id]/download-pdf/route") },
  { name: "download-docx", method: "GET", load: () => import("@/app/(frontend)/api/contracts/[id]/download-docx/route") },
  { name: "agency-sign", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/agency-sign/route") },
  { name: "duplicate", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/duplicate/route") },
  { name: "send-email", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/send-email/route") },
  { name: "send-to-client", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/send-to-client/route") },
  { name: "trash", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/trash/route") },
  { name: "restore", method: "POST", load: () => import("@/app/(frontend)/api/contracts/[id]/restore/route") },
];

function call(mod: RouteModule, method: "GET" | "POST", name: string) {
  const handler = mod[method];
  if (!handler) throw new Error(`${name} has no ${method} handler`);
  const req = new NextRequest(`http://localhost/api/contracts/16/${name}`, {
    method,
    ...(method === "POST" ? { body: "{}", headers: { "Content-Type": "application/json" } } : {}),
  });
  return handler(req, { params: Promise.resolve({ id: "16" }) });
}

describe("contract [id] routes require the Contracts feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(routes)("$name rejects anonymous requests with 401", async ({ name, method, load }) => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const res = await call(await load(), method, name);
    expect(res.status).toBe(401);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it.each(routes)("$name rejects logged-in users without Contracts access with 403", async ({ name, method, load }) => {
    mockPayload.auth.mockResolvedValue({
      user: { id: 7, role: "specialist", featureAccess: ["blog-posts"], permissionProfiles: [] },
    });
    const res = await call(await load(), method, name);
    expect(res.status).toBe(403);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it.each(routes)("$name lets users with Contracts access past the gate", async ({ name, method, load }) => {
    mockPayload.auth.mockResolvedValue({
      user: { id: 8, role: "specialist", featureAccess: ["contracts"], permissionProfiles: [] },
    });
    mockPayload.findByID.mockRejectedValue(new Error("not found"));
    const res = await call(await load(), method, name);
    expect([401, 403]).not.toContain(res.status);
  });
});
