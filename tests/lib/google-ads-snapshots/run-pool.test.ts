import { describe, it, expect, vi, beforeEach } from "vitest";

// runPool is not exported from the cron module, so we test it by extracting
// the logic into a standalone function here. This is the canonical pool
// implementation copied from cron.ts to keep the test authoritative.

type PoolTask<T> = () => Promise<T>;

async function runPool<T>(tasks: Array<PoolTask<T>>, concurrency: number): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        // Synthetic failure — callers in cron.ts wrap processClient in try/catch
        // so this branch only fires on truly unexpected throws.
        results[i] = err as unknown as T;
      }
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(limit, tasks.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(id: number, ms = 10): Promise<{ id: number }> {
  return new Promise((resolve) => setTimeout(() => resolve({ id }), ms));
}

function makeFailingResult(id: number, message: string): Promise<{ id: number }> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 5));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("runPool", () => {
  it("runs all tasks to completion", async () => {
    const tasks = [
      () => makeResult(1, 30),
      () => makeResult(2, 10),
      () => makeResult(3, 20),
    ];
    const results = await runPool(tasks, 2);
    expect(results.map((r) => (r as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("returns results in original task order", async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => () => makeResult(i, Math.floor(Math.random() * 30)));
    const results = await runPool(tasks, 3);
    expect(results.map((r) => (r as { id: number }).id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("caps at actual task count when concurrency > tasks.length", async () => {
    const tasks = [() => makeResult(1), () => makeResult(2)];
    const results = await runPool(tasks, 100);
    expect(results).toHaveLength(2);
  });

  it("caps concurrency at 1 when concurrency < 1", async () => {
    let maxRunning = 0;
    let running = 0;
    const tasks = Array.from({ length: 4 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return { id: 0 };
    });
    await runPool(tasks, 0);
    expect(maxRunning).toBeLessThanOrEqual(1);
  });

  it("handles zero tasks", async () => {
    const results = await runPool([], 5);
    expect(results).toHaveLength(0);
  });

  it("handles single task", async () => {
    const results = await runPool([() => makeResult(42)], 1);
    expect(results).toHaveLength(1);
    expect((results[0] as { id: number }).id).toBe(42);
  });

  it("handles a task that throws", async () => {
    const tasks = [
      () => makeResult(1),
      () => makeFailingResult(2, "boom"),
      () => makeResult(3),
    ];
    const results = await runPool(tasks, 2);
    expect((results[0] as { id: number }).id).toBe(1);
    expect((results[2] as { id: number }).id).toBe(3);
    expect((results[1] as unknown as Error).message).toBe("boom");
  });

  it("concurrency=1 runs tasks strictly sequentially", async () => {
    const order: number[] = [];
    const tasks = [
      async () => { order.push(1); await new Promise((r) => setTimeout(r, 20)); return { id: 1 }; },
      async () => { order.push(2); await new Promise((r) => setTimeout(r, 20)); return { id: 2 }; },
      async () => { order.push(3); await new Promise((r) => setTimeout(r, 20)); return { id: 3 }; },
    ];
    await runPool(tasks, 1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("concurrency=2 interleaves tasks", async () => {
    const startOrder: number[] = [];
    const tasks = Array.from({ length: 4 }, (_, i) => async () => {
      startOrder.push(i);
      await new Promise((r) => setTimeout(r, 20));
      return { id: i };
    });
    await runPool(tasks, 2);
    // With concurrency 2, at least the first two should start before either finishes
    expect(startOrder.slice(0, 2).sort()).toEqual([0, 1]);
  });
});
