vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

import { uploadScreenshotToBlob } from "@/lib/blob-upload";
import { put } from "@vercel/blob";

const mockPut = vi.mocked(put);

describe("uploadScreenshotToBlob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Domain sanitization
  // -----------------------------------------------------------------------

  it("strips https:// from domain", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "https://example.com");

    expect(mockPut).toHaveBeenCalledWith(
      expect.stringContaining("example.com/"),
      expect.anything(),
      expect.anything(),
    );
  });

  it("strips http:// from domain", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "http://example.com");

    expect(mockPut).toHaveBeenCalledWith(
      expect.stringContaining("example.com/"),
      expect.anything(),
      expect.anything(),
    );
  });

  it("strips www. from domain", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "https://www.example.com");

    const pathname = mockPut.mock.calls[0][0] as string;
    expect(pathname).not.toContain("www.");
    expect(pathname).toContain("example.com/");
  });

  it("strips path after domain", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "https://example.com/some/path");

    const pathname = mockPut.mock.calls[0][0] as string;
    expect(pathname).toMatch(/^screenshots\/example\.com\/\d+\.png$/);
  });

  it("replaces non-alphanumeric/dot/dash characters with underscores", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "https://exam ple!@#.com");

    const pathname = mockPut.mock.calls[0][0] as string;
    expect(pathname).toMatch(/^screenshots\/exam_ple___\.com\/\d+\.png$/);
  });

  it("handles domain with no protocol", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    await uploadScreenshotToBlob(Buffer.from("img"), "example.com");

    const pathname = mockPut.mock.calls[0][0] as string;
    expect(pathname).toMatch(/^screenshots\/example\.com\/\d+\.png$/);
  });

  // -----------------------------------------------------------------------
  // Path structure
  // -----------------------------------------------------------------------

  it("creates path with screenshots/ prefix, domain folder, and timestamp.png", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    const beforeTs = Date.now();
    await uploadScreenshotToBlob(Buffer.from("img"), "example.com");
    const afterTs = Date.now();

    const pathname = mockPut.mock.calls[0][0] as string;
    const match = pathname.match(/^screenshots\/example\.com\/(\d+)\.png$/);
    expect(match).toBeTruthy();
    const ts = parseInt(match![1], 10);
    expect(ts).toBeGreaterThanOrEqual(beforeTs);
    expect(ts).toBeLessThanOrEqual(afterTs);
  });

  // -----------------------------------------------------------------------
  // put() call parameters
  // -----------------------------------------------------------------------

  it("calls put with public access and image/png content type", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/result.png" } as any);
    const buffer = Buffer.from("image-data");
    await uploadScreenshotToBlob(buffer, "example.com");

    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      buffer,
      { access: "public", contentType: "image/png" },
    );
  });

  // -----------------------------------------------------------------------
  // Return values
  // -----------------------------------------------------------------------

  it("returns the blob URL on success", async () => {
    mockPut.mockResolvedValue({ url: "https://blob.vercel-storage.com/shot.png" } as any);
    const result = await uploadScreenshotToBlob(Buffer.from("img"), "example.com");
    expect(result).toBe("https://blob.vercel-storage.com/shot.png");
  });

  it("returns null on error", async () => {
    mockPut.mockRejectedValue(new Error("Upload failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await uploadScreenshotToBlob(Buffer.from("img"), "example.com");

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it("logs the error with domain info on failure", async () => {
    mockPut.mockRejectedValue(new Error("Network timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uploadScreenshotToBlob(Buffer.from("img"), "failing-site.com");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("failing-site.com"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
