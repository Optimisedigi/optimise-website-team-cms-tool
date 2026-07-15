import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useDocumentInfo, useAllFormFields } from "@payloadcms/ui";
import RefreshMetaAdsButton from "@/components/RefreshMetaAdsButton";

vi.mock("@payloadcms/ui", () => ({
  useDocumentInfo: vi.fn(),
  useAllFormFields: vi.fn(),
}));

const mockUseDocumentInfo = useDocumentInfo as Mock;
const mockUseAllFormFields = useAllFormFields as Mock;

function fields(overrides: Record<string, unknown> = {}) {
  const f: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries(overrides)) f[k] = { value: v };
  return [f];
}

function statusResponse(body: Record<string, unknown>) {
  return { ok: true, json: () => Promise.resolve(body) };
}

let fetchMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("RefreshMetaAdsButton", () => {
  it("returns null without a document id", () => {
    mockUseDocumentInfo.mockReturnValue({ id: undefined });
    mockUseAllFormFields.mockReturnValue(fields());
    const { container } = render(<RefreshMetaAdsButton />);
    expect(container.innerHTML).toBe("");
  });

  it("auto-polls and shows progress when reopened on a running job", async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 5 });
    mockUseAllFormFields.mockReturnValue(
      fields({
        metaAdsStatus: "running",
        metaAdsJobState: { total: 14, completed: 3, failed: 1, processed: 4, percent: 29 },
      }),
    );
    fetchMock.mockResolvedValue(
      statusResponse({
        metaAdsStatus: "running",
        metaAds: { total: 14, completed: 8, failed: 1, processed: 9, percent: 64 },
      }),
    );

    await act(async () => {
      render(<RefreshMetaAdsButton />);
    });

    // Seeded from the saved job state on mount.
    expect(screen.getByText(/4 of 14 processed · 1 failed/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent(/Refreshing Meta Ads/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText(/9 of 14 processed · 1 failed/)).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "64");
  });

  it("announces progress in an accessible live region", () => {
    mockUseDocumentInfo.mockReturnValue({ id: 5 });
    mockUseAllFormFields.mockReturnValue(
      fields({ metaAdsStatus: "running", metaAdsJobState: { total: 10, completed: 2, failed: 0, processed: 2, percent: 20 } }),
    );
    fetchMock.mockResolvedValue(statusResponse({ metaAdsStatus: "running", metaAds: { total: 10, processed: 2, percent: 20 } }));

    render(<RefreshMetaAdsButton />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent(/2 of 10 processed/);
  });

  it("shows a completion message when the job finishes", async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 5 });
    mockUseAllFormFields.mockReturnValue(fields({ metaAdsStatus: "idle" }));
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: "running", total: 2, processed: 0, percent: 0 }) })
      .mockResolvedValue(statusResponse({ metaAdsStatus: "completed", metaAds: { total: 2, completed: 2, failed: 0, processed: 2, percent: 100 } }));

    render(<RefreshMetaAdsButton />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText(/Meta Ads refreshed/i)).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("shows a Retry action and counts on terminal failure", () => {
    mockUseDocumentInfo.mockReturnValue({ id: 5 });
    mockUseAllFormFields.mockReturnValue(
      fields({
        metaAdsStatus: "failed",
        metaAdsError: "Meta Ads finished with 2 of 5 competitor(s) failed",
        metaAdsJobState: { total: 5, completed: 3, failed: 2, processed: 5, percent: 100 },
      }),
    );

    render(<RefreshMetaAdsButton />);

    expect(screen.getByRole("button")).toHaveTextContent(/Retry Meta Ads/);
    expect(screen.getByRole("button")).not.toBeDisabled();
    expect(screen.getByText(/3 completed and 2 failed/)).toBeInTheDocument();
  });

  it("does NOT declare the job stuck after a long client-side wait", async () => {
    mockUseDocumentInfo.mockReturnValue({ id: 5 });
    mockUseAllFormFields.mockReturnValue(
      fields({ metaAdsStatus: "running", metaAdsJobState: { total: 14, completed: 1, failed: 0, processed: 1, percent: 7 } }),
    );
    fetchMock.mockResolvedValue(statusResponse({ metaAdsStatus: "running", metaAds: { total: 14, completed: 1, failed: 0, processed: 1, percent: 7 } }));

    await act(async () => {
      render(<RefreshMetaAdsButton />);
    });

    // Well past the old 10-minute client stuck timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    });

    expect(screen.queryByText(/stuck/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent(/Refreshing Meta Ads/);
  });
});
