import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@/collections/api-key-access", () => ({
  hasValidApiKey: vi.fn(() => false),
}));

import { POST } from "@/app/(frontend)/api/google-ads-budgets/[id]/update/route";

function request(body: unknown): NextRequest {
  return new NextRequest("https://cms.example/api/google-ads-budgets/12/update", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("google ads budgets update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockPayload.findByID.mockResolvedValue({ customerId: "123-456-7890" });
    mockPayload.update.mockResolvedValue({ id: 99 });
    mockPayload.create.mockResolvedValue({ id: 100 });
  });

  it("saves annual budget placeholders onto the linked client record", async () => {
    mockPayload.findByID.mockResolvedValueOnce({ id: 12, client: 77 });

    const response = await POST(request({
      _saveAnnualBudgetPlaceholders: {
        thisYear: { rows: [{ id: '1', label: 'Budget', values: { jul: 50000 } }], actualTotals: {} },
        lastYear: { rows: [{ id: '2', label: 'Budget', values: { jun: 100000 } }], actualTotals: {} },
      },
    }), {
      params: Promise.resolve({ id: '12' }),
    });

    expect(response.status).toBe(200);
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'clients',
      id: 77,
      data: expect.objectContaining({
        annualClientBudgetPlaceholders: expect.objectContaining({
          thisYear: expect.any(Object),
          lastYear: expect.any(Object),
        }),
      }),
    }));
  });

  it("falls back to the audit field when client placeholder storage is unavailable", async () => {
    mockPayload.findByID.mockResolvedValueOnce({ id: 12, client: 77 });
    mockPayload.update
      .mockRejectedValueOnce(new Error("SQL_INPUT_ERROR: no such column: annual_client_budget_placeholders"))
      .mockResolvedValueOnce({ id: 12 });

    const response = await POST(request({
      _saveAnnualBudgetPlaceholders: {
        thisYear: { rows: [{ id: '1', label: 'Budget', values: { jul: 50000 } }], actualTotals: { jul: 1200 } },
        lastYear: { rows: [{ id: '2', label: 'Budget', values: { jun: 100000 } }], actualTotals: {} },
      },
    }), {
      params: Promise.resolve({ id: '12' }),
    });

    expect(response.status).toBe(200);
    expect(mockPayload.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      collection: 'clients',
      id: 77,
    }));
    expect(mockPayload.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      collection: 'google-ads-audits',
      id: 12,
      data: expect.objectContaining({
        annualBudgetPlaceholders: expect.objectContaining({
          thisYear: expect.any(Object),
          lastYear: expect.any(Object),
        }),
      }),
    }));
  });

  it("bulk save uses depth-0 audit lookup and depth-0 CMS writes", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ totalDocs: 1, docs: [{ id: 41 }] })
      .mockResolvedValueOnce({ totalDocs: 0, docs: [] });

    const response = await POST(request({
      campaigns: [
        {
          campaignId: "existing-campaign",
          campaignName: "Existing campaign",
          budgetPercentage: 55,
          calculatedDailyBudget: 120,
          bidStrategy: "manual_cpc",
          enabled: true,
        },
        {
          campaignId: "new-campaign",
          campaignName: "New campaign",
          budgetPercentage: 45,
          calculatedDailyBudget: 90,
          bidStrategy: "manual_cpc",
          enabled: true,
        },
      ],
    }), {
      params: Promise.resolve({ id: "12" }),
    });

    expect(response.status).toBe(200);
    expect(mockPayload.findByID).toHaveBeenCalledWith(expect.objectContaining({
      collection: "google-ads-audits",
      id: 12,
      depth: 0,
    }));
    expect(mockPayload.find).toHaveBeenNthCalledWith(1, expect.objectContaining({
      collection: "google-ads-campaign-budgets",
      depth: 0,
    }));
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: "google-ads-campaign-budgets",
      id: 41,
      depth: 0,
    }));
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: "google-ads-campaign-budgets",
      depth: 0,
      data: expect.objectContaining({
        audit: 12,
        customerId: "123-456-7890",
        campaignId: "new-campaign",
      }),
    }));
  });
});
