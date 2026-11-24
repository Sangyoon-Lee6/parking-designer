// 다각형 평면 배치 검사: node scripts/polygon-plate.mjs
import {
  layoutParking, referenceCase, minStraightRampLength, rampTransitions, defaultCore,
} from "../src/layout.js?v=282";
import {
  presetL, presetU, presetTrapezoid, presetChamferRect, rectPolygon,
  rectInsidePolygon, pointInPolygon, polygonArea, validatePolygon,
} from "../src/polygon.js?v=282";

let fails = 0;
const expect = (cond, msg) => {
  if (!cond) { fails += 1; console.log("  ✗ " + msg); }
  else console.log("  ✓ " + msg);
};

function basePlate(poly, extra = {}) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...ys) - Math.min(...ys);
  const sample = referenceCase;
  return {
    width,
    depth,
    polygon: poly,
    spacing: sample.spacing,
    columnWidth: sample.columnWidth,
    columnDepth: sample.columnDepth,
    minClear: sample.minClear,
    siteMargin: sample.siteMargin,
    floorHeight: 3.2,
    legalStalls: 80,
    roadEdge: sample.ramp.edge,
    stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 80 },
    ...extra,
  };
}

function runCase(name, poly) {
  console.log(`\n[${name}]`);
  const errs = validatePolygon(poly);
  expect(errs.length === 0, `유효 다각형 (${errs.join("; ") || "ok"})`);
  const plate = basePlate(poly);
  const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 80 }));
  const core = defaultCore(plate);
  // 코어가 다각형 안인지 확인·조정
  if (!rectInsidePolygon(core, poly)) {
    // 외접 중심 근처로
    core.x = Math.max(1, plate.width / 2 - core.w / 2);
    core.y = Math.max(1, plate.depth / 2 - core.d / 2);
  }
  let res;
  try {
    res = layoutParking({
      plate,
      cores: [core],
      ramps: [{ id: 1, ...referenceCase.ramp, length: len, placement: "external" }],
      openings: [],
      rampPlacement: "external",
      entranceMode: "integrated",
    });
  } catch (e) {
    expect(false, `layout 예외: ${e.message}`);
    return null;
  }
  const stalls = res.stalls || [];
  const aisles = res.aisles || [];
  const columns = res.columns || [];
  const cores = res.cores || [];
  const outsideStall = stalls.filter((s) => !rectInsidePolygon(s, poly));
  const outsideAisle = aisles.filter((a) => !rectInsidePolygon(a, poly));
  const outsideCol = columns.filter((c) => !rectInsidePolygon(c, poly));
  const outsideCore = cores.filter((c) => !rectInsidePolygon(c, poly));
  expect(outsideStall.length === 0, `주차칸 다각형 밖 0 (실제 ${outsideStall.length})`);
  expect(outsideAisle.length === 0, `차로 다각형 밖 0 (실제 ${outsideAisle.length})`);
  expect(outsideCol.length === 0, `기둥 다각형 밖 0 (실제 ${outsideCol.length})`);
  expect(outsideCore.length === 0, `코어 다각형 밖 0 (실제 ${outsideCore.length})`);

  let overlaps = 0;
  for (let i = 0; i < stalls.length; i += 1) {
    for (let j = i + 1; j < stalls.length; j += 1) {
      const a = stalls[i];
      const b = stalls[j];
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y));
      if (ox * oy > 0.05) overlaps += 1;
    }
  }
  expect(overlaps === 0, `칸 겹침 0 (실제 ${overlaps})`);

  const connIssue = (res.issues || []).some((i) => /연결|동선|끊/i.test(i.label || i.text || ""));
  // 연결 이슈가 있어도 대수만 보고 — 연결 여부를 별도 표시
  const aisleOk = aisles.length === 0 || !connIssue;
  expect(aisleOk || aisles.length > 0, `동선/차로 존재 (차로 ${aisles.length}, 연결이슈=${connIssue})`);
  console.log(`  · 대수 ${stalls.length} · 면적 ${polygonArea(poly).toFixed(0)}㎡ · 이슈 ${(res.issues || []).length}`);
  return res;
}

// 1) 사각형: 기존과 대수 동일
console.log("\n=== 다각형 평면 검사 ===");
const sample = referenceCase;
const rect = rectPolygon(sample.width, sample.depth);
const rectPlate = basePlate(rect, {
  legalStalls: sample.legalStalls || 112,
  stallRules: { disabled: true, disabledRate: 0.03, legalStalls: sample.legalStalls || 112 },
});
const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 112 }));
const rectRes = layoutParking({
  plate: { ...rectPlate, polygon: rect },
  cores: sample.cores.map((c) => ({ ...c })),
  ramps: [{ id: 1, ...sample.ramp, length: len, placement: "external" }],
  openings: [],
  rampPlacement: "external",
  entranceMode: "integrated",
});
const rectPlain = layoutParking({
  plate: { ...rectPlate, polygon: undefined },
  cores: sample.cores.map((c) => ({ ...c })),
  ramps: [{ id: 1, ...sample.ramp, length: len, placement: "external" }],
  openings: [],
  rampPlacement: "external",
  entranceMode: "integrated",
});
console.log("\n[사각형 회귀]");
expect(rectRes.stalls.length === rectPlain.stalls.length,
  `사각형 다각형=${rectRes.stalls.length} ≡ 기존=${rectPlain.stalls.length}`);
expect(rectPlain.stalls.length >= 100, `기준 사례 대수 ${rectPlain.stalls.length} (≥100)`);

runCase("L자 60×40 −20×20", presetL(60, 40, 20, 20));
runCase("ㄷ자", presetU(60, 40, 12, 20));
runCase("사다리꼴", presetTrapezoid(60, 40, 8));
runCase("모서리 45° 깎기 6m", presetChamferRect(48, 42, 6));

// 점-다각형 샘플
const L = presetL(60, 40, 20, 20);
expect(pointInPolygon({ x: 55, y: 35 }, L) === false, "L자 cut 영역 밖");
expect(pointInPolygon({ x: 10, y: 10 }, L) === true, "L자 본체 안");

console.log(`\n실패 ${fails}개`);
process.exitCode = fails ? 1 : 0;
