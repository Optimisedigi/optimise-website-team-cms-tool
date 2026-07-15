import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
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
    // Falls back to extraction when the audit has no saved Facebook link.
    expect(mockSocial).toHaveBeenCalledWith(
      "acme.com",
      expect.objectContaining({ timeout: 10, signal: expect.any(AbortSignal) }),
    );
    expect(mockMeta).toHaveBeenCalledWith("acme");
  });

  it("reuses a stored Facebook URL without requesting another social-link scrape", async () => {
    mockMeta.mockResolvedValue({ isRunningAds: true, activeAdCount: 1, adScreenshots: [] });

    const competitors = [{
      domain: "acme.com",
      socialLinks: {
        facebook: "https://www.facebook.com/acme",
        instagram: "https://www.instagram.com/acme",
        linkedin: null,
      },
    }];
    const result = await fetchMetaAdsForCompetitors(competitors);

    expect(result.failed).toBe(0);
    expect(mockSocial).not.toHaveBeenCalled();
    expect(mockMeta).toHaveBeenCalledWith("https://www.facebook.com/acme");
    expect(result.updated[0].socialLinks).toEqual(competitors[0].socialLinks);
  });

  it("never runs more than two Meta Ads competitor requests at once", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    mockMeta.mockImplementation(async () => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests--;
      return { isRunningAds: false, activeAdCount: 0, adScreenshots: [] };
    });

    const competitors = Array.from({ length: 6 }, (_, index) => ({
      domain: `competitor-${index}.example`,
      socialLinks: { facebook: `https://facebook.com/competitor-${index}` },
    }));
    const result = await fetchMetaAdsForCompetitors(competitors);

    expect(result.attempted).toBe(6);
    expect(result.failed).toBe(0);
    expect(mockMeta).toHaveBeenCalledTimes(6);
    expect(maxActiveRequests).toBe(2);
  });

  it("falls back to the domain when social-link extraction times out", async () => {
    const timeoutSignal = AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    mockSocial.mockImplementation(async (_domain: string, opts: { signal: AbortSignal }) => {
      expect(opts.signal).toBe(timeoutSignal);
      throw timeoutSignal.reason;
    });
    mockMeta.mockResolvedValue({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] });

    await fetchMetaAdsForCompetitors([{ domain: "timeout.example" }]);

    expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
    expect(mockMeta).toHaveBeenCalledWith("timeout.example");
  });

  it("falls back to the domain when social-link extraction errors or crashes", async () => {
    mockSocial.mockRejectedValue(new Error("Page.goto: Page crashed"));
    mockMeta.mockResolvedValue({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] });

    const result = await fetchMetaAdsForCompetitors([{ domain: "crashed.example" }]);

    expect(result.failed).toBe(0);
    expect(mockMeta).toHaveBeenCalledWith("crashed.example");
  });

  it("falls back to the domain when extraction returns no Facebook link", async () => {
    mockSocial.mockResolvedValue({
      facebook: null,
      instagram: "https://instagram.com/no-facebook",
      linkedin: null,
    });
    mockMeta.mockResolvedValue({ isRunningAds: false, activeAdCount: 0, adScreenshots: [] });

    const result = await fetchMetaAdsForCompetitors([{ domain: "no-facebook.example" }]);

    expect(result.failed).toBe(0);
    expect(mockMeta).toHaveBeenCalledWith("no-facebook.example");
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
