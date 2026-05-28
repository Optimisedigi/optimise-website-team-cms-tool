import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
};

const mockPut = vi.fn(async () => ({ url: "https://blob.test/signed.pdf" }));
const mockGenerateContractPdf = vi.fn(async () => Buffer.from("pdf"));
const mockLogActivity = vi.fn(async () => undefined);
const mockGenerateCompletionEmail = vi.fn(() => "<p>complete</p>");
const mockSyncContractToClient = vi.fn(async () => ({ ok: true }));

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => mockPut(...args),
}));

vi.mock("@/lib/contract-pdf", () => ({
  generateContractPdf: (...args: unknown[]) => mockGenerateContractPdf(...args),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

vi.mock("@/lib/contract-email", () => ({
  generateCompletionEmail: (...args: unknown[]) => mockGenerateCompletionEmail(...args),
}));

vi.mock("@/lib/contract-to-client-sync", () => ({
  syncContractToClient: (...args: unknown[]) => mockSyncContractToClient(...args),
}));

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/contracts/sign/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(): NextRequest {
  return new NextRequest("http://localhost/api/contracts/sign/token");
}

function sentContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123,
    status: "sent",
    signingToken: "token",
    signingTokenExpiresAt: "2999-01-01T00:00:00.000Z",
    contractTitle: "Growth Agreement",
    client: 42,
    clientName: "Acme Pty Ltd",
    clientContactName: "Ada Lovelace",
    clientEmail: "signer@example.com, finance@example.com",
    clientWebsite: "https://example.com",
    contractDate: "2026-05-01",
    contractStartDate: "2026-06-01",
    monthlyRetainer: 2500,
    setupFee: 750,
    currency: "AUD",
    additionalWork: [{ projectName: "Landing page", amount: 1200, countTowardsRetainer: false }],
    agencyContactName: "Optimise",
    agencyContactEmail: "team@optimisedigital.online",
    agencySignerName: "Agency Signer",
    agencySignerTitle: "Director",
    agencySignature: { url: "https://assets.test/signature.png", mimeType: "image/png" },
    agencySignedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("contract signing route regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BREVO_API_KEY;
  });

  it("rejects missing sign tokens without updating contracts or clients", async () => {
    const { GET, POST } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });

    const getRes = await GET(getRequest(), { params: Promise.resolve({ token: "missing" }) });
    const postRes = await POST(postRequest({ signature: "data:image/png;base64,abc", signerName: "Ada" }), {
      params: Promise.resolve({ token: "missing" }),
    });

    expect(getRes.status).toBe(404);
    expect(postRes.status).toBe(404);
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockSyncContractToClient).not.toHaveBeenCalled();
  });

  it.each([
    ["draft", "This contract is not available for signing"],
    ["rejected", "This contract is not available for signing"],
  ])("does not allow %s contracts to be signed", async (status, error) => {
    const { POST } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [sentContract({ status })] });

    const res = await POST(postRequest({ signature: "data:image/png;base64,abc", signerName: "Ada" }), {
      params: Promise.resolve({ token: "token" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error });
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockSyncContractToClient).not.toHaveBeenCalled();
  });

  it("treats completed contracts as idempotent already-signed responses without re-updating", async () => {
    const { GET, POST } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    const completed = sentContract({
      status: "completed",
      signedPdfUrl: "https://blob.test/already.pdf",
    });
    mockPayload.find.mockResolvedValue({ totalDocs: 1, docs: [completed] });

    const getRes = await GET(getRequest(), { params: Promise.resolve({ token: "token" }) });
    const postRes = await POST(postRequest({ signature: "data:image/png;base64,abc", signerName: "Ada" }), {
      params: Promise.resolve({ token: "token" }),
    });
    const getJson = await getRes.json();

    expect(getRes.status).toBe(400);
    expect(getJson).toMatchObject({
      error: "This contract has already been signed",
      completed: true,
      signedPdfUrl: "https://blob.test/already.pdf",
    });
    expect(postRes.status).toBe(400);
    await expect(postRes.json()).resolves.toEqual({ error: "This contract is not available for signing" });
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockSyncContractToClient).not.toHaveBeenCalled();
  });

  it("rejects expired sent tokens before any update side effects", async () => {
    const { POST } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    mockPayload.find.mockResolvedValueOnce({
      totalDocs: 1,
      docs: [sentContract({ signingTokenExpiresAt: "2000-01-01T00:00:00.000Z" })],
    });

    const res = await POST(postRequest({ signature: "data:image/png;base64,abc", signerName: "Ada" }), {
      params: Promise.resolve({ token: "token" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Signing link expired" });
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(mockSyncContractToClient).not.toHaveBeenCalled();
  });

  it("completes a sent contract once, syncs only the linked client, and never trusts a client id from the request body", async () => {
    const { POST } = await import("@/app/(frontend)/api/contracts/sign/[token]/route");
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    const original = sentContract();
    const updated = sentContract({
      clientEmail: "signer@example.com",
      clientSignature: "data:image/png;base64,abc",
      clientSignedAt: "2026-06-02T00:00:00.000Z",
      status: "completed",
    });
    mockPayload.find.mockResolvedValueOnce({ totalDocs: 1, docs: [original] });
    mockPayload.update.mockResolvedValue({});
    mockPayload.findByID.mockResolvedValueOnce(updated);

    const res = await POST(
      postRequest({
        signature: "data:image/png;base64,abc",
        signerName: "Ada Lovelace",
        signerTitle: "Owner",
        clientEmail: "signer@example.com",
        client: 999,
        status: "rejected",
        signedPdfUrl: "https://attacker.test/evil.pdf",
        signingDate: "2026-06-02T00:00:00.000Z",
      }),
      { params: Promise.resolve({ token: "token" }) },
    );

    expect(res.status).toBe(200);
    const contractUpdate = mockPayload.update.mock.calls.find(
      ([arg]) => arg.collection === "contracts" && arg.data.status === "completed",
    )?.[0];
    expect(contractUpdate).toMatchObject({
      collection: "contracts",
      id: 123,
      overrideAccess: true,
      data: {
        clientSignature: "data:image/png;base64,abc",
        clientSignerName: "Ada Lovelace",
        clientTitle: "Owner",
        clientEmail: "signer@example.com",
        clientSignedIp: "203.0.113.10",
        status: "completed",
      },
    });
    expect(contractUpdate.data).not.toHaveProperty("client");
    expect(contractUpdate.data).not.toHaveProperty("signedPdfUrl", "https://attacker.test/evil.pdf");

    expect(mockSyncContractToClient).toHaveBeenCalledOnce();
    expect(mockSyncContractToClient.mock.calls[0][1]).toMatchObject({
      id: 123,
      client: 42,
      clientEmail: "signer@example.com",
      signedPdfUrl: undefined,
    });

    const clientUpdates = mockPayload.update.mock.calls.filter(([arg]) => arg.collection === "clients");
    expect(clientUpdates).toHaveLength(1);
    expect(clientUpdates[0][0]).toMatchObject({
      collection: "clients",
      id: 42,
      data: { signedContractUrl: "https://blob.test/signed.pdf" },
      overrideAccess: true,
    });
    expect(JSON.stringify(mockPayload.update.mock.calls)).not.toContain("999");
  });
});
