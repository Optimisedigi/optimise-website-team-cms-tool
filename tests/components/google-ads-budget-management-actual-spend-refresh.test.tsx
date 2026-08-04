import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: '12' }),
}));

import GoogleAdsBudgetManagement from '@/components/GoogleAdsBudgetManagement';

function createDateMock(iso: string) {
  const RealDate = Date;
  return class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(iso);
        return;
      }
      // @ts-ignore
      super(...args);
    }
    static now() {
      return new RealDate(iso).getTime();
    }
    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
  };
}

const emptyMonths = { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' };

function campaign(overrides: Record<string, any>) {
  return {
    campaignId: '1',
    campaignName: 'Search - Generic',
    budgetPercentage: 0,
    calculatedDailyBudget: 100,
    actualDailyBudget: 100,
    bidStrategy: 'manual_cpc',
    impressions: 1000,
    clicks: 100,
    avgCpc: 5,
    conversions: 10,
    mtdSpend: 0,
    enabled: true,
    campaignStatus: 'ENABLED',
    campaignStartDate: null,
    campaignEndDate: null,
    ...overrides,
  };
}

describe('GoogleAdsBudgetManagement actual spend refresh', () => {
  const realFetch = global.fetch;
  const RealDate = Date;
  const updateBodies: Array<Record<string, any>> = [];
  let storedActualTotals: Record<string, number | string>;
  let listCampaigns: Array<Record<string, any>>;
  let campaignsByRange: Record<string, Array<Record<string, any>>> | null;
  let deferLastMonth: (() => void) | null;

  beforeEach(() => {
    updateBodies.length = 0;
    storedActualTotals = { ...emptyMonths };
    listCampaigns = [];
    campaignsByRange = null;
    deferLastMonth = null;
    // @ts-ignore
    global.Date = createDateMock('2026-07-31T12:00:00Z');

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/google-ads-audits/12?depth=1')) {
        return new Response(JSON.stringify({
          monthlyBudget: 35000,
          businessName: 'Away Digital Teams',
          client: {
            slug: 'away',
            clientPin: '1605',
            annualClientBudgetPlaceholders: {
              thisYear: {
                rows: [{ id: 'this-row', label: 'Budget', values: { ...emptyMonths, jul: 35000 } }],
                actualTotals: storedActualTotals,
              },
              lastYear: {
                rows: [{ id: 'last-row', label: 'Budget', values: { ...emptyMonths } }],
                actualTotals: { ...emptyMonths },
              },
            },
          },
        }), { status: 200 });
      }

      if (url.includes('/api/google-ads-budgets/12/list')) {
        const range = new URL(url, 'http://localhost').searchParams.get('range') || 'THIS_MONTH';
        if (range === 'LAST_MONTH' && deferLastMonth) {
          await new Promise<void>((resolve) => {
            deferLastMonth = resolve;
          });
        }
        const campaigns = campaignsByRange ? (campaignsByRange[range] ?? []) : listCampaigns;
        return new Response(JSON.stringify({ monthlyBudget: 35000, campaigns }), { status: 200 });
      }

      if (url.includes('/api/google-ads-budgets/12/update') && init?.method === 'POST') {
        updateBodies.push(JSON.parse(String(init.body ?? '{}')));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    }) as any;
  });

  afterEach(() => {
    cleanup();
    global.Date = RealDate;
    global.fetch = realFetch;
  });

  it('refreshes a stale stored actual for the live month instead of keeping the first value written', async () => {
    storedActualTotals.jul = 2470;
    listCampaigns = [campaign({ mtdSpend: 29000, budgetPercentage: 100 })];

    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe(29000);
    });
  });

  it('counts standalone, paused and ended campaigns so the actual matches the Google Ads account total', async () => {
    listCampaigns = [
      campaign({ campaignId: '1', mtdSpend: 12000, budgetPercentage: 100 }),
      campaign({ campaignId: '2', campaignName: 'Standalone promo', mtdSpend: 9000, standalone: true, standaloneBudget: 9000 }),
      campaign({ campaignId: '3', campaignName: 'Paused brand', mtdSpend: 5000, campaignStatus: 'PAUSED', enabled: false }),
      campaign({ campaignId: '4', campaignName: 'Ended promo', mtdSpend: 3000, campaignEndDate: '2026-07-10' }),
    ];

    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe(29000);
    });
  });

  it('never writes a previous range\u2019s totals into the viewed month while the new range is still loading', async () => {
    campaignsByRange = {
      THIS_MONTH: [campaign({ mtdSpend: 29000, budgetPercentage: 100 })],
      LAST_60_DAYS: [campaign({ mtdSpend: 90000, budgetPercentage: 100 })],
      LAST_MONTH: [campaign({ mtdSpend: 31000, budgetPercentage: 100 })],
    };

    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe(29000);
    });

    // Last 60 days: display-only range, nothing should be persisted.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last 60 days' }));
    });
    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe(29000);
    });
    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.lastYear?.actualTotals?.jun).toBe('');

    // Switch to Last Month but hold the response open: the 60-day figure
    // (90000) must not leak into June while the fetch is in flight.
    deferLastMonth = () => {};
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
    });
    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.lastYear?.actualTotals?.jun).toBe('');

    await act(async () => {
      deferLastMonth?.();
      deferLastMonth = null;
    });

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.lastYear?.actualTotals?.jun).toBe(31000);
    });
  });
});
