/**
 * Browser worker (step 12) — drives admin / public UI via Playwright and saves
 * a screenshot to `docs/test-runs/<date>/screenshots/` as evidence.
 *
 * Owns the ~60 UI features where rendering/interaction is the thing under test.
 * It is deliberately **read-only**: it navigates to the scenario's page and
 * captures a screenshot, but never clicks apply/send/push controls. Combined
 * with the coordinator screening DANGER scenarios out before dispatch, no live
 * external write can originate here.
 *
 * Auth: admin pages get the `payload-token` session cookie minted by
 * {@link ensureAdminLogin} injected into the browser context. Public PIN-gated
 * pages render their gate (the PIN entry), which is itself valid evidence.
 *
 * Playwright is an optional/runtime dependency — if Chromium is not installed
 * (`npx playwright install chromium`) the worker degrades to a `blocked` /
 * DEV-CONFIG result instead of crashing the run.
 */

import { join, relative } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { BASE_URL } from '../auth';
import type { WorkerExecutor } from '../coordinator';
import {
  ensureAdminLogin,
  extractBrowserPath,
  inferEnvDeps,
  isTemplatedPath,
  makeResult,
  sessionTokenValue,
} from './shared';

const NAV_TIMEOUT_MS = 30_000;

export const browserWorker: WorkerExecutor = async (scenario, ctx) => {
  const envDeps = inferEnvDeps(scenario.surface);

  const target = extractBrowserPath(scenario.surface);
  if (!target) {
    return makeResult(scenario, {
      steps: ['Parse a navigable path from the scenario surface line.'],
      expected: 'An /admin or public route to open.',
      observed: 'No navigable path found in the scenario surface metadata.',
      status: 'blocked',
      triage: null,
      notes: 'Run this scenario from its full markdown block in docs/test-scenarios.',
      envDeps,
    });
  }

  if (isTemplatedPath(target)) {
    return makeResult(scenario, {
      steps: [`Resolve templated path ${target}.`],
      expected: 'A concrete URL with fixture ids/slugs substituted.',
      observed: `Path still contains a placeholder: ${target}`,
      status: 'blocked',
      triage: null,
      notes: 'Templated path needs a fixture id/slug not encoded in scenario metadata.',
      envDeps,
    });
  }

  const isAdmin = target.startsWith('/admin');
  if (isAdmin) {
    const login = await ensureAdminLogin();
    if (!login.ok) {
      return makeResult(scenario, {
        steps: ['Attempt admin login via loginAdmin().'],
        expected: 'Authenticated admin session for the browser context.',
        observed: `Login failed: ${login.reason}`,
        status: 'blocked',
        triage: 'DEV-CONFIG',
        notes: 'Admin browser scenarios need a running dev server and TEST_ADMIN_PASSWORD.',
        envDeps,
      });
    }
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeResult(scenario, {
      steps: ['Launch headless Chromium via Playwright.'],
      expected: 'A Chromium browser instance.',
      observed: `Could not launch Chromium: ${message}`,
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes: 'Install the browser binary with: npx playwright install chromium',
      envDeps,
    });
  }

  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    if (isAdmin) {
      const token = sessionTokenValue();
      if (token) {
        await context.addCookies([
          { name: 'payload-token', value: token, url: BASE_URL },
        ]);
      }
    }

    const page = await context.newPage();
    const response = await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });
    const status = response?.status() ?? 0;

    const shotPath = join(ctx.runDir, 'screenshots', `${scenario.scenarioId}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    const evidencePath = relative(ctx.runDir, shotPath);

    const ok = status > 0 && status < 400;
    return makeResult(scenario, {
      steps: [
        isAdmin ? 'Inject admin session cookie into the browser context.' : 'Open public page.',
        `Navigate to ${target}.`,
        `Capture screenshot → ${evidencePath}.`,
      ],
      expected: `Page at ${target} renders without an HTTP error.`,
      observed: `Navigation returned HTTP ${status || 'unknown'}; screenshot captured.`,
      status: ok ? 'pass' : 'fail',
      triage: ok ? null : status >= 500 ? 'UNKNOWN' : 'PROD-BUG',
      notes: 'Read-only render check — no apply/send/push controls are clicked.',
      evidence: evidencePath,
      envDeps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeResult(scenario, {
      steps: [`Navigate to ${target}.`],
      expected: `Page at ${target} renders.`,
      observed: `Navigation/screenshot threw: ${message}`,
      status: 'fail',
      triage: 'UNKNOWN',
      notes: 'Page failed to load — likely dev server down or a navigation timeout.',
      envDeps,
    });
  } finally {
    await context.close();
    await browser.close();
  }
};
