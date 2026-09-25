// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChatFunnelPanel, choiceLabel, nodeLabel } from "@/components/dashboards/landing/ChatFunnelPanel";
import { summariseChat, type ChatEventRow } from "@/lib/landing-chat-report";

let tick = 0;
const row = (sessionId: string, eventType: string, extra: Partial<ChatEventRow> = {}): ChatEventRow => ({
  sessionId,
  eventType,
  occurredAt: new Date(Date.UTC(2026, 8, 25, 1, 0, ++tick)).toISOString(),
  paid: true,
  ...extra,
});

const ROWS: ChatEventRow[] = [
  row("s1", "chat_open", { trigger: "auto" }),
  row("s1", "chat_start"),
  row("s1", "chat_step", { node: "welcome", choice: "ready", step: 1 }),
  row("s1", "chat_identified"),
  row("s2", "chat_open", { trigger: "button" }),
  row("s2", "chat_start"),
  row("s2", "chat_step", { node: "welcome", choice: "research", step: 1 }),
  row("s2", "chat_step", { node: "research_topic", choice: "vietnam", step: 2 }),
  // A hostile id from a browser must render as inert text.
  row("s3", "chat_start"),
  row("s3", "chat_step", { node: "<img src=x onerror=alert(1)>", choice: null, step: 1 }),
];

function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 502, json: async () => body })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RANGE = { mode: "last_30_days" as const };

describe("ChatFunnelPanel", () => {
  it("shows the funnel, the open trigger split, the paths and the drop-off", async () => {
    const summary = summariseChat(ROWS);
    respond({ all: summary, paid: summary, trackingSince: "2026-09-25T01:00:00.000Z", truncated: false });

    render(<ChatFunnelPanel slug="away-digital-teams" range={RANGE} layout="current" />);

    const funnel = await screen.findByRole("list", { name: "Chat funnel" });
    expect(within(funnel).getByText("Opened the chat")).toBeTruthy();
    expect(within(funnel).getByText("Gave an email")).toBeTruthy();
    expect(screen.getByText("Opened by itself")).toBeTruthy();
    expect(screen.getByText("Chat button")).toBeTruthy();
    expect(screen.getByText("Ready to build a team")).toBeTruthy();
    expect(screen.getByText("Still researching")).toBeTruthy();
    expect(screen.getByText(/Research menu/)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("switches between Google Ads visitors and everyone", async () => {
    const paid = summariseChat(ROWS.filter((r) => r.sessionId === "s1"));
    const all = summariseChat(ROWS);
    respond({ all, paid, trackingSince: null, truncated: false });

    render(<ChatFunnelPanel slug="away-digital-teams" range={RANGE} layout="current" />);
    await screen.findByRole("list", { name: "Chat funnel" });
    expect(screen.queryByText("Still researching")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All visitors" }));
    expect(screen.getByText("Still researching")).toBeTruthy();
  });

  it("explains that the original layout only has chats started and sign-ups", async () => {
    const summary = summariseChat(ROWS);
    respond({ all: summary, paid: summary, trackingSince: null, truncated: false });

    render(<ChatFunnelPanel slug="away-digital-teams" range={RANGE} layout="original" />);

    expect(await screen.findByText(/Step-by-step chat tracking began with the new layout/)).toBeTruthy();
    expect(screen.getByText("Chats started")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Chat funnel" })).toBeNull();
  });

  it("shows the error rather than an empty panel when the request fails", async () => {
    respond({ error: "Chat data is unavailable" }, false);
    render(<ChatFunnelPanel slug="away-digital-teams" range={RANGE} layout="current" />);
    expect(await screen.findByText("Chat data is unavailable")).toBeTruthy();
  });
});

describe("chat step labels", () => {
  it.each([
    ["welcome", "First question"],
    ["readiness_v2_3", "Readiness question 3"],
    ["role_profile_developer", "Role profile · Developer"],
    ["some_new_node", "Some new node"],
    ["<script>", "Script"],
  ])("node %s reads as %s", (id, label) => {
    expect(nodeLabel(id)).toBe(label);
  });

  it("labels known choices and falls back to a cleaned id", () => {
    expect(choiceLabel("readiness_v2")).toBe("Check if we’re ready");
    expect(choiceLabel("new_choice")).toBe("New choice");
  });
});
