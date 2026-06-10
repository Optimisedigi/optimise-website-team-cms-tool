/**
 * Worker registry assembly (step 12).
 *
 * Registers every implemented worker role with a {@link WorkerRegistry} so the
 * coordinator can dispatch scenarios to them. The `validation` role (Phase 5
 * ground-truth + goal-agent live validation, steps 13–14) is intentionally not
 * registered here — until it lands the coordinator records an honest `blocked`
 * result for validation scenarios.
 */

import { WorkerRegistry } from '../coordinator';
import { apiWorker } from './api-worker';
import { browserWorker } from './browser-worker';
import { optimateWorker } from './optimate-worker';
import { goalAgentWorker } from './goal-agent-worker';

export { apiWorker } from './api-worker';
export { browserWorker } from './browser-worker';
export { optimateWorker } from './optimate-worker';
export { goalAgentWorker } from './goal-agent-worker';

/** Register the step-12 worker roles onto an existing registry. */
export function registerDefaultWorkers(registry: WorkerRegistry): void {
  registry.register('api', apiWorker);
  registry.register('browser', browserWorker);
  registry.register('optimate', optimateWorker);
  registry.register('goal-agent', goalAgentWorker);
}

/** Build a {@link WorkerRegistry} with every implemented worker role registered. */
export function buildDefaultRegistry(): WorkerRegistry {
  const registry = new WorkerRegistry();
  registerDefaultWorkers(registry);
  return registry;
}
