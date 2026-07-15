import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const findByID = vi.fn();
const auth = vi.fn();
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find, findByID, auth })) }));
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
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [contractor] };
      if (collection === 'users') return { docs: [] };
      if (collection === 'contractor-payments') return { docs: [] };
      return {
        docs: [
          { id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, totalFee: 160, status: 'approved' },
          { id: 8, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, totalFee: 160, status: 'approved' },
        ],
      };
    });
    findByID.mockResolvedValue({ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, clientAllocations: [] });

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
    find.mockImplementation(({ collection, where }: { collection: string; where?: any }) => {
      if (collection === 'contractors') return { docs: [contractor] };
      if (collection === 'users') return { docs: [] };
      if (collection === 'contractor-payments') {
        const sentOnly = where?.status?.equals === 'sent';
        return { docs: sentOnly ? [{ id: 3, contractor: { id: 1 }, fortnightStartDate: '2026-06-29', transferAmount: 354, transferReference: 'REF', paymentDate: '2026-07-13' }] : [] };
      }
      return { docs: [{ id: 9, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, totalFee: 160, status: 'approved' }] };
    });
    findByID.mockResolvedValue({ id: 9, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, clientAllocations: [] });

    const response = await GET();
    const body = await response.json();

    expect(body.fortnightlyPayments[0]).toMatchObject({ status: 'paid', amount: 354, transferReference: 'REF', paidDate: '2026-07-13' });
    expect(body.globals).toMatchObject({ owingNow: 0, totalPaid: 354 });
  });

  it('attributes user-logged entries (contractor empty) to the matching contractor', async () => {
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [{ ...contractor, name: 'Lorenzo', email: null }] };
      if (collection === 'users') return { docs: [{ id: 42, name: 'Lorenzo', email: null }] };
      if (collection === 'contractor-payments') return { docs: [] };
      return {
        docs: [
          { id: 9, contractor: null, user: { id: 42 }, weekCommencing: '2026-07-06', hours: 10, totalFee: 200, status: 'approved' },
        ],
      };
    });
    findByID.mockResolvedValue({ id: 9, user: { id: 42 }, weekCommencing: '2026-07-06', hours: 10, clientAllocations: [] });

    const response = await GET();
    const body = await response.json();

    expect(body.fortnightlyPayments).toHaveLength(1);
    expect(body.fortnightlyPayments[0]).toMatchObject({ contractorId: 1, fortnightStartDate: '2026-06-29', totalHours: 10, subtotal: 200, status: 'unpaid' });
    expect(body.globals).toMatchObject({ owingNow: 234, totalHours: 10 });
  });

  it('computes subtotal as hours x rate when the entry has no stored totalFee', async () => {
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [{ ...contractor, hourlyRate: 21, chatGptReimbursementPerFortnight: 0, transferFeeDefault: 0 }] };
      if (collection === 'users') return { docs: [] };
      if (collection === 'contractor-payments') return { docs: [] };
      return { docs: [{ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 25, status: 'approved' }] };
    });
    findByID.mockResolvedValue({ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 25, clientAllocations: [] });

    const response = await GET();
    const body = await response.json();

    // 25h x $21 = $525, no reimbursement/fee.
    expect(body.fortnightlyPayments[0]).toMatchObject({ totalHours: 25, subtotal: 525, reimbursement: 0, fee: 0, amount: 525 });
  });

  it('applies a monthly reimbursement only to the fortnight containing its start day', async () => {
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [{ ...contractor, hourlyRate: 20, transferFeeDefault: 0, reimbursementRecurrence: 'monthly', reimbursementAmount: 40, reimbursementStartDate: '2026-07-01' }] };
      if (collection === 'users') return { docs: [] };
      if (collection === 'contractor-payments') return { docs: [] };
      return {
        docs: [
          { id: 9, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 10, totalFee: 200, status: 'approved' },
          { id: 8, contractor: { id: 1 }, weekCommencing: '2026-07-13', hours: 10, totalFee: 200, status: 'approved' },
        ],
      };
    });
    findByID.mockResolvedValue({ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-13', hours: 10, clientAllocations: [] });

    const response = await GET();
    const body = await response.json();

    const byStart = Object.fromEntries(body.fortnightlyPayments.map((p: any) => [p.fortnightStartDate, p]));
    expect(byStart['2026-06-29']).toMatchObject({ reimbursement: 40, amount: 240 });
    expect(byStart['2026-07-13']).toMatchObject({ reimbursement: 0, amount: 200 });
  });
});
