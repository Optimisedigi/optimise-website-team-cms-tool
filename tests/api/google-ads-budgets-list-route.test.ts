import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  db: {
    client: {
      execute: vi.fn(),
    },
  },
};

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}));

vi.mock('@/collections/api-key-access', () => ({
  hasValidApiKey: vi.fn(() => false),
}));

import { GET } from '@/app/(frontend)/api/google-ads-budgets/[id]/list/route';

function makeRequest(range: string): NextRequest {
  return new NextRequest(`https://cms.example/api/google-ads-budgets/12/list?reportOnly=1&skipPersist=1&range=${range}`, {
    method: 'GET',
  });
}

function growthToolsResponse(cost: number) {
  return {
    ok: true,
    json: async () => ({
      campaigns: [
        {
          campaignId: '123',
          campaignName: 'Search - Generic',
          dailyBudget: 100,
          biddingStrategyType: 'MANUAL_CPC',
          impressions: 1000,
          clicks: 100,
          avgCpc: 5,
          conversions: 10,
          cost,
          campaignStatus: 'ENABLED',
        },
      ],
    }),
  };
}

describe('google ads budgets list route', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    vi.clearAllMocks();
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.example';
    process.env.INTERNAL_API_KEY = 'test-internal-key';

    mockPayload.auth.mockResolvedValue({ user: { id: 1 } });
    mockPayload.db.client.execute.mockResolvedValue({
      rows: [{ id: 12, customer_id: '111-222-3333', client_id: 77, monthly_budget: 42000 }],
    });
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    mockPayload.findByID.mockResolvedValue({
      id: 77,
      googleAdsCustomerId: '444-555-6666',
      dashboardConversionActions: '',
      annualClientBudgetPlaceholders: {
        thisYear: {
          rows: [{ id: 'fy-this', label: 'Budget', values: { jul: 50000, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
          actualTotals: {},
        },
        lastYear: {
          rows: [{ id: 'fy-last', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 100000 } }],
          actualTotals: {},
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('selects the viewed month budget: this month uses July while last month uses June', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(growthToolsResponse(12000) as any)
      .mockResolvedValueOnce(growthToolsResponse(80000) as any) as any;

    const thisMonthResponse = await GET(makeRequest('THIS_MONTH'), { params: Promise.resolve({ id: '12' }) });
    const thisMonthJson = await thisMonthResponse.json();

    const lastMonthResponse = await GET(makeRequest('LAST_MONTH'), { params: Promise.resolve({ id: '12' }) });
    const lastMonthJson = await lastMonthResponse.json();

    expect(thisMonthJson.monthlyBudget).toBe(50000);
    expect(lastMonthJson.monthlyBudget).toBe(100000);
    expect(thisMonthJson.range).toBe('THIS_MONTH');
    expect(lastMonthJson.range).toBe('LAST_MONTH');
    expect(thisMonthJson.campaigns[0]).toMatchObject({ campaignName: 'Search - Generic', mtdSpend: 12000 });
    expect(lastMonthJson.campaigns[0]).toMatchObject({ campaignName: 'Search - Generic', mtdSpend: 80000 });
  });

  it('uses the legacy audit placeholder when the linked client exists but the viewed FY month is blank after migration', async () => {
    mockPayload.findByID
      .mockResolvedValueOnce({
        id: 77,
        googleAdsCustomerId: '444-555-6666',
        dashboardConversionActions: '',
        annualClientBudgetPlaceholders: {
          thisYear: {
            rows: [{ id: 'fy-this', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
          lastYear: {
            rows: [{ id: 'fy-last', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
        },
      })
      .mockResolvedValueOnce({
        id: 12,
        annualBudgetPlaceholders: {
          rows: [{ id: 'legacy', label: 'Budget', values: { jul: 73000, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
          actualTotals: {},
        },
      });
    global.fetch = vi.fn().mockResolvedValueOnce(growthToolsResponse(12000) as any) as any;

    const response = await GET(makeRequest('THIS_MONTH'), { params: Promise.resolve({ id: '12' }) });
    const json = await response.json();

    expect(json.monthlyBudget).toBe(73000);
    expect(json.monthlyBudget).not.toBe(42000);
    expect(json.campaigns[0]).toMatchObject({ campaignName: 'Search - Generic', mtdSpend: 12000 });
  });

  it('uses the legacy audit placeholder for last month when the viewed month is in the previous FY', async () => {
    mockPayload.findByID
      .mockResolvedValueOnce({
        id: 77,
        googleAdsCustomerId: '444-555-6666',
        dashboardConversionActions: '',
        annualClientBudgetPlaceholders: {
          thisYear: {
            rows: [{ id: 'fy-this', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
          lastYear: {
            rows: [{ id: 'fy-last', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
        },
      })
      .mockResolvedValueOnce({
        id: 12,
        annualBudgetPlaceholders: {
          rows: [{ id: 'legacy', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 91000 } }],
          actualTotals: {},
        },
      });
    global.fetch = vi.fn().mockResolvedValueOnce(growthToolsResponse(80000) as any) as any;

    const response = await GET(makeRequest('LAST_MONTH'), { params: Promise.resolve({ id: '12' }) });
    const json = await response.json();

    expect(json.monthlyBudget).toBe(91000);
    expect(json.monthlyBudget).not.toBe(42000);
    expect(json.range).toBe('LAST_MONTH');
    expect(json.campaigns[0]).toMatchObject({ campaignName: 'Search - Generic', mtdSpend: 80000 });
  });

  it('falls back to the monthly budget total when the viewed month placeholder is blank', async () => {
    mockPayload.findByID
      .mockResolvedValueOnce({
        id: 77,
        googleAdsCustomerId: '444-555-6666',
        dashboardConversionActions: '',
        annualClientBudgetPlaceholders: {
          thisYear: {
            rows: [{ id: 'fy-this', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
          lastYear: {
            rows: [{ id: 'fy-last', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
            actualTotals: {},
          },
        },
      })
      .mockResolvedValueOnce({
        id: 12,
        annualBudgetPlaceholders: {
          rows: [{ id: 'legacy', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
          actualTotals: {},
        },
      });
    global.fetch = vi.fn().mockResolvedValueOnce(growthToolsResponse(12000) as any) as any;

    const response = await GET(makeRequest('THIS_MONTH'), { params: Promise.resolve({ id: '12' }) });
    const json = await response.json();

    expect(json.monthlyBudget).toBe(42000);
    expect(json.campaigns[0]).toMatchObject({ campaignName: 'Search - Generic', mtdSpend: 12000 });
  });
});
