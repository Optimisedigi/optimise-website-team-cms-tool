import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "https://growth.example";
  process.env.INTERNAL_API_KEY = "internal-key";
});

const mockPayload = { auth: vi.fn(), find: vi.fn() };

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { GET as getXeroInvoices } from "@/app/(frontend)/api/xero/invoices/route";
import { GET as getXeroScheduledSends } from "@/app/(frontend)/api/xero/scheduled-sends/route";
import { GET as getLatestGsc } from "@/app/(frontend)/api/organic-growth-snapshots/latest-gsc/route";

describe("admin-only finance and GSC routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as any;
  });

  it("xero/invoices rejects anonymous callers before calling Growth Tools", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const res = await getXeroInvoices(new NextRequest("https://cms.example/api/xero/invoices"));
    expect(res.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("xero/scheduled-sends rejects anonymous callers before calling Growth Tools", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const res = await getXeroScheduledSends(new NextRequest("https://cms.example/api/xero/scheduled-sends"));
    expect(res.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("latest-gsc rejects anonymous callers before reading snapshots", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });
    const res = await getLatestGsc(new Request("https://cms.example/api/organic-growth-snapshots/latest-gsc?clientId=1"));
    expect(res.status).toBe(401);
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("latest-gsc serves an admin session", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockPayload.find.mockResolvedValue({ docs: [{ id: 9 }] });
    const res = await getLatestGsc(new Request("https://cms.example/api/organic-growth-snapshots/latest-gsc?clientId=1"));
    expect(res.status).toBe(200);
    expect((await res.json()).snapshot.id).toBe(9);
  });
});
