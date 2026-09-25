import { describe, expect, it } from "vitest";
import { summariseChat, type ChatEventRow } from "@/lib/landing-chat-report";

let clock = 0;
function row(sessionId: string, eventType: string, extra: Partial<ChatEventRow> = {}): ChatEventRow {
  clock += 1;
  return {
    sessionId,
    eventType,
    occurredAt: new Date(Date.UTC(2026, 8, 25, 0, 0, clock)).toISOString(),
    paid: false,
    ...extra,
  };
}

function step(sessionId: string, node: string, choice: string | null, n: number) {
  return row(sessionId, "chat_step", { node, choice, step: n });
}

describe("summariseChat", () => {
  it("returns zeroed figures for no events", () => {
    const summary = summariseChat([]);
    expect(summary.funnel.map((s) => s.sessions)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(summary.funnel.every((s) => s.fromPrevious === null)).toBe(true);
    expect(summary.paths).toEqual([]);
    expect(summary.dropOff).toEqual([]);
  });

  it("counts each step on distinct sessions, with step-to-step conversion", () => {
    const rows = [
      // s1: auto open, ready path, books through the chat.
      row("s1", "chat_open", { trigger: "auto" }),
      row("s1", "chat_start"),
      step("s1", "welcome", "ready", 1),
      step("s1", "ready_role", "developer", 2),
      row("s1", "booking_open", { bookingId: "chatbot-scheduler-api" }),
      row("s1", "chat_identified"),
      row("s1", "booking_complete", { bookingId: "chatbot-scheduler-api" }),
      // s2: button open, research path, stops at the topic menu.
      row("s2", "chat_open", { trigger: "button" }),
      row("s2", "chat_open", { trigger: "button" }),
      row("s2", "chat_start"),
      step("s2", "welcome", "research", 1),
      step("s2", "research_topic", "vietnam", 2),
      // s3: auto open, never answers.
      row("s3", "chat_open", { trigger: "auto" }),
      // s4: booked through the page form, not the chat - ignored here.
      row("s4", "booking_complete", { bookingId: "hubspot-meetings" }),
    ];

    const summary = summariseChat(rows);

    expect(Object.fromEntries(summary.funnel.map((s) => [s.key, s.sessions]))).toEqual({
      opened: 3,
      started: 2,
      path: 2,
      booking: 1,
      email: 1,
      booked: 1,
    });
    expect(summary.funnel[1].fromPrevious).toBe(66.7);
    expect(summary.funnel[3].fromPrevious).toBe(50);
    expect(summary.openedBy).toEqual({ auto: { sessions: 2, started: 1 }, button: { sessions: 1, started: 1 } });
    expect(summary.paths).toEqual([
      { choice: "ready", sessions: 1, gaveEmail: 1, booked: 1 },
      { choice: "research", sessions: 1, gaveEmail: 0, booked: 0 },
    ]);
    expect(summary.droppedSessions).toBe(1);
    expect(summary.dropOff).toEqual([{ node: "research_topic", choice: "vietnam", sessions: 1, share: 100 }]);
  });

  it("attributes a session to the trigger that opened it first", () => {
    const summary = summariseChat([
      row("s1", "chat_open", { trigger: "auto" }),
      row("s1", "chat_open", { trigger: "button" }),
      row("s1", "chat_start"),
    ]);
    expect(summary.openedBy).toEqual({ auto: { sessions: 1, started: 1 }, button: { sessions: 0, started: 0 } });
  });

  it("reads rows in any order (the route scans newest first)", () => {
    const ordered = [
      row("s1", "chat_open", { trigger: "button" }),
      step("s1", "welcome", "readiness_v2", 1),
      step("s1", "readiness_v2_1", "yes", 2),
      step("s1", "readiness_v2_2", "no", 3),
    ];
    const forward = summariseChat(ordered);
    const backward = summariseChat([...ordered].reverse());
    expect(backward).toEqual(forward);
    expect(forward.dropOff[0]).toMatchObject({ node: "readiness_v2_2", choice: "no" });
  });

  it("keeps the first welcome pick as the path when the visitor goes back", () => {
    const summary = summariseChat([
      step("s1", "welcome", "research", 1),
      step("s1", "welcome", "ready", 1),
    ]);
    expect(summary.paths.map((p) => p.choice)).toEqual(["research"]);
  });

  it("counts reaching the booking step from its step even without booking_open", () => {
    const summary = summariseChat([step("s1", "welcome", "ready", 1), step("s1", "booking_slot", null, 5)]);
    expect(summary.funnel.find((s) => s.key === "booking")?.sessions).toBe(1);
    expect(summary.dropOff[0]).toMatchObject({ node: "booking_slot", choice: null });
  });

  it("leaves sessions with no step data out of the drop-off list", () => {
    const summary = summariseChat([row("s1", "chat_start")]);
    expect(summary.droppedSessions).toBe(0);
    expect(summary.dropOff).toEqual([]);
  });

  it("caps the drop-off list at twelve entries", () => {
    const rows = Array.from({ length: 15 }, (_, i) => step(`s${i}`, `node_${String(i).padStart(2, "0")}`, "x", 1));
    const summary = summariseChat(rows);
    expect(summary.dropOff).toHaveLength(12);
    expect(summary.droppedSessions).toBe(15);
  });
});
