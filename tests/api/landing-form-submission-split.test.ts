import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `form_submit` carries two unrelated intents: the qualification form (a lead)
 * and the readiness-checklist PDF (an email capture). Pooled together they are
 * indistinguishable in the funnel, so a checklist campaign can read as lead
 * volume. These tests pin the split.
 */

const drizzleRun = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }));
const payloadMock = {
  find: vi.fn(),
  auth: vi.fn(async () => ({ user: null })),
  db: { drizzle: { run: drizzleRun } },
};

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (token: string | undefined) => token === "valid-token",
}));

import { GET } from "@/app/(frontend)/api/dashboard/landing-experiments/route";

function request(params: string) {
  return new NextRequest(`http://localhost/api/dashboard/landing-experiments?${params}`, {
    headers: { cookie: "dashboard_token=valid-token" },
  });
}

function submit(sessionId: string, formId: string | null, variantId = "a") {
  return {
    eventType: "form_submit",
    sessionId,
    variantId,
    ...(formId === null ? {} : { properties: { form_id: formId } }),
  };
}

function mockEvents(docs: Record<string, unknown>[]) {
  payloadMock.find
    .mockResolvedValueOnce({ docs: [{ id: 42, slug: "away-digital" }] })
    // The property lookup: no reporting baseline, so the selected range stands.
    .mockResolvedValueOnce({ docs: [{ dataStartDate: null }] })
    .mockResolvedValueOnce({
      docs: [
        {
          experimentId: "landing-hero-v1",
          name: "Hero test",
          status: "running",
          allocationVersion: "1",
          primaryGoal: "booking_complete",
          variants: [{ variantId: "a" }, { variantId: "b" }],
        },
      ],
    })
    .mockResolvedValueOnce({
      docs: docs.map((event) => ({ attribution: { gclid: "test-click" }, ...event })),
      hasNextPage: false,
    });
}

beforeEach(() => {
  payloadMock.find.mockReset();
  drizzleRun.mockReset();
  drizzleRun.mockResolvedValue({ rows: [] });
});

describe("form_submit split by form_id", () => {
  it("reports checklist downloads separately from qualification submits", async () => {
    mockEvents([
      // Each step clamps to the one before it, so every session needs the whole
      // journey up to the submit for the pooled step to read 5.
      ...["s1", "s2", "s3", "s4", "s5"].flatMap((sessionId) =>
        ["page_view", "cta_click", "form_start"].map((eventType) => ({
          eventType,
          sessionId,
          variantId: "a",
        }))
      ),
      submit("s1", "qualification"),
      submit("s2", "qualification"),
      submit("s3", "readiness-checklist"),
      submit("s4", "readiness-checklist"),
      submit("s5", "readiness-checklist"),
    ]);

    const res = await GET(request("slug=away-digital&days=30"));
    expect(res.status).toBe(200);
    const body = await res.json();

    const byId = Object.fromEntries(
      body.formSubmissions.map((f: { formId: string; sessions: number }) => [f.formId, f.sessions])
    );
    expect(byId).toEqual({ qualification: 2, "readiness-checklist": 3 });

    // The pooled funnel step still counts every submitting session, so the
    // split explains that number rather than contradicting it.
    const step = body.funnel.find((s: { key: string }) => s.key === "form_submit");
    expect(step.sessions).toBe(5);
  });

  it("counts a session once however many times it submits the same form", async () => {
    mockEvents([
      submit("s1", "readiness-checklist"),
      submit("s1", "readiness-checklist"),
      submit("s1", "readiness-checklist"),
    ]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    expect(body.formSubmissions).toEqual([
      { formId: "readiness-checklist", label: "Readiness checklist (PDF)", sessions: 1 },
    ]);
  });

  it("counts one session against both forms when it submits each", async () => {
    mockEvents([submit("s1", "qualification"), submit("s1", "readiness-checklist")]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    const byId = Object.fromEntries(
      body.formSubmissions.map((f: { formId: string; sessions: number }) => [f.formId, f.sessions])
    );
    expect(byId).toEqual({ qualification: 1, "readiness-checklist": 1 });
  });

  it("labels the known forms and sorts the busiest first", async () => {
    mockEvents([
      submit("s1", "qualification"),
      submit("s2", "readiness-checklist"),
      submit("s3", "readiness-checklist"),
    ]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    expect(body.formSubmissions).toEqual([
      { formId: "readiness-checklist", label: "Readiness checklist (PDF)", sessions: 2 },
      { formId: "qualification", label: "Qualification form", sessions: 1 },
    ]);
  });

  it("surfaces a submit with no form_id instead of dropping it", async () => {
    mockEvents([submit("s1", null), submit("s2", "qualification")]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    const unset = body.formSubmissions.find((f: { formId: string }) => f.formId === "(unset)");
    expect(unset).toEqual({ formId: "(unset)", label: "Unlabelled form", sessions: 1 });
  });

  it("shows an unrecognised form_id under its own id rather than pooling it", async () => {
    mockEvents([submit("s1", "newsletter-signup")]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    expect(body.formSubmissions).toEqual([
      { formId: "newsletter-signup", label: "newsletter-signup", sessions: 1 },
    ]);
  });

  it("returns an empty split when no form was submitted", async () => {
    mockEvents([{ eventType: "page_view", sessionId: "s1", variantId: "a" }]);

    const body = await (await GET(request("slug=away-digital&days=30"))).json();
    expect(body.formSubmissions).toEqual([]);
  });
});
