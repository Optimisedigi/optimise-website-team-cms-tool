import { describe, expect, it } from "vitest";
import { isBareDoneComment } from "@/lib/team-task-mention-filter";

describe("isBareDoneComment", () => {
  it.each([
    "@Peter done with this",
    "@peter done with this.",
    "@Peter done with this boss",
    "@Peter done with these boss",
    "@Peter done here",
    "@Peter i am done here",
    "@Peter im done with this",
    "<p>@Peter done with this</p>",
    "Done!",
  ])("treats %j as a bare done comment", (body) => {
    expect(isBareDoneComment(body)).toBe(true);
  });

  it.each([
    "@Peter done with this. i hope i did right",
    "@Peter done publishing these WCQ blogs",
    "@Peter done with this. I've scheduled this for sending on Wed, 7th Oct 1030",
    "@Peter done with this email. ready to be sent tomorrow morning https://us8.admin.mailchimp.com/x",
    '@Peter done with this <img src="shot.png">',
    "@Peter progress update: done with july and aug 2025.",
    "@Peter can you check this?",
    "",
  ])("still notifies for %j", (body) => {
    expect(isBareDoneComment(body)).toBe(false);
  });
});
