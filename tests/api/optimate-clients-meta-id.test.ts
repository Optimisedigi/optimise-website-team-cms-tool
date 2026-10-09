import { beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ find })) }));
vi.mock("@/payload.config", () => ({ default: {} }));

describe("GET /api/optimate/clients", () => {
  beforeEach(() => {
    vi.resetModules();
    find.mockReset();
    process.env.CMS_API_KEY = "test-key";
  });

  it("returns each client's Meta Ad account ID", async () => {
    find.mockResolvedValue({
      docs: [
        {
          id: 12,
          name: "Example client",
          slug: "example-client",
          metaAdAccountId: "act_123456789",
        },
      ],
    });
    const { GET } = await import("@/app/(frontend)/api/optimate/clients/route");
    const response = await GET(
      new Request("http://localhost/api/optimate/clients", {
        headers: { "x-api-key": "test-key" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ metaAdAccountId: "act_123456789" }),
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ metaAdAccountId: true }) }),
    );
  });

  describe("targetCustomer", () => {
    function mockFind(clientDoc: Record<string, unknown>, briefingDocs: unknown[]) {
      find.mockImplementation(async (args: { collection: string }) => {
        if (args.collection === "clients") {
          return { docs: [{ id: 12, name: "Example client", slug: "example-client", ...clientDoc }] };
        }
        if (args.collection === "client-discovery-briefings") return { docs: briefingDocs };
        throw new Error(`unexpected collection ${args.collection}`);
      });
    }

    async function getClients() {
      const { GET } = await import("@/app/(frontend)/api/optimate/clients/route");
      const response = await GET(
        new Request("http://localhost/api/optimate/clients", {
          headers: { "x-api-key": "test-key" },
        }),
      );
      expect(response.status).toBe(200);
      return response.json();
    }

    it("prefers the Business tab value", async () => {
      mockFind(
        { targetCustomer: "Business tab answer", gadsAuto: { triageIdealCustomer: "Triage answer" } },
        [{ client: 12, data: { idealClient: "Briefing answer" } }],
      );
      expect(await getClients()).toEqual([
        expect.objectContaining({ targetCustomer: "Business tab answer" }),
      ]);
    });

    it("uses the newest discovery briefing when the Business tab is empty", async () => {
      mockFind(
        { targetCustomer: "  ", gadsAuto: { triageIdealCustomer: "Triage answer" } },
        [
          { client: 12, data: { idealClient: "Briefing answer" } },
          { client: 12, data: { idealClient: "Older briefing" } },
        ],
      );
      expect(await getClients()).toEqual([
        expect.objectContaining({ targetCustomer: "Briefing answer" }),
      ]);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "client-discovery-briefings",
          where: { client: { in: [12] } },
          sort: "-updatedAt",
        }),
      );
    });

    it("uses Google Ads triage when the Business tab and briefing are empty", async () => {
      mockFind({ targetCustomer: null, gadsAuto: { triageIdealCustomer: "Triage answer" } }, [
        { client: 12, data: { idealClient: "" } },
      ]);
      expect(await getClients()).toEqual([
        expect.objectContaining({ targetCustomer: "Triage answer" }),
      ]);
    });

    it("returns null when all three sources are empty", async () => {
      mockFind({ targetCustomer: "", gadsAuto: { triageIdealCustomer: " " } }, []);
      expect(await getClients()).toEqual([expect.objectContaining({ targetCustomer: null })]);
    });

    it("selects targetCustomer and the triage field from clients", async () => {
      mockFind({}, []);
      await getClients();
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "clients",
          select: expect.objectContaining({
            targetCustomer: true,
            gadsAuto: { triageIdealCustomer: true },
          }),
        }),
      );
    });

    it("returns businessType, targetLocation and conversionGoal unchanged when set", async () => {
      mockFind(
        {
          businessType: "trades",
          targetLocation: "North Sydney, Australia",
          conversionGoal: "phone calls",
        },
        [],
      );
      expect(await getClients()).toEqual([
        expect.objectContaining({
          businessType: "trades",
          targetLocation: "North Sydney, Australia",
          conversionGoal: "phone calls",
        }),
      ]);
    });

    it("returns null for missing businessType/conversionGoal and blank targetLocation", async () => {
      mockFind({ targetLocation: " \n\t " }, []);
      expect(await getClients()).toEqual([
        expect.objectContaining({ businessType: null, targetLocation: null, conversionGoal: null }),
      ]);
    });

    it("collapses whitespace in targetLocation", async () => {
      mockFind({ targetLocation: "  North   Sydney,\n Australia " }, []);
      expect(await getClients()).toEqual([
        expect.objectContaining({ targetLocation: "North Sydney, Australia" }),
      ]);
    });

    it("selects businessType, targetLocation and conversionGoal from clients", async () => {
      mockFind({}, []);
      await getClients();
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "clients",
          select: expect.objectContaining({
            businessType: true,
            targetLocation: true,
            conversionGoal: true,
          }),
        }),
      );
    });

    it("falls back to the other sources when the briefing query fails", async () => {
      find.mockImplementation(async (args: { collection: string }) => {
        if (args.collection === "clients") {
          return { docs: [{ id: 12, name: "Example client", slug: "example-client", gadsAuto: { triageIdealCustomer: "Triage answer" } }] };
        }
        throw new Error("briefings unavailable");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await getClients()).toEqual([
        expect.objectContaining({ targetCustomer: "Triage answer" }),
      ]);
      errorSpy.mockRestore();
    });
  });
});
