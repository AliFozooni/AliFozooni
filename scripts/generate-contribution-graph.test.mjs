import test from "node:test";
import assert from "node:assert/strict";

import { fixedLevel, renderSvg } from "./generate-contribution-graph.mjs";

test("uses fixed contribution bands with 15 as the darkest level", () => {
  assert.deepEqual(
    [0, 1, 4, 5, 9, 10, 14, 15, 68].map(fixedLevel),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});

test("renders 10 as medium-high and all 15+ values at the same darkest color", () => {
  const days = [
    { date: "2026-08-11", week: 0, count: 10 },
    { date: "2026-08-12", week: 0, count: 15 },
    { date: "2026-08-13", week: 0, count: 68 },
  ];
  const svg = renderSvg(days, "light");

  assert.match(svg, /fill="#30a14e"><title>10 contributions/);
  assert.equal((svg.match(/fill="#216e39"><title>/g) || []).length, 3);
  assert.match(svg, /fixed color bands: 1 to 4, 5 to 9, 10 to 14, and 15 or more/);
});
