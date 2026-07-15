import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const auth = vi.fn();
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find, auth })) }));
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from '@/app/(frontend)/api/contractor-overview/route';

describe('GET /api/contractor-overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: 1 } });
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [{ id: 1, name: 'Ada', currency: 'AUD', hourlyRate: 20, isActive: true }] };
      if (collection === 'contractor-time-entries') return { docs: [{ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, totalFee: 160, clientAllocations: [{ client: { name: 'Acme' }, hours: 8 }] }] };
      return { docs: [{ id: 3, contractor: { id: 1, name: 'Ada', currency: 'AUD' }, fortnightStartDate: '2026-07-06', fortnightEndDate: '2026-07-19', totalHours: 8, subtotal: 160, transferAmount: 196, transferReference: '0607-1907 Optimise', status: 'sent', paymentDate: '2026-07-20' }] };
    });
  });

  it('returns payment transfer fields and truthful logged-hour allocation rollups', async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.globals).toMatchObject({ activeContractors: 1, totalPaid: 196, totalHours: 8 });
    expect(body.contractors[0]).toMatchObject({ totalHours: 8, totalPaid: 196, latestWeek: { hours: 8, clientAllocations: [{ clientName: 'Acme', hours: 8 }] } });
    expect(body.recentPayments[0]).toMatchObject({ totalHours: 8, subtotal: 160, transferAmount: 196, transferReference: '0607-1907 Optimise', status: 'sent', paidDate: '2026-07-20' });
  });

  it('aggregates totals across every Payload result page', async () => {
    find.mockImplementation(({ collection, page, limit, where }: { collection: string; page?: number; limit?: number; where?: unknown }) => {
      if (collection === 'contractors') return { docs: [{ id: 1, name: 'Ada', currency: 'AUD', hourlyRate: 20 }] };
      if (collection === 'contractor-time-entries' && limit === 1) {
        return { docs: [{ id: 12, contractor: { id: 1 }, weekCommencing: '2026-07-13', hours: 3, totalFee: 60, clientAllocations: [] }] };
      }
      if (collection === 'contractor-time-entries') {
        return page === 2
          ? { docs: [{ id: 11, contractor: 1, weekCommencing: '2026-07-06', hours: 5, totalFee: 100 }], totalPages: 2 }
          : { docs: [{ id: 10, contractor: 1, weekCommencing: '2026-07-13', hours: 3, totalFee: 60 }], totalPages: 2 };
      }
      if (where) {
        return page === 2
          ? { docs: [{ id: 21, contractor: 1, transferAmount: 80, status: 'sent' }], totalPages: 2 }
          : { docs: [{ id: 20, contractor: 1, transferAmount: 120, status: 'sent' }], totalPages: 2 };
      }
      return { docs: [] };
    });

    const response = await GET();
    const body = await response.json();

    expect(body.globals).toMatchObject({ totalHours: 8, totalPaid: 200 });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'contractor-time-entries', page: 2 }));
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'contractor-payments', page: 2 }));
  });
});
