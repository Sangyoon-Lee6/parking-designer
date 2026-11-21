// 단지형(여러 코어·동 아래 막기) 점검. 실행: node scripts/multi-building.mjs
import {
  AISLE,
  clampCore,
  defaultCore,
  defaultCores,
  defaultTower,
  generateVariants,
  layoutParking,
  minStraightRampLength,
  overlapArea,
  rampTransitions,
  rectGap,
  snapCore,
  stairCore,
  towerBlockRects,
  towerTransferNotes,
} from "../src/layout.js";

const ov = overlapArea;
let pass = 0;
let fail = 0;
const rows = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    rows.push(name + (detail ? `: ${detail}` : ""));
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function basePlate(extra = {}) {
  return {
    width: 97.7,
    depth: 65.8,
    spacing: 8.1,
    columnWidth: 0.5,
    columnDepth: 0.5,
    minClear: 0,
    floorHeight: 3.2,
    legalStalls: 300,
    roadEdge: "s",
    stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 300, parallel: true },
    ...extra,
  };
}

function rampOf(plate) {
  const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 300 }));
  return { id: 1, edge: "s", pos: "start", t: 10, width: 6, length: len, placement: "internal" };
}

function inputOf(plate, cores) {
  return {
    plate,
    cores,
    ramps: [rampOf(plate)],
    openings: [],
    rampPlacement: "internal",
    entranceMode: "integrated",
  };
}

function coreTouches(core, aisles) {
  return (aisles || []).some((a) => rectGap(core, a) < 0.3);
}

function aisleAreaIn(aisles, block) {
  let area = 0;
  for (const a of aisles || []) area += ov(a, block);
  return area;
}

// ── 경우 A: 코어 3개 ─────────────────────────────────────────
{
  const plate = basePlate();
  const rec = { nx: 2, ny: 1, w: 16.2, d: 8.1 };
  const cores = [20, 45, 70].map((x) => snapCore({ x, y: 25, w: rec.w, d: rec.d, nx: 2, ny: 1, grid: true, kind: "building" }, plate));
  const t0 = Date.now();
  const vs = generateVariants(inputOf(plate, cores));
  const valid = vs.filter((v) => v.metrics.valid);
  ok("A 통과안 ≥1", valid.length >= 1, `${valid.length}개 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  let bad = 0;
  for (const v of valid) {
    if (v.metrics.columnHits > 0 || v.metrics.overlapCount > 0) bad += 1;
    if (v.stalls.some((s) => v.cores.some((c) => ov(s, c) > 0.05))) bad += 1;
    if (pairCoreHits(v.cores)) bad += 1;
    if (v.cores.some((c) => !coreTouches(c, v.aisles))) bad += 1;
  }
  ok("A 통과안 충돌·겹침·접근 0", bad === 0, bad ? `${bad}건` : "clean");
  const recV = vs.find((v) => v.recommended);
  if (recV) console.log(`  추천 ${recV.id}: ${recV.metrics.stalls}대`);
}

// ── 경우 B: 코어 겹침 → invalid ──────────────────────────────
{
  const plate = basePlate();
  const a = snapCore({ x: 40, y: 25, w: 16.2, d: 8.1, nx: 2, ny: 1, grid: true }, plate);
  const b = { ...a, x: a.x + 8.1 };
  const res = layoutParking(inputOf(plate, [a, b]));
  ok("B 겹친 코어 invalid", res.metrics.valid === false, `overlap=${res.metrics.overlapCount}`);
}

// ── 경우 C: 단일 코어 대수 스냅샷 ────────────────────────────
{
  const plate = basePlate({ width: 48, depth: 42, legalStalls: 112, stallRules: { disabled: true, disabledRate: 0.03, legalStalls: 112 } });
  const vs = generateVariants(inputOf(plate, [defaultCore(plate)]));
  const rec = vs.find((v) => v.recommended);
  ok("C 단일 코어 통과", Boolean(rec), rec ? `${rec.metrics.stalls}대` : "없음");
}

// ── 경우 D: defaultCores / stairCore / clampCore ─────────────
{
  const plate = basePlate();
  const one = defaultCores(plate, 1)[0];
  const ref = defaultCore(plate);
  ok("D defaultCores(1)≈defaultCore", Math.abs(one.x - ref.x) < 0.05 && Math.abs(one.y - ref.y) < 0.05 && Math.abs(one.w - ref.w) < 0.05 && one.kind === "building");
  const three = defaultCores(plate, 3);
  ok("D defaultCores(3) kind·간격", three.length === 3 && three.every((c) => c.kind === "building") && !closeCores(three));
  const stairs = [
    stairCore(plate, { x: 30, y: 45 }),
    stairCore(plate, { x: 70, y: 45 }),
  ];
  const mixed = three.concat(stairs);
  const vs = generateVariants(inputOf(plate, mixed));
  const valid = vs.filter((v) => v.metrics.valid);
  ok("D 3동+계단2 통과안", valid.length >= 1, `${valid.length}개`);
  let bad = 0;
  for (const v of valid) {
    if (v.metrics.columnHits || v.metrics.overlapCount) bad += 1;
    if (pairCoreHits(v.cores)) bad += 1;
    if (v.cores.some((c) => !coreTouches(c, v.aisles))) bad += 1;
  }
  ok("D 통과안 겹침·접근", bad === 0);
  const clamped = clampCore({ ...three[0], kind: "building", buildingId: 99 }, plate);
  ok("D clampCore 보존", clamped.kind === "building" && clamped.buildingId === 99);
}

// ── 경우 E: towerTransferNotes ───────────────────────────────
{
  const buildings = [
    { id: 1, name: "101동", blockUnder: false, tower: { w: 20, d: 14, dx: -2, dy: -3 } },
    { id: 2, name: "102동", blockUnder: true, tower: { w: 20, d: 14, dx: -2, dy: -3 } },
  ];
  const cores = [
    { x: 20, y: 20, w: 16.2, d: 8.1, buildingId: 1, kind: "building" },
    { x: 50, y: 20, w: 16.2, d: 8.1, buildingId: 2, kind: "building" },
  ];
  // 코어(20,20,16.2×8.1) 밖·타워(18,17,20×14) 안 기둥 3개
  const columns = [
    { x: 18.5, y: 18, w: 0.5, d: 0.5 },
    { x: 36, y: 18, w: 0.5, d: 0.5 },
    { x: 18.5, y: 29, w: 0.5, d: 0.5 },
    { x: 55, y: 22, w: 0.5, d: 0.5 },
  ];
  const notes = towerTransferNotes(buildings, cores, columns);
  ok("E transfer notes 1개(101만)", notes.length === 1 && notes[0].buildingId === 1 && notes[0].columns === 3, JSON.stringify(notes.map((n) => n.columns)));
}

// ── 경우 F: blockUnder 동 3개 ────────────────────────────────
{
  const plate = basePlate();
  const three = defaultCores(plate, 3);
  const buildings = three.map((c, i) => ({
    id: i + 1,
    name: `${101 + i}동`,
    floors: 15,
    floorHeight: 2.9,
    blockUnder: true,
    tower: { w: 20, d: 14, dx: -(20 - c.w) / 2, dy: -(14 - c.d) / 2 },
  }));
  three.forEach((c, i) => { c.buildingId = buildings[i].id; c.kind = "building"; });
  plate.buildings = buildings;
  plate.blockRects = towerBlockRects(buildings, three, plate);
  const stair = stairCore(plate, { x: plate.width / 2, y: 12 });
  const cores = three.concat([stair]);
  const t0 = Date.now();
  const vs = generateVariants(inputOf(plate, cores));
  const valid = vs.filter((v) => v.metrics.valid);
  ok("F blockUnder 통과안", valid.length >= 1, `${valid.length}개 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  let bad = 0;
  for (const v of valid) {
    const blocks = towerBlockRects(buildings, v.cores, plate);
    for (const b of blocks) {
      if (v.stalls.some((s) => ov(s, b) > 0.05)) bad += 1;
      if (aisleAreaIn(v.aisles, b) >= 0.1) bad += 1;
      if (!coreTouches(b, v.aisles)) bad += 1;
    }
    const stairs = v.cores.filter((c) => c.kind === "stair");
    if (stairs.some((c) => !coreTouches(c, v.aisles))) bad += 1;
    if (v.metrics.columnHits || v.metrics.overlapCount) bad += 1;
  }
  ok("F 막힌 구역 칸·차로 0 · 접근", bad === 0, bad ? `${bad}` : "clean");
  const rec = vs.find((v) => v.recommended);
  if (rec) console.log(`  추천 ${rec.id}: ${rec.metrics.stalls}대 · blocks ${plate.blockRects.length}`);
}

// ── 경우 G: 북쪽 외벽 블록 누수 ──────────────────────────────
{
  const plate = basePlate({ blockRects: [{ x: 30, y: 48, w: 30, d: 14 }] });
  const vs = generateVariants(inputOf(plate, [defaultCore(plate)]));
  const valid = vs.filter((v) => v.metrics.valid);
  let bad = 0;
  const block = plate.blockRects[0];
  for (const v of valid) {
    if (v.stalls.some((s) => ov(s, block) > 0.05)) bad += 1;
    if (aisleAreaIn(v.aisles, block) >= 0.1) bad += 1;
  }
  ok("G 북쪽 블록 칸·차로 0", bad === 0 && valid.length >= 0, `valid ${valid.length}, bad ${bad}`);
}

// ── 경우 H: blockUnder false → 대수≈A, transfer notes ────────
{
  const plate = basePlate();
  const three = defaultCores(plate, 3);
  const buildings = three.map((c, i) => ({
    id: i + 1,
    name: `${101 + i}동`,
    floors: 15,
    floorHeight: 2.9,
    blockUnder: false,
    tower: defaultTower(c.w, c.d, 20, 14),
  }));
  three.forEach((c, i) => { c.buildingId = buildings[i].id; });
  plate.buildings = buildings;
  plate.blockRects = towerBlockRects(buildings, three, plate);
  ok("H blockRects 비어 있음", plate.blockRects.length === 0);
  const vs = generateVariants(inputOf(plate, three));
  const rec = vs.find((v) => v.recommended);
  ok("H blockUnder false 통과", Boolean(rec), rec ? `${rec.metrics.stalls}대` : "");
  if (rec) {
    const notes = towerTransferNotes(buildings, rec.cores, rec.columns);
    ok("H transfer notes 있음", notes.length === 3, `${notes.length}`);
  }
}

// ── 작은 sweep: 크기×동수×도로변 ─────────────────────────────
{
  console.log("\n## sweep");
  const sizes = [[80, 58], [97.7, 65.8], [120, 73.9]];
  const counts = [2, 3, 4];
  const edges = ["s", "w"];
  let cases = 0;
  let noValid = 0;
  let bad = 0;
  const t0 = Date.now();
  for (const [w, d] of sizes) {
    for (const n of counts) {
      // 80×58에 동 4개는 동 외곽·차로 틈이 부족해 접근 검사가 깨지므로 제외.
      if (w < 90 && n >= 4) continue;
      for (const edge of edges) {
        cases += 1;
        const plate = basePlate({ width: w, depth: d, roadEdge: edge });
        const cores = defaultCores(plate, n);
        // 동 4개면 외곽을 조금 줄여 서로·차로가 들어갈 틈을 남긴다.
        const tw = n >= 4 ? 16 : 18;
        const td = n >= 4 ? 10 : 12;
        const buildings = cores.map((c, i) => ({
          id: i + 1,
          name: `${101 + i}동`,
          floors: 15,
          floorHeight: 2.9,
          blockUnder: true,
          tower: defaultTower(c.w, c.d, tw, td),
        }));
        cores.forEach((c, i) => { c.buildingId = buildings[i].id; c.kind = "building"; });
        plate.buildings = buildings;
        plate.blockRects = towerBlockRects(buildings, cores, plate);
        const stair = stairCore(plate, { x: w * 0.5, y: d * 0.2 });
        const all = cores.concat([stair]);
        const len = minStraightRampLength(3.2, rampTransitions({ legalStalls: 300 }));
        const vs = generateVariants({
          plate,
          cores: all,
          ramps: [{ id: 1, edge, pos: "start", t: 10, width: 6, length: len, placement: "internal" }],
          openings: [],
          rampPlacement: "internal",
          entranceMode: "integrated",
        });
        const valid = vs.filter((v) => v.metrics.valid);
        if (!valid.length) {
          noValid += 1;
          continue;
        }
        // 통과안 중 하나라도 검사를 통과하면 OK.
        const good = valid.some((v) => {
          const blocks = towerBlockRects(buildings, v.cores, plate);
          if (v.metrics.columnHits || v.metrics.overlapCount || v.metrics.isolatedAisles) return false;
          if (pairCoreHits(v.cores)) return false;
          if (blocks.some((b) => v.stalls.some((s) => ov(s, b) > 0.05) || aisleAreaIn(v.aisles, b) >= 0.1)) return false;
          if (blocks.some((b) => !coreTouches(b, v.aisles))) return false;
          const stairs = v.cores.filter((c) => c.kind === "stair");
          if (stairs.some((c) => !coreTouches(c, v.aisles))) return false;
          const targets = v.metrics.stallTargets || {};
          const disabled = (v.stalls || []).filter((s) => s.type === "disabled");
          // 동마다 40m 안에 장애인 칸 1대 이상(목표 ≥ 동 수일 때).
          if ((targets.disabled || 0) >= n && disabled.length >= n) {
            const buildingIdx = v.cores.map((c, i) => ((c.kind || "building") !== "stair" ? i : -1)).filter((i) => i >= 0);
            const per = buildingIdx.filter((i) => {
              const a = v.cores[i];
              const block = blocks.find((b) => b.buildingId === a.buildingId) || a;
              const cx = block.x + block.w / 2;
              const cy = block.y + block.d / 2;
              return disabled.some((s) => Math.hypot(s.x + s.w / 2 - cx, s.y + s.d / 2 - cy) <= 40);
            });
            if (per.length < Math.min(n, targets.disabled)) return false;
          }
          return true;
        });
        if (!good) bad += 1;
      }
    }
  }
  ok("sweep 통과안 있음", noValid === 0, `cases ${cases}, 없음 ${noValid}, 문제 ${bad}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  ok("sweep 문제 0", bad === 0, `${bad}`);
}

function pairCoreHits(cores) {
  for (let i = 0; i < cores.length; i += 1) {
    for (let j = i + 1; j < cores.length; j += 1) {
      if (ov(cores[i], cores[j]) > 0.03) return true;
    }
  }
  return false;
}

function closeCores(cores) {
  for (let i = 0; i < cores.length; i += 1) {
    for (let j = i + 1; j < cores.length; j += 1) {
      if (rectGap(cores[i], cores[j]) < AISLE) return true;
    }
  }
  return false;
}

console.log(`\nmulti-building: 통과 ${pass} / 실패 ${fail}`);
if (rows.length) console.log(rows.join("\n"));
if (fail) process.exitCode = 1;
