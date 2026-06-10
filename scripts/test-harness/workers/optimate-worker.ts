/**
 * OptiMate worker (step 12) — runs the typed chat scenarios and captures the
 * full prompt → tools → numeric-answer trace for Phase 5 data validation.
 *
 * It posts to the portfolio chat route
 * (`/api/optimate/google-ads-portfolio/chat`) with the admin session, then
 * records the prompt, the assistant reply (snippet), any staged proposals /
 * confirm-requests, and the number-like tokens extracted from the answer as
 * evidence.
 *
 * Safety: OptiMate `propose_*` tools stage approval rows (CMS-WRITE) and
 * `request_confirm` raises a confirm gate — the worker captures both but NEVER
 * applies/confirms them, so nothing goes live. Voice/realtime parity scenarios
 * need a live audio session and are reported `blocked` (not executable from the
 * harness fetch path).
 */

import { authedFetch } from '../auth';
import { BlockedExternalWriteError, type Scenario, type WorkerExecutor } from '../coordinator';
import {
  ensureAdminLogin,
  extractNumbers,
  makeResult,
  snippet,
} from './shared';

const CHAT_ENDPOINT = '/api/optimate/google-ads-portfolio/chat';
const WHITELISTED_ACCOUNT = '659-101-3898';

interface PortfolioChatResponse {
  reply?: string;
  runId?: string;
  modelUsed?: string;
  source?: string;
  proposals?: unknown[];
  confirmRequests?: unknown[];
  error?: string;
  error_kind?: string;
}

export const optimateWorker: WorkerExecutor = async (scenario, _ctx) => {
  const envDeps = ['TEST_ADMIN_PASSWORD', 'GROWTH_TOOLS_URL', 'KIMI_API_KEY'];

  if (isVoiceScenario(scenario)) {
    return makeResult(scenario, {
      steps: ['Detect voice/realtime parity scenario.'],
      expected: 'Same numeric answer via the realtime voice path.',
      observed: 'Realtime voice requires a live WebRTC audio session; not executable from fetch.',
      status: 'blocked',
      triage: null,
      notes:
        'Voice-vs-typed parity must be run against /api/optimate/realtime-session with an audio client.',
      envDeps: [...envDeps, 'OPENAI_API_KEY'],
    });
  }

  const login = await ensureAdminLogin();
  if (!login.ok) {
    return makeResult(scenario, {
      steps: ['Attempt admin login via loginAdmin().'],
      expected: 'Authenticated admin session for the OptiMate chat route.',
      observed: `Login failed: ${login.reason}`,
      status: 'blocked',
      triage: 'DEV-CONFIG',
      notes: 'OptiMate scenarios need a running dev server and TEST_ADMIN_PASSWORD.',
      envDeps,
    });
  }

  const prompt = derivePrompt(scenario);
  const steps = [
    'loginAdmin()',
    `POST ${CHAT_ENDPOINT} with the scenario prompt`,
    'Capture prompt → reply → staged proposals → numeric answer',
  ];

  try {
    const res = await authedFetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history: [], selectedAccountRefs: [] }),
    });

    const data = (await res.json().catch(() => ({}))) as PortfolioChatResponse;
    const reply = data.reply ?? '';
    const proposals = Array.isArray(data.proposals) ? data.proposals.length : 0;
    const confirmRequests = Array.isArray(data.confirmRequests) ? data.confirmRequests.length : 0;
    const numericAnswers = extractNumbers(reply);

    const evidence = JSON.stringify(
      {
        prompt,
        reply: snippet(reply, 800),
        runId: data.runId ?? '',
        modelUsed: data.modelUsed ?? '',
        proposalsStaged: proposals,
        confirmRequests,
        numericAnswers,
      },
      null,
      2,
    );

    if (!res.ok || data.error) {
      const errKind = data.error_kind ?? '';
      const llmKeyIssue = /api.?key|auth|unauthor|model|provider/i.test(`${data.error ?? ''} ${errKind}`);
      return makeResult(scenario, {
        steps,
        expected: 'A grounded numeric answer from OptiMate.',
        observed: `Chat returned ${res.status}: ${data.error ?? (errKind || 'error')}`,
        status: 'fail',
        triage: llmKeyIssue ? 'DEV-CONFIG' : res.status >= 500 ? 'UNKNOWN' : 'PROD-BUG',
        notes: 'OptiMate chat failed — LLM key / provider issues triage as DEV-CONFIG.',
        evidence,
        envDeps,
      });
    }

    const answered = reply.trim().length > 0;
    return makeResult(scenario, {
      steps,
      expected: 'A non-empty reply with numeric answer(s) for Phase 5 validation.',
      observed: `Reply captured (${numericAnswers.length} numeric token(s), ${proposals} proposal(s) staged).`,
      status: answered ? 'pass' : 'fail',
      triage: answered ? null : 'PROD-BUG',
      notes:
        'Proposals/confirm-requests captured but NEVER applied. Feed numericAnswers into Phase 5 ground-truth validation.',
      evidence,
      envDeps,
    });
  } catch (err) {
    if (err instanceof BlockedExternalWriteError) {
      return makeResult(scenario, {
        steps,
        expected: 'A read-only chat answer.',
        observed: `Interlock blocked a live write attempted by a tool: ${err.message}`,
        status: 'skipped-danger',
        triage: null,
        notes: 'A tool tried to apply/send; the Safety Interlock rejected it.',
        evidence: prompt,
        envDeps,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    return makeResult(scenario, {
      steps,
      expected: 'A reply from the OptiMate chat route.',
      observed: `Request threw: ${message}`,
      status: 'fail',
      triage: 'UNKNOWN',
      notes: 'Transport error — likely dev server down or unreachable.',
      envDeps,
    });
  }
};

/** Voice/realtime parity scenarios cannot run over the typed fetch path. */
function isVoiceScenario(scenario: Scenario): boolean {
  return /voice|realtime/i.test(`${scenario.scenarioId} ${scenario.surface}`);
}

/**
 * Derive a representative read prompt for the scenario. The exact prompt lives
 * in the full scenario block in `docs/test-scenarios/optimate.md`; the parsed
 * surface is included as context so the agent reaches for the right tool, and
 * the whitelisted read account is named so any tool call targets a safe account.
 */
function derivePrompt(scenario: Scenario): string {
  const surface = scenario.surface.trim();
  return (
    `For Google Ads account ${WHITELISTED_ACCOUNT} (Optimise Digital), over the last 30 days, ` +
    `answer this read-only question and show the numbers: ${surface}. ` +
    `Do not apply, send, or push anything — report figures only.`
  );
}
