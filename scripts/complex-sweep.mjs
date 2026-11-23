/**
 * 단지형 스윕: 대지 3 × 동배치 4 × 램프변 2 × t 2 = 48가지.
 * 기존 generateVariants 최대 vs 신규(단지형) 최대를 같이 출력.
 * 실행: node scripts/complex-sweep.mjs
 */
import { generateVariants } from "../src/layout.js";
import { layoutComplex } from "../src/complexLayout.js";
import { checkComplex } from "./complex-check.mjs";

function towersFor(kind, W, D) {
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
    siteMargin: 25,
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
    rampPlacement: "external",
    entranceMode: "integrated",
    noUniform: true,
  };
}

const sizes = [[98, 66], [80, 60], [120, 72]];
const kinds = ["north", "wall", "mid", "diag"];
const edges = ["w", "s"];
const tFracs = [0.15, 0.5];

const t0 = Date.now();
let legacyPass = 0;
let newPass = 0;
let checkFail = 0;
const rows = [];

for (const [W, D] of sizes) {
  for (const kind of kinds) {
    for (const edge of edges) {
      for (const tf of tFracs) {
        const input = makeInput(W, D, kind, edge, tf);
        let legacyMax = 0;
        let newMax = 0;
        let bestNew = null;
        try {
          const variants = generateVariants(input);
          const legacy = variants.filter((v) => !v.loopFirst && v.metrics?.valid);
          const neu = variants.filter((v) => v.loopFirst && v.metrics?.valid);
          legacyMax = Math.max(0, ...legacy.map((v) => v.metrics.stalls));
          newMax = Math.max(0, ...neu.map((v) => v.metrics.stalls));
          if (legacy.length) legacyPass += 1;
          if (neu.length) newPass += 1;
          bestNew = neu.sort((a, b) => b.metrics.stalls - a.metrics.stalls)[0] || null;
        } catch (e) {
          rows.push(`${W}x${D} ${kind} ${edge} t${tf}: generateVariants ${e.message || e}`);
        }
        if (!bestNew) {
          try {
            const { best } = layoutComplex(input);
            bestNew = best;
            if (best?.metrics?.valid) {
              newPass += 1;
              newMax = best.metrics.stalls;
            }
          } catch (e) { /* ignore */ }
        }
        const check = checkComplex(bestNew, input);
        if (!check.ok) {
          checkFail += 1;
          rows.push(`${W}x${D} ${kind} ${edge} t${tf}: 기존 ${legacyMax} / 신규 ${newMax} · ${check.problems.join(",")}`);
        }
      }
    }
  }
}

console.log(`cases 48, 기존 통과 ${legacyPass}/48, 신규 통과 ${newPass}/48, 독립검사 문제 ${checkFail}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (rows.length) console.log(rows.slice(0, 30).join("\n"));
if (newPass < 48 || checkFail > 0) process.exitCode = 1;
