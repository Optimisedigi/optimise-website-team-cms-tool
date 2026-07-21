import { beforeEach, describe, expect, it } from "vitest";

import {
  incomingRevisionAction,
  insertReviewNote,
  parseReviewerNoteMarkdown,
  persistRecoveryRecord,
  shouldOfferLocalRecovery,
} from "@/app/(frontend)/cipher/patient-journey-review/PatientJourneyReviewClient";

const recoveryKey = "working-doc-recovery:cipher/patient-journey-review";

describe("patient journey working-document client synchronization", () => {
  beforeEach(() => localStorage.clear());

  it("persists local edits for offline and refresh recovery", () => {
    persistRecoveryRecord({
      contentMarkdown: "# Local draft\n",
      baseRevision: 4,
      contentHash: "local-hash",
      savedAt: "2026-07-20T02:00:00.000Z",
    });
    expect(JSON.parse(localStorage.getItem(recoveryKey) || "null")).toEqual({
      contentMarkdown: "# Local draft\n",
      baseRevision: 4,
      contentHash: "local-hash",
      savedAt: "2026-07-20T02:00:00.000Z",
    });
  });

  it("offers recovery only when the local content differs from the server", () => {
    const recovery = {
      contentMarkdown: "# Local\n",
      baseRevision: 2,
      contentHash: "local-hash",
      savedAt: "2026-07-20T02:00:00.000Z",
    };
    expect(shouldOfferLocalRecovery(recovery, "server-hash")).toBe(true);
    expect(shouldOfferLocalRecovery(recovery, "local-hash")).toBe(false);
  });

  it("polling renders a newer server revision only when the browser is clean", () => {
    expect(
      incomingRevisionAction({ dirty: false, currentRevision: 2, incomingRevision: 3 }),
    ).toBe("render");
    expect(
      incomingRevisionAction({ dirty: true, currentRevision: 2, incomingRevision: 3 }),
    ).toBe("save");
    expect(
      incomingRevisionAction({ dirty: false, currentRevision: 3, incomingRevision: 3 }),
    ).toBe("none");
  });

  it("places a note inside the default content container so serialization includes it", () => {
    const app = document.createElement("div");
    const content = document.createElement("div");
    content.className = "content";
    app.appendChild(content);
    const note = document.createElement("div");
    note.className = "review-note";

    insertReviewNote(app, content, note);

    expect(content.querySelector(":scope > .review-note")).toBe(note);
  });

  it("moves notes beside a serializable top-level block when a nested item is selected", () => {
    const app = document.createElement("div");
    app.innerHTML = '<div class="content"><ul><li>Selected item</li></ul></div>';
    const note = document.createElement("div");
    note.className = "review-note";

    insertReviewNote(app, app.querySelector("li")!, note);

    expect(app.querySelector(".content")?.children[1]).toBe(note);
  });

  it("falls back to the document content when a heading outside it is selected", () => {
    const app = document.createElement("div");
    app.innerHTML = '<div class="section-head"><h2>Heading</h2></div><div class="content"></div>';
    const note = document.createElement("div");
    note.className = "review-note";

    insertReviewNote(app, app.querySelector("h2")!, note);

    expect(app.querySelector(".content > .review-note")).toBe(note);
  });

  it("recognizes serialized reviewer notes inside table cells", () => {
    expect(
      parseReviewerNoteMarkdown("> **Reviewer note — Alex:** Confirm this journey step"),
    ).toEqual({ author: "Alex", text: "Confirm this journey step", replies: [] });
  });

  it("parses threaded replies from reviewer note markers", () => {
    const marker = encodeURIComponent(JSON.stringify([{ author: "Peter", text: "I'll remove this" }]));
    expect(
      parseReviewerNoteMarkdown(`> **Reviewer note — Tracey:** please explain <!--review-replies:${marker}-->`),
    ).toEqual({ author: "Tracey", text: "please explain", replies: [{ author: "Peter", text: "I'll remove this" }] });
  });
});
