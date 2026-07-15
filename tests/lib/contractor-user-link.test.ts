import { describe, expect, it } from 'vitest';
import {
  buildUserToContractorMap,
  resolveEntryContractorId,
  userMatchesContractor,
} from '@/lib/contractor-user-link';

describe('contractor ↔ user linking', () => {
  it('matches on email case-insensitively before name', () => {
    expect(userMatchesContractor({ id: 1, email: 'LORENZO@x.io', name: 'Different' }, { id: 5, email: 'lorenzo@x.io', name: 'Whoever' })).toBe(true);
  });

  it('matches on a normalised name when emails are absent or differ', () => {
    expect(userMatchesContractor({ id: 1, name: '  Lorenzo   Rossi ' }, { id: 5, name: 'lorenzo rossi' })).toBe(true);
    expect(userMatchesContractor({ id: 1, name: 'Lorenzo' }, { id: 5, name: 'Someone Else' })).toBe(false);
  });

  it('does not match two users with empty names', () => {
    expect(userMatchesContractor({ id: 1, name: '', email: null }, { id: 5, name: '', email: null })).toBe(false);
  });

  it('builds a userId → contractorId map for matching users', () => {
    const contractors = [{ id: 5, name: 'Lorenzo', email: null }];
    const users = [{ id: 1, name: 'Lorenzo', email: null }, { id: 2, name: 'Peter', email: null }];
    const map = buildUserToContractorMap(contractors, users);
    expect(map.get('1')).toBe('5');
    expect(map.has('2')).toBe(false);
  });

  it('resolves a contractor from an explicit relationship first, then via the user', () => {
    const map = new Map([['1', '5']]);
    expect(resolveEntryContractorId({ contractor: { id: 9 }, user: { id: 1 } }, map)).toBe('9');
    expect(resolveEntryContractorId({ contractor: null, user: 1 }, map)).toBe('5');
    expect(resolveEntryContractorId({ contractor: null, user: 2 }, map)).toBeUndefined();
  });
});
