/**
 * Worker registry assembly (step 12).
 *
 * Registers every implemented worker role with a {@link WorkerRegistry} so the
 * coordinator can dispatch scenarios to them. The `validation` role hosts the
 * OptiMate real-data ground-truth worker (Phase 5 / step 13); the goal-agent
 * live-validation track (step 14) is owned by the goal-agent worker behind the
 * `--allow-live-push` gate.
 */

import { WorkerRegistry } from '../coordinator';
import { apiWorker } from './api-worker';
import { browserWorker } from './browser-worker';
import { optimateWorker } from './optimate-worker';
import { goalAgentWorker } from './goal-agent-worker';
import { optimateValidationWorker } from './optimate-validation';

export { apiWorker } from './api-worker';
export { browserWorker } from './browser-worker';
export { optimateWorker } from './optimate-worker';
export { goalAgentWorker } from './goal-agent-worker';
export { optimateValidationWorker } from './optimate-validation';
// Step-14 goal-agent runtime validation (lifecycle / risk-gating / dispatch /
// audit-trail / escalations / watchdog / scheduler + the gated live push). It
// ships its own standalone runner; the step-12 goalAgentWorker remains the
// registered `goal-agent` role for in-swarm dispatch.
export { goalAgentValidationWorker } from './goal-agent-validation';

/** Register the step-12 worker roles onto an existing registry. */
export function registerDefaultWorkers(registry: WorkerRegistry): void {
  registry.register('api', apiWorker);
  registry.register('browser', browserWorker);
  registry.register('optimate', optimateWorker);
  registry.register('goal-agent', goalAgentWorker);
  registry.register('validation', optimateValidationWorker);
}

/** Build a {@link WorkerRegistry} with every implemented worker role registered. */
export function buildDefaultRegistry(): WorkerRegistry {
  const registry = new WorkerRegistry();
  registerDefaultWorkers(registry);
  return registry;
}
