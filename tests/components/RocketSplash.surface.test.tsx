import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RocketSplash from "@/components/RocketSplash";

/**
 * The rocket mark is a black PNG. The dashboard stylesheet inverts it to white
 * so it reads on slate-900, which is exactly what made it invisible on the
 * light landing report: white artwork on a slate-50 field. Only the flames
 * showed, so the loader looked like a rocket-shaped hole.
 *
 * The surface is therefore opt-in per caller rather than sniffed from an
 * ancestor class, and these tests pin both directions: `onLight` must ask for
 * the un-inverted mark, and the default must stay inverted so the Google Ads
 * dashboard, simple view, SEO hub and GA4 page cannot silently regress to a
 * black rocket on a black background.
 */

function splashOf(container: HTMLElement) {
  return container.querySelector(".od-splash") as HTMLElement;
}

describe("RocketSplash surface variant", () => {
  it("marks the light variant so the black rocket is left un-inverted", () => {
    const { container } = render(<RocketSplash onLight />);

    expect(splashOf(container).classList.contains("od-splash--light")).toBe(true);
  });

  it("defaults to the dark variant, keeping the white rocket on dark dashboards", () => {
    const { container } = render(<RocketSplash />);

    const splash = splashOf(container);
    expect(splash).not.toBeNull();
    // Absence is the whole contract: the inverting rule is unqualified, so any
    // stray modifier here would switch every dark dashboard to a black rocket.
    expect(splash.classList.contains("od-splash--light")).toBe(false);
    expect(splash.className).toBe("od-splash");
  });

  it("renders the rocket image and its flames on both surfaces", () => {
    for (const onLight of [true, false]) {
      const { container } = render(<RocketSplash onLight={onLight} />);

      // The flames are divs and rendered even when the image is invisible,
      // which is why a missing rocket did not look like a missing loader.
      const img = container.querySelector(".od-splash__rocket img");
      expect(img?.getAttribute("src")).toBe("/optimise-rocket-logo-black.png");
      expect(container.querySelectorAll(".od-splash__flame")).toHaveLength(3);
    }
  });

  it("announces itself to screen readers while the page loads", () => {
    const { container } = render(<RocketSplash onLight />);

    const splash = splashOf(container);
    expect(splash.getAttribute("role")).toBe("status");
    expect(splash.getAttribute("aria-label")).toBe("Loading");
  });
});
