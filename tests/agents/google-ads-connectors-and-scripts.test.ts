import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  badJsonRequest,
  createMockPayload,
  expectJsonStatus,
  getRequest,
  installNextHeadersMock,
  installPayloadMocks,
  jsonRequest,
  makeFetchJsonResponse,
  params,
  setAuthenticatedUser,
} from '../api/helpers/integration';

const mockPayload = vi.hoisted(() => ({
  find: vi.fn(),
}));

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}));

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}));

describe('Optimate Google Ads Growth Tools connector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('normalises customer IDs and maps day ranges for connector callers', async () => {
    const { ensureCustomerId, daysToDateRange } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');

    expect(ensureCustomerId('123-456-7890')).toBe('1234567890');
    expect(daysToDateRange(7)).toBe('LAST_7_DAYS');
    expect(daysToDateRange(14)).toBe('LAST_14_DAYS');
    expect(daysToDateRange(30)).toBe('LAST_30_DAYS');
    expect(daysToDateRange(60)).toBe('LAST_60_DAYS');
    expect(daysToDateRange(90)).toBe('LAST_90_DAYS');
  });

  it('returns a graceful connector error when INTERNAL_API_KEY is missing', async () => {
    delete process.env.INTERNAL_API_KEY;
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { growthToolsGet } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');

    await expect(growthToolsGet('/api/google-ads/accounts')).resolves.toEqual({
      ok: false,
      error: 'INTERNAL_API_KEY is not configured on this CMS instance',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the internal key and returns parsed connector data on success', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ accounts: [{ customerId: '1234567890', name: 'Acme' }] }),
    } as Response);

    const { growthToolsGet } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');
    const result = await growthToolsGet('/api/google-ads/accounts');

    expect(result).toEqual({ ok: true, data: { accounts: [{ customerId: '1234567890', name: 'Acme' }] } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://growth-tools.test/api/google-ads/accounts',
      expect.objectContaining({
        headers: { 'x-internal-key': 'test-internal-key' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns status and body text for failed connector responses', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream unavailable',
    } as Response);

    const { growthToolsGet } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');

    await expect(growthToolsGet('/api/google-ads/accounts')).resolves.toEqual({
      ok: false,
      error: 'Growth Tools 502: upstream unavailable',
    });
  });

  it('returns a connector error when fetch rejects before a response is available', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const { growthToolsGet } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');

    await expect(growthToolsGet('/api/google-ads/accounts', 1000)).resolves.toEqual({
      ok: false,
      error: 'Growth Tools request failed: network down',
    });
  });

  it('truncates long failed response bodies in connector errors', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'x'.repeat(450),
    } as Response);

    const { growthToolsGet } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');
    const result = await growthToolsGet('/api/google-ads/accounts');

    expect(result.ok).toBe(false);
    expect(result.error).toBe(`Growth Tools 500: ${'x'.repeat(400)}`);
  });

  it('throws a clear validation error when connector context has no customerId', async () => {
    const { ensureCustomerId } = await import('@/lib/agents/optimate-google-ads/tools/_growth-tools');

    expect(() => ensureCustomerId('')).toThrow('customerId not present on agent context');
    expect(() => ensureCustomerId(undefined)).toThrow('customerId not present on agent context');
  });
});

describe('API integration test helpers', () => {
  it('creates complete Payload mocks and allows authenticated-user overrides', async () => {
    const payload = createMockPayload();
    await expect(payload.create({ data: { name: 'Acme' } })).resolves.toEqual({ id: 1, name: 'Acme' });

    setAuthenticatedUser(payload, { id: 22, role: 'editor' });
    await expect(payload.auth()).resolves.toEqual({ user: { id: 22, role: 'editor' } });
  });

  it('builds NextRequest helpers with expected methods, headers, bodies, and params', async () => {
    const post = jsonRequest('https://cms.test/api/example', { ok: true });
    await expect(post.json()).resolves.toEqual({ ok: true });
    expect(post.method).toBe('POST');
    expect(post.headers.get('content-type')).toContain('application/json');

    const get = getRequest('https://cms.test/api/example');
    expect(get.method).toBe('GET');

    const bad = badJsonRequest('https://cms.test/api/example');
    await expect(bad.json()).rejects.toThrow();
    await expect(params({ id: '123' }).params).resolves.toEqual({ id: '123' });
  });

  it('installs module mocks and asserts JSON response status/content-type', async () => {
    const payload = createMockPayload();
    const headers = new Headers({ authorization: 'Bearer test' });

    installPayloadMocks(payload);
    installNextHeadersMock(headers);

    const payloadModule = await import('payload');
    const headersModule = await import('next/headers');
    await expect(payloadModule.getPayload({ config: {} })).resolves.toBe(payload);
    await expect(headersModule.headers()).resolves.toBe(headers);

    await expect(expectJsonStatus(makeFetchJsonResponse({ saved: true }, { status: 201 }), 201)).resolves.toEqual({ saved: true });
  });
});

describe('Google Ads client listing script', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock('payload');
    vi.unmock('@/payload.config');
    vi.doMock('payload', () => ({
      getPayload: vi.fn(async () => mockPayload),
    }));
    vi.doMock('@/payload.config', () => ({
      default: Promise.resolve({}),
    }));
    mockPayload.find.mockReset();
  });

  function captureProcess(): { stdout: () => string; stderr: () => string; exit: ReturnType<typeof vi.spyOn> } {
    const logs: string[] = [];
    const errors: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args.map(String).join(' ')));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    return { stdout: () => logs.join('\n'), stderr: () => errors.join('\n'), exit };
  }

  it('prints only clients with Google Ads IDs and exits zero', async () => {
    const proc = captureProcess();
    mockPayload.find.mockResolvedValue({
      docs: [
        { slug: 'acme', name: 'Acme', googleAdsCustomerId: '123-456-7890', isActive: true },
        { slug: 'missing', name: 'Missing Ads', googleAdsCustomerId: '', isActive: true },
        { slug: 'beta', name: 'Beta', googleAdsCustomerId: '2223334444', isActive: false },
      ],
    });

    await import('../../scripts/list-google-ads-clients');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));

    expect(mockPayload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'clients',
      where: { googleAdsCustomerId: { exists: true } },
      limit: 200,
      overrideAccess: true,
    }));
    expect(proc.stdout()).toContain('Found 2 clients with a googleAdsCustomerId');
    expect(proc.stdout()).toContain('slug="acme"');
    expect(proc.stdout()).toContain('customerId=2223334444');
    expect(proc.stdout()).not.toContain('slug="missing"');
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('prints script errors and exits one when Payload lookup fails', async () => {
    const proc = captureProcess();
    mockPayload.find.mockRejectedValue(new Error('database offline'));

    await import('../../scripts/list-google-ads-clients');
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(1));

    expect(proc.stderr()).toContain('database offline');
  });
});
