import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the scrapling service + blob upload the helper depends on.
vi.mock("@/lib/scrapling-service", () => ({
  extractSocialLinks: vi.fn(),
  checkMetaAdsViaScrapling: vi.fn(),
}));
vi.mock("@/lib/blob-upload", () => ({
  uploadScreenshotToBlob: vi.fn(),
}));

import { fetchMetaAdsForCompetitors } from "@/lib/proposal-meta-ads";
import { extractSocialLinks, checkMetaAdsViaScrapling } from "@/lib/scrapling-service";
import { uploadScreenshotToBlob } from "@/lib/blob-upload";

const mockSocial = extractSocialLinks as unknown as ReturnType<typeof vi.fn>;
const mockMeta = checkMetaAdsViaScrapling as unknown as ReturnType<typeof vi.fn>;
const mockBlob = uploadScreenshotToBlob as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchMetaAdsForCompetitors", () => {
  it("merges meta ads + social links and uploads screenshots to blob", async () => {
    mockSocial.mockResolvedValue({ facebook: "acme", instagram: null, linkedin: null });
    mockMeta.mockResolvedValue({ isRunningAds: true, activeAdCount: 2, adScreenshots: ["aGk="] });
    mockBlob.mockResolvedValue("https://blob.test/meta-ad.png");

    const competitors = [{ domain: "acme.com", traffic: { monthlyVisits: 5 }, websiteScreenshot: "shot" }];
    const result = await fetchMetaAdsForCompetitors(competitors);

    expect(result.attempted).toBe(1);
    expect(result.withAds).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    const comp = result.updated[0];
    // Preserves existing fields
    expect(comp.traffic).toEqual({ monthlyVisits: 5 });
    expect(comp.websiteScreenshot).toBe("shot");
    // Merges meta ads with uploaded blob URLs (not base64)
    expect(comp.metaAds.isRunningAds).toBe(true);
    expect(comp.metaAds.adScreenshots).toEqual(["https://blob.test/meta-ad.png"]);
    expect(comp.socialLinks.facebook).toBe("acme");
    // Uses the Facebook handle as the Ad Library search term
    expect(mockMeta).toHaveBeenCalledWith("acme");
  });

  it("counts a rejected fetch as failed and leaves that competitor untouched", async () => {
    mockSocial.mockResolvedValue({ facebook: null, instagram: null, linkedin: null });
    mockMeta.mockRejectedValue(new Error("scrapling down"));

    const competitors = [{ domain: "acme.com", metaAds: null }];
    const result = await fetchMetaAdsForCompetitors(competitors);

    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.updated[0].metaAds).toBeNull();
  });

  it("skips remaining competitors once the deadline is reached", async () => {
    mockSocial.mockResolvedValue({ facebook: null, instagram: null, linkedin: null });
    mockMeta.mockResolvedValue({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] });

    const competitors = [{ domain: "acme.com" }, { domain: "beta.com" }];
    // deadlineAt in the past => everything skipped, nothing counted as a real failure
    const result = await fetchMetaAdsForCompetitors(competitors, { deadlineAt: Date.now() - 1 });

    expect(result.attempted).toBe(2);
    expect(result.skipped).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockMeta).not.toHaveBeenCalled();
  });

  it("returns input unchanged when there are no competitor domains", async () => {
    const result = await fetchMetaAdsForCompetitors([{ name: "no domain" }]);
    expect(result.attempted).toBe(0);
    expect(result.updated).toEqual([{ name: "no domain" }]);
    expect(mockMeta).not.toHaveBeenCalled();
  });
});
