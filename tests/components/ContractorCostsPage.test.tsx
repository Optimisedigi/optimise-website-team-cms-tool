import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContractorCostsPage from '@/components/ContractorCostsPage';

vi.mock('@/components/RocketSplash', () => ({ default: () => <div>Loading</div> }));

afterEach(() => vi.restoreAllMocks());

const overview = {
  globals: { activeContractors: 1, mtdCost: 400, totalPaid: 1200, totalHours: 32 },
  recentPayments: [{ id: 7, contractorName: 'Ada Lovelace', currency: 'AUD', fortnightStartDate: '2026-07-06', fortnightEndDate: '2026-07-19', totalHours: 16, subtotal: 320, transferAmount: 356, transferReference: '0607-1907 Optimise', status: 'scheduled', paidDate: null }],
  contractors: [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com', currency: 'AUD', hourlyRate: 20, mtd: { hours: 16, cost: 320 }, totalPaid: 1200, totalHours: 32, latestWeek: { weekCommencing: '2026-07-06', hours: 16, clientAllocations: [{ clientName: 'Example Client', hours: 16 }] } }],
};

describe('ContractorCostsPage', () => {
  it('puts payments first, keeps contractors collapsed, and removes record-detail links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
    render(<ContractorCostsPage />);
    await screen.findByRole('heading', { name: 'Fortnightly payments' });

    expect(screen.getByText('Logged hours')).toBeInTheDocument();
    expect(screen.getByText('Contractors (1)').closest('details')).not.toHaveAttribute('open');
    expect(document.querySelector('a[href*="/collections/contractors/1"]')).toBeNull();
    expect(document.querySelector('a[href*="/collections/contractor-payments/7"]')).toBeNull();
  });

  it('copies transfer references and exposes weekly allocation detail on focus', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => overview }));
    render(<ContractorCostsPage />);
    const reference = await screen.findByRole('button', { name: '0607-1907 Optimise' });
    fireEvent.click(reference);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0607-1907 Optimise'));

    fireEvent.click(screen.getByText('Contractors (1)'));
    const latestWeek = screen.getByRole('button', { name: '06 Jul 2026' });
    fireEvent.focus(latestWeek);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Example Client: 16.00h');
  });
});
