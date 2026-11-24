// CAD 내보내기 검사: node scripts/dxf-export.mjs
import { writeFileSync } from "fs";
import { referenceCase, layoutParking, minStraightRampLength, rampTransitions } from "../src/layout.js?v=282";
import { buildDxf, LAYERS, STALL_LAYER, dxfText, dxfToDwg, cadFilename } from "../src/dxfExport.js?v=282";

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
  plate,
  cores: res.cores || sample.cores,
  ramps: [{ id: 1, ...sample.ramp, length: len, placement: "external" }],
  stalls: res.stalls,
  columns: res.columns,
  aisles: res.aisles,
  drives: res.drives || [],
  buildings: [],
  gridX: res.gridX,
  gridY: res.gridY,
  demand: { projectName: "기준사례" },
  metrics: { floors: 1 },
  siteMargin: sample.siteMargin,
  variantIndex: 0,
};
const info = { floors: 1, placed: state.stalls.length, required: 112, checkedOn: "2026-11-24", demand: state.demand };

console.log("\n[CAD] 기준 사례 내보내기");
const { dxf, meta, stallCount } = buildDxf(state, info, { unit: "mm", floorIndex: 0, version: "r281" });

expect(dxf.includes("SECTION") && dxf.includes("ENDSEC") && dxf.includes("EOF"), "SECTION/ENDSEC/EOF 짝");
const sectionCount = (dxf.match(/(?:^|\n)0\nSECTION\n/g) || []).length;
const endsecCount = (dxf.match(/(?:^|\n)0\nENDSEC\n/g) || []).length;
expect(sectionCount === endsecCount && sectionCount >= 4, `SECTION ${sectionCount} = ENDSEC ${endsecCount} (BLOCKS 포함)`);
expect(dxf.includes("\n2\nBLOCKS\n"), "BLOCKS 섹션");
expect(!/\n0\nHATCH\n/.test(dxf), "HATCH 없음(호환)");

const missing = LAYERS.map((l) => l[0]).filter((n) => !dxf.includes(`\n2\n${n}\n`) && !dxf.includes(`\n8\n${n}\n`));
expect(missing.length === 0, `레이어 목록 포함 (${LAYERS.length}개)`);

const colors = LAYERS.map((l) => l[1]);
expect(new Set(colors).size === colors.length, "레이어 ACI 색 모두 서로 다름");
expect(STALL_LAYER.general !== STALL_LAYER.parallel, "일반·평행 주차 레이어 분리");
expect(LAYERS.find((l) => l[0] === "PD-COLUMN")[1] !== LAYERS.find((l) => l[0] === "PD-CORE")[1], "기둥·코어 색 분리");

expect(stallCount === state.stalls.length, `주차칸 엔티티 ${stallCount} = 화면 ${state.stalls.length}`);
expect(dxf.includes("PD-PLATE"), "PD-PLATE 레이어 엔티티");
expect(dxf.includes("PD-COLUMN"), "PD-COLUMN 레이어 엔티티");
expect(dxf.includes("PD-CORE"), "PD-CORE 레이어 엔티티");
expect(dxfText("한글").includes("\\U+"), "한글 \\U+ 이스케이프");
expect(dxf.includes("ANSI_949") && dxf.includes("malgun.ttf"), "코드페이지·맑은 고딕");

console.log("\n[CAD] DWG 변환");
const { data, skipped, downgraded } = await dxfToDwg(dxf);
expect(data.byteLength > 1000, `DWG 바이트 ${data.byteLength}`);
expect(skipped.length === 0, `skipped ${skipped.length}`);
expect(downgraded.length === 0, `downgraded ${downgraded.length}`);
writeFileSync("/tmp/parking-r281.dwg", data);
writeFileSync("/tmp/parking-r281.dxf", dxf);
expect(cadFilename(state, 0, false, "dwg").endsWith(".dwg"), "파일명 .dwg");

console.log(fails === 0 ? "\n실패 0개" : `\n실패 ${fails}개`);
process.exit(fails ? 1 : 0);
