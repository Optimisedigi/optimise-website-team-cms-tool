import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContractorCostsPage from '@/components/ContractorCostsPage';

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }));

afterEach(() => vi.restoreAllMocks());

const overview = {
  globals: { activeContractors: 1, owingNow: 354, totalPaid: 1200, totalHours: 32 },
  fortnightlyPayments: [{ id: '1-0', contractorId: 1, contractorName: 'Ada Lovelace', currency: 'AUD', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', totalHours: 16, subtotal: 320, reimbursement: 30, fee: 4, amount: 354, transferReference: '2906-1207 Optimise', status: 'unpaid', paidDate: null }],
  contractors: [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com', currency: 'AUD', hourlyRate: 20, mtd: { hours: 16, cost: 320 }, totalPaid: 1200, totalHours: 32, latestWeek: { weekCommencing: '2026-07-06', hours: 16, clientAllocations: [{ clientName: 'Example Client', hours: 16 }] } }],
};

describe('ContractorCostsPage', () => {
  it('shows the derived unpaid fortnight and hides the removed manual payment button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
    render(<ContractorCostsPage />);
    await screen.findByRole('heading', { name: 'Fortnightly payments' });

    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Owing now (unpaid)')).toBeInTheDocument();
    expect(document.querySelector('a[href*="/collections/contractor-payments/create"]')).toBeNull();
    expect(screen.getByText('Contractors (1)').closest('details')).not.toHaveAttribute('open');
  });

  it('marks a fortnight paid by posting the contractor id and fortnight start', async () => {
    const paid = {
      ...overview,
      globals: { ...overview.globals, owingNow: 0, totalPaid: 1554 },
      fortnightlyPayments: [{ ...overview.fortnightlyPayments[0], status: 'paid', paidDate: '2026-07-13' }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, paymentId: 3 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => paid });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractorCostsPage />);
    const markButton = await screen.findByRole('button', { name: 'Mark paid' });
    fireEvent.click(markButton);

    await waitFor(() => expect(screen.getByText(/Paid/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/contractor-payments/mark-paid', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ contractorId: 1, fortnightStartDate: '2026-06-29' }),
    }));
  });

  it('copies transfer references and exposes weekly allocation detail on focus', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
    render(<ContractorCostsPage />);
    const reference = await screen.findByRole('button', { name: '2906-1207 Optimise' });
    fireEvent.click(reference);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('2906-1207 Optimise'));

    fireEvent.click(screen.getByText('Contractors (1)'));
    const latestWeek = screen.getByRole('button', { name: '06 Jul 2026' });
    fireEvent.focus(latestWeek);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Example Client: 16.00h');
  });
});
