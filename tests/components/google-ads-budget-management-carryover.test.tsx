import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

const MONTH_VALUES = { jul: '', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '' };

describe('GoogleAdsBudgetManagement financial-year carryover', () => {
  const realFetch = global.fetch;
  const RealDate = Date;
  const updateBodies: Array<Record<string, any>> = [];

  beforeEach(() => {
    updateBodies.length = 0;
    // October: Jul/Aug/Sep are complete, so their leftover is the pool.
    // @ts-ignore
    global.Date = createDateMock('2025-10-15T12:00:00Z');

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/google-ads-audits/12?depth=1')) {
        return new Response(JSON.stringify({
          monthlyBudget: 10000,
          businessName: 'Acme Hydraulics',
          client: {
            slug: 'acme',
            clientPin: '1605',
            annualClientBudgetPlaceholders: {
              thisYear: {
                rows: [{ id: 'base', label: 'Search', values: { ...MONTH_VALUES, jul: 10000, aug: 10000, sep: 10000, oct: 10000, nov: 10000 } }],
                actualTotals: { ...MONTH_VALUES, jul: 9000, aug: 8000, sep: 10500 },
              },
              lastYear: { rows: [], actualTotals: { ...MONTH_VALUES } },
            },
          },
        }), { status: 200 });
      }

      if (url.includes('/api/google-ads-budgets/12/list')) {
        const range = new URL(url, 'http://localhost').searchParams.get('range');
        const campaigns = range === 'LAST_MONTH' ? [{ mtdSpend: 10500 }] : [];
        return new Response(JSON.stringify({ monthlyBudget: 10000, campaigns }), { status: 200 });
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

  function carryoverPanel() {
    return screen.getByTestId('fy-carryover-panel');
  }

  async function renderView() {
    render(<GoogleAdsBudgetManagement auditId="12" />);
    await screen.findByText(/Unspent budget · FY 2025\/26/i);
  }

  function statValue(label: string): string {
    const labelNode = within(carryoverPanel()).getByText(label);
    return labelNode.previousElementSibling?.textContent ?? '';
  }

  it('surfaces planned vs actual and the unspent total for completed months of this FY', async () => {
    await renderView();

    expect(screen.getByTestId('fy-carryover-available').textContent).toBe('$2,500');
    expect(statValue('Planned to date')).toBe('$30,000');
    expect(statValue('Actual spend to date')).toBe('$27,500');
    expect(statValue('Discrepancy')).toBe('$2,500');
    expect(statValue('Allocated forward')).toBe('$0');
  });

  it('allocates carryover to a new row and decrements the unspent total', async () => {
    await renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Allocate to new row' }));
    fireEvent.change(screen.getByLabelText(/Month \(this FY only\)/i), { target: { value: 'nov' } });
    fireEvent.change(screen.getByLabelText(/Row label/i), { target: { value: 'Q2 catch-up' } });
    fireEvent.change(screen.getByLabelText(/Amount to allocate/i), { target: { value: '1,500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      const saved = updateBodies.filter((body) => body._saveAnnualBudgetPlaceholders).at(-1);
      expect(saved?._saveAnnualBudgetPlaceholders?.thisYear?.carryoverAllocations).toHaveLength(1);
    });

    const saved = updateBodies.filter((body) => body._saveAnnualBudgetPlaceholders).at(-1)!;
    const year = saved._saveAnnualBudgetPlaceholders.thisYear;
    expect(year.rows.at(-1)).toMatchObject({ label: 'Q2 catch-up' });
    expect(year.rows.at(-1).values.nov).toBe(1500);

    expect(screen.getByTestId('fy-carryover-available').textContent).toBe('$1,000');
    expect(statValue('Allocated forward')).toBe('$1,500');
  });

  it('draws only the increase from the pool when a budget amount is manually overridden', async () => {
    await renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Override a budget amount' }));
    fireEvent.change(screen.getByLabelText(/Month \(this FY only\)/i), { target: { value: 'nov' } });
    fireEvent.change(screen.getByLabelText(/New month budget/i), { target: { value: '12000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      const saved = updateBodies.filter((body) => body._saveAnnualBudgetPlaceholders).at(-1);
      expect(saved?._saveAnnualBudgetPlaceholders?.thisYear?.rows?.[0]?.values?.nov).toBe(12000);
    });

    expect(screen.getByTestId('fy-carryover-available').textContent).toBe('$500');
  });

  it('blocks allocations larger than the unspent total', async () => {
    await renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Allocate to new row' }));
    fireEvent.change(screen.getByLabelText(/Amount to allocate/i), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/exceeds the unspent budget available/i)).toBeTruthy();
    expect(updateBodies.some((body) => body._saveAnnualBudgetPlaceholders?.thisYear?.carryoverAllocations?.length)).toBe(false);
  });

  it('rejects a blank amount instead of zeroing the month on override', async () => {
    await renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Override a budget amount' }));
    fireEvent.change(screen.getByLabelText(/Month \(this FY only\)/i), { target: { value: 'nov' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/Enter a valid amount/i)).toBeTruthy();
    expect(updateBodies.some((body) => body._saveAnnualBudgetPlaceholders?.thisYear?.carryoverAllocations?.length)).toBe(false);
    expect(screen.getByTestId('fy-carryover-available').textContent).toBe('$2,500');
  });

  it('only offers remaining months of the current financial year', async () => {
    await renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Allocate to new row' }));
    const options = Array.from(
      (screen.getByLabelText(/Month \(this FY only\)/i) as HTMLSelectElement).options,
    ).map((option) => option.value);

    expect(options).toEqual(['oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun']);
  });
});
