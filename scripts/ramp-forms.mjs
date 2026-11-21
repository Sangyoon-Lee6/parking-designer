// 램프 형태·층간 경로 점검. 실행: node scripts/ramp-forms.mjs
import {
  defaultCore,
  generateVariants,
  lowerFloorRamp,
  minStraightRampLength,
  rampShape,
  rampTransitions,
  rampsForLevel,
} from "../src/layout.js";

let pass = 0;
let fail = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 112 }));
const big = {
  width: 97.7, depth: 65.8, spacing: 8.1, columnWidth: 0.5, columnDepth: 0.5,
  minClear: 0, floorHeight: 3.2, legalStalls: 112, roadEdge: "w", siteMargin: 28,
  rampForm: "auto", lowerRampMode: "alternate",
};

{
  const s = rampShape({ id: 1, edge: "w", t: 32, width: 6, length: len, placement: "internal", form: "straight" }, big);
  ok("직선 path·하강", s.kind === "straight" && s.path.length >= 2 && s.path.at(-1).h >= 3.1);
}
{
  const s = rampShape({ id: 1, edge: "w", t: 32, width: 6.5, length: len, placement: "internal", form: "curve90" }, big);
  ok("내부 90° 곡선", s.kind === "curved" && s.ok && s.polygons.length >= 2);
}
{
  const s = rampShape({ id: 1, edge: "w", t: 32, width: 6.5, length: 21.4, placement: "external", form: "curve90" }, big);
  ok("외부 90° 곡선", s.kind === "curved" && s.externalCurve && s.ok, s.reason || `total ${s.total}`);
}
{
  const s = rampShape({ id: 1, edge: "w", t: 32, width: 6.5, length: len, placement: "internal", form: "spiral" }, big);
  ok("원형 나선 Ri≥6", s.kind === "spiral" && s.ok && s.Ri >= 6 && s.segments[0].slope <= 0.1401, `slope ${s.segments[0].slope}`);
}
{
  const g = { id: 1, edge: "w", t: 30, width: 6, length: len, placement: "external", form: "auto" };
  const low = lowerFloorRamp(g, big, "alternate");
  ok("층간 반대 변", low.edge === "e" && low.placement === "internal");
  const L0 = rampsForLevel([g], big, 0, "alternate")[0];
  const L1 = rampsForLevel([g], big, 1, "alternate")[0];
  ok("B1≠B2 경로", L0.edge !== L1.edge);
}
{
  const vs = generateVariants({
    plate: { ...big, rampForm: "spiral" },
    cores: [defaultCore(big)],
    ramps: [{ id: 1, edge: "w", t: 32.9, width: 6.5, length: len, placement: "internal", form: "spiral" }],
    openings: [],
    rampPlacement: "internal",
    entranceMode: "integrated",
    rampForm: "spiral",
  });
  ok("원형 통과안", vs.some((v) => v.metrics.valid), `${vs.filter((v) => v.metrics.valid).length}/${vs.length}`);
}
{
  const small = { ...big, width: 48, depth: 42, rampForm: "auto" };
  const vs = generateVariants({
    plate: small,
    cores: [defaultCore(small)],
    ramps: [{ id: 1, edge: "w", t: 21, width: 6, length: len, placement: "internal", form: "auto" }],
    openings: [],
    rampPlacement: "internal",
    entranceMode: "integrated",
  });
  ok("기존 auto 회귀", vs.filter((v) => v.metrics.valid).length >= 1, `${vs.filter((v) => v.metrics.valid).length}/${vs.length}`);
}

console.log(`\nramp-forms: 통과 ${pass} / 실패 ${fail}`);
if (fail) process.exitCode = 1;
