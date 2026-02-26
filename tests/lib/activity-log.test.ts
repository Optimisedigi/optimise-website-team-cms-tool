import { logActivity } from "@/lib/activity-log";

describe("logActivity", () => {
  function createMockPayload() {
    return {
      create: vi.fn().mockResolvedValue({ id: "new-entry" }),
    };
  }

  it("calls payload.create with the activity-log collection", async () => {
    const mockPayload = createMockPayload();

    await logActivity(mockPayload as any, {
      type: "blog_published",
      title: "New blog post",
    });

    expect(mockPayload.create).toHaveBeenCalledOnce();
    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "activity-log",
      data: {
        type: "blog_published",
        title: "New blog post",
      },
    });
  });

  it("passes optional description field", async () => {
    const mockPayload = createMockPayload();

    await logActivity(mockPayload as any, {
      type: "seo_audit_completed",
      title: "SEO Audit",
      description: "Completed for client X",
    });

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Completed for client X",
        }),
      }),
    );
  });

  it("passes optional user field", async () => {
    const mockPayload = createMockPayload();

    await logActivity(mockPayload as any, {
      type: "client_added",
      title: "Added client",
      user: 42,
    });

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user: 42 }),
      }),
    );
  });

  it("passes optional client field", async () => {
    const mockPayload = createMockPayload();

    await logActivity(mockPayload as any, {
      type: "retainer_changed",
      title: "Retainer changed",
      client: "client-123",
    });

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ client: "client-123" }),
      }),
    );
  });

  it("passes all fields together", async () => {
    const mockPayload = createMockPayload();

    await logActivity(mockPayload as any, {
      type: "proposal_created",
      title: "Proposal for Acme",
      description: "SEO proposal",
      user: 1,
      client: "acme-id",
    });

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "activity-log",
      data: {
        type: "proposal_created",
        title: "Proposal for Acme",
        description: "SEO proposal",
        user: 1,
        client: "acme-id",
      },
    });
  });

  it("returns void (resolves with undefined)", async () => {
    const mockPayload = createMockPayload();

    const result = await logActivity(mockPayload as any, {
      type: "time_tracked",
      title: "Logged time",
    });

    expect(result).toBeUndefined();
  });

  it("propagates errors from payload.create", async () => {
    const mockPayload = {
      create: vi.fn().mockRejectedValue(new Error("DB error")),
    };

    await expect(
      logActivity(mockPayload as any, {
        type: "gsc_snapshot",
        title: "Snapshot failed",
      }),
    ).rejects.toThrow("DB error");
  });

  it("works with all activity types", async () => {
    const types = [
      "blog_published",
      "seo_audit_completed",
      "cro_audit_completed",
      "keyword_analysis",
      "client_added",
      "retainer_changed",
      "proposal_created",
      "gsc_snapshot",
      "time_tracked",
      "google_ads_audit_created",
      "google_ads_proposal_created",
    ] as const;

    for (const type of types) {
      const mockPayload = createMockPayload();
      await logActivity(mockPayload as any, {
        type,
        title: `Activity: ${type}`,
      });
      expect(mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type }),
        }),
      );
    }
  });
});
