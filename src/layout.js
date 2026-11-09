/**
 * 주차장법 시행규칙 제3조·제6조. 확인 2026-11-08. law.go.kr
 * 주차단위구획 2.5×5.0m, 직각 차로 6m, 직선 램프 17% 이하.
 * 기둥 기본 단면 0.5×0.5m. 중심 간격과 주차 간격(2.5m)은 따로 계산한다.
 */
export const STALL_W = 2.5;
export const STALL_D = 5;
export const AISLE = 6;
export const COLUMN = 0.5;
export const FLOOR_H = 3.2;
export const CLEAR_HEIGHT = 2.3;
export const RAMP_SLOPE_STRAIGHT = 0.17;
export const RAMP_SLOPE_CURVE = 0.14;
export const CURB_H = 0.15;
export const CURB_W = 0.3;
export const LINE_W = 0.1;
export const WALL_T = 0.2;
export const CORE_GAP = 0.5;

/**
 * 첨부 지하 1층 도면에서 읽은 값과, 잘린 이미지라 확정하지 못한 값.
 * 확정: 기둥 중심 간격 8100(도면에 반복 표기).
 * 추정(불확실): 가로 9모듈=72.9m, 세로 7모듈=56.7m. 첨부 범위 밖으로 치수 합계가 잘려 있다.
 * 추정(불확실): 코어 2개, 각 16.2×11m·16.2×10m, 평면 안쪽 아래·위.
 * 추정(불확실): 서쪽 외부 램프 폭 6m. 길이 18.9m는 층고 3.2m / 17%로 역산(도면에 램프 길이 없음).
 * 추정(불확실): 대지 여유 24m. 도면에 대지경계 치수가 없어 램프가 대지 안에 남도록 둔 값.
 * 추정(불확실): 램프 중심 t=28m. 아래쪽 코어 옆으로 읽음.
 */
export const referenceCase = {
  projectName: "대학 건물 지하 1층",
  width: 72.9,
  depth: 56.7,
  spacing: 8.1,
  columnWidth: 0.5,
  columnDepth: 0.5,
  minClear: 0.05,
  siteMargin: 24,
  rampPlacement: "external",
  entranceMode: "integrated",
  circulation: "ccw",
  ramp: { edge: "w", t: 28, width: 6, length: 18.9 },
  cores: [
    { x: 24.3, y: 17.5, w: 16.2, d: 11 },
    { x: 24.3, y: 34.5, w: 16.2, d: 10 },
  ],
  notes: [
    "기둥 중심 간격 8.1m는 도면의 8100 표기다.",
    "평면 72.9×56.7m는 8.1m 모듈 9×7로 읽은 추정값이다. 첨부 도면은 외곽 치수 합계가 잘려 있다.",
    "코어 크기·위치, 램프 길이 18.9m, 대지 여유 24m, 램프 위치 28m는 도면에 수치가 없어 모듈에 맞춘 추정이다.",
    "램프는 도면의 왼쪽 램프처럼 건축선 밖 외부형이고, 출입구는 그 개구부에 붙인다.",
  ],
};

export function minStraightRampLength(floorHeight = FLOOR_H) {
  return Math.ceil((floorHeight / RAMP_SLOPE_STRAIGHT) * 10) / 10;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function basementCount(required, stallsPerFloor) {
  if (stallsPerFloor <= 0) return 0;
  return Math.max(1, Math.ceil(required / stallsPerFloor));
}

/** 순간격 = 중심 간격 − 기둥 폭. 한 칸 대수 = floor((순간격 − 2×최소 이격) / 2.5). */
export function stallsPerBay(spacing, columnWidth = COLUMN, minClear = 0.05) {
  const module = Number(spacing) || 0;
  const width = Number(columnWidth) || 0;
  const clear = module - width;
  const count = Math.max(0, Math.floor((clear - 2 * minClear + 1e-9) / STALL_W));
  const gap = count > 0 ? (clear - count * STALL_W) / 2 : 0;
  return {
    count,
    gap: round3(gap),
    clear: round3(clear),
  };
}

/** 주차칸 사각형과 기둥 사각형이 겹치거나 간격이 최소 이격보다 작은 쌍의 수. */
export function stallColumnHits(stalls, columns, minClear = 0.05) {
  let hits = 0;
  (stalls || []).forEach((stall) => {
    (columns || []).forEach((column) => {
      if (rectGap(stall, column) < minClear - 1e-4) hits += 1;
    });
  });
  return hits;
}

export function ringInset() {
  return STALL_D + AISLE;
}

export function defaultCore(plate) {
  const inset = ringInset();
  const innerW = Math.max(4, plate.width - inset * 2);
  const innerD = Math.max(4, plate.depth - inset * 2);
  const area = Math.min(80, innerW * innerD * 0.16);
  const aspect = innerW / innerD;
  let w = Math.sqrt(Math.max(area, 16) * aspect);
  let d = Math.max(area, 16) / w;
  w = clamp(w, 4, innerW);
  d = clamp(d, 4, innerD);
  return clampCore({
    x: inset + (innerW - w) / 2,
    y: inset + (innerD - d) / 2,
    w,
    d,
  }, plate);
}

export function rampFootprint(ramp, plate) {
  const { edge, t, width, length } = ramp;
  const external = (ramp.placement || "internal") === "external";
  if (edge === "s") return { x: t - width / 2, y: external ? -length : 0, w: width, d: length };
  if (edge === "n") return { x: t - width / 2, y: external ? plate.depth : plate.depth - length, w: width, d: length };
  if (edge === "w") return { x: external ? -length : 0, y: t - width / 2, w: length, d: width };
  return { x: external ? plate.width : plate.width - length, y: t - width / 2, w: length, d: width };
}

export function defaultRampLength(plate, edge) {
  const span = edge === "n" || edge === "s" ? plate.depth : plate.width;
  return round1(clamp(minStraightRampLength(), AISLE, Math.min(40, span * 0.8)));
}

export function clampCore(core, plate) {
  const inset = Math.min(ringInset(), Math.max(0, Math.min(plate.width, plate.depth) / 2 - 3));
  const maxW = Math.max(3, plate.width - inset * 2);
  const maxD = Math.max(3, plate.depth - inset * 2);
  const w = clamp(core.w, 3, maxW);
  const d = clamp(core.d, 3, maxD);
  return {
    w: round1(w),
    d: round1(d),
    x: round1(clamp(core.x, inset, plate.width - inset - w)),
    y: round1(clamp(core.y, inset, plate.depth - inset - d)),
  };
}

export function clampOpening(item, plate) {
  if (!item) return item;
  const along = item.edge === "n" || item.edge === "s" ? plate.width : plate.depth;
  const across = item.edge === "n" || item.edge === "s" ? plate.depth : plate.width;
  const width = clamp(item.width, 3, Math.max(3, along - 0.4));
  const t = clamp(item.t, width / 2, along - width / 2);
  const next = { ...item, width: round1(width), t: round1(t) };
  if (item.length != null) {
    const limit = (item.placement || "internal") === "external"
      ? 40
      : Math.max(AISLE, across * 0.85);
    next.length = round1(clamp(item.length, AISLE, limit));
  }
  return next;
}

export function edgePoint(edge, t, plate) {
  if (edge === "s") return { x: t, y: 0 };
  if (edge === "n") return { x: t, y: plate.depth };
  if (edge === "w") return { x: 0, y: t };
  return { x: plate.width, y: t };
}

export function pickEdge(point, plate) {
  const options = [
    { edge: "s", dist: Math.abs(point.y), t: point.x, len: plate.width },
    { edge: "n", dist: Math.abs(point.y - plate.depth), t: point.x, len: plate.width },
    { edge: "w", dist: Math.abs(point.x), t: point.y, len: plate.depth },
    { edge: "e", dist: Math.abs(point.x - plate.width), t: point.y, len: plate.depth },
  ];
  options.sort((a, b) => a.dist - b.dist);
  const nearest = options[0];
  const limit = Math.max(2.5, Math.min(plate.width, plate.depth) * 0.18);
  if (nearest.dist > limit) return null;
  return nearest;
}

export function intervalsOverlap(a, b) {
  if (!a || !b || a.edge !== b.edge) return false;
  return Math.abs(a.t - b.t) < (a.width + b.width) / 2 - 0.25;
}

export function variantSpecs(basePlacement = "external") {
  const other = basePlacement === "external" ? "internal" : "external";
  return [
    { axis: "x", dir: "ccw", packFrom: "start", bayMode: "max", rampShift: 0, rampPlacement: basePlacement, entranceMode: "follow" },
    { axis: "y", dir: "ccw", packFrom: "start", bayMode: "max", rampShift: 0, rampPlacement: basePlacement, entranceMode: "follow" },
    { axis: "x", dir: "cw", packFrom: "start", bayMode: "max", rampShift: 0, rampPlacement: basePlacement, entranceMode: "follow" },
    { axis: "x", dir: "ccw", packFrom: "end", bayMode: "max", rampShift: 0, rampPlacement: basePlacement, entranceMode: "follow" },
    { axis: "x", dir: "ccw", packFrom: "start", bayMode: "minus1", rampShift: 0, rampPlacement: basePlacement, entranceMode: "follow" },
    { axis: "x", dir: "ccw", packFrom: "start", bayMode: "max", rampShift: 1, rampPlacement: other, entranceMode: "opposite" },
  ];
}

export function generateVariants(input) {
  const specs = variantSpecs(input.rampPlacement || input.ramps?.[0]?.placement || "internal");
  const variants = specs.map((spec, index) => {
    const result = layoutParking({ ...input, spec });
    return {
      ...result,
      id: `V${index + 1}`,
      name: variantName(spec, input),
      spec,
    };
  });
  const ranked = variants.map((variant, index) => ({ variant, index }));
  ranked.sort((a, b) => compareVariants(a.variant, b.variant));
  const best = ranked.find((item) => item.variant.metrics.valid);
  variants.forEach((variant, index) => {
    variant.recommended = Boolean(best && best.index === index);
  });
  return variants;
}

export function layoutParking(input) {
  const plate = normalizePlate(input.plate || input);
  const spec = {
    axis: "x",
    dir: input.circulation || "ccw",
    packFrom: "start",
    bayMode: "max",
    rampShift: 0,
    rampPlacement: input.rampPlacement || "internal",
    entranceMode: "follow",
    ...(input.spec || {}),
  };
  if (spec.dir === "both") spec.dir = "ccw";
  const baseRamps = (input.ramps || []).map((ramp) => ({ ...ramp }));
  const ramp0 = baseRamps[0] || defaultRamp(plate, spec.rampPlacement);
  const placed = { ...ramp0, placement: spec.rampPlacement || ramp0.placement || "internal" };
  const shifted = input.lockRamp
    ? placed
    : placed.placement === "internal"
      ? snapRamp(placed, plate, spec)
      : snapRamp(shiftRamp(placed, spec, plate), plate, spec);
  const entranceMode = resolveEntrance(spec.entranceMode, input.entranceMode || "separate");
  const ramp = clampOpening({
    ...shifted,
    placement: spec.rampPlacement,
    width: Math.max(AISLE, shifted.width || AISLE),
    length: shifted.length || defaultRampLength(plate, shifted.edge || "w"),
  }, plate);
  ramp.placement = spec.rampPlacement;
  const openings = buildOpenings(input, plate, ramp, entranceMode);
  const cores = (input.cores || (input.core ? [input.core] : [])).filter(Boolean).map((core) => clampCore(core, plate));

  const bay = stallsPerBay(plate.spacing, plate.columnWidth, plate.minClear);
  const bayStats = { total: 0, triple: 0 };
  let aisles = loopAisles(plate).concat(innerAisles(plate, spec));
  if ((ramp.placement || "internal") === "internal") {
    aisles = aisles.flatMap((aisle) => cutBlock(aisle, rampFootprint(ramp, plate), "internal"));
  }
  aisles.push(approachAisle(ramp, plate));
  openings.forEach((opening) => {
    if (sharesRamp(opening, ramp)) return;
    aisles.push(entryAisle(opening, plate));
  });
  cores.forEach((core) => {
    aisles = applyCore(aisles, core, plate, rampFootprint(ramp, plate));
  });
  const blockers = cores.slice();
  if ((ramp.placement || "internal") === "internal") blockers.push(rampFootprint(ramp, plate));
  aisles = repairNetwork(aisles.filter((aisle) => aisle.w >= 1 && aisle.d >= 1), plate, blockers);
  stampPortals(aisles, openings, ramp, plate);

  const bands = perimeterBands(plate).concat(innerStallBands(plate, spec));
  const stallBlocks = aisles.concat(cores);
  if ((ramp.placement || "internal") === "internal") stallBlocks.push(rampFootprint(ramp, plate));
  const gridX = gridLines(plate.width, plate.spacing);
  const gridY = gridLines(plate.depth, plate.spacing);
  const stalls = [];
  bands.forEach((band) => fillBand(band, plate, band.along === "x" ? gridX : gridY, plate.columnWidth, plate.minClear, stallBlocks, stalls, bayStats));

  const backs = backSegments(bands);
  const columnObstacles = stallBlocks.concat(openings.map((opening) => mouthRect(opening, plate)));
  const columns = placeColumns(backs, gridX, gridY, plate, columnObstacles);
  const columnConflicts = [];
  const keptStalls = [];
  stalls.forEach((stall) => {
    if (columns.some((column) => rectGap(stall, column) < plate.minClear - 1e-4)) columnConflicts.push({ ...stall, conflict: true });
    else keptStalls.push(stall);
  });
  stalls.length = 0;
  keptStalls.forEach((stall, index) => {
    stall.no = index + 1;
    stalls.push(stall);
  });
  const adj = buildGraph(aisles);
  const issues = [];
  issues.push(...portalIssues(aisles, openings, [ramp], plate));
  issues.push(...slopeIssues([ramp]));
  issues.push(...siteIssues([ramp], plate));
  const drives = buildArrows(plate, aisles, openings, ramp, spec.dir, input.circulation === "both" || spec.dir === "both");
  const route = drives.map((seg) => ({ x: seg.x1, y: seg.y1 })).concat(drives.length ? [{ x: drives[drives.length - 1].x2, y: drives[drives.length - 1].y2 }] : []);
  const columnHits = stallColumnHits(stalls, columns, plate.minClear);
  if (columnHits > 0) issues.push({ type: "column", label: `주차칸-기둥 충돌 ${columnHits}건` });
  const deadEnds = deadEndCount(aisles, adj);
  const overlapCount = countOverlaps({ stalls, aisles, columns }, cores, (ramp.placement || "internal") === "internal" ? [rampFootprint(ramp, plate)] : [], plate);
  const connected = !issues.some((issue) => issue.type === "opening" || issue.type === "ramp" || issue.type === "network");
  const slopeOk = !issues.some((issue) => issue.type === "slope");
  const siteOk = !issues.some((issue) => issue.type === "site");
  const plateArea = plate.width * plate.depth;
  const aisleRatio = plateArea ? round3(aisleArea(aisles, plate) / plateArea) : 0;
  const perimeterRatio = stalls.length ? stalls.filter((stall) => stall.phase === "perimeter").length / stalls.length : 0;
  const tripleRatio = bayStats.total ? bayStats.triple / bayStats.total : 0;
  const hasLoop = ["s", "n", "w", "e"].every((side) => aisles.some((aisle) => aisle.role === "ring" && aisle.side === side));
  const similarity = Math.round(clamp(perimeterRatio, 0, 1) * 40 + (hasLoop ? 30 : 0) + clamp(tripleRatio, 0, 1) * 30);
  const valid = connected && columnHits === 0 && slopeOk && overlapCount === 0;
  const rejected = valid ? null : rejectReason({ connected, columnHits, slopeOk, siteOk, overlapCount });
  return {
    stalls,
    aisles,
    columns,
    drives,
    route,
    issues,
    connected,
    axis: spec.axis,
    fixedAlong: spec.axis === "x" ? "가로" : "세로",
    flexAlong: spec.axis === "x" ? "세로" : "가로",
    gridX,
    gridY,
    cores,
    openings,
    ramps: [ramp],
    plate,
    spec,
    bay,
    columnConflicts,
    clearance: clearanceMark(stalls, columns),
    metrics: {
      stalls: stalls.length,
      areaPerStall: stalls.length ? round3(plateArea / stalls.length) : 0,
      aisleRatio,
      connected,
      columnHits,
      deadEnds,
      similarity,
      overlapCount,
      slopeOk,
      siteOk,
      valid: valid && siteOk,
      perimeterRatio: round3(perimeterRatio),
      tripleRatio: round3(tripleRatio),
      hasLoop,
      rejected: valid && siteOk ? null : (rejected || (siteOk ? null : "램프가 대지 밖")),
    },
  };
}

function rejectReason(flags) {
  const reasons = [];
  if (!flags.connected) reasons.push("동선 끊김");
  if (flags.columnHits > 0 || flags.overlapCount > 0) reasons.push("충돌");
  if (!flags.slopeOk) reasons.push("경사 초과");
  if (!flags.siteOk) reasons.push("대지 밖");
  return reasons.join(" · ") || "조건 미달";
}

function variantName(spec, input) {
  const axis = spec.axis === "x" ? "가로 베이" : "세로 베이";
  const dir = spec.dir === "cw" ? "시계" : "반시계";
  const pack = spec.packFrom === "end" ? "루프 반대 정렬" : "루프 기준";
  const bay = spec.bayMode === "minus1" ? "내부 베이 -1" : "내부 최대";
  const placement = spec.rampPlacement === "external" ? "외부 램프" : "내부 램프";
  const entrance = resolveEntrance(spec.entranceMode, input.entranceMode || "separate");
  const door = entrance === "integrated" ? "일체 출입" : "분리 출입";
  return `${axis} · ${dir} · ${pack} · ${bay} · ${placement} · ${door}`;
}

function resolveEntrance(mode, current) {
  if (mode === "opposite") return current === "integrated" ? "separate" : "integrated";
  if (mode === "integrated" || mode === "separate") return mode;
  return current === "integrated" ? "integrated" : "separate";
}

function normalizePlate(plate) {
  return {
    width: plate.width,
    depth: plate.depth,
    spacing: plate.spacing || 8.1,
    columnWidth: plate.columnWidth || COLUMN,
    columnDepth: plate.columnDepth || plate.columnWidth || COLUMN,
    minClear: plate.minClear == null ? 0.05 : plate.minClear,
    siteMargin: plate.siteMargin == null ? 20 : plate.siteMargin,
  };
}

function defaultRamp(plate, placement) {
  return {
    id: 1,
    edge: "w",
    t: round1(plate.depth / 2),
    width: 6,
    length: minStraightRampLength(),
    placement,
  };
}

function shiftRamp(ramp, spec, plate) {
  const along = ramp.edge === "n" || ramp.edge === "s" ? plate.width : plate.depth;
  const delta = spec.rampShift ? along * 0.22 : 0;
  return { ...ramp, t: ramp.t + delta };
}

function buildOpenings(input, plate, ramp, entranceMode) {
  if (entranceMode === "integrated") {
    const width = ramp.width;
    return ["in", "out"].map((kind, index) => clampOpening({
      id: 100 + index,
      kind,
      edge: ramp.edge,
      t: ramp.t,
      width,
      linkedRamp: ramp.id,
    }, plate));
  }
  const custom = (input.openings || []).filter((opening) => !opening.linkedRamp);
  if (custom.length) return custom.map((opening) => clampOpening(opening, plate));
  return autoSeparate(plate, ramp);
}

function snapRamp(ramp, plate, spec) {
  const width = Math.max(AISLE, ramp.width || AISLE);
  const next = { ...ramp, width };
  if ((next.placement || "internal") !== "internal") {
    next.t = clampExternalT(next, plate);
    return next;
  }
  const centers = next.edge === "w" || next.edge === "e"
    ? [STALL_D + AISLE / 2, plate.depth - STALL_D - AISLE / 2]
    : [STALL_D + AISLE / 2, plate.width - STALL_D - AISLE / 2];
  const ordered = centers.slice().sort((a, b) => Math.abs(a - next.t) - Math.abs(b - next.t));
  next.t = spec.rampShift ? ordered[ordered.length - 1] : ordered[0];
  return next;
}

function clampExternalT(ramp, plate) {
  const half = Math.max(ramp.width, AISLE) / 2;
  const along = ramp.edge === "n" || ramp.edge === "s" ? plate.width : plate.depth;
  const rings = ramp.edge === "w" || ramp.edge === "e"
    ? [[STALL_D, STALL_D + AISLE], [plate.depth - STALL_D - AISLE, plate.depth - STALL_D]]
    : [[STALL_D, STALL_D + AISLE], [plate.width - STALL_D - AISLE, plate.width - STALL_D]];
  let t = clamp(ramp.t, half, along - half);
  rings.forEach(([start, end]) => {
    const overlap = Math.min(t + half, end) - Math.max(t - half, start);
    if (overlap > 0.2 && overlap < end - start - 0.2) {
      const mid = (start + end) / 2;
      t = t < mid ? start - half - 1 : end + half + 1;
    }
  });
  return clamp(t, half, along - half);
}

function autoSeparate(plate, ramp) {
  const horizontal = ramp.edge === "w" || ramp.edge === "e";
  const low = ramp.t < (horizontal ? plate.depth : plate.width) / 2;
  let edge = "s";
  if (horizontal) edge = low ? "n" : "s";
  else edge = ramp.edge === "s" ? "e" : "w";
  const along = edge === "n" || edge === "s" ? plate.width : plate.depth;
  return [0.28, 0.72].map((ratio, index) => clampOpening({
    id: 201 + index,
    kind: index === 0 ? "in" : "out",
    edge,
    t: along * ratio,
    width: AISLE,
  }, plate));
}

function sharesRamp(opening, ramp) {
  return opening.edge === ramp.edge && Math.abs(opening.t - ramp.t) < 0.4 && Math.abs(opening.width - ramp.width) < 0.4;
}

function loopAisles(plate) {
  const o = STALL_D;
  const a = AISLE;
  return [
    { x: 0, y: o, w: plate.width, d: a, role: "ring", phase: "loop", side: "s" },
    { x: 0, y: plate.depth - o - a, w: plate.width, d: a, role: "ring", phase: "loop", side: "n" },
    { x: o, y: o, w: a, d: plate.depth - 2 * o, role: "ring", phase: "loop", side: "w" },
    { x: plate.width - o - a, y: o, w: a, d: plate.depth - 2 * o, role: "ring", phase: "loop", side: "e" },
  ];
}

function packSpan(span, bayMode) {
  if (span < STALL_D - 0.01) return [];
  const events = [{ kind: "stall", a: 0, b: STALL_D, face: "near" }];
  let cursor = STALL_D;
  while (cursor + STALL_D + AISLE <= span + 0.01) {
    const stallEnd = cursor + STALL_D;
    const aisleEnd = stallEnd + AISLE;
    events.push({ kind: "stall", a: cursor, b: stallEnd, face: "far" });
    events.push({ kind: "aisle", a: stallEnd, b: aisleEnd });
    cursor = aisleEnd;
    if (cursor + STALL_D <= span + 0.01) {
      events.push({ kind: "stall", a: cursor, b: cursor + STALL_D, face: "near" });
      cursor += STALL_D;
    } else break;
  }
  if (bayMode !== "minus1") return events;
  let last = -1;
  events.forEach((event, index) => {
    if (event.kind === "aisle") last = index;
  });
  if (last < 0) return events;
  const aisle = events[last];
  return events.filter((event) => {
    if (event === aisle) return false;
    if (event.kind === "stall" && event.face === "far" && Math.abs(event.b - aisle.a) < 0.05) return false;
    if (event.kind === "stall" && event.face === "near" && Math.abs(event.a - aisle.b) < 0.05) return false;
    return true;
  });
}

function worldBands(start, end, bayMode, packFrom) {
  const span = end - start;
  const local = packSpan(span, bayMode);
  if (packFrom !== "end") {
    return local.map((band) => ({ ...band, a: start + band.a, b: start + band.b }));
  }
  return local.map((band) => ({
    kind: band.kind,
    a: end - band.b,
    b: end - band.a,
    face: band.face === "near" ? "far" : band.face === "far" ? "near" : band.face,
  }));
}

function innerAisles(plate, spec) {
  return innerPieces(plate, spec).aisles;
}

function innerStallBands(plate, spec) {
  return innerPieces(plate, spec).bands;
}

function innerPieces(plate, spec) {
  const origin = STALL_D + AISLE;
  const x0 = origin;
  const y0 = origin;
  const x1 = plate.width - origin;
  const y1 = plate.depth - origin;
  if (x1 - x0 < STALL_W || y1 - y0 < STALL_D) return { bands: [], aisles: [] };
  if (spec.axis === "x") {
    const packed = worldBands(y0, y1, spec.bayMode, spec.packFrom);
    const bands = [];
    const aisles = [];
    packed.forEach((band) => {
      if (band.kind === "stall") {
        bands.push({
          x: x0,
          y: band.a,
          w: x1 - x0,
          d: band.b - band.a,
          along: "x",
          face: band.face === "near" ? "s" : "n",
          phase: "inner",
        });
      } else {
        aisles.push({
          x: STALL_D,
          y: band.a,
          w: plate.width - STALL_D * 2,
          d: band.b - band.a,
          role: "interior",
          phase: "inner",
        });
      }
    });
    return { bands, aisles };
  }
  const packed = worldBands(x0, x1, spec.bayMode, spec.packFrom);
  const bands = [];
  const aisles = [];
  packed.forEach((band) => {
    if (band.kind === "stall") {
      bands.push({
        x: band.a,
        y: y0,
        w: band.b - band.a,
        d: y1 - y0,
        along: "y",
        face: band.face === "near" ? "w" : "e",
        phase: "inner",
      });
    } else {
      aisles.push({
        x: band.a,
        y: STALL_D,
        w: band.b - band.a,
        d: plate.depth - STALL_D * 2,
        role: "interior",
        phase: "inner",
      });
    }
  });
  return { bands, aisles };
}

function perimeterBands(plate) {
  const side = STALL_D + AISLE;
  const sideD = plate.depth - side * 2;
  const bands = [
    { x: 0, y: 0, w: plate.width, d: STALL_D, along: "x", face: "n", phase: "perimeter" },
    { x: 0, y: plate.depth - STALL_D, w: plate.width, d: STALL_D, along: "x", face: "s", phase: "perimeter" },
  ];
  if (sideD >= STALL_W) {
    bands.push({ x: 0, y: side, w: STALL_D, d: sideD, along: "y", face: "e", phase: "perimeter" });
    bands.push({ x: plate.width - STALL_D, y: side, w: STALL_D, d: sideD, along: "y", face: "w", phase: "perimeter" });
  }
  return bands;
}

function approachAisle(ramp, plate) {
  const span = Math.max(ramp.width, AISLE);
  const reach = STALL_D + AISLE;
  const aisle = { role: "approach", phase: "loop", portals: [] };
  if (ramp.placement === "external") {
    if (ramp.edge === "w") return { ...aisle, x: 0, y: ramp.t - span / 2, w: reach, d: span };
    if (ramp.edge === "e") return { ...aisle, x: plate.width - reach, y: ramp.t - span / 2, w: reach, d: span };
    if (ramp.edge === "s") return { ...aisle, x: ramp.t - span / 2, y: 0, w: span, d: reach };
    return { ...aisle, x: ramp.t - span / 2, y: plate.depth - reach, w: span, d: reach };
  }
  const box = rampFootprint(ramp, plate);
  if (ramp.edge === "w") return { ...aisle, x: box.x + box.w, y: box.y + (box.d - span) / 2, w: AISLE, d: span };
  if (ramp.edge === "e") return { ...aisle, x: box.x - AISLE, y: box.y + (box.d - span) / 2, w: AISLE, d: span };
  if (ramp.edge === "s") return { ...aisle, x: box.x + (box.w - span) / 2, y: box.y + box.d, w: span, d: AISLE };
  return { ...aisle, x: box.x + (box.w - span) / 2, y: box.y - AISLE, w: span, d: AISLE };
}

function entryAisle(opening, plate) {
  const span = Math.max(opening.width, AISLE);
  const reach = STALL_D + AISLE;
  const aisle = { role: "entry", phase: "loop", portals: [] };
  if (opening.edge === "s") return { ...aisle, x: opening.t - span / 2, y: 0, w: span, d: reach };
  if (opening.edge === "n") return { ...aisle, x: opening.t - span / 2, y: plate.depth - reach, w: span, d: reach };
  if (opening.edge === "w") return { ...aisle, x: 0, y: opening.t - span / 2, w: reach, d: span };
  return { ...aisle, x: plate.width - reach, y: opening.t - span / 2, w: reach, d: span };
}

function cutBlock(aisle, block, role) {
  if (overlapArea(aisle, block) < 0.04) return [aisle];
  return subtractRect(aisle, block)
    .filter((part) => durable(part, aisle))
    .map((part) => ({ ...aisle, ...part, portals: [], role: aisle.role || role }));
}

function durable(part, aisle) {
  const horizontal = aisle.w + 0.01 >= aisle.d;
  if (horizontal) return part.d >= 5.5 && part.w >= 2;
  return part.w >= 5.5 && part.d >= 2;
}

function applyCore(aisles, core, plate, rampBox) {
  const next = [];
  aisles.forEach((aisle) => {
    if (overlapArea(aisle, core) < 0.04) {
      next.push(aisle);
      return;
    }
    const parts = subtractRect(aisle, core).filter((part) => durable(part, aisle));
    parts.sort((a, b) => b.w * b.d - a.w * a.d);
    parts.forEach((part, index) => {
      next.push({ ...aisle, ...part, portals: index === 0 ? (aisle.portals || []) : [] });
    });
    detourFor(aisle, core, plate, rampBox).forEach((piece) => next.push(piece));
  });
  return next;
}

function detourFor(aisle, core, plate, rampBox) {
  const horizontal = aisle.w + 0.01 >= aisle.d;
  const sides = horizontal ? ["n", "s"] : ["e", "w"];
  for (let index = 0; index < sides.length; index += 1) {
    const pieces = detourPieces(aisle, core, sides[index])
      .map((piece) => clipDrive(piece, plate))
      .filter(Boolean);
    if (pieces.length < 3) continue;
    if (pieces.some((piece) => overlapArea(piece, core) > 0.04)) continue;
    if (rampBox && pieces.some((piece) => overlapArea(piece, rampBox) > 0.4)) continue;
    return pieces.map((piece) => ({ ...piece, role: "bypass", phase: "bypass", portals: [] }));
  }
  return [];
}

function detourPieces(aisle, core, side) {
  if (side === "n" || side === "s") {
    const y = side === "n" ? core.y + core.d : core.y - AISLE;
    const y0 = Math.min(aisle.y, y);
    const y1 = Math.max(aisle.y + aisle.d, y + AISLE);
    const westX = core.x - AISLE;
    const eastX = core.x + core.w;
    return [
      { x: westX, y: y0, w: AISLE, d: y1 - y0 },
      { x: eastX, y: y0, w: AISLE, d: y1 - y0 },
      { x: westX, y, w: eastX + AISLE - westX, d: AISLE },
    ];
  }
  const x = side === "e" ? core.x + core.w : core.x - AISLE;
  const x0 = Math.min(aisle.x, x);
  const x1 = Math.max(aisle.x + aisle.w, x + AISLE);
  const southY = core.y - AISLE;
  const northY = core.y + core.d;
  return [
    { x: x0, y: southY, w: x1 - x0, d: AISLE },
    { x: x0, y: northY, w: x1 - x0, d: AISLE },
    { x, y: southY, w: AISLE, d: northY + AISLE - southY },
  ];
}

function fillBand(band, plate, lines, columnWidth, minClear, obstacles, stalls, bayStats) {
  const horizontal = band.along === "x";
  const origin = horizontal ? band.x : band.y;
  const limit = origin + (horizontal ? band.w : band.d);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const bay0 = lines[index];
    const bay1 = lines[index + 1];
    if (bay1 <= origin + 0.05 || bay0 >= limit - 0.05) continue;
    const pack = stallsPerBay(bay1 - bay0, columnWidth, minClear);
    const count = pack.count;
    if (!count) continue;
    const face0 = bay0 + columnWidth / 2;
    const gap = pack.gap;
    let placed = 0;
    for (let stallIndex = 0; stallIndex < count; stallIndex += 1) {
      const pos = face0 + gap + stallIndex * STALL_W;
      const stall = horizontal
        ? { x: pos, y: band.y, w: STALL_W, d: band.d, aisle: band.face, phase: band.phase }
        : { x: band.x, y: pos, w: band.w, d: STALL_W, aisle: band.face, phase: band.phase };
      if (stall.x < -1e-6 || stall.y < -1e-6 || stall.x + stall.w > plate.width + 1e-6 || stall.y + stall.d > plate.depth + 1e-6) continue;
      if (horizontal && (stall.x < band.x - 0.02 || stall.x + stall.w > band.x + band.w + 0.02)) continue;
      if (!horizontal && (stall.y < band.y - 0.02 || stall.y + stall.d > band.y + band.d + 0.02)) continue;
      if (Math.min(stall.w, stall.d) < STALL_W - 0.02 || Math.max(stall.w, stall.d) < STALL_D - 0.02) continue;
      if (obstacles.some((block) => overlapArea(stall, block) > 0.03)) continue;
      if (stalls.some((item) => overlapArea(stall, item) > 0.03)) continue;
      stalls.push({
        x: round3(stall.x),
        y: round3(stall.y),
        w: round3(stall.w),
        d: round3(stall.d),
        aisle: stall.aisle,
        phase: stall.phase,
      });
      placed += 1;
    }
    if (placed) {
      bayStats.total += 1;
      if (placed >= 3) bayStats.triple += 1;
    }
  }
}

function backSegments(bands) {
  return bands.map((band) => {
    if (band.along === "x") {
      const rearSouth = band.face === "n";
      const y = rearSouth ? band.y : band.y + band.d;
      return { axis: "h", y, x0: band.x, x1: band.x + band.w, outward: rearSouth ? -1 : 1 };
    }
    const rearWest = band.face === "e";
    const x = rearWest ? band.x : band.x + band.w;
    return { axis: "v", x, y0: band.y, y1: band.y + band.d, outward: rearWest ? -1 : 1 };
  });
}

function placeColumns(segments, gridX, gridY, plate, obstacles) {
  const halfW = plate.columnWidth / 2;
  const halfD = plate.columnDepth / 2;
  const seen = new Set();
  const columns = [];
  const sharedLine = (segment, pos) => segments.some((other) => {
    if (other === segment || other.axis !== segment.axis) return false;
    const otherPos = other.axis === "h" ? other.y : other.x;
    return Math.abs(otherPos - pos) < 0.3;
  });
  const put = (cx, cy) => {
    const key = `${round1(cx)}:${round1(cy)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const rect = {
      x: cx - halfW,
      y: cy - halfD,
      w: plate.columnWidth,
      d: plate.columnDepth,
    };
    if (rect.x > plate.width + 0.02 || rect.y > plate.depth + 0.02 || rect.x + rect.w < -0.02 || rect.y + rect.d < -0.02) return;
    if (obstacles.some((block) => rectGap(rect, block) < plate.minClear - 1e-4)) return;
    columns.push({
      x: round3(rect.x),
      y: round3(rect.y),
      w: round3(rect.w),
      d: round3(rect.d),
      phase: "column",
    });
  };
  segments.forEach((segment) => {
    if (segment.axis === "h") {
      const cy = sharedLine(segment, segment.y) ? segment.y : segment.y + segment.outward * halfD;
      gridX.forEach((gx) => {
        if (gx < segment.x0 - 0.05 || gx > segment.x1 + 0.05) return;
        put(gx, cy);
      });
      return;
    }
    const cx = sharedLine(segment, segment.x) ? segment.x : segment.x + segment.outward * halfW;
    gridY.forEach((gy) => {
      if (gy < segment.y0 - 0.05 || gy > segment.y1 + 0.05) return;
      put(cx, gy);
    });
  });
  return columns;
}

function clearanceMark(stalls, columns) {
  for (let index = 0; index < stalls.length; index += 1) {
    const stall = stalls[index];
    const alongX = Math.abs(stall.w - STALL_W) < 0.08 && stall.d + 0.01 >= STALL_D;
    if (!alongX) continue;
    let best = null;
    columns.forEach((column) => {
      const midY = column.y + column.d / 2;
      if (midY < stall.y - column.d - 0.05 || midY > stall.y + stall.d + 0.05) return;
      const left = stall.x - (column.x + column.w);
      if (left < -0.001 || left > 0.45) return;
      if (!best || left < best.gap) best = { column, gap: left };
    });
    if (!best) continue;
    return {
      x1: round3(best.column.x + best.column.w),
      x2: round3(stall.x),
      y: round3(stall.y + 0.45),
      gap: round3(best.gap),
    };
  }
  return null;
}

function stampPortals(aisles, openings, ramp, plate) {
  aisles.forEach((aisle) => {
    aisle.portals = [];
  });
  openings.forEach((opening) => {
    const mouth = mouthRect(opening, plate);
    const host = bestPortalHost(aisles, mouth)
      || (sharesRamp(opening, ramp) ? bestPortalHost(aisles, innerLip(ramp, plate)) : null);
    if (host) host.portals.push({ type: "opening", id: opening.id, kind: opening.kind });
  });
  const lip = innerLip(ramp, plate);
  const host = bestPortalHost(aisles, lip);
  if (host) host.portals.push({ type: "ramp", id: ramp.id });
}

function bestPortalHost(aisles, mouth) {
  let best = null;
  let score = 0.4;
  aisles.forEach((aisle) => {
    const area = overlapArea(aisle, mouth);
    if (area > score) {
      score = area;
      best = aisle;
    }
  });
  return best;
}

function mouthRect(opening, plate) {
  const depth = 1.2;
  if (opening.edge === "s") return { x: opening.t - opening.width / 2, y: 0, w: opening.width, d: depth };
  if (opening.edge === "n") return { x: opening.t - opening.width / 2, y: plate.depth - depth, w: opening.width, d: depth };
  if (opening.edge === "w") return { x: 0, y: opening.t - opening.width / 2, w: depth, d: opening.width };
  return { x: plate.width - depth, y: opening.t - opening.width / 2, w: depth, d: opening.width };
}

function innerLip(ramp, plate) {
  const box = rampFootprint(ramp, plate);
  const thick = 1.2;
  if (ramp.placement === "external") {
    if (ramp.edge === "w") return { x: 0, y: box.y, w: thick, d: box.d };
    if (ramp.edge === "e") return { x: plate.width - thick, y: box.y, w: thick, d: box.d };
    if (ramp.edge === "s") return { x: box.x, y: 0, w: box.w, d: thick };
    return { x: box.x, y: plate.depth - thick, w: box.w, d: thick };
  }
  if (ramp.edge === "w") return { x: box.x + box.w - 0.2, y: box.y, w: thick, d: box.d };
  if (ramp.edge === "e") return { x: box.x - thick + 0.2, y: box.y, w: thick, d: box.d };
  if (ramp.edge === "s") return { x: box.x, y: box.y + box.d - 0.2, w: box.w, d: thick };
  return { x: box.x, y: box.y - thick + 0.2, w: box.w, d: thick };
}

function portalIssues(aisles, openings, ramps, plate) {
  const groups = componentGroups(aisles);
  const main = groups.slice().sort((a, b) => b.length - a.length)[0] || [];
  const mainSet = new Set(main);
  const issues = [];
  const hostIndex = (type, id) => aisles.findIndex((aisle) => (aisle.portals || []).some((portal) => portal.type === type && portal.id === id));
  openings.forEach((opening) => {
    const index = hostIndex("opening", opening.id);
    if (index >= 0 && mainSet.has(index)) return;
    issues.push({
      type: "opening",
      id: opening.id,
      edge: opening.edge,
      label: `${edgeLabel(opening.edge)}측 ${opening.kind === "in" ? "입구" : "출구"}가 차로와 연결되지 않습니다.`,
    });
  });
  ramps.forEach((ramp) => {
    const index = hostIndex("ramp", ramp.id);
    const lip = innerLip(ramp, plate);
    const touches = index >= 0 && overlapArea(aisles[index], lip) > 0.4;
    if (index >= 0 && mainSet.has(index) && touches) return;
    issues.push({
      type: "ramp",
      id: ramp.id,
      edge: ramp.edge,
      label: `${edgeLabel(ramp.edge)}측 램프 안쪽 끝단이 차로와 연결되지 않습니다.`,
    });
  });
  if (!openings.some((opening) => opening.kind === "in") || !openings.some((opening) => opening.kind === "out") || !ramps.length) {
    issues.push({ type: "network", label: "입구, 램프, 출구가 모두 있어야 동선이 이어집니다." });
  }
  return issues;
}

function slopeIssues(ramps) {
  return ramps.filter((ramp) => ramp.length > 0 && FLOOR_H / ramp.length > RAMP_SLOPE_STRAIGHT + 1e-4).map((ramp) => ({
    type: "slope",
    id: ramp.id,
    label: `${edgeLabel(ramp.edge)}측 램프 경사가 ${(FLOOR_H / ramp.length * 100).toFixed(1)}%로 직선 램프 17%를 넘습니다.`,
  }));
}

function siteIssues(ramps, plate) {
  const margin = plate.siteMargin;
  return ramps.filter((ramp) => rampOutside(ramp, plate, margin)).map((ramp) => ({
    type: "site",
    id: ramp.id,
    label: `${edgeLabel(ramp.edge)}측 램프가 대지 여유 ${margin}m 밖으로 나갑니다.`,
  }));
}

function rampOutside(ramp, plate, margin) {
  const box = rampFootprint(ramp, plate);
  return box.x < -margin - 0.05
    || box.y < -margin - 0.05
    || box.x + box.w > plate.width + margin + 0.05
    || box.y + box.d > plate.depth + margin + 0.05;
}

function buildArrows(plate, aisles, openings, ramp, dir, both) {
  const segments = [];
  aisles.forEach((aisle) => {
    if (Math.max(aisle.w, aisle.d) < 8) return;
    const horizontal = aisle.w >= aisle.d;
    const forward = arrowSign(aisle, plate, dir);
    pushArrow(segments, aisle, horizontal, forward);
    if (both) pushArrow(segments, aisle, horizontal, -forward);
  });
  openings.forEach((opening) => {
    const gate = edgePoint(opening.edge, opening.t, plate);
    const into = inwardPoint(opening, plate);
    segments.push({ x1: gate.x, y1: gate.y, x2: into.x, y2: into.y, arrow: true, phase: "arrow" });
  });
  if (ramp.placement === "external") {
    const box = rampFootprint(ramp, plate);
    const outer = centerOf(box);
    const inner = edgePoint(ramp.edge, ramp.t, plate);
    segments.push({ x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, arrow: true, phase: "arrow" });
  }
  return segments;
}

function arrowSign(aisle, plate, dir) {
  const center = centerOf(aisle);
  const horizontal = aisle.w >= aisle.d;
  let sign = horizontal ? (center.y < plate.depth / 2 ? 1 : -1) : (center.x > plate.width / 2 ? 1 : -1);
  if (dir === "cw") sign *= -1;
  return sign;
}

function pushArrow(segments, aisle, horizontal, sign) {
  const length = horizontal ? aisle.w : aisle.d;
  const steps = Math.max(1, Math.round(length / 9));
  for (let step = 0; step < steps; step += 1) {
    const t0 = (step + 0.18) / steps;
    const t1 = (step + 0.82) / steps;
    if (sign < 0) {
      const a = 1 - t0;
      const b = 1 - t1;
      segments.push(horizontal
        ? { x1: aisle.x + aisle.w * a, y1: aisle.y + aisle.d / 2, x2: aisle.x + aisle.w * b, y2: aisle.y + aisle.d / 2, arrow: true, phase: "arrow" }
        : { x1: aisle.x + aisle.w / 2, y1: aisle.y + aisle.d * a, x2: aisle.x + aisle.w / 2, y2: aisle.y + aisle.d * b, arrow: true, phase: "arrow" });
    } else {
      segments.push(horizontal
        ? { x1: aisle.x + aisle.w * t0, y1: aisle.y + aisle.d / 2, x2: aisle.x + aisle.w * t1, y2: aisle.y + aisle.d / 2, arrow: true, phase: "arrow" }
        : { x1: aisle.x + aisle.w / 2, y1: aisle.y + aisle.d * t0, x2: aisle.x + aisle.w / 2, y2: aisle.y + aisle.d * t1, arrow: true, phase: "arrow" });
    }
  }
}

function inwardPoint(opening, plate) {
  const reach = STALL_D + AISLE / 2;
  if (opening.edge === "s") return { x: opening.t, y: reach };
  if (opening.edge === "n") return { x: opening.t, y: plate.depth - reach };
  if (opening.edge === "w") return { x: reach, y: opening.t };
  return { x: plate.width - reach, y: opening.t };
}

function compareVariants(a, b) {
  const av = a.metrics.valid ? 1 : 0;
  const bv = b.metrics.valid ? 1 : 0;
  if (av !== bv) return bv - av;
  if (a.metrics.stalls !== b.metrics.stalls) return b.metrics.stalls - a.metrics.stalls;
  if (a.metrics.areaPerStall !== b.metrics.areaPerStall) return a.metrics.areaPerStall - b.metrics.areaPerStall;
  if (a.metrics.similarity !== b.metrics.similarity) return b.metrics.similarity - a.metrics.similarity;
  return 0;
}

export function countOverlaps(result, cores, rampBoxes, plate) {
  const stalls = result.stalls || [];
  const aisles = (result.aisles || []).filter((aisle) => aisleInside(aisle, plate));
  const columns = result.columns || [];
  let count = 0;
  count += pairHits(stalls, stalls, true);
  count += pairHits(stalls, aisles);
  count += pairHits(stalls, cores);
  count += pairHits(stalls, rampBoxes);
  const minClear = plate.minClear == null ? 0.05 : plate.minClear;
  count += closeHits(columns, stalls, minClear);
  count += closeHits(columns, aisles, minClear);
  count += closeHits(columns, cores, minClear);
  count += closeHits(columns, rampBoxes, minClear);
  count += pairHits(aisles, cores);
  count += pairHits(aisles, rampBoxes);
  count += pairHits(cores, rampBoxes);
  return count;
}

function aisleInside(aisle, plate) {
  return aisle.x < plate.width - 0.05 && aisle.y < plate.depth - 0.05 && aisle.x + aisle.w > 0.05 && aisle.y + aisle.d > 0.05;
}

function closeHits(listA, listB, minClear) {
  let hits = 0;
  for (let i = 0; i < listA.length; i += 1) {
    for (let j = 0; j < listB.length; j += 1) {
      if (rectGap(listA[i], listB[j]) < minClear - 1e-4) hits += 1;
    }
  }
  return hits;
}

function pairHits(listA, listB, unique) {
  let hits = 0;
  for (let i = 0; i < listA.length; i += 1) {
    const start = unique ? i + 1 : 0;
    for (let j = start; j < listB.length; j += 1) {
      if (overlapArea(listA[i], listB[j]) > 0.03) hits += 1;
    }
  }
  return hits;
}

function aisleArea(aisles, plate) {
  const step = 0.5;
  let cells = 0;
  for (let y = step / 2; y < plate.depth; y += step) {
    for (let x = step / 2; x < plate.width; x += step) {
      if (aisles.some((aisle) => x >= aisle.x && x < aisle.x + aisle.w && y >= aisle.y && y < aisle.y + aisle.d)) cells += 1;
    }
  }
  return cells * step * step;
}

function deadEndCount(aisles, adj) {
  return aisles.reduce((sum, aisle, index) => {
    if ((aisle.portals || []).length) return sum;
    return sum + (adj[index].length <= 1 ? 1 : 0);
  }, 0);
}

function repairNetwork(aisles, plate, blockers) {
  let current = aisles.slice();
  for (let pass = 0; pass < 4; pass += 1) {
    const groups = componentGroups(current);
    if (groups.length <= 1) return current;
    groups.sort((a, b) => b.length - a.length);
    let added = false;
    for (let group = 1; group < groups.length; group += 1) {
      const link = closestBridge(current, groups[group], groups[0], plate, blockers);
      if (!link) continue;
      current.push(...link);
      added = true;
    }
    if (!added) break;
  }
  return current;
}

function closestBridge(aisles, group, main, plate, blockers) {
  let best = null;
  let bestDist = Infinity;
  group.forEach((from) => {
    main.forEach((to) => {
      linkOptions(aisles[from], aisles[to]).forEach((option) => {
        const clipped = option.map((rect) => clipDrive({ ...rect, role: "repair", phase: "loop", portals: [] }, plate)).filter(Boolean);
        if (clipped.length !== option.length) return;
        if (clipped.some((rect) => blockers.some((block) => overlapArea(rect, block) > 0.4))) return;
        const dist = rectGap(aisles[from], aisles[to]);
        if (dist < bestDist) {
          bestDist = dist;
          best = clipped;
        }
      });
    });
  });
  return best;
}

function linkOptions(a, b) {
  const options = [];
  const straight = straightLink(a, b);
  if (straight) options.push([straight]);
  const ac = centerOf(a);
  const bc = centerOf(b);
  options.push([
    { x: Math.min(ac.x, bc.x) - AISLE / 2, y: ac.y - AISLE / 2, w: Math.abs(bc.x - ac.x) + AISLE, d: AISLE },
    { x: bc.x - AISLE / 2, y: Math.min(ac.y, bc.y) - AISLE / 2, w: AISLE, d: Math.abs(bc.y - ac.y) + AISLE },
  ]);
  return options;
}

function straightLink(a, b) {
  const ox = overlapAmount(a.x, a.x + a.w, b.x, b.x + b.w);
  const oy = overlapAmount(a.y, a.y + a.d, b.y, b.y + b.d);
  if (ox >= AISLE && oy < -0.05) {
    const x = Math.max(a.x, b.x);
    const span = Math.min(AISLE, ox);
    const y = Math.min(a.y + a.d, b.y + b.d);
    return { x: x + (ox - span) / 2, y, w: span, d: -oy };
  }
  if (oy >= AISLE && ox < -0.05) {
    const y = Math.max(a.y, b.y);
    const span = Math.min(AISLE, oy);
    const x = Math.min(a.x + a.w, b.x + b.w);
    return { x, y: y + (oy - span) / 2, w: -ox, d: span };
  }
  return null;
}

function buildGraph(aisles) {
  const adj = aisles.map(() => []);
  for (let i = 0; i < aisles.length; i += 1) {
    for (let j = i + 1; j < aisles.length; j += 1) {
      if (contactLength(aisles[i], aisles[j]) < 5.5) continue;
      adj[i].push(j);
      adj[j].push(i);
    }
  }
  return adj;
}

function componentGroups(aisles) {
  const adj = buildGraph(aisles);
  const seen = new Set();
  const groups = [];
  for (let index = 0; index < aisles.length; index += 1) {
    if (seen.has(index)) continue;
    const group = [];
    const queue = [index];
    seen.add(index);
    while (queue.length) {
      const current = queue.shift();
      group.push(current);
      adj[current].forEach((next) => {
        if (seen.has(next)) return;
        seen.add(next);
        queue.push(next);
      });
    }
    groups.push(group);
  }
  return groups;
}

function contactLength(a, b) {
  const ox = overlapAmount(a.x, a.x + a.w, b.x, b.x + b.w);
  const oy = overlapAmount(a.y, a.y + a.d, b.y, b.y + b.d);
  if (ox >= 5.5 && oy >= 5.5) return Math.min(ox, oy);
  if (ox >= 5.5 && oy >= -0.15) return ox;
  if (oy >= 5.5 && ox >= -0.15) return oy;
  return 0;
}

function clipDrive(rect, plate) {
  const clipped = clipRect(rect, plate);
  if (!clipped || clipped.w < 5.5 || clipped.d < 5.5) return null;
  return { ...rect, ...clipped };
}

function clipRect(rect, plate) {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const x2 = Math.min(plate.width, rect.x + rect.w);
  const y2 = Math.min(plate.depth, rect.y + rect.d);
  if (x2 - x < 0.05 || y2 - y < 0.05) return null;
  return { ...rect, x, y, w: x2 - x, d: y2 - y };
}

function centerOf(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.d / 2 };
}

function overlapAmount(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const ox = overlapAmount(a.x, a.x + a.w, b.x, b.x + b.w);
  const oy = overlapAmount(a.y, a.y + a.d, b.y, b.y + b.d);
  if (ox <= 0 || oy <= 0) return 0;
  return ox * oy;
}

function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.d, b.y + b.d));
  return Math.hypot(dx, dy);
}

function edgeLabel(edge) {
  if (edge === "s") return "남";
  if (edge === "n") return "북";
  if (edge === "w") return "서";
  return "동";
}

function gridLines(length, spacing) {
  const lines = [0];
  if (!(spacing > 0)) return [0, round3(length)];
  for (let cursor = spacing; cursor < length - 0.2; cursor += spacing) lines.push(round3(cursor));
  if (length - lines[lines.length - 1] > 0.2) lines.push(round3(length));
  return lines;
}

function subtractRect(rect, block) {
  if (overlapArea(rect, block) <= 0) return [rect];
  const x1 = Math.max(rect.x, block.x);
  const x2 = Math.min(rect.x + rect.w, block.x + block.w);
  const y1 = Math.max(rect.y, block.y);
  const y2 = Math.min(rect.y + rect.d, block.y + block.d);
  const parts = [];
  if (y1 - rect.y > 0.05) parts.push({ x: rect.x, y: rect.y, w: rect.w, d: y1 - rect.y });
  if (rect.y + rect.d - y2 > 0.05) parts.push({ x: rect.x, y: y2, w: rect.w, d: rect.y + rect.d - y2 });
  if (x1 - rect.x > 0.05) parts.push({ x: rect.x, y: y1, w: x1 - rect.x, d: y2 - y1 });
  if (rect.x + rect.w - x2 > 0.05) parts.push({ x: x2, y: y1, w: rect.x + rect.w - x2, d: y2 - y1 });
  return parts;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
