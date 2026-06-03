/**
 * Render tests for the Clients list-view cell components. Each cell receives a
 * partial `DefaultCellComponentProps` (cellData + rowData) — the only fields the
 * components read — so we cast a minimal object rather than build the full type.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DefaultCellComponentProps } from "payload";

import NameAvatarCell from "@/components/clients-list/NameAvatarCell";
import StatusCell from "@/components/clients-list/StatusCell";
import SlugCell from "@/components/clients-list/SlugCell";
import PinCell from "@/components/clients-list/PinCell";
import AccountManagerCell from "@/components/clients-list/AccountManagerCell";
import MonthsActiveCell from "@/components/clients-list/MonthsActiveCell";
import TitleAvatarCell from "@/components/list-cells/TitleAvatarCell";
import StatusPillCell from "@/components/list-cells/StatusPillCell";

function props(cellData: unknown, rowData: Record<string, unknown> = {}): DefaultCellComponentProps {
  return { cellData, rowData } as unknown as DefaultCellComponentProps;
}

describe("NameAvatarCell", () => {
  it("renders the name, initial, and derived host", () => {
    render(<NameAvatarCell {...props("Acme Corp", { name: "Acme Corp", websiteUrl: "https://www.acme.com" })} />);
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("acme.com")).toBeTruthy();
  });

  it("omits the domain line when there is no website", () => {
    const { container } = render(<NameAvatarCell {...props("Brightline", { name: "Brightline" })} />);
    expect(container.querySelector(".od-client-cell__domain")).toBeNull();
  });

  it("falls back to 'Untitled' when the name is empty", () => {
    render(<NameAvatarCell {...props("", { name: "" })} />);
    expect(screen.getByText("Untitled")).toBeTruthy();
  });

  it("renders the logo image from the server-resolved logoThumbUrl", () => {
    const { container } = render(
      <NameAvatarCell
        {...props("Acme Corp", { id: 1, name: "Acme Corp", logoThumbUrl: "/logo-thumb.png" })}
      />,
    );
    const img = container.querySelector("img.od-client-cell__logo") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/logo-thumb.png");
    // No gradient initial avatar when a logo is present.
    expect(container.querySelector(".od-client-cell__avatar")).toBeNull();
  });

  it("falls back to a populated logo object when logoThumbUrl is absent", () => {
    const { container } = render(
      <NameAvatarCell
        {...props("Acme Corp", {
          id: 1,
          name: "Acme Corp",
          logo: { url: "/logo.png", sizes: { thumbnail: { url: "/logo-thumb.png" } } },
        })}
      />,
    );
    const img = container.querySelector("img.od-client-cell__logo") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("/logo-thumb.png");
  });

  it("renders the gradient initial when no logo is set", () => {
    const { container } = render(
      <NameAvatarCell {...props("Acme Corp", { id: 1, name: "Acme Corp" })} />,
    );
    expect(container.querySelector(".od-client-cell__avatar")).not.toBeNull();
    expect(container.querySelector("img.od-client-cell__logo")).toBeNull();
  });
});

describe("StatusCell", () => {
  it("renders an Active pill when isActive is true", () => {
    render(<StatusCell {...props(true)} />);
    const pill = screen.getByText("Active");
    expect(pill.className).toContain("od-pill--green");
  });

  it("renders an Inactive pill when falsy", () => {
    render(<StatusCell {...props(false)} />);
    const pill = screen.getByText("Inactive");
    expect(pill.className).toContain("od-pill--gray");
  });
});

describe("TitleAvatarCell", () => {
  it("renders the title, subtitle, and avatar initial", () => {
    render(
      <TitleAvatarCell
        {...props("Acme Proposal", {
          id: 7,
          businessName: "Acme Proposal",
          websiteUrl: "https://www.acme.com.au/services",
        })}
      />,
    );

    expect(screen.getByText("Acme Proposal")).toBeTruthy();
    expect(screen.getByText("acme.com.au")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("falls back to row title fields and contact subtitle", () => {
    render(
      <TitleAvatarCell
        {...props(null, {
          contractTitle: "SEO Retainer",
          clientName: "Acme Pty Ltd",
        })}
      />,
    );

    expect(screen.getByText("SEO Retainer")).toBeTruthy();
    expect(screen.getByText("Acme Pty Ltd")).toBeTruthy();
    expect(screen.getByText("S")).toBeTruthy();
  });
});

describe("StatusPillCell", () => {
  it.each([
    ["client", "Client", "od-pill--green"],
    ["proposal_sent", "Proposal Sent", "od-pill--blue"],
    ["draft", "Draft", "od-pill--amber"],
    ["lost", "Lost", "od-pill--red"],
    ["unknown", "Unknown", "od-pill--gray"],
  ])("maps %s to %s with %s", (status, label, className) => {
    render(<StatusPillCell {...props(status)} />);
    const pill = screen.getByText(label);
    expect(pill.className).toContain(className);
  });
});

describe("SlugCell", () => {
  it("renders the slug in monospace", () => {
    render(<SlugCell {...props("acme-corp")} />);
    expect(screen.getByText("acme-corp").className).toContain("od-cell-slug");
  });

  it("renders an em dash when empty", () => {
    render(<SlugCell {...props("")} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("PinCell", () => {
  it("renders the PIN", () => {
    render(<PinCell {...props("4821")} />);
    expect(screen.getByText("4821").className).toContain("od-cell-pin");
  });

  it("renders an em dash when no PIN is set", () => {
    render(<PinCell {...props(null)} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("AccountManagerCell", () => {
  it("shows the first manager name", () => {
    render(<AccountManagerCell {...props([{ name: "Peter Tu" }])} />);
    expect(screen.getByText("Peter Tu")).toBeTruthy();
  });

  it("adds a +N suffix for additional managers", () => {
    render(<AccountManagerCell {...props([{ name: "Peter Tu" }, { name: "Sarah K." }, { name: "Jo" }])} />);
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("falls back to email then to an em dash", () => {
    const { rerender } = render(<AccountManagerCell {...props([{ email: "pt@od.com" }])} />);
    expect(screen.getByText("pt@od.com")).toBeTruthy();
    rerender(<AccountManagerCell {...props([])} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("MonthsActiveCell", () => {
  it("renders 'N mo' for a numeric value", () => {
    render(<MonthsActiveCell {...props(14)} />);
    expect(screen.getByText("14 mo")).toBeTruthy();
  });

  it("renders '— mo' when null", () => {
    render(<MonthsActiveCell {...props(null)} />);
    expect(screen.getByText("— mo")).toBeTruthy();
  });
});
