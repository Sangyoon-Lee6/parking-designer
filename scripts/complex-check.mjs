/**
 * 단지형 차로 먼저 결과 하나를 독립 검사한다.
 * 사용: node scripts/complex-check.mjs
 * 또는 import { checkComplex } from "./complex-check.mjs"
 */
import { countOverlaps, AISLE } from "../src/layout.js";
import { layoutComplex } from "../src/complexLayout.js";

const EPS = 0.05;

function pointIn(rect, x, y) {
  return x >= rect.x - 1e-6 && x <= rect.x + rect.w + 1e-6 && y >= rect.y - 1e-6 && y <= rect.y + rect.d + 1e-6;
}

/** 0.5m 격자 흐름: 입구에서 차로·칸 앞까지 닿는지 */
function floodReachable(result, plate) {
  const step = 0.5;
  const W = plate.width;
  const D = plate.depth;
  const cols = Math.ceil(W / step);
  const rows = Math.ceil(D / step);
  const blocked = new Uint8Array(cols * rows);
  const towers = result.towers || plate.blockRects || [];
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const x = (ix + 0.5) * step;
      const y = (iy + 0.5) * step;
      const hitTower = towers.some((t) => pointIn(t, x, y));
      const onAisle = (result.aisles || []).some((a) => pointIn(a, x, y));
      // 차로만 통행 가능
      if (hitTower || !onAisle) blocked[iy * cols + ix] = 1;
    }
  }
  const entry = (result.aisles || []).find((a) => a.role === "entry") || (result.aisles || [])[0];
  if (!entry) return { aisleOk: false, stallOk: false, reached: 0 };
  const sx = Math.min(cols - 1, Math.max(0, Math.floor((entry.x + entry.w / 2) / step)));
  const sy = Math.min(rows - 1, Math.max(0, Math.floor((entry.y + entry.d / 2) / step)));
  const seen = new Uint8Array(cols * rows);
  const q = [];
  if (!blocked[sy * cols + sx]) {
    q.push(sx, sy);
    seen[sy * cols + sx] = 1;
  } else {
    // 입구 주변 탐색
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (!blocked[y * cols + x] && !seen[y * cols + x]) {
          seen[y * cols + x] = 1;
          q.push(x, y);
        }
      }
    }
  }
  let qi = 0;
  while (qi < q.length) {
    const x = q[qi++];
    const y = q[qi++];
    const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nbs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      if (seen[i] || blocked[i]) continue;
      seen[i] = 1;
      q.push(nx, ny);
    }
  }
  let aisleCells = 0;
  let aisleHit = 0;
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const x = (ix + 0.5) * step;
      const y = (iy + 0.5) * step;
      if (!(result.aisles || []).some((a) => pointIn(a, x, y))) continue;
      if (towers.some((t) => pointIn(t, x, y))) continue;
      aisleCells += 1;
      if (seen[iy * cols + ix]) aisleHit += 1;
    }
  }
  const stallFrontOk = (result.stalls || []).every((s) => {
    const face = s.aisle || s.face || "n";
    const fx = face === "e" ? s.x + s.w + 0.5
      : face === "w" ? s.x - 0.5
        : s.x + s.w / 2;
    const fy = face === "n" ? s.y + s.d + 0.5
      : face === "s" ? s.y - 0.5
        : s.y + s.d / 2;
    const ix = Math.min(cols - 1, Math.max(0, Math.floor(fx / step)));
    const iy = Math.min(rows - 1, Math.max(0, Math.floor(fy / step)));
    return !!seen[iy * cols + ix];
  });
  return {
    aisleOk: aisleCells === 0 || aisleHit / aisleCells > 0.95,
    stallOk: stallFrontOk,
    reached: aisleHit,
    aisleCells,
  };
}

function aisleWidthOk(aisles) {
  return (aisles || []).every((a) => {
    // 진행 방향에 수직인 폭 (along 우선, 없으면 긴 쪽을 진행으로)
    const along = a.along || (a.w >= a.d ? "x" : "y");
    const width = along === "x" ? a.d : a.w;
    return width >= AISLE - 0.02;
  });
}

function towerAccessOk(tower, aisles) {
  return (aisles || []).some((a) => {
    const ox = Math.min(tower.x + tower.w, a.x + a.w) - Math.max(tower.x, a.x);
    const oy = Math.min(tower.y + tower.d, a.y + a.d) - Math.max(tower.y, a.y);
    if (ox >= 3 - EPS && oy >= -EPS && oy < 0.35) return true;
    if (oy >= 3 - EPS && ox >= -EPS && ox < 0.35) return true;
    return false;
  });
}

export function checkComplex(result, input) {
  const problems = [];
  if (!result) {
    problems.push("결과 없음");
    return { ok: false, problems };
  }
  const plate = result.plate || input.plate;
  const towers = result.towers || input.towers || [];
  // 동 외곽을 코어 자리에 넘겨 칸·차로·기둥과의 겹침을 센다(내부 코어와 중복 넣지 않음).
  const coresAsTowers = towers.map((t, i) => ({ ...t, id: `tw${i}` }));
  const overlap = countOverlaps(result, coresAsTowers, [], { ...plate, blockRects: [] });
  if (overlap > 0) problems.push(`겹침 ${overlap}`);

  const flood = floodReachable(result, plate);
  if (!flood.aisleOk) problems.push("차로 흐름 미달");
  if (!flood.stallOk) problems.push("칸 진입 불가");

  (result.stalls || []).forEach((s, i) => {
    const w = Math.min(s.w, s.d);
    const d = Math.max(s.w, s.d);
    if (w < 2.45 || d < 4.95) problems.push(`칸크기#${i}`);
  });

  towers.forEach((t) => {
    if (!towerAccessOk(t, result.aisles)) problems.push(`${t.name || "동"} 접근 없음`);
  });

  if (!aisleWidthOk(result.aisles)) problems.push("차로 폭 부족");

  if (!result.metrics?.connected) problems.push("동선 끊김");
  if (result.metrics && !result.metrics.valid) problems.push(`valid=false (${result.metrics.rejected || "?"})`);

  return { ok: problems.length === 0, problems, flood, stalls: result.metrics?.stalls };
}

function acceptanceInput() {
  const towers = [
    { x: 12, y: 48, w: 24, d: 14, name: "101동", buildingId: "b1" },
    { x: 44, y: 48, w: 24, d: 14, name: "102동", buildingId: "b2" },
    { x: 78, y: 20, w: 14, d: 24, name: "103동", buildingId: "b3" },
  ];
  const cores = towers.map((t, i) => ({
    id: i + 1,
    x: t.x + (t.w - 8.1) / 2,
    y: t.y + (t.d - 8.1) / 2,
    w: 8.1,
    d: 8.1,
    kind: "building",
    buildingId: t.buildingId,
  }));
  const plate = {
    width: 98,
    depth: 66,
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
    ramps: [{ id: 1, edge: "w", t: 10, width: 6.5, length: 22, placement: "external" }],
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("complex-check.mjs");
if (isMain) {
  const input = acceptanceInput();
  const { best } = layoutComplex(input);
  const check = checkComplex(best, input);
  const stalls = best?.metrics?.stalls || 0;
  const ext = best?.metrics?.stallTypes?.extended || 0;
  const extT = best?.metrics?.stallTargets?.extended || 0;
  const dis = best?.metrics?.stallTypes?.disabled || 0;
  const disT = best?.metrics?.stallTargets?.disabled || 0;
  console.log(JSON.stringify({
    stalls,
    valid: best?.metrics?.valid,
    access: best?.metrics?.coreAccess,
    ext: `${ext}/${extT}`,
    dis: `${dis}/${disT}`,
    check,
    pass: check.ok && stalls >= 170 && ext >= extT && dis >= disT,
  }, null, 2));
  if (!(check.ok && stalls >= 170)) process.exitCode = 1;
}
