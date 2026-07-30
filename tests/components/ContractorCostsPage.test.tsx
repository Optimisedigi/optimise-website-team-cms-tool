import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContractorCostsPage from '@/components/ContractorCostsPage';

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }));

afterEach(() => vi.restoreAllMocks());

const overview = {
  globals: { activeContractors: 1, owingNow: 354, totalPaid: 1200, totalHours: 32 },
  fortnightlyPayments: [{ id: '1-0', contractorId: 1, contractorName: 'Ada Lovelace', currency: 'AUD', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', totalHours: 16, subtotal: 320, reimbursement: 30, fee: 4, amount: 354, transferReference: '2906-1207 Optimise', status: 'paid', paidDate: '2026-07-13' }],
  contractors: [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com', currency: 'AUD', hourlyRate: 20, reimbursement: { amount: 40, recurrence: 'monthly', startDate: '2026-07-01' }, mtd: { hours: 16, cost: 320 }, totalPaid: 1200, totalHours: 32, latestWeek: { weekCommencing: '2026-07-06', hours: 16, clientAllocations: [{ clientName: 'Example Client', hours: 16 }] } }],
};

describe('ContractorCostsPage', () => {
  it('shows the derived unpaid fortnight and hides the removed manual payment button', async () => {
    const unpaidOverview = {
      ...overview,
      fortnightlyPayments: [{ ...overview.fortnightlyPayments[0], status: 'unpaid', paidDate: null }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => unpaidOverview }));
    render(<ContractorCostsPage />);
    await screen.findByRole('heading', { name: 'Fortnightly payments' });
    await waitFor(() => expect(document.querySelector('select[aria-label="Date range"]')).toBeTruthy());
    fireEvent.change(document.querySelector('select[aria-label="Date range"]') as HTMLSelectElement, { target: { value: 'all' } });
    await screen.findByRole('cell', { name: /Unpaid/ });

    expect(screen.getAllByText('Unpaid').length).toBeGreaterThan(0);
    expect(screen.getByText('Owing now (unpaid)')).toBeInTheDocument();
    expect(document.querySelector('a[href*="/collections/contractor-payments/create"]')).toBeNull();
    expect(screen.getByText('Contractors (1)').closest('details')).not.toHaveAttribute('open');
  });

  it('refreshes overview data when the admin returns to a previously open tab', async () => {
    const staleOverview = {
      ...overview,
      globals: { ...overview.globals, owingNow: 0 },
      fortnightlyPayments: [],
    };
    const freshOverview = {
      ...overview,
      fortnightlyPayments: [{ ...overview.fortnightlyPayments[0], status: 'unpaid', paidDate: null }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => staleOverview })
      .mockResolvedValueOnce({ ok: true, json: async () => freshOverview });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractorCostsPage />);
    await screen.findByText('No approved time entries yet. Approve a contractor\'s weeks to build a fortnightly payment.');

    fireEvent.focus(window);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/contractor-overview', expect.objectContaining({ cache: 'no-store' }));
    await screen.findByRole('cell', { name: /Unpaid/ });
  });

  it('shows the reimbursement summary as an in-page editor trigger (no navigation link)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
    render(<ContractorCostsPage />);
    await screen.findByRole('heading', { name: 'Fortnightly payments' });
    fireEvent.click(screen.getByText('Contractors (1)'));

    expect(screen.getByRole('button', { name: /\$40 monthly from 01 Jul 2026/ })).toBeInTheDocument();
    // The old link that 404'd must be gone.
    expect(document.querySelector('a[href="/admin/collections/contractors/1"]')).toBeNull();
  });

  it('edits reimbursement inline via a popup and posts the new values', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => overview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => overview });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractorCostsPage />);
    await screen.findByRole('heading', { name: 'Fortnightly payments' });
    fireEvent.click(screen.getByText('Contractors (1)'));
    fireEvent.click(screen.getByRole('button', { name: /\$40 monthly from 01 Jul 2026/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Frequency/), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/contractor-reimbursement', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse((fetchMock.mock.calls[1][1] as any).body);
    expect(body).toMatchObject({ contractorId: 1, reimbursementRecurrence: 'weekly', reimbursementAmount: 40 });
  });

  it('marks a fortnight paid by posting the contractor id and fortnight start', async () => {
    const unpaid = { ...overview, fortnightlyPayments: [{ ...overview.fortnightlyPayments[0], status: 'unpaid', paidDate: null }] };
    const paid = {
      ...unpaid,
      globals: { ...unpaid.globals, owingNow: 0, totalPaid: 1554 },
      fortnightlyPayments: [{ ...unpaid.fortnightlyPayments[0], status: 'paid', paidDate: '2026-07-13' }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => unpaid })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, paymentId: 3 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => paid });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContractorCostsPage />);
    await waitFor(() => expect(document.querySelector('select[aria-label="Date range"]')).toBeTruthy());
    fireEvent.change(document.querySelector('select[aria-label="Date range"]') as HTMLSelectElement, { target: { value: 'all' } });
    const statusSelect = await screen.findByRole('combobox', { name: /Payment status for Ada Lovelace/ });
    fireEvent.change(statusSelect, { target: { value: 'paid' } });

    const paidStatus = await screen.findByRole('combobox', { name: /Payment status for Ada Lovelace/ });
    await waitFor(() => expect(paidStatus).toHaveValue('paid'));
    expect(paidStatus).toBeDisabled();
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
    await waitFor(() => expect(document.querySelector('select[aria-label="Date range"]')).toBeTruthy());
    fireEvent.change(document.querySelector('select[aria-label="Date range"]') as HTMLSelectElement, { target: { value: 'all' } });
    fireEvent.change(document.querySelector('select[aria-label="Status"]') as HTMLSelectElement, { target: { value: 'paid' } });
    const reference = await screen.findByRole('button', { name: '2906-1207 Optimise' });
    fireEvent.click(reference);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('2906-1207 Optimise'));

    fireEvent.click(screen.getByText('Contractors (1)'));
    const latestWeek = screen.getByRole('button', { name: '06 Jul 2026' });
    fireEvent.focus(latestWeek);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Example Client: 16.00h');
  });
});
