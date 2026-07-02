import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

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

describe('GoogleAdsBudgetManagement actual-total autosave', () => {
  const realFetch = global.fetch;
  const RealDate = Date;
  const updateBodies: Array<Record<string, any>> = [];

  function setNow(iso: string) {
    // @ts-ignore
    global.Date = createDateMock(iso);
  }

  beforeEach(() => {
    updateBodies.length = 0;
    setNow('2026-07-31T12:00:00Z');

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/google-ads-audits/12?depth=1')) {
        return new Response(JSON.stringify({
          monthlyBudget: 42000,
          businessName: 'Acme Hydraulics',
          client: {
            slug: 'acme',
            clientPin: '1605',
            annualClientBudgetPlaceholders: {
              thisYear: {
                rows: [{ id: 'this-row', label: 'Budget', values: { jul: 50000, aug: 51000, sep: '', oct: '', nov: '', dec: '', jan: 39000, feb: '', mar: '', apr: '', may: '', jun: '' } }],
                actualTotals: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' },
              },
              lastYear: {
                rows: [{ id: 'last-row', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 100000 } }],
                actualTotals: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' },
              },
            },
          },
        }), { status: 200 });
      }

      if (url.includes('/api/google-ads-budgets/12/list?range=THIS_MONTH')) {
        return new Response(JSON.stringify({
          monthlyBudget: 50000,
          campaigns: [{
            campaignId: '123',
            campaignName: 'Search - Generic',
            budgetPercentage: 100,
            calculatedDailyBudget: 100,
            actualDailyBudget: 100,
            bidStrategy: 'manual_cpc',
            impressions: 1000,
            clicks: 100,
            avgCpc: 5,
            conversions: 10,
            mtdSpend: 12000,
            enabled: true,
            campaignStatus: 'ENABLED',
            campaignStartDate: null,
            campaignEndDate: null,
          }],
        }), { status: 200 });
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

  it('writes actual totals to the live month key after a month rollover instead of freezing the first render month', async () => {
    const first = render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe(12000);
    });

    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.aug).toBe('');

    first.unmount();
    updateBodies.length = 0;
    setNow('2026-08-01T12:00:00Z');

    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.aug).toBe(12000);
    });

    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe('');
  });

  it('writes the current month actual total into the FY slot that matches the live date', async () => {
    setNow('2026-01-10T12:00:00Z');

    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jan).toBe(12000);
    });

    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.thisYear?.actualTotals?.jul).toBe('');
    expect(updateBodies.at(-1)?._saveAnnualBudgetPlaceholders?.lastYear?.actualTotals?.jan).toBe('');
  });
});
