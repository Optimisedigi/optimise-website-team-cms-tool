import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const auth = vi.fn();
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find, auth })) }));
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from '@/app/(frontend)/api/contractor-overview/route';

/** Weeks commencing 29 Jun 2026 and 6 Jul 2026 both fall in the first fortnight (29 Jun → 12 Jul). */
const contractor = { id: 1, name: 'Ada', currency: 'AUD', hourlyRate: 20, chatGptReimbursementPerFortnight: 30, transferFeeDefault: 4, transferReferenceTemplate: '{startShort}-{endShort} Optimise' };

describe('GET /api/contractor-overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: 1 } });
  });

  it('derives one unpaid fortnight from approved time entries anchored at 29 Jun 2026', async () => {
    find.mockImplementation(({ collection, limit }: { collection: string; limit?: number }) => {
      if (collection === 'contractors') return { docs: [contractor] };
      if (collection === 'contractor-payments') return { docs: [] };
      if (collection === 'contractor-time-entries' && limit === 1) {
        return { docs: [{ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, clientAllocations: [] }] };
      }
      return {
        docs: [
          { id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, totalFee: 160, status: 'approved' },
          { id: 8, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, totalFee: 160, status: 'approved' },
        ],
      };
    });

    const response = await GET();
    const body = await response.json();

    expect(body.fortnightlyPayments).toHaveLength(1);
    expect(body.fortnightlyPayments[0]).toMatchObject({
      contractorId: 1,
      fortnightStartDate: '2026-06-29',
      fortnightEndDate: '2026-07-12',
      totalHours: 16,
      subtotal: 320,
      reimbursement: 30,
      fee: 4,
      amount: 354,
      status: 'unpaid',
      transferReference: '2906-1207 Optimise',
    });
    expect(body.globals).toMatchObject({ owingNow: 354, totalPaid: 0 });
  });

  it('marks the fortnight paid when a sent payment covers its start date', async () => {
    find.mockImplementation(({ collection, where, limit }: { collection: string; where?: any; limit?: number }) => {
      if (collection === 'contractors') return { docs: [contractor] };
      if (collection === 'contractor-payments') {
        const sentOnly = where?.status?.equals === 'sent';
        return { docs: sentOnly ? [{ id: 3, contractor: { id: 1 }, fortnightStartDate: '2026-06-29', transferAmount: 354, transferReference: 'REF', paymentDate: '2026-07-13' }] : [] };
      }
      if (collection === 'contractor-time-entries' && limit === 1) return { docs: [] };
      return { docs: [{ id: 9, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, totalFee: 160, status: 'approved' }] };
    });

    const response = await GET();
    const body = await response.json();

    expect(body.fortnightlyPayments[0]).toMatchObject({ status: 'paid', amount: 354, transferReference: 'REF', paidDate: '2026-07-13' });
    expect(body.globals).toMatchObject({ owingNow: 0, totalPaid: 354 });
  });
});
