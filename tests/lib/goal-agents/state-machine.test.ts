import { describe, it, expect } from "vitest";

import {
  LEGAL_TRANSITIONS,
  IllegalTransitionError,
  assertLegalTransition,
  type GoalRunStatus,
} from "@/lib/goal-agents/state-machine";

const ALL_STATUSES: GoalRunStatus[] = [
  "awaiting_data",
  "analysing",
  "pending_approval",
  "executing",
  "measuring",
  "complete",
  "failed",
  "blocked",
];

describe("LEGAL_TRANSITIONS", () => {
  it("declares every status as a key", () => {
    for (const s of ALL_STATUSES) {
      expect(LEGAL_TRANSITIONS).toHaveProperty(s);
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS.complete).toEqual([]);
    expect(LEGAL_TRANSITIONS.failed).toEqual([]);
  });

  it("only references known statuses in the allowed lists", () => {
    for (const s of ALL_STATUSES) {
      for (const t of LEGAL_TRANSITIONS[s]) {
        expect(ALL_STATUSES).toContain(t);
      }
    }
  });
});

describe("assertLegalTransition — legal moves", () => {
  for (const from of ALL_STATUSES) {
    for (const to of LEGAL_TRANSITIONS[from]) {
      it(`${from} → ${to} is allowed`, () => {
        expect(() => assertLegalTransition(from, to)).not.toThrow();
      });
    }
  }
});

describe("assertLegalTransition — identity moves", () => {
  for (const s of ALL_STATUSES) {
    it(`${s} → ${s} is allowed (idempotent re-save)`, () => {
      expect(() => assertLegalTransition(s, s)).not.toThrow();
    });
  }
});

describe("assertLegalTransition — illegal moves", () => {
  for (const from of ALL_STATUSES) {
    const allowed = new Set<GoalRunStatus>([from, ...LEGAL_TRANSITIONS[from]]);
    for (const to of ALL_STATUSES) {
      if (allowed.has(to)) continue;
      it(`${from} → ${to} throws IllegalTransitionError`, () => {
        let caught: unknown;
        try {
          assertLegalTransition(from, to);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(IllegalTransitionError);
        const e = caught as IllegalTransitionError;
        expect(e.from).toBe(from);
        expect(e.to).toBe(to);
        expect(e.name).toBe("IllegalTransitionError");
        expect(e.message).toContain(from);
        expect(e.message).toContain(to);
      });
    }
  }
});

describe("IllegalTransitionError", () => {
  it("is a real Error subclass", () => {
    const e = new IllegalTransitionError("complete", "analysing");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(IllegalTransitionError);
    expect(e.from).toBe("complete");
    expect(e.to).toBe("analysing");
  });

  it("terminal complete cannot leave", () => {
    expect(() => assertLegalTransition("complete", "failed")).toThrow(IllegalTransitionError);
    expect(() => assertLegalTransition("complete", "analysing")).toThrow(IllegalTransitionError);
  });

  it("terminal failed cannot leave", () => {
    expect(() => assertLegalTransition("failed", "complete")).toThrow(IllegalTransitionError);
    expect(() => assertLegalTransition("failed", "analysing")).toThrow(IllegalTransitionError);
  });

  it("blocked can be resumed to analysing or fail outright", () => {
    expect(() => assertLegalTransition("blocked", "analysing")).not.toThrow();
    expect(() => assertLegalTransition("blocked", "failed")).not.toThrow();
    expect(() => assertLegalTransition("blocked", "executing")).toThrow(IllegalTransitionError);
  });
});
