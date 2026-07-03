import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
};

const { mockGetValidGmailToken, mockCreateGmailDraft } = vi.hoisted(() => ({
  mockGetValidGmailToken: vi.fn(),
  mockCreateGmailDraft: vi.fn(),
}));

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: mockGetValidGmailToken,
}));

vi.mock("@/lib/gmail-service", () => ({
  createGmailDraft: mockCreateGmailDraft,
}));

import { POST } from "@/app/(frontend)/api/google-ads-audits/[id]/gmail-draft/route";

function request(body: unknown): NextRequest {
  return new NextRequest("https://cms.example/api/google-ads-audits/123/gmail-draft", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google Ads campaign proposal Gmail draft route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.auth.mockResolvedValue({ user: { id: 7 } });
    mockPayload.findByID.mockResolvedValue({
      id: 123,
      businessName: "Acme Plumbing",
      contactEmail: "owner@acme.test",
      campaignProposalEmailHtml: "<p>Stored proposal</p>",
    });
    mockGetValidGmailToken.mockResolvedValue({ ok: true, accessToken: "gmail-token" });
    mockCreateGmailDraft.mockResolvedValue({ draftId: "draft-1", messageId: "msg-1" });
  });

  it("creates a Gmail draft with the exact campaign proposal subject and raw HTML body", async () => {
    const htmlBody = "<div><h2>Campaign structure</h2><table><tr><td>Brand</td></tr></table></div>";

    const response = await POST(request({ htmlBody }), {
      params: Promise.resolve({ id: "123" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockPayload.findByID).toHaveBeenCalledWith({
      collection: "google-ads-audits",
      id: "123",
    });
    expect(mockGetValidGmailToken).toHaveBeenCalledWith(7);
    expect(mockCreateGmailDraft).toHaveBeenCalledWith("gmail-token", {
      to: "owner@acme.test",
      subject: "[Acme Plumbing] campaign structure proposal",
      htmlBody,
    });
    expect(json).toMatchObject({
      draftId: "draft-1",
      messageId: "msg-1",
      gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg-1",
      subject: "[Acme Plumbing] campaign structure proposal",
      to: "owner@acme.test",
    });
  });
});
