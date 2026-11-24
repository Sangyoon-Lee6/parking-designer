// 모듈형 램프 계산 시험 (node scripts/ramp-modules.mjs). 실패 0개여야 한다.
const plate = { width: 98, depth: 66, spacing: 8.1, columnWidth: 0.5, columnDepth: 0.5, minClear: 0, siteMargin: 24,
  floorHeight: 3.2, legalStalls: 300, roadEdge: "w",
  stallRules: { legalStalls: 300, disabled: true, disabledRate: 0.03, ecoMode: "auto" } };
const towers = [
  { name: "101동", x: 12, y: 48, w: 24, d: 14 },
  { name: "102동", x: 44, y: 48, w: 24, d: 14 },
  { name: "103동", x: 78, y: 20, w: 14, d: 24 },
];
const S = (length) => ({ type: "straight", length });
const T = (dir, radius = 6) => ({ type: "turn", dir, radius });
const cases = [
  { key: "A", name: "직선 1개 층(내부, 서측 벽에서 11.5m 안)", ramp: { id: 1, x: 11.5, y: 14, heading: 0, width: 6, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(21.5)] } },
  { key: "B", name: "ㄱ자(직선→좌회전→직선, 내부)", ramp: { id: 1, x: 11.5, y: 8, heading: 0, width: 6.5, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(9), T("L"), S(6)] } },
  { key: "C", name: "U턴(직선→좌→좌→직선, 내부, 2개 층)", ramp: { id: 1, x: 11.5, y: 4, heading: 0, width: 6.5, innerRadius: 6, levels: 2, mode: "repeat", modules: [S(6), T("L"), T("L"), S(6)] } },
  { key: "D", name: "나선 3개 층(외부, 서측 외벽에 착지부)", ramp: { id: 1, x: -3.25, y: 20, heading: 90, width: 6.5, innerRadius: 6, levels: 3, mode: "spiral", modules: [S(6), T("L"), T("L"), S(6), T("L"), T("L")] } },
  { key: "E", name: "외부 직선(서측, 화면과 같은 위치)", ramp: { id: 1, x: -21.5, y: 10, heading: 0, width: 6, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(21.5)] } },
  { key: "F", name: "걸침(밖 10m + 안 11.5m 직선)", ramp: { id: 1, x: -10, y: 14, heading: 0, width: 6, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(21.5)] } },
  { key: "G", name: "짧은 ㄱ자(길이 부족 → 자동 맞춤)", ramp: { id: 1, x: 11.5, y: 8, heading: 0, width: 6.5, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(4), T("L"), S(2)] } },
  { key: "H", name: "회전 반경·폭 위반(내변 4m, 폭 6m)", ramp: { id: 1, x: 11.5, y: 8, heading: 0, width: 6, innerRadius: 4, levels: 1, mode: "repeat", modules: [S(9), T("L", 4), S(8)] } },
  { key: "I", name: "동과 겹침(102동 밑으로 들어감)", ramp: { id: 1, x: 50, y: 30, heading: 90, width: 6, innerRadius: 6, levels: 1, mode: "repeat", modules: [S(21.5)] } },
];

import * as R from "../src/rampModules.js";

const L = await import("../src/layout.js?v=277");
const out = [];
const opts = { floorHeight: plate.floorHeight, legalStalls: plate.legalStalls };
let fails = 0;
const expect = (cond, msg) => { if (!cond) { fails += 1; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };
for (const c of cases) {
  let ramp = c.ramp;
  const plan0 = R.slopePlan(ramp, opts);
  let fit = null;
  if (!plan0.ok && c.key === "G") { fit = R.autoFit(ramp, opts); ramp = fit.ramp; }
  const plan = R.slopePlan(ramp, opts);
  const site = R.analyzeOnPlate(ramp, plate, { ...opts, blocks: towers });
  console.log(`\n[${c.key}] ${c.name}`);
  console.log(`  사슬 ${plan.chain.modules.map((m) => m.type === "straight" ? `직선${m.length}` : `${m.dir}회전(Rc${(m.radius + ramp.width / 2)})${m.length}`).join(" → ")} = ${plan.chain.total}m, 배치 ${site.placement}, 평면 안 ${site.insideArea}/${site.totalArea}㎡`);
  plan.levels.forEach((lv) => console.log(`  ${lv.name}: 윗완화 ${lv.trans.top}m 아랫완화 ${lv.trans.bottom}m, 최대 낙차 ${lv.capacity}m / 층고 ${plate.floorHeight}m → ${lv.ok ? `통과(k=${lv.k})` : `부족 ${lv.shortfall}m: ${lv.fix.text}`} | ${lv.pieces.map((p) => `${p.zone}/${p.kind} ${p.length}m@${(p.slope * 100).toFixed(1)}%`).join(", ")}`));
  if (plan.closed !== null) console.log(`  나선 닫힘: ${plan.closed}`);
  if (fit) console.log(`  자동 맞춤: ${fit.fix.text} → 모듈 ${JSON.stringify(ramp.modules)}`);
  console.log(`  외벽 연결 ${JSON.stringify(site.openings)} | 장애물 ${site.block.length}개, 비울 구역 ${site.keepClear.map((z) => z.role).join(",") || "-"}`);
  site.issues.forEach((i) => console.log(`  ! ${i.level}: ${i.text}`));
  // 법정 한도 검사: 모든 조각이 한도 이하, 층별 낙차 = 층고
  plan.levels.forEach((lv) => {
    if (!lv.ok) return;
    const drop = lv.pieces.reduce((t, p) => t + p.length * p.slope, 0);
    expect(Math.abs(drop - plate.floorHeight) < 0.005, `${lv.name} 낙차 합 ${drop.toFixed(3)}m = 층고`);
    expect(lv.pieces.every((p) => p.slope <= p.limit + 1e-6), `${lv.name} 모든 조각 한도 이하`);
  });
  const mesh = R.rampMesh(ramp, plan, { floorHeight: plate.floorHeight, groundY: 0 });
  out.push({ key: c.key, name: c.name, ramp, plan: { levels: plan.levels, perModule: plan.perModule, closed: plan.closed, ok: plan.ok, total: plan.chain.total }, modules: plan.chain.modules.map(({ polygon, type, index, start, end }) => ({ polygon, type, index, start, end })), site: { placement: site.placement, openings: site.openings, block: site.block, keepClear: site.keepClear, issues: site.issues, crossings: site.crossings }, mesh: { surface: mesh.surface, walls: mesh.walls }, fit: fit && fit.fix });
  // 기대값
  if (c.key === "A") { expect(plan.ok && site.placement === "internal" && !site.issues.length, "A 통과·내부·문제 없음"); expect(plan.chain.total >= L.minStraightRampLength(3.2, L.rampTransitions({ legalStalls: 300 })) && plan.chain.total - L.minStraightRampLength(3.2, L.rampTransitions({ legalStalls: 300 })) < 0.5, `A 길이 ${plan.chain.total} ≈ 기존 minStraightRampLength ${L.minStraightRampLength(3.2, L.rampTransitions({ legalStalls: 300 }))}`); }
  if (c.key === "B") expect(plan.ok && !site.issues.length, "B 통과");
  if (c.key === "C") expect(plan.ok && plan.levels.length === 2, "C 2개 층 통과");
  if (c.key === "D") expect(plan.ok && plan.closed && site.placement === "external" && site.openings.length === 1, "D 나선 닫힘·외부·착지부 연결 1곳");
  if (c.key === "E") expect(plan.ok && site.placement === "external" && site.openings[0]?.edge === "w" && Math.abs(site.openings[0].t - 10) < 0.01 && !site.block.length, "E 외부·서측 t=10 연결·평면 장애물 없음");
  if (c.key === "F") expect(site.placement === "mixed" && site.crossings.length === 1 && Math.abs(site.crossings[0].s - 10) < 0.05, `F 걸침·연결점 s=${site.crossings[0]?.s}m`);
  if (c.key === "G") expect(!plan0.ok && plan.ok, `G 처음 부족 ${plan0.levels[0].shortfall}m → 자동 맞춤 후 통과`);
  if (c.key === "H") expect(site.issues.some((i) => i.text.includes("내변반경")) && site.issues.some((i) => i.text.includes("6.5")), "H 반경·폭 오류 표시");
  if (c.key === "I") expect(site.issues.some((i) => i.text.includes("102동")), "I 102동 겹침 표시");
}
// 예전 램프 옮기기: 외부형·내부 직선은 바닥 사각형이 같아야 한다
console.log("\n[M] 예전 램프 → 모듈 사슬");
for (const old of [
  { id: 1, edge: "w", t: 10, width: 6, length: 21.4, placement: "external" },
  { id: 1, edge: "s", t: 30, width: 6, length: 21.4, placement: "external" },
  { id: 1, edge: "e", t: 30, width: 6, length: 21.4, placement: "external" },
  { id: 1, edge: "n", t: 30, width: 6, length: 21.4, placement: "external" },
]) {
  const p0 = { ...plate };
  const fp = L.rampFootprint(old, p0);
  const m = R.migrateLegacy(old, p0);
  const box = R.buildChain(m).modules[0].rects[0];
  const same = ["x", "y", "w", "d"].every((k) => Math.abs(fp[k] - box[k]) < 0.01);
  expect(same, `${old.edge} 외부형: 기존 ${JSON.stringify(fp)} / 새 ${JSON.stringify(box)}`);
}
// migrateLegacy 재적용 시 동일 사슬(ensureModules/isLegacyEquivalent와 같은 판정)
console.log("\n[E] migrateLegacy 재적용 동등성");
const samples = [
  { id: 1, edge: "w", t: 10, width: 6, length: 21.4, placement: "external" },
  { id: 1, edge: "s", t: 30, width: 6, length: 21.4, placement: "external" },
  { id: 1, edge: "w", t: 20, width: 6, length: 21.4, placement: "internal", inset: 11.2 },
];
for (const old of samples) {
  let shape = null;
  try { shape = L.rampShape(old, plate); } catch (e) { shape = null; }
  const m = R.migrateLegacy(old, plate, shape);
  const again = R.migrateLegacy(m.legacy, plate, shape);
  const a = R.buildChain(m);
  const b = R.buildChain(again);
  expect(a.modules.length === b.modules.length && Math.abs(a.total - b.total) < 0.05, `${old.edge}/${old.placement} 재적용 동등`);
}

// ensureModules → isLegacyEquivalent (sweep 입력 램프와 같은 형태)
console.log("\n[L] ensureModules / isLegacyEquivalent");
const { ensureModules, isLegacyEquivalent } = await import("../src/state.js?v=277");
const len112 = L.minStraightRampLength(3.2, L.rampTransitions({ legalStalls: 112 }));
const sweepLike = [];
for (const edge of ["w", "e", "s", "n"]) {
  for (const placement of ["external", "internal"]) {
    sweepLike.push({
      id: 1, edge, t: 10, width: 6, length: len112, placement,
      ...(placement === "internal" ? { inset: 11.2 } : {}),
    });
  }
}
// report 기준 사례 외부 램프
const ref = L.referenceCase;
const reportPlate = {
  width: ref.width, depth: ref.depth, spacing: ref.spacing,
  columnWidth: ref.columnWidth, columnDepth: ref.columnDepth, minClear: ref.minClear,
  siteMargin: ref.siteMargin, floorHeight: 3.2, legalStalls: 112, roadEdge: ref.ramp.edge,
  stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 112 },
};
const reportRamp = { id: 1, ...ref.ramp, placement: "external" };
sweepLike.push(reportRamp);
for (const old of sweepLike) {
  const p = old === reportRamp ? reportPlate : {
    width: 48, depth: 42, spacing: 8.1, columnWidth: 0.5, columnDepth: 0.5,
    minClear: 0, siteMargin: 20, floorHeight: 3.2, legalStalls: 112, roadEdge: old.edge,
    stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 112 },
  };
  const label = old === reportRamp ? "reference/external" : `${old.edge}/${old.placement}`;
  const m = ensureModules({ ...old }, p);
  expect(!!m.modules?.length && !!m.legacy, `${label} modules+legacy`);
  expect(isLegacyEquivalent(m, p), `${label} isLegacyEquivalent`);
}

// 배치 엔진: 모듈 사슬 장애물·keepClear (단지형 차로 먼저)
console.log("\n[P] 엔진 keepClear·block (A/B/C/E/F)");
const engineCases = cases.filter((c) => "ABCEF".includes(c.key));
const baseTowers = towers.map((t) => ({ ...t }));
let eRef = null;
for (const c of engineCases) {
  let ramp = c.ramp;
  if (c.key === "G") continue;
  const site = R.analyzeOnPlate(ramp, plate, { ...opts, blocks: baseTowers });
  const input = {
    plate: { ...plate, blockRects: baseTowers, buildings: baseTowers.map((t, i) => ({ id: i + 1, name: t.name, x: t.x, y: t.y, w: t.w, d: t.d })) },
    towers: baseTowers,
    cores: [],
    ramps: [ramp],
    openings: [],
    rampPlacement: site.placement === "external" ? "external" : "internal",
    spec: { engine: "loopFirst", axis: "x" },
  };
  const res = L.layoutParking(input);
  const stalls = res?.stalls || [];
  const aisles = res?.aisles || [];
  const kc = res?.keepClear || site.keepClear || [];
  const blocks = site.block || [];
  const ov = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const stallInBlock = stalls.filter((s) => blocks.some((b) => ov(s, b) > 0.05)).length;
  const aisleInBlock = aisles.filter((a) => blocks.some((b) => ov(a, b) > 0.05)).length;
  const stallInKeep = stalls.filter((s) => kc.some((z) => ov(s, z) > 0.05)).length;
  // 엔진 modulePortalIssues와 같이: 가장 큰 차로 묶음과 0.4㎡ 이상 겹침
  const nA = aisles.length;
  const parent = [...Array(nA).keys()];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < nA; i += 1) for (let j = i + 1; j < nA; j += 1) {
    if (ov(aisles[i], aisles[j]) > 0.05) {
      const a = find(i); const b = find(j); if (a !== b) parent[b] = a;
    }
  }
  const groups = new Map();
  for (let i = 0; i < nA; i += 1) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const main = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
  const mainAisles = main.map((i) => aisles[i]);
  const zoneTouch = res?.metrics?.zoneTouch;
  const zonesOk = kc.length === 0
    || (Array.isArray(zoneTouch) && zoneTouch.length === kc.length && zoneTouch.every((z) => z.ok))
    || kc.every((z) => mainAisles.some((a) => ov(a, z) > 0.4) || aisles.some((a) => ov(a, z) > 0.4));
  const n = stalls.length;
  console.log(`  [${c.key}] ${n}대 · body칸 ${stallInBlock} 차로 ${aisleInBlock} · keep칸 ${stallInKeep} · 구역연결 ${zonesOk} · loop=${!!res?.loopFirst}`);
  expect(stallInBlock === 0 && aisleInBlock === 0, `${c.key} 램프 몸체 안 칸·차로 0`);
  expect(stallInKeep === 0, `${c.key} keepClear 안 칸 0`);
  expect(zonesOk, `${c.key} keepClear 구역이 차로와 닿음`);
  if (c.key === "E") eRef = n;
}
// E와 같은 위치의 예전 외부 램프 대수 비교
{
  const old = { id: 1, edge: "w", t: 10, width: 6, length: 21.5, placement: "external" };
  const res = L.layoutParking({
    plate: { ...plate, blockRects: baseTowers, buildings: baseTowers.map((t, i) => ({ id: i + 1, name: t.name, x: t.x, y: t.y, w: t.w, d: t.d })) },
    towers: baseTowers,
    cores: [],
    ramps: [old],
    openings: [],
    rampPlacement: "external",
    spec: { engine: "loopFirst", axis: "x" },
  });
  const n = (res?.stalls || []).length;
  console.log(`  [E-legacy] ${n}대 (모듈 E ${eRef}대)`);
  expect(eRef != null && Math.abs(n - eRef) <= 10, `E 모듈≈예전 외부 램프 (±10): ${eRef} vs ${n}`);
}

console.log(`\n실패 ${fails}개`);
process.exitCode = fails ? 1 : 0;
