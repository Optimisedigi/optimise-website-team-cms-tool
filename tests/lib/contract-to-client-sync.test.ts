import { syncContractToClient } from "@/lib/contract-to-client-sync";

function createMockPayload(clientDoc: Record<string, unknown> | null) {
  return {
    findByID: vi.fn().mockResolvedValue(clientDoc),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({ id: "log-1" }),
  };
}

describe("syncContractToClient", () => {
  it("copies all contract values onto an empty client", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      monthlyRetainer: 1500,
      setupFee: 1000,
      contractStartDate: "2026-06-01",
      additionalWork: [
        { projectName: "Website build", amount: 5000, countTowardsRetainer: false },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toEqual({
      monthlyRetainer: true,
      setupFee: true,
      clientStartDate: true,
      additionalWorkAppended: 1,
      name: false,
      tradingName: false,
      contactName: false,
      contactEmail: false,
      websiteUrl: false,
      signedContract: true,
      signedContractUrl: false,
    });
    expect(payload.update).toHaveBeenCalledOnce();
    const call = payload.update.mock.calls[0][0];
    expect(call.id).toBe(42);
    expect(call.data.monthlyRetainer).toBe(1500);
    expect(call.data.setupFee).toBe(1000);
    expect(call.data.clientStartDate).toBe("2026-06-01");
    expect(call.data.oneOffProjects).toEqual([
      {
        projectName: "Website build",
        amount: 5000,
        date: "2026-06-01",
        countTowardsRetainer: false,
      },
    ]);
  });

  it("overwrites monthlyRetainer when contract has a different non-zero value (history preserved via Clients hook)", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 1000,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      monthlyRetainer: 1500,
    });

    expect(result.applied.monthlyRetainer).toBe(true);
    const call = payload.update.mock.calls[0]?.[0];
    expect(call?.data.monthlyRetainer).toBe(1500);
    // The retainerHistory append is the Clients collection's responsibility
    // (its beforeChange hook), not this sync function's — we just write the
    // new value and let the existing hook record the change.
  });

  it("does not touch monthlyRetainer when contract value matches client", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 1500,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      monthlyRetainer: 1500,
    });

    expect(result.applied.monthlyRetainer).toBe(false);
    const call = payload.update.mock.calls[0]?.[0];
    expect(call?.data.monthlyRetainer).toBeUndefined();
  });

  it("does not overwrite existing setupFee and logs a warning", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 0,
      setupFee: 500,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      setupFee: 1000,
    });

    expect(result.applied.setupFee).toBe(false);
    expect(result.warnings.some((w) => w.includes("setupFee"))).toBe(true);
  });

  it("appends additionalWork rows to existing oneOffProjects", async () => {
    const existing = [
      { projectName: "Existing", amount: 100, date: "2026-01-01", countTowardsRetainer: false },
    ];
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: existing,
    });

    await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      contractStartDate: "2026-06-01",
      additionalWork: [
        { projectName: "New Build", amount: 2000, countTowardsRetainer: true },
      ],
    });

    const call = payload.update.mock.calls[0][0];
    expect(call.data.oneOffProjects).toHaveLength(2);
    expect(call.data.oneOffProjects[0]).toEqual(existing[0]);
    expect(call.data.oneOffProjects[1]).toMatchObject({
      projectName: "New Build",
      amount: 2000,
      date: "2026-06-01",
      countTowardsRetainer: true,
    });
  });

  it("does not duplicate additionalWork rows that already exist on the client", async () => {
    // Re-running the sync (e.g. signing then a later contract update, or the
    // convert-to-client hook firing it again) must not double-write rows.
    const existing = [
      {
        projectName: "Website + CRM build",
        amount: 16000,
        date: "2026-05-19T00:00:00.000Z",
        countTowardsRetainer: false,
      },
    ];
    const payload = createMockPayload({
      id: 9,
      monthlyRetainer: 4600,
      setupFee: 0,
      clientStartDate: "2026-05-19",
      oneOffProjects: existing,
    });

    const result = await syncContractToClient(payload as any, {
      id: 12,
      client: 9,
      contractStartDate: "2026-05-19",
      additionalWork: [
        { projectName: "Website + CRM build", amount: 16000, countTowardsRetainer: false },
      ],
    });

    // The sync may still update other fields (e.g. signedContract), but the
    // oneOffProjects payload must not be touched when every row is already
    // present.
    expect(result.applied.additionalWorkAppended).toBe(0);
    if (payload.update.mock.calls.length > 0) {
      const call = payload.update.mock.calls[0][0];
      expect("oneOffProjects" in call.data).toBe(false);
    }
  });

  it("dedupes case-insensitively and ignores leading/trailing whitespace", async () => {
    const existing = [
      {
        projectName: "Website + CRM build",
        amount: 16000,
        date: "2026-05-19T00:00:00.000Z",
        countTowardsRetainer: false,
      },
    ];
    const payload = createMockPayload({
      id: 9,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: existing,
    });

    await syncContractToClient(payload as any, {
      id: 12,
      client: 9,
      contractStartDate: "2026-05-19",
      additionalWork: [
        // Same project as existing, just with a different casing / whitespace.
        { projectName: "  website + crm BUILD ", amount: 16000, countTowardsRetainer: false },
        // Genuinely new row — must still come through.
        { projectName: "SEO sprint", amount: 3000, countTowardsRetainer: false },
      ],
    });

    const call = payload.update.mock.calls[0][0];
    expect(call.data.oneOffProjects).toHaveLength(2);
    expect(call.data.oneOffProjects[0]).toEqual(existing[0]);
    expect(call.data.oneOffProjects[1]).toMatchObject({
      projectName: "SEO sprint",
      amount: 3000,
    });
  });

  it("falls back to current ISO date for additionalWork when contractStartDate missing", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      additionalWork: [{ projectName: "Audit", amount: 500 }],
    });

    const call = payload.update.mock.calls[0][0];
    const row = call.data.oneOffProjects[0];
    expect(row.projectName).toBe("Audit");
    expect(typeof row.date).toBe("string");
    expect(row.date.length).toBeGreaterThan(0);
    expect(row.countTowardsRetainer).toBe(false);
  });

  it("copies contact details (name, contactName, contactEmail, websiteUrl) onto an empty client", async () => {
    const payload = createMockPayload({
      id: 42,
      name: "",
      contactName: "",
      contactEmail: "",
      websiteUrl: "",
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      clientName: "Acme Corp",
      clientContactName: "Jane Doe",
      clientEmail: "jane@acme.com, ops@acme.com",
      clientWebsite: "https://acme.com",
    });

    expect(result.ok).toBe(true);
    expect(result.applied.name).toBe(true);
    expect(result.applied.contactName).toBe(true);
    expect(result.applied.contactEmail).toBe(true);
    expect(result.applied.websiteUrl).toBe(true);
    const call = payload.update.mock.calls[0][0];
    expect(call.data.name).toBe("Acme Corp");
    expect(call.data.contactName).toBe("Jane Doe");
    // Only the first email (the signer) is copied; CCs ignored.
    expect(call.data.contactEmail).toBe("jane@acme.com");
    expect(call.data.websiteUrl).toBe("https://acme.com");
  });

  it("does not overwrite existing contact details", async () => {
    const payload = createMockPayload({
      id: 42,
      name: "Existing Co",
      contactName: "Bob",
      contactEmail: "bob@existing.com",
      websiteUrl: "https://existing.com",
      // signedContract already linked -> backfill is also a no-op below.
      signedContract: 99,
      signedContractUrl: "https://blob/existing.pdf",
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      clientName: "Acme Corp",
      clientContactName: "Jane Doe",
      clientEmail: "jane@acme.com",
      clientWebsite: "https://acme.com",
      signedPdfUrl: "https://blob/new.pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.applied.name).toBe(false);
    expect(result.applied.contactName).toBe(false);
    expect(result.applied.contactEmail).toBe(false);
    expect(result.applied.websiteUrl).toBe(false);
    expect(result.applied.signedContract).toBe(false);
    expect(result.applied.signedContractUrl).toBe(false);
    // Nothing to update -> update should not be called at all
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("falls back to contractDate for clientStartDate when contractStartDate is blank", async () => {
    const payload = createMockPayload({
      id: 42,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      contractStartDate: null,
      contractDate: "2026-05-18",
    });

    expect(result.applied.clientStartDate).toBe(true);
    const call = payload.update.mock.calls[0][0];
    expect(call.data.clientStartDate).toBe("2026-05-18");
  });

  it("backfills signedContract + signedContractUrl on the client when missing", async () => {
    const payload = createMockPayload({
      id: 42,
      name: "Existing Co",
      monthlyRetainer: 1500,
      setupFee: 500,
      signedContract: null,
      signedContractUrl: null,
      oneOffProjects: [],
    });

    const result = await syncContractToClient(payload as any, {
      id: 99,
      client: 42,
      signedPdfUrl: "https://blob/signed-99.pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.applied.signedContract).toBe(true);
    expect(result.applied.signedContractUrl).toBe(true);
    const call = payload.update.mock.calls[0][0];
    expect(call.data.signedContract).toBe(99);
    expect(call.data.signedContractUrl).toBe("https://blob/signed-99.pdf");
  });

  it("skips sync when contract has no linked client", async () => {
    const payload = createMockPayload(null);
    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: null,
      monthlyRetainer: 1000,
    });
    expect(result.ok).toBe(true);
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("resolves populated client objects to ids", async () => {
    const payload = createMockPayload({
      id: 7,
      monthlyRetainer: 0,
      setupFee: 0,
      clientStartDate: null,
      oneOffProjects: [],
    });
    await syncContractToClient(payload as any, {
      id: 1,
      client: { id: 7 },
      setupFee: 250,
    });
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
  });

  it("catches errors and returns ok=false", async () => {
    const payload = {
      findByID: vi.fn().mockRejectedValue(new Error("db down")),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    };
    const result = await syncContractToClient(payload as any, {
      id: 1,
      client: 42,
      monthlyRetainer: 1000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("db down");
  });
});
