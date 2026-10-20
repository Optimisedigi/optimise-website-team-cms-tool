import { describe, expect, it } from "vitest";
import {
  buildInviteReplyIcs,
  buildInviteReplyMime,
  parseCalendarInvite,
  pickThreadInvite,
} from "@/lib/mail/calendar-invite";

const CALENDLY = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "DTSTART:20261026T230000Z",
  "DTEND:20261026T231500Z",
  "DTSTAMP:20261020T103400Z",
  "ORGANIZER;CN=Carli Markunsky:mailto:carli@inthepicture.com.au",
  "UID:abc123@google.com",
  "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Carli M",
  " arkunsky:mailto:carli@inthepicture.com.au",
  'ATTENDEE;PARTSTAT=NEEDS-ACTION;CN="Peter QA Test":mailto:peter+ia-live@optimisedigital.online',
  "SEQUENCE:2",
  "SUMMARY:Peter QA Test and Carli Markunsky",
  "LOCATION:https://us02web.zoom.us/j/85740705813",
  "BEGIN:VALARM",
  "SUMMARY:Alarm notification",
  "TRIGGER:-P0DT0H30M0S",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const SELF = ["peter@optimisedigital.online"];

describe("parseCalendarInvite", () => {
  it("reads a Calendly/Google invite, unfolding lines and ignoring the alarm", () => {
    const invite = parseCalendarInvite(CALENDLY);
    expect(invite).toMatchObject({
      method: "REQUEST",
      uid: "abc123@google.com",
      summary: "Peter QA Test and Carli Markunsky",
      start: "2026-10-26T23:00:00.000Z",
      end: "2026-10-26T23:15:00.000Z",
      allDay: false,
      location: "https://us02web.zoom.us/j/85740705813",
      organizer: { name: "Carli Markunsky", email: "carli@inthepicture.com.au" },
      sequence: "2",
    });
    expect(invite?.attendees).toEqual([
      { name: "Carli Markunsky", email: "carli@inthepicture.com.au", status: "accepted" },
      { name: "Peter QA Test", email: "peter+ia-live@optimisedigital.online", status: "needsAction" },
    ]);
  });

  it("converts TZID times and all-day dates", () => {
    const tz = parseCalendarInvite(
      "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nDTSTART;TZID=Australia/Sydney:20261027T100000\nDTEND;TZID=Australia/Sydney:20261027T101500\nEND:VEVENT\nEND:VCALENDAR",
    );
    expect(tz?.start).toBe("2026-10-26T23:00:00.000Z");
    const allDay = parseCalendarInvite("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:y\nDTSTART;VALUE=DATE:20261027\nEND:VEVENT\nEND:VCALENDAR");
    expect(allDay).toMatchObject({ allDay: true, start: "2026-10-27T00:00:00.000Z", summary: "(no title)" });
  });

  it("treats a cancelled status as a cancellation and rejects non-events", () => {
    expect(parseCalendarInvite(CALENDLY.replace("SEQUENCE:2", "STATUS:CANCELLED"))?.method).toBe("CANCEL");
    expect(parseCalendarInvite("BEGIN:VCALENDAR\nEND:VCALENDAR")).toBeNull();
  });
});

describe("pickThreadInvite", () => {
  it("lets the owner respond and matches them despite the +tag", () => {
    const picked = pickThreadInvite([{ messageId: "m1", from: "carli@inthepicture.com.au", calendarIcs: CALENDLY }], SELF);
    expect(picked).toMatchObject({ messageId: "m1", selfStatus: "needsAction", canRespond: true });
    expect(picked?.invite).not.toHaveProperty("raw");
  });

  it("takes the owner's status from their own emailed reply", () => {
    const invite = parseCalendarInvite(CALENDLY);
    if (!invite) throw new Error("parse failed");
    const reply = buildInviteReplyIcs(invite, { name: "Peter", email: "peter+ia-live@optimisedigital.online" }, "tentative", new Date(0));
    const picked = pickThreadInvite(
      [
        { messageId: "m1", from: "carli", calendarIcs: CALENDLY },
        { messageId: "m2", from: "peter", calendarIcs: reply },
      ],
      SELF,
    );
    expect(picked).toMatchObject({ messageId: "m1", selfStatus: "tentative" });
  });

  it("does not offer Yes/No/Maybe on the owner's own invite", () => {
    const own = CALENDLY.replace("mailto:carli@inthepicture.com.au\r\nUID", "mailto:peter@optimisedigital.online\r\nUID");
    expect(pickThreadInvite([{ messageId: "m1", from: "", calendarIcs: own }], SELF)?.canRespond).toBe(false);
  });
});

describe("invite replies", () => {
  it("builds an iTIP REPLY echoing the event and the chosen PARTSTAT", () => {
    const invite = parseCalendarInvite(CALENDLY);
    if (!invite) throw new Error("parse failed");
    const ics = buildInviteReplyIcs(invite, { name: "Peter", email: "peter+ia-live@optimisedigital.online" }, "accepted", new Date("2026-10-20T10:00:00Z"));
    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("UID:abc123@google.com");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("DTSTAMP:20261020T100000Z");
    expect(ics).toContain("ORGANIZER;CN=Carli Markunsky:mailto:carli@inthepicture.com.au");
    expect(ics.replace(/\r\n /g, "")).toContain('ATTENDEE;PARTSTAT=ACCEPTED;CN="Peter":mailto:peter+ia-live@optimisedigital.online');
  });

  it("wraps the reply in a threaded text/calendar email without header injection", () => {
    const invite = parseCalendarInvite(CALENDLY);
    if (!invite) throw new Error("parse failed");
    const raw = buildInviteReplyMime({
      to: "carli@inthepicture.com.au\r\nBcc: x@evil.test",
      invite,
      attendee: { name: "Peter", email: "peter@optimisedigital.online" },
      response: "declined",
      inReplyTo: "<id@mail>",
      now: new Date(0),
    });
    const mime = Buffer.from(raw, "base64url").toString("utf-8");
    expect(mime).toContain("Subject: Declined: Peter QA Test and Carli Markunsky");
    expect(mime).toContain("In-Reply-To: <id@mail>");
    expect(mime).toContain('Content-Type: text/calendar; charset="UTF-8"; method=REPLY');
    expect(mime).not.toMatch(/^Bcc:/m);
  });
});
