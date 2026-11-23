// DXF 내보내기 검사: node scripts/dxf-export.mjs
import { referenceCase, layoutParking, defaultCore, minStraightRampLength, rampTransitions } from "../src/layout.js?v=276";
import { buildDxf, LAYERS, dxfText } from "../src/dxfExport.js?v=276";
import { polygonFromPlate } from "../src/polygon.js?v=276";

let fails = 0;
const expect = (cond, msg) => {
  if (!cond) { fails += 1; console.log("  ✗ " + msg); }
  else console.log("  ✓ " + msg);
};

const sample = referenceCase;
const plate = {
  width: sample.width,
  depth: sample.depth,
  spacing: sample.spacing,
  columnWidth: sample.columnWidth,
  columnDepth: sample.columnDepth,
  minClear: sample.minClear,
  siteMargin: sample.siteMargin,
  floorHeight: 3.2,
  legalStalls: 112,
  roadEdge: sample.ramp.edge,
  stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 112 },
};
const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 112 }));
const res = layoutParking({
  plate,
  cores: sample.cores.map((c) => ({ ...c })),
  ramps: [{ id: 1, ...sample.ramp, length: len, placement: "external" }],
  openings: [],
  rampPlacement: "external",
  entranceMode: "integrated",
});

const state = {
  ...res,
  plate: res.plate,
  demand: { projectName: sample.projectName },
  siteMargin: sample.siteMargin,
  siteMargins: {},
  variantIndex: 3,
  buildings: [],
};
const info = {
  placed: res.stalls.length,
  required: 112,
  floors: 1,
  checkedOn: "2026-11-23",
  demand: { projectName: sample.projectName },
};

console.log("\n[DXF] 기준 사례 내보내기");
const { dxf, meta, stallCount } = buildDxf(state, info, { unit: "mm", floorIndex: 0, version: "r276" });

expect(dxf.includes("SECTION") && dxf.includes("ENDSEC") && dxf.includes("EOF"), "SECTION/ENDSEC/EOF 짝");
const sectionCount = (dxf.match(/(?:^|\n)0\nSECTION\n/g) || []).length;
const endsecCount = (dxf.match(/(?:^|\n)0\nENDSEC\n/g) || []).length;
expect(sectionCount === endsecCount && sectionCount >= 3, `SECTION ${sectionCount} = ENDSEC ${endsecCount}`);

const layerNames = LAYERS.map((l) => l[0]);
const missing = layerNames.filter((n) => !dxf.includes(`\n2\n${n}\n`) && !dxf.includes(`\n8\n${n}\n`));
expect(missing.length === 0, `레이어 목록 포함 (${layerNames.length}개)` + (missing.length ? ` 부족:${missing.join(",")}` : ""));

expect(stallCount === res.stalls.length, `주차칸 엔티티 ${stallCount} = 화면 ${res.stalls.length}`);

const poly = polygonFromPlate(res.plate);
expect(poly.length >= 3, `외곽 꼭짓점 ${poly.length}`);
// LWPOLYLINE closed flag
expect(dxf.includes("PD-PLATE"), "PD-PLATE 레이어 엔티티");

// 좌표 범위: ENTITIES의 10/20 값 중 대부분은 스케일된 좌표 — mm이므로 ×1000
const scale = 1000;
const nums = [];
const lines = dxf.split("\n");
for (let i = 0; i < lines.length - 1; i += 1) {
  if (lines[i] === "10" || lines[i] === "20" || lines[i] === "11" || lines[i] === "21") {
    const v = Number(lines[i + 1]);
    if (Number.isFinite(v)) nums.push(v);
  }
}
const pad = 50 * scale; // 표제·치수 여유
const x0 = meta.bounds.x0 * scale - pad;
const y0 = meta.bounds.y0 * scale - pad;
const x1 = meta.bounds.x1 * scale + pad * 3;
const y1 = meta.bounds.y1 * scale + pad * 2;
const outside = nums.filter((v, i) => {
  // alternate roughly — just check absolute magnitude not insane
  return Math.abs(v) > Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) * 2;
});
expect(outside.length === 0, `좌표가 외곽 범위 안 (표본 ${nums.length}개, 이상 ${outside.length})`);

expect(dxfText("한글").includes("\\U+"), "한글 \\U+ 이스케이프");
expect(dxf.includes("ANSI_949") && dxf.includes("malgun.ttf"), "코드페이지·맑은 고딕");

console.log(`\n실패 ${fails}개`);
process.exitCode = fails ? 1 : 0;
