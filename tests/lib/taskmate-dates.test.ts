import { describe, expect, it } from "vitest";
import { buildTaskMateDateContext, mondayOf, resolveTaskMateToday, todayInTimeZone } from "@/lib/agents/taskmate/dates";

describe("TaskMate dates", () => {
  it("lists this week, next week, and two weeks from now as Monday-Sunday weeks", () => {
    // Saturday: next week is the coming Monday, two weeks from now the Monday after.
    const context = buildTaskMateDateContext("2026-10-24");
    expect(context).toContain("Today is Saturday 2026-10-24.");
    expect(context).toContain("- This week: Monday 2026-10-19 to Sunday 2026-10-25");
    expect(context).toContain("- Next week: Monday 2026-10-26 to Sunday 2026-11-01");
    expect(context).toContain("- Two weeks from now (the week after next): Monday 2026-11-02 to Sunday 2026-11-08");
    expect(context).toMatch(/never ask the admin to confirm/);
  });

  it("treats Monday and Sunday as the edges of the same week", () => {
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(buildTaskMateDateContext("2026-11-01")).toContain("- Next week: Monday 2026-11-02 to Sunday 2026-11-08");
  });

  it("uses the browser's date when plausible, else today in the team's time zone", () => {
    const now = new Date("2026-10-24T20:00:00Z"); // Sunday 25 Oct in Sydney
    expect(resolveTaskMateToday("2026-10-25", now)).toBe("2026-10-25");
    expect(resolveTaskMateToday("2026-10-24", now)).toBe("2026-10-24");
    expect(resolveTaskMateToday("2027-01-01", now)).toBe("2026-10-25");
    expect(resolveTaskMateToday("2026-02-30", now)).toBe("2026-10-25");
    expect(resolveTaskMateToday(undefined, now)).toBe("2026-10-25");
    expect(todayInTimeZone(now, "UTC")).toBe("2026-10-24");
  });
});
