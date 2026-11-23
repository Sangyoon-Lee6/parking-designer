/**
 * 단지형 차로 먼저 엔진 스윕: 대지 3 × 동배치 4 × 램프변 2 × t 2 = 48가지.
 * 실행: node scripts/complex-sweep.mjs
 */
import { layoutComplex } from "../src/complexLayout.js";
import { checkComplex } from "./complex-check.mjs";

function towersFor(kind, W, D) {
  // 북쪽 3개 / 벽에 붙음 / 안쪽 / 대각
  if (kind === "north") {
    return [
      { x: W * 0.12, y: D * 0.72, w: W * 0.24, d: D * 0.21, name: "101동" },
      { x: W * 0.45, y: D * 0.72, w: W * 0.24, d: D * 0.21, name: "102동" },
      { x: W * 0.8, y: D * 0.3, w: W * 0.14, d: D * 0.36, name: "103동" },
    ].map((t) => ({ ...t, x: +t.x.toFixed(1), y: +t.y.toFixed(1), w: +t.w.toFixed(1), d: +t.d.toFixed(1) }));
  }
  if (kind === "wall") {
    return [
      { x: 0, y: D - 14, w: 24, d: 14, name: "101동" },
      { x: 28, y: D - 14, w: 24, d: 14, name: "102동" },
      { x: W - 14, y: 8, w: 14, d: 24, name: "103동" },
    ];
  }
  if (kind === "mid") {
    return [
      { x: W * 0.2, y: D * 0.55, w: 22, d: 12, name: "101동" },
      { x: W * 0.5, y: D * 0.55, w: 22, d: 12, name: "102동" },
      { x: W * 0.7, y: D * 0.2, w: 12, d: 20, name: "103동" },
    ].map((t) => ({ ...t, x: +t.x.toFixed(1), y: +t.y.toFixed(1) }));
  }
  // diagonal
  return [
    { x: 8, y: D - 18, w: 20, d: 12, name: "101동" },
    { x: W * 0.4, y: D * 0.4, w: 20, d: 12, name: "102동" },
    { x: W - 18, y: 8, w: 12, d: 20, name: "103동" },
  ].map((t) => ({ ...t, x: +t.x.toFixed(1), y: +t.y.toFixed(1) }));
}

function makeInput(W, D, kind, edge, tFrac) {
  const towers = towersFor(kind, W, D);
  const cores = towers.map((t, i) => ({
    id: i + 1,
    x: t.x + Math.max(0, (t.w - 8.1) / 2),
    y: t.y + Math.max(0, (t.d - 8.1) / 2),
    w: Math.min(8.1, t.w),
    d: Math.min(8.1, t.d),
    kind: "building",
  }));
  const t = edge === "w" || edge === "e" ? D * tFrac : W * tFrac;
  const plate = {
    width: W,
    depth: D,
    spacing: 8.1,
    columnWidth: 0.5,
    columnDepth: 0.5,
    minClear: 0,
    siteMargin: 0,
    floorHeight: 3.2,
    legalStalls: 300,
    blockRects: towers,
    stallRules: { legalStalls: 300, disabled: true, disabledRate: 0.03, ecoMode: "auto" },
  };
  return {
    plate,
    towers,
    cores,
    ramps: [{ id: 1, edge, t, width: 6.5, length: 22, placement: "external" }],
  };
}

const sizes = [[98, 66], [80, 60], [120, 72]];
const kinds = ["north", "wall", "mid", "diag"];
const edges = ["w", "s"];
const tFracs = [0.15, 0.5];

const t0 = Date.now();
let pass = 0;
let fail = 0;
const rows = [];

for (const [W, D] of sizes) {
  for (const kind of kinds) {
    for (const edge of edges) {
      for (const tf of tFracs) {
        const input = makeInput(W, D, kind, edge, tf);
        let best;
        let err = null;
        try {
          ({ best } = layoutComplex(input));
        } catch (e) {
          err = String(e?.message || e);
        }
        const check = err ? { ok: false, problems: [err] } : checkComplex(best, input);
        const ok = !!(best?.metrics?.valid && check.ok);
        if (ok) pass += 1;
        else {
          fail += 1;
          rows.push(`${W}x${D} ${kind} ${edge} t${tf}: stalls=${best?.metrics?.stalls ?? "-"} ${check.problems.join(",") || best?.metrics?.rejected || "?"}`);
        }
      }
    }
  }
}

console.log(`cases 48, 신규 통과 ${pass}/48, 문제 ${fail}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (rows.length) console.log(rows.slice(0, 30).join("\n"));
if (pass < 48) process.exitCode = 1;
