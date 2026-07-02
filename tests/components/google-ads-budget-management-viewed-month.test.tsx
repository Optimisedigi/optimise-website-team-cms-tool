import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: '12' }),
}));

import GoogleAdsBudgetManagement from '@/components/GoogleAdsBudgetManagement';

describe('GoogleAdsBudgetManagement viewed month budget tracking', () => {
  const realFetch = global.fetch;
  const RealDate = Date;

  beforeEach(() => {
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2026-07-10T12:00:00Z');
          return;
        }
        // @ts-ignore
        super(...args);
      }
      static now() {
        return new RealDate('2026-07-10T12:00:00Z').getTime();
      }
      static parse = RealDate.parse;
      static UTC = RealDate.UTC;
    }
    // @ts-ignore
    global.Date = MockDate;

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
                rows: [{ id: 'this-row', label: 'Budget', values: { jul: 50000, aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' } }],
                actualTotals: {},
              },
              lastYear: {
                rows: [{ id: 'last-row', label: 'Budget', values: { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: 100000 } }],
                actualTotals: {},
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

      if (url.includes('/api/google-ads-budgets/12/list?range=LAST_MONTH')) {
        return new Response(JSON.stringify({
          monthlyBudget: 100000,
          campaigns: [{
            campaignId: '123',
            campaignName: 'Search - Generic',
            budgetPercentage: 100,
            calculatedDailyBudget: 100,
            actualDailyBudget: 100,
            bidStrategy: 'manual_cpc',
            impressions: 2000,
            clicks: 150,
            avgCpc: 5,
            conversions: 20,
            mtdSpend: 80000,
            enabled: true,
            campaignStatus: 'ENABLED',
            campaignStartDate: null,
            campaignEndDate: null,
          }],
        }), { status: 200 });
      }

      if (url.includes('/api/google-ads-budgets/12/update') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    }) as any;
  });

  afterEach(() => {
    global.Date = RealDate;
    global.fetch = realFetch;
  });

  it('shows This FY with a collapsible Last FY and switches the tracker to last month\'s month/year budget', async () => {
    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(screen.getByText('📊 Monthly Budget Tracker - July 2026')).toBeInTheDocument();
    });

    expect(screen.getByText(/This FY \(2026\/27\)/i)).toBeInTheDocument();
    const lastFyToggle = screen.getByRole('button', { name: /Last FY \(2025\/26\)/i });

    expect(lastFyToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByDisplayValue('100,000')).not.toBeInTheDocument();
    expect(screen.getByText('Budget source: client FY placeholder')).toBeInTheDocument();
    expect(screen.getAllByText('$50,000').length).toBeGreaterThan(0);

    fireEvent.click(lastFyToggle);

    await waitFor(() => {
      expect(screen.getByDisplayValue('100,000')).toBeInTheDocument();
    });

    expect(lastFyToggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));

    await waitFor(() => {
      expect(screen.getByText('📊 Monthly Budget Tracker - June 2026')).toBeInTheDocument();
    });

    expect(screen.getAllByText('$100,000').length).toBeGreaterThan(0);
    expect(screen.getByText('Last Month Spend')).toBeInTheDocument();
  });
});
