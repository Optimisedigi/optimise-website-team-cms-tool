/**
 * API worker (step 12) — runs authenticated `fetch` scenarios.
 *
 * Owns the breadth-first surface: every scenario whose role resolves to `api`
 * (CMS REST + custom `/api/*` route handlers). It authenticates once via
 * {@link ensureAdminLogin} (which wraps `loginAdmin()` from `../auth`) and
 * replays the session cookie through {@link authedFetch}.
 *
 * Safety: the worker only auto-executes **read** endpoints (GET/HEAD). Write
 * endpoints are pre-screened through the coordinator's {@link SafetyInterlock}:
 * a candidate live external write is reported `skipped-danger` (never sent), and
 * a CMS-write whose request body the scenario metadata does not encode is
 * reported `blocked` rather than fired blind. The coordinator additionally wraps
 * the global `fetch`, so any live write that slips through is still rejected
 * before the network — defence in depth.
 */

import { authedFetch } from '../auth';
import { BlockedExternalWriteError, type WorkerExecutor } from '../coordinator';
import {
  ensureAdminLogin,
  extractEndpoint,
  inferEnvDeps,
  isTemplatedPath,
  makeResult,
  snippet,
  triageForStatus,
} from './shared';

export const apiWorker: WorkerExecutor = async (scenario, ctx) => {
  const envDeps = inferEnvDeps(scenario.surface);

  const login = await ensureAdminLogin();
  if (!login.ok) {
    return makeResult(scenario, {
      steps: ['Attempt admin login via loginAdmin().'],
      expected: 'Authenticated admin session established against the dev server.',
      observed: `Login failed: ${login.reason}`,
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes:
        'API scenarios need a running dev server on TEST_BASE_URL and TEST_ADMIN_PASSWORD exported.',
      envDeps,
    });
  }

  const endpoint = extractEndpoint(scenario.surface);
  if (!endpoint) {
    return makeResult(scenario, {
      steps: ['Parse an HTTP endpoint from the scenario surface line.'],
      expected: 'A METHOD + /api path the worker can call.',
      observed: 'No endpoint found in the scenario surface metadata.',
      status: 'blocked',
      triage: null,
      notes:
        'Scenario surface carries no callable endpoint; run it from its full markdown block in docs/test-scenarios.',
      envDeps,
    });
  }

  if (isTemplatedPath(endpoint.path)) {
    return makeResult(scenario, {
      steps: [`Resolve templated path ${endpoint.path}.`],
      expected: 'A concrete path with fixture ids substituted.',
      observed: `Path still contains a placeholder: ${endpoint.path}`,
      status: 'blocked',
      triage: null,
      notes:
        'Templated path needs a fixture id/slug not encoded in scenario metadata.',
      envDeps,
    });
  }

  // Write endpoints: screen through the interlock; never fire blind.
  if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
    const write = ctx.interlock.classifyRequest(endpoint.path, endpoint.method);
    if (write) {
      const verdict = ctx.interlock.evaluate(write);
      if (!verdict.allowed) {
        return makeResult(scenario, {
          steps: [`Classify ${endpoint.method} ${endpoint.path} as a live external write.`],
          expected: 'Live external write blocked at the harness level (never applied).',
          observed: `Interlock blocked: ${verdict.reason}`,
          status: 'skipped-danger',
          triage: null,
          notes: 'Central Safety Interlock: live external writes are blocked by default.',
          envDeps,
        });
      }
    }
    return makeResult(scenario, {
      steps: [`Prepare ${endpoint.method} ${endpoint.path}.`],
      expected: 'Request body with the scenario inputs.',
      observed: 'Write endpoint requires a request body not encoded in scenario metadata.',
      status: 'blocked',
      triage: null,
      notes:
        'CMS/EXTERNAL-SAFE write endpoints are not auto-executed without inputs; run from the full scenario block.',
      envDeps,
    });
  }

  // Read endpoint — execute it.
  const steps = ['loginAdmin()', `${endpoint.method} ${endpoint.path}`];
  try {
    const res = await authedFetch(endpoint.path, { method: endpoint.method });
    const text = await res.text();
    const evidence = `${endpoint.method} ${endpoint.path} → ${res.status} ${res.statusText}\n${snippet(text)}`;

    if (res.ok) {
      return makeResult(scenario, {
        steps,
        expected: `2xx response from ${endpoint.path}.`,
        observed: `HTTP ${res.status} ${res.statusText}`,
        status: 'pass',
        triage: null,
        notes: 'Read endpoint returned a successful response.',
        evidence,
        envDeps,
      });
    }

    return makeResult(scenario, {
      steps,
      expected: `2xx response from ${endpoint.path}.`,
      observed: `HTTP ${res.status} ${res.statusText}`,
      status: 'fail',
      triage: triageForStatus(res.status),
      notes:
        res.status === 401 || res.status === 403
          ? 'Auth/permission failure — expected without a valid session/key in dev.'
          : 'Read endpoint returned a non-2xx response.',
      evidence,
      envDeps,
    });
  } catch (err) {
    if (err instanceof BlockedExternalWriteError) {
      return makeResult(scenario, {
        steps,
        expected: 'Read-only call.',
        observed: `Request-level interlock blocked a live write: ${err.message}`,
        status: 'skipped-danger',
        triage: null,
        notes: 'Request-level Safety Interlock rejected the call before the network.',
        envDeps,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return makeResult(scenario, {
      steps,
      expected: `2xx response from ${endpoint.path}.`,
      observed: `Request threw: ${message}`,
      status: 'fail',
      triage: 'UNKNOWN',
      notes: 'Network/transport error — likely dev server down or unreachable.',
      envDeps,
    });
  }
};
