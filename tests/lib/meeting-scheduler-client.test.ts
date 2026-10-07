import { describe, expect, it } from "vitest";
import { meetingSchedulerClientId } from "@/lib/meeting-scheduler-client";

describe("meetingSchedulerClientId", () => {
  it.each([
    ["client id", { relationTo: "clients", value: 7 }, 7],
    ["populated client", { relationTo: "clients", value: { id: 9, name: "Acme" } }, 9],
    ["prospect", { relationTo: "client-proposals", value: 4 }, undefined],
    ["populated prospect", { relationTo: "client-proposals", value: { id: 4 } }, undefined],
    ["empty", null, undefined],
    ["legacy bare id", 7, undefined],
  ])("%s", (_label, input, expected) => {
    expect(meetingSchedulerClientId(input)).toBe(expected);
  });
});
