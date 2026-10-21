import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Login launch: one steady climb with no slowdowns, and a white booster that
 * separates about 70% of the way up and falls away with an ease-in. The old
 * arc had keyframes at 35% and 70%, each easing on its own, so the rocket
 * slowed twice before taking off again.
 */
const css = readFileSync("src/components/login/CountdownLogin.css", "utf8");
const form = readFileSync("src/components/login/CountdownLoginForm.tsx", "utf8");

function keyframes(name: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** Keyframe offsets that set the given property. */
function stops(block: string, property: "translate" | "transform"): number[] {
  const out: number[] = [];
  for (const match of block.matchAll(/([\d.]+%(?:,\s*[\d.]+%)*)\s*\{([^}]*)\}/g)) {
    if (!new RegExp(`(^|[\\s;])${property}:`).test(match[2] ?? "")) continue;
    for (const stop of (match[1] ?? "").split(",")) out.push(Number.parseFloat(stop));
  }
  return out;
}

const SQUARE = "cubic-bezier(0.3333, 0, 0.6667, 0.3333)";
const CUBE = "cubic-bezier(0.3333, 0, 0.6667, 0)";

describe("login rocket launch", () => {
  it("climbs in one constant-acceleration segment, with the arc in its own single segment", () => {
    expect(stops(keyframes("od-launch-rise"), "translate")).toEqual([0, 100]);
    expect(stops(keyframes("od-launch-drift"), "transform")).toEqual([0, 100]);
    expect(css).toContain(`od-launch-rise var(--launch) ${SQUARE} forwards`);
    expect(css).toContain(`od-launch-drift var(--launch) ${CUBE} forwards`);
    expect(css).not.toContain("od-launch-arc");
  });

  it("carries the booster on the rocket's exact curves until it separates halfway along the path", () => {
    const rise = keyframes("od-launch-stage-rise");
    const drift = keyframes("od-launch-stage-drift");
    expect(stops(rise, "translate")).toEqual([0, 70.71, 100]);
    expect(stops(drift, "transform")).toEqual([0, 70.71, 100]);
    // Halfway along a t² path is reached at √0.5 of the time.
    expect(Math.sqrt(0.5) * 100).toBeCloseTo(70.71, 2);
    expect(rise).toContain(SQUARE);
    expect(rise).toContain("* 0.5)");
    // Where the t³ drift (90px, 14°) has got to at that moment.
    expect(drift).toContain(CUBE);
    expect(90 * Math.sqrt(0.5) ** 3).toBeCloseTo(31.82, 2);
    expect(14 * Math.sqrt(0.5) ** 3).toBeCloseTo(4.95, 2);
    expect(drift).toContain("translateX(31.82px) rotate(4.95deg)");
  });

  it("lets the booster fall down and sideways from the moment it separates, with an ease-in", () => {
    expect(css).toMatch(
      /\.od-launch\.is-launching \.od-launch__booster \{\s*animation: od-launch-booster-fall var\(--drop\) cubic-bezier\(0\.55, 0, 1, 0\.45\) calc\(var\(--launch\) \* 0\.7071\) forwards;/,
    );
    const fall = keyframes("od-launch-booster-fall");
    expect(fall).toMatch(/100% \{[^}]*translate: -\d+px \d+px;[^}]*opacity: 0;/);
  });

  it("waits for the booster to finish falling before leaving the login page", () => {
    // 2.1s climb, separation at 70.71% of it, then a 1s fall.
    expect(css).toContain("--launch: 2.1s;");
    expect(css).toContain("--drop: 1s;");
    const launchMs = Number(form.match(/launchMs: (\d+),/)?.[1]);
    expect(launchMs).toBeGreaterThanOrEqual(Math.ceil(2100 * Math.sqrt(0.5) + 1000));
    expect(form).toContain('className="od-launch__booster"');
  });

  it("keeps still for people who prefer reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.od-launch\.is-launching \.od-launch__booster \{\s*animation: none;/);
  });
});
