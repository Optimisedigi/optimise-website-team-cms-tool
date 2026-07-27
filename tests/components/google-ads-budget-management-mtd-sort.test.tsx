import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: '12' }),
}));

import GoogleAdsBudgetManagement from '@/components/GoogleAdsBudgetManagement';

const campaigns = [
  {
    campaignId: 'low',
    campaignName: 'Low spend',
    budgetPercentage: 20,
    calculatedDailyBudget: 20,
    actualDailyBudget: 20,
    bidStrategy: 'manual_cpc',
    impressions: 100,
    clicks: 10,
    avgCpc: 2,
    conversions: 1,
    mtdSpend: 9,
    enabled: true,
    campaignStatus: 'ENABLED',
    campaignStartDate: null,
    campaignEndDate: null,
  },
  {
    campaignId: 'high',
    campaignName: 'High spend',
    budgetPercentage: 50,
    calculatedDailyBudget: 50,
    actualDailyBudget: 50,
    bidStrategy: 'manual_cpc',
    impressions: 100,
    clicks: 10,
    avgCpc: 2,
    conversions: 1,
    mtdSpend: 1200,
    enabled: true,
    campaignStatus: 'ENABLED',
    campaignStartDate: null,
    campaignEndDate: null,
  },
  {
    campaignId: 'middle',
    campaignName: 'Middle spend',
    budgetPercentage: 30,
    calculatedDailyBudget: 30,
    actualDailyBudget: 30,
    bidStrategy: 'manual_cpc',
    impressions: 100,
    clicks: 10,
    avgCpc: 2,
    conversions: 1,
    mtdSpend: 100,
    enabled: true,
    campaignStatus: 'ENABLED',
    campaignStartDate: null,
    campaignEndDate: null,
  },
];

function appearsBefore(first: HTMLElement, second: HTMLElement) {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('GoogleAdsBudgetManagement MTD spend sorting', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/google-ads-audits/12?depth=1')) {
        return new Response(JSON.stringify({ monthlyBudget: 3000, client: {} }), { status: 200 });
      }
      if (url.includes('/api/google-ads-budgets/12/list?range=THIS_MONTH')) {
        return new Response(JSON.stringify({ monthlyBudget: 3000, campaigns }), { status: 200 });
      }
      if (url.includes('/api/google-ads-budgets/12/update')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = realFetch;
  });

  it('sorts numeric month-to-date spend descending by default and ascending after the MTD header is clicked', async () => {
    render(<GoogleAdsBudgetManagement auditId="12" />);

    await waitFor(() => {
      expect(screen.getByText('High spend')).toBeInTheDocument();
    });

    const high = screen.getByText('High spend');
    const middle = screen.getByText('Middle spend');
    const low = screen.getByText('Low spend');
    expect(appearsBefore(high, middle)).toBe(true);
    expect(appearsBefore(middle, low)).toBe(true);

    const sortButton = screen.getByRole('button', { name: 'Sort campaigns by month-to-date spend ascending' });
    expect(sortButton).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(sortButton);

    await waitFor(() => {
      expect(sortButton).toHaveAttribute('aria-sort', 'ascending');
    });
    expect(appearsBefore(low, middle)).toBe(true);
    expect(appearsBefore(middle, high)).toBe(true);
  });
});
