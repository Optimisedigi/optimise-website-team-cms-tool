import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The loader's flight must be one steady, accelerating climb. The old loops
 * had several mid-flight keyframes, each easing in and out, so the rocket
 * slowed down twice before taking off again. These checks read the shared
 * stylesheet so a future edit can't quietly bring the stops back.
 */
const css = readFileSync("src/components/RocketSplash.css", "utf8");

function keyframes(name: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** Keyframe stops (as numbers) that set `transform`. */
function transformStops(block: string): number[] {
  const stops: number[] = [];
  for (const match of block.matchAll(/([\d.]+%(?:,\s*[\d.]+%)*)\s*\{([^}]*)\}/g)) {
    if (!/\btransform:/.test(match[2] ?? "")) continue;
    for (const stop of (match[1] ?? "").split(",")) stops.push(Number.parseFloat(stop));
  }
  return stops;
}

const QUADRATIC = "cubic-bezier(0.3333, 0, 0.6667, 0.3333)";

describe("rocket loader flight", () => {
  it("climbs in a single constant-acceleration segment, with no stops on the way up", () => {
    const climb = keyframes("od-rocket-climb");
    // On the pad (0%, 12%) and gone (80%, 100%): nothing in between.
    expect(transformStops(climb)).toEqual([0, 12, 80, 100]);
    // The one climbing segment eases as distance = time².
    expect(climb).toMatch(new RegExp(`12% \\{[^}]*animation-timing-function: ${QUADRATIC.replace(/[().]/g, "\\$&")}`));
    // Linear outside the keyframes, so nothing else bends the curve.
    expect(css).toMatch(/\.od-splash__rocket \{[^}]*animation: od-rocket-climb var\(--od-loop\) linear infinite;/);
    expect(css).toMatch(/\.od-splash__flames \{[^}]*animation: od-rocket-climb var\(--od-loop\) linear infinite;/);
  });

  it("drops the booster at 70% of the climb, on the rocket's own curve, then lets it fall with an ease-in", () => {
    const drop = keyframes("od-booster-drop");
    expect(transformStops(drop)).toEqual([0, 12, 68.9, 100]);
    // 70% of the distance on a t² climb from 12% to 80% is reached at 12% + √0.7 × 68%.
    expect(12 + Math.sqrt(0.7) * 68).toBeCloseTo(68.9, 1);
    expect(drop).toContain("translateY(calc(var(--od-rise) * -0.7))");
    expect(drop).toMatch(/12% \{[^}]*cubic-bezier\(0\.3333, 0, 0\.6667, 0\.3333\)/);
    // After letting go: starts slow and speeds up (ease-in: no initial slope, ends steep).
    const fall = drop.match(/68\.9% \{[^}]*animation-timing-function: cubic-bezier\(([^)]*)\)/)?.[1]?.split(",").map(Number);
    expect(fall).toBeDefined();
    const [x1, y1, x2, y2] = fall ?? [];
    expect(y1).toBe(0);
    expect((x1 ?? 0) > 0 && (y2 ?? 1) < (x2 ?? 0)).toBe(true);
    // It ends lower and further left than where it let go, and invisible before the loop restarts.
    expect(drop).toMatch(/100% \{[^}]*opacity: 0;[^}]*translateX\(calc\(var\(--od-booster-x\) - \d+px\)\) translateY\(calc\(var\(--od-rise\) \* -0\.7 \+ \d+px\)\)/);
  });

  it("keeps still for people who prefer reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.od-splash__booster \{[\s\S]*animation: none;/);
  });

  it("is the only definition of the loader flight", () => {
    for (const file of [
      "src/app/(payload)/custom.scss",
      "src/app/(frontend)/google-dashboard/globals.css",
      "src/components/ScheduleResponseClient.tsx",
      "src/components/RocketSplash.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@keyframes od-(rocket|flame)-/);
      expect(source, file).not.toMatch(/\.od-splash__rocket\s*\{/);
    }
  });
});
