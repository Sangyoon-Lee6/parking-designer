/**
 * 램프 형태(직선·90° 곡선·원형)와 지하층별 다른 경로.
 * 근거: 주차장법 시행규칙 제6조①5
 *  - 나: 곡선 내변반경 ≥6m (총주차 50대 이하 5m)
 *  - 다: 곡선 2차로 ≥6.5m
 *  - 라: 직선 ≤17%, 곡선 ≤14%
 *  - 바: 도로변 3m — 직선 ≤8.5%, 곡선 ≤7%
 *
 * layout.js와 순환 import를 피하려고 법규 상수를 여기에 둔다(값은 layout과 동일).
 */

export const AISLE = 6;
export const FLOOR_H = 3.2;
export const RAMP_SLOPE_STRAIGHT = 0.17;
export const RAMP_SLOPE_CURVE = 0.14;
export const GENTLE_SLOPE = 0.085;
export const GENTLE_SLOPE_CURVE = 0.07;
export const GENTLE_LEN = 3;
export const CREST_LEN = 1.7;
export const SAG_LEN = 2;
export const RAMP_R_IN = 6;
export const RAMP_CURVE_W = 6.5;

export const RAMP_FORMS = ["auto", "straight", "curve90", "spiral"];
export const LOWER_RAMP_MODES = ["alternate", "same"];

export function rampFormOf(ramp, fallback = "auto") {
  const f = (ramp && ramp.form) || fallback || "auto";
  return RAMP_FORMS.includes(f) ? f : "auto";
}

export function floorHeightOf(plate) {
  const value = Number(plate && plate.floorHeight);
  return value > 0 ? value : FLOOR_H;
}

export function rampTransitions(plate, level = "ground") {
  const legal = Number(plate && plate.legalStalls) || 0;
  const gentle = level !== "lower";
  return {
    top: Math.max(gentle ? GENTLE_LEN : 0, legal >= 50 ? CREST_LEN : 0),
    bottom: legal >= 100 ? SAG_LEN : 0,
    gentle,
    legal,
  };
}

export function innerCurveRadius(plate) {
  const legal = Number(plate && plate.legalStalls) || 0;
  return legal > 0 && legal <= 50 ? 5 : RAMP_R_IN;
}

export function minCurvePathLength(floorHeight = FLOOR_H, tr) {
  const top = Number(tr && tr.top) || 0;
  const bottom = Number(tr && tr.bottom) || 0;
  const easeDrop = (top + bottom) * GENTLE_SLOPE_CURVE;
  const H = Number(floorHeight) || FLOOR_H;
  if (H <= easeDrop) return Math.ceil((H / GENTLE_SLOPE_CURVE) * 10) / 10;
  return Math.ceil((top + bottom + (H - easeDrop) / RAMP_SLOPE_CURVE) * 10) / 10;
}

export function minStraightRampLengthLocal(floorHeight = FLOOR_H, tr) {
  const top = Number(tr && tr.top) || 0;
  const bottom = Number(tr && tr.bottom) || 0;
  const easeDrop = (top + bottom) * GENTLE_SLOPE;
  const H = Number(floorHeight) || FLOOR_H;
  if (H <= easeDrop) return Math.ceil((H / GENTLE_SLOPE) * 10) / 10;
  return Math.ceil((top + bottom + (H - easeDrop) / RAMP_SLOPE_STRAIGHT) * 10) / 10;
}

export function oppositeEdge(edge) {
  return { n: "s", s: "n", w: "e", e: "w" }[edge] || "s";
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
function round3(v) {
  return Math.round(v * 1000) / 1000;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * 지하 2층 이하용 램프: 지상→B1과 다른 경로.
 * alternate = 반대쪽 변 내부형 / same = 동일 복제
 */
export function lowerFloorRamp(groundRamp, plate, mode = "alternate") {
  if (!groundRamp) return null;
  if (mode === "same") return { ...groundRamp, level: "lower" };
  const edge = oppositeEdge(groundRamp.edge);
  const along = edge === "n" || edge === "s" ? plate.width : plate.depth;
  const t = round1(along - (groundRamp.t || along / 2));
  const baseForm = rampFormOf(groundRamp);
  const form = baseForm === "spiral" ? "spiral"
    : baseForm === "straight" ? "auto"
      : baseForm === "auto" ? "curve90"
        : baseForm;
  const tr = rampTransitions(plate, "lower");
  return {
    ...groundRamp,
    id: (Number(groundRamp.id) || 1) + 1000,
    edge,
    t,
    placement: "internal",
    form,
    level: "lower",
    inset: AISLE,
    length: minStraightRampLengthLocal(floorHeightOf(plate), tr),
    width: Math.max(groundRamp.width || AISLE, RAMP_CURVE_W),
  };
}

export function rampsForLevel(ramps, plate, level, lowerMode = "alternate") {
  const list = (ramps || []).filter(Boolean);
  if (!list.length) return [];
  if (level <= 0) return list.map((r) => ({ ...r, level: "ground" }));
  if (lowerMode === "same") return list.map((r) => ({ ...r, level: "lower" }));
  if (list.every((r) => rampFormOf(r) === "spiral")) {
    return list.map((r) => ({ ...r, level: "lower", form: "spiral", placement: "internal" }));
  }
  return list.map((r) => lowerFloorRamp(r, plate, "alternate")).filter(Boolean);
}

export function occupancyRamps(ramps, plate, lowerMode = "alternate") {
  const ground = (ramps || []).filter(Boolean);
  if (lowerMode === "same" || !ground.length) return ground;
  if (ground.every((r) => rampFormOf(r) === "spiral")) return ground;
  return ground.concat(ground.map((r) => lowerFloorRamp(r, plate, "alternate")).filter(Boolean));
}

/**
 * 외곽 회전 램프(한 층분): 주차장 외벽에 붙어 변을 따라가다 모서리에서 내변≥6m로 꺾으며 내려간다.
 * (가운데 원형 우물이 아님 — 차가 가장자리를 돌며 층고를 내려감)
 */
export function spiralRampShape(ramp, plate) {
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, ramp.level === "lower" ? "lower" : "ground");
  const Ri = innerCurveRadius(plate);
  const W = Math.max(RAMP_CURVE_W, ramp.width || RAMP_CURVE_W);
  const Rc = Ri + W / 2;
  const Ww = plate.width;
  const Dd = plate.depth;

  let reason = "";
  if (Ww < 2 * (W + Ri) + AISLE || Dd < 2 * (W + Ri) + AISLE) {
    reason = "평면이 작아 외곽 회전 램프(내변 6m·폭 6.5m)를 둘 수 없습니다";
  }

  // 진행 방향: 진입 변에서 t가 작은 쪽 모서리로 가며 시계/반시계로 외곽을 돈다.
  const startEdge = ramp.edge || "w";
  const along0 = startEdge === "n" || startEdge === "s" ? Ww : Dd;
  const t0 = clamp(Number(ramp.t) || along0 / 2, W + Ri, Math.max(W + Ri, along0 - (W + Ri)));
  const towardLow = t0 <= along0 / 2;
  // 외곽을 따라 도는 변 순서 (차 진행).
  const cw = { w: ["w", "s", "e", "n"], s: ["s", "e", "n", "w"], e: ["e", "n", "w", "s"], n: ["n", "w", "s", "e"] };
  const ccw = { w: ["w", "n", "e", "s"], s: ["s", "w", "n", "e"], e: ["e", "s", "w", "n"], n: ["n", "e", "s", "w"] };
  // west+towardLow → 남쪽(작은 y)으로 = cw의 w→s. west+!towardLow → 북쪽 = ccw.
  const useCw = (startEdge === "w" && towardLow) || (startEdge === "e" && !towardLow)
    || (startEdge === "s" && !towardLow) || (startEdge === "n" && towardLow);
  const order = (useCw ? cw : ccw)[startEdge];

  // 직선 구간 최대 경사 17%, 모서리 곡선 14%로 층고를 나눈다.
  const needStraight = minStraightRampLengthLocal(H, tr);
  const needCurve = minCurvePathLength(H, tr);
  const targetLen = Math.max(needStraight, needCurve);

  const path = [];
  const polygons = [];
  const pieces = [];
  const segments = [];
  let sAcc = 0;
  let hAcc = 0;
  let done = false;

  const pushPt = (x, y, ds, slope) => {
    if (done) return;
    const drop = Math.min(H - hAcc, ds * slope);
    sAcc += ds;
    hAcc += drop;
    path.push({ x: round3(x), y: round3(y), s: round3(sAcc), h: round3(hAcc) });
    if (hAcc >= H - 1e-6) done = true;
  };

  // 첫 점: 진입 변 위, 외벽에서 W/2 안쪽.
  const start = edgePoint(startEdge, t0, W / 2, Ww, Dd);
  path.push({ x: round3(start.x), y: round3(start.y), s: 0, h: 0 });

  for (let ei = 0; ei < order.length * 2 && !done; ei += 1) {
    const edge = order[ei % 4];
    const next = order[(ei + 1) % 4];
    const run = edgeRun(edge, startEdge, t0, ei === 0, W, Ri, Ww, Dd, useCw);
    // 직선: 외벽 띠 중심선
    const nSteps = Math.max(2, Math.ceil(run.len / 2));
    let segDrop = 0;
    let segLen = 0;
    for (let i = 1; i <= nSteps && !done; i += 1) {
      const u = i / nSteps;
      const p = run.at(u);
      const prev = path[path.length - 1];
      const ds = Math.hypot(p.x - prev.x, p.y - prev.y);
      let slope = RAMP_SLOPE_STRAIGHT;
      if (ei === 0 && sAcc < tr.top) slope = GENTLE_SLOPE;
      else if (H - hAcc <= tr.bottom * GENTLE_SLOPE + 1e-6) slope = GENTLE_SLOPE;
      pushPt(p.x, p.y, ds, slope);
      segLen += ds;
      segDrop += ds * slope;
    }
    if (segLen > 0.05) {
      segments.push({
        name: `${edgeLabelKo(edge)}측 외곽`,
        length: round1(segLen),
        drop: round3(Math.min(segDrop, H)),
        slope: round3(segLen ? Math.min(segDrop, H) / segLen : 0),
      });
      // 실제 달린 구간만 장애물·윤곽으로 (변 전체를 막지 않음)
      pieces.push(pathSpanBox(path, path.length - nSteps - 1, path.length - 1, W));
      polygons.push(edgeBandPoly(edge, run, W, Ww, Dd));
    }
    if (done) break;

    // 모서리 90° (내변 Ri)
    const corner = cornerTurn(edge, next, W, Ri, Rc, Ww, Dd, useCw);
    const arcSteps = 12;
    const arcStartIdx = path.length - 1;
    let arcLen = 0;
    let arcDrop = 0;
    for (let i = 1; i <= arcSteps && !done; i += 1) {
      const u = i / arcSteps;
      const a = corner.a0 + (corner.a1 - corner.a0) * u;
      const x = corner.cx + Rc * Math.cos(a);
      const y = corner.cy + Rc * Math.sin(a);
      const prev = path[path.length - 1];
      const ds = Math.hypot(x - prev.x, y - prev.y);
      pushPt(x, y, ds, RAMP_SLOPE_CURVE);
      arcLen += ds;
      arcDrop += ds * RAMP_SLOPE_CURVE;
    }
    if (arcLen > 0.05) {
      segments.push({
        name: "모서리 곡선",
        length: round1(arcLen),
        drop: round3(Math.min(arcDrop, H)),
        slope: round3(arcLen ? Math.min(arcDrop, H) / arcLen : 0),
      });
      pieces.push(...corner.pieces);
      pieces.push(pathSpanBox(path, arcStartIdx, path.length - 1, W));
      polygons.push(corner.poly);
    }
    if (sAcc >= targetLen * 3 && hAcc < H - 0.05) {
      reason = reason || "외곽 경로가 너무 길어 경사를 맞추지 못했습니다";
      break;
    }
  }

  if (hAcc < H - 0.05 && !reason) {
    reason = "외곽 경로로 층고를 다 내려가지 못했습니다(평면이 너무 작음)";
  }

  // 전체 AABB
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const pad = W / 2 + 0.2;
  const footprint = {
    x: round3(Math.min(...xs) - pad),
    y: round3(Math.min(...ys) - pad),
    w: round3(Math.max(...xs) - Math.min(...xs) + 2 * pad),
    d: round3(Math.max(...ys) - Math.min(...ys) + 2 * pad),
  };

  // 도착 쪽: 마지막 변 안쪽으로 차로와 닿는 띠
  const lastEdge = order[Math.min(order.length - 1, Math.floor((path.length) / 8)) % 4];
  const lip = edgeInnerLip(lastEdge, W, Ww, Dd);

  return {
    kind: "spiral",
    ok: !reason,
    reason,
    pieces: pieces.length ? pieces : [footprint],
    polygons: polygons.length ? polygons : [rectPolyLocal(footprint)],
    path,
    segments,
    total: round1(sAcc),
    approach: lip,
    lip,
    Ri,
    width: W,
    turns: round3(sAcc / (2 * Math.PI * Rc)),
    footprint,
    perimeter: true,
  };
}

function edgeLabelKo(edge) {
  return { n: "북", s: "남", w: "서", e: "동" }[edge] || edge;
}

function rectPolyLocal(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.d },
    { x: r.x, y: r.y + r.d },
  ];
}

/** 외벽에서 inset 안쪽 중심선 좌표. */
function edgePoint(edge, t, inset, Ww, Dd) {
  if (edge === "w") return { x: inset, y: t };
  if (edge === "e") return { x: Ww - inset, y: t };
  if (edge === "s") return { x: t, y: inset };
  return { x: t, y: Dd - inset };
}

/** 한 변을 따라 달리는 직선 구간 (모서리 곡선 직전까지만). */
function edgeRun(edge, startEdge, t0, isFirst, W, Ri, Ww, Dd, useCw) {
  const inset = W / 2;
  const cornerClear = W + Ri; // 모서리 곡선 시작 전
  let from;
  let to;
  if (edge === "w") {
    if (isFirst && startEdge === "w") {
      from = t0;
      to = useCw ? cornerClear : Dd - cornerClear;
    } else {
      from = useCw ? Dd - cornerClear : cornerClear;
      to = useCw ? cornerClear : Dd - cornerClear;
    }
    const len = Math.abs(to - from);
    return {
      len,
      at: (u) => ({ x: inset, y: from + (to - from) * u }),
    };
  }
  if (edge === "e") {
    if (isFirst && startEdge === "e") {
      from = t0;
      to = useCw ? Dd - cornerClear : cornerClear;
    } else {
      from = useCw ? cornerClear : Dd - cornerClear;
      to = useCw ? Dd - cornerClear : cornerClear;
    }
    const len = Math.abs(to - from);
    return {
      len,
      at: (u) => ({ x: Ww - inset, y: from + (to - from) * u }),
    };
  }
  if (edge === "s") {
    if (isFirst && startEdge === "s") {
      from = t0;
      to = useCw ? Ww - cornerClear : cornerClear;
    } else {
      from = useCw ? cornerClear : Ww - cornerClear;
      to = useCw ? Ww - cornerClear : cornerClear;
    }
    const len = Math.abs(to - from);
    return {
      len,
      at: (u) => ({ x: from + (to - from) * u, y: inset }),
    };
  }
  // n
  if (isFirst && startEdge === "n") {
    from = t0;
    to = useCw ? cornerClear : Ww - cornerClear;
  } else {
    from = useCw ? Ww - cornerClear : cornerClear;
    to = useCw ? cornerClear : Ww - cornerClear;
  }
  const len = Math.abs(to - from);
  return {
    len,
    at: (u) => ({ x: from + (to - from) * u, y: Dd - inset }),
  };
}

function pathSpanBox(path, i0, i1, W) {
  const slice = path.slice(Math.max(0, i0), Math.max(i0 + 1, i1 + 1));
  if (!slice.length) return { x: 0, y: 0, w: W, d: W };
  const xs = slice.map((p) => p.x);
  const ys = slice.map((p) => p.y);
  const pad = W / 2;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return {
    x: round3(x0),
    y: round3(y0),
    w: round3(Math.max(...xs) - Math.min(...xs) + W),
    d: round3(Math.max(...ys) - Math.min(...ys) + W),
  };
}

/** 달린 직선 구간의 램프 띠 폴리곤 (외벽~안쪽 W). */
function edgeBandPoly(edge, run, W, Ww, Dd) {
  const a = run.at(0);
  const b = run.at(1);
  if (edge === "w") {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return [{ x: 0, y: y0 }, { x: W, y: y0 }, { x: W, y: y1 }, { x: 0, y: y1 }];
  }
  if (edge === "e") {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return [{ x: Ww - W, y: y0 }, { x: Ww, y: y0 }, { x: Ww, y: y1 }, { x: Ww - W, y: y1 }];
  }
  if (edge === "s") {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: W }, { x: x0, y: W }];
  }
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  return [{ x: x0, y: Dd - W }, { x: x1, y: Dd - W }, { x: x1, y: Dd }, { x: x0, y: Dd }];
}

function edgeInnerLip(edge, W, Ww, Dd) {
  if (edge === "w") return { x: W - 0.2, y: Dd * 0.25, w: 1.2, d: Dd * 0.5 };
  if (edge === "e") return { x: Ww - W - 1.0, y: Dd * 0.25, w: 1.2, d: Dd * 0.5 };
  if (edge === "s") return { x: Ww * 0.25, y: W - 0.2, w: Ww * 0.5, d: 1.2 };
  return { x: Ww * 0.25, y: Dd - W - 1.0, w: Ww * 0.5, d: 1.2 };
}

/** fromEdge → nextEdge 모서리 90° 곡선. */
function cornerTurn(fromEdge, nextEdge, W, Ri, Rc, Ww, Dd, useCw) {
  const key = `${fromEdge}${nextEdge}`;
  // 중심 = 모서리에서 안쪽으로 (W/2 + 거리?) — 내변 Ri가 램프 안쪽 연석.
  // 중심선 반경 Rc = Ri + W/2, 중심은 외곽 모서리에서 Rc만큼 안쪽 대각.
  const centers = {
    ws: { cx: Rc, cy: Rc, a0: Math.PI, a1: Math.PI * 1.5 },       // 서→남 (cw)
    se: { cx: Ww - Rc, cy: Rc, a0: Math.PI * 1.5, a1: Math.PI * 2 }, // 남→동
    en: { cx: Ww - Rc, cy: Dd - Rc, a0: 0, a1: Math.PI * 0.5 },     // 동→북
    nw: { cx: Rc, cy: Dd - Rc, a0: Math.PI * 0.5, a1: Math.PI },    // 북→서
    wn: { cx: Rc, cy: Dd - Rc, a0: Math.PI, a1: Math.PI * 0.5 },    // 서→북 (ccw)
    ne: { cx: Ww - Rc, cy: Dd - Rc, a0: Math.PI * 0.5, a1: 0 },     // 북→동
    es: { cx: Ww - Rc, cy: Rc, a0: 0, a1: -Math.PI * 0.5 },         // 동→남
    sw: { cx: Rc, cy: Rc, a0: -Math.PI * 0.5, a1: -Math.PI },      // 남→서
  };
  const c = centers[key] || centers.ws;
  const steps = 8;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = c.a0 + (c.a1 - c.a0) * (i / steps);
    outer.push({ x: round3(c.cx + (Ri + W) * Math.cos(a)), y: round3(c.cy + (Ri + W) * Math.sin(a)) });
    inner.push({ x: round3(c.cx + Ri * Math.cos(a)), y: round3(c.cy + Ri * Math.sin(a)) });
  }
  const poly = outer.concat(inner.slice().reverse());
  const xs = outer.concat(inner).map((p) => p.x);
  const ys = outer.concat(inner).map((p) => p.y);
  const piece = {
    x: round3(Math.min(...xs)),
    y: round3(Math.min(...ys)),
    w: round3(Math.max(...xs) - Math.min(...xs)),
    d: round3(Math.max(...ys) - Math.min(...ys)),
  };
  void useCw;
  return { ...c, poly, pieces: [piece] };
}

/**
 * 외부 90° 곡선. helpers = layout의 localFrame, arcSectors, straightDrop, straightSegments, rectPoly.
 */
export function externalCurve90Shape(ramp, plate, helpers) {
  const { localFrame, arcSectors, straightDrop, straightSegments, rectPoly } = helpers;
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, "ground");
  const W = Math.max(AISLE, ramp.width || AISLE, RAMP_CURVE_W);
  const Ri = innerCurveRadius(plate);
  const Rc = Ri + W / 2;
  const vertical = ramp.edge === "n" || ramp.edge === "s";
  const along = vertical ? plate.width : plate.depth;
  const toLocal = localFrame(ramp.edge, plate);
  const sgn = ramp.t <= along / 2 ? 1 : -1;

  const sOut = Math.max(tr.top + 2, Math.min(Number(ramp.length) || 12, 18));
  const arc = (Math.PI / 2) * Rc;
  const dropOutMax = straightDrop(sOut, tr.top);
  const dropArcMax = arc * RAMP_SLOPE_CURVE;
  const bottomDrop = Math.min(H, tr.bottom * GENTLE_SLOPE);
  const rest = Math.max(0, H - bottomDrop - dropOutMax - dropArcMax);
  const ease = rest > 0 ? 1 : Math.max(0, H - bottomDrop) / Math.max(1e-6, dropOutMax + dropArcMax);
  const sInMain = rest > 0 ? Math.ceil((rest / RAMP_SLOPE_STRAIGHT) * 10) / 10 : 0;
  const sIn = round1(sInMain + tr.bottom);

  const vWall = 0;
  const vStart = -sOut;
  const uc = ramp.t + sgn * Rc;
  const vc = vWall;

  let reason = "";
  // 바깥으로 뻗는 길이 ≈ 바깥 직선 + 곡선이 벽을 따라 도는 돌출(대략 Ro).
  const m = plate.siteMargin == null ? 20 : Number(plate.siteMargin);
  const needMargin = round1(Math.max(sOut, Ri + W));
  if (needMargin > m + 0.05) {
    reason = `외부 곡선 램프가 대지 여유 ${m}m를 넘습니다(필요 약 ${needMargin}m)`;
  }

  const piecesLocal = [
    { u0: ramp.t - W / 2, u1: ramp.t + W / 2, v0: vStart, v1: vWall },
    ...arcSectors(uc, vc, Ri, Ri + W, sgn, 3),
  ];
  if (sIn > 0) {
    const laneV0 = vc + Ri;
    const laneV1 = vc + Ri + W;
    const uEnd = uc + sgn * sIn;
    piecesLocal.push({ u0: Math.min(uc, uEnd), u1: Math.max(uc, uEnd), v0: laneV0, v1: laneV1 });
  }
  const pieces = piecesLocal.map(toLocal.rect);

  const steps = 16;
  const arcPoly = [];
  for (let i = 0; i <= steps; i += 1) {
    const th = Math.PI - (i / steps) * (Math.PI / 2);
    arcPoly.push(toLocal.pt(uc + sgn * (Ri + W) * Math.cos(th), vc + (Ri + W) * Math.sin(th)));
  }
  for (let i = steps; i >= 0; i -= 1) {
    const th = Math.PI - (i / steps) * (Math.PI / 2);
    arcPoly.push(toLocal.pt(uc + sgn * Ri * Math.cos(th), vc + Ri * Math.sin(th)));
  }
  const polygons = [rectPoly(pieces[0]), arcPoly];
  if (sIn > 0) polygons.push(rectPoly(pieces[pieces.length - 1]));

  const at = (p, h) => ({ ...p, h: round3(h) });
  const path = [at(toLocal.pt(ramp.t, vStart, 0), 0)];
  path.push(at(toLocal.pt(ramp.t, vWall, sOut), dropOutMax * ease));
  for (let i = 1; i <= steps; i += 1) {
    const th = Math.PI - (i / steps) * (Math.PI / 2);
    path.push(at(
      toLocal.pt(uc + sgn * Rc * Math.cos(th), vc + Rc * Math.sin(th), sOut + arc * (i / steps)),
      (dropOutMax + dropArcMax * (i / steps)) * ease,
    ));
  }
  if (sIn > 0) path.push(at(toLocal.pt(uc + sgn * sIn, vc + Rc, sOut + arc + sIn), H));

  const segments = straightSegments(sOut, { ...tr, bottom: 0 }, H)
    .map((seg) => ({ ...seg, drop: round3(seg.drop * ease) }))
    .concat([{ name: "외부 곡선 90°", length: round1(arc), drop: round3(dropArcMax * ease), slope: round3(RAMP_SLOPE_CURVE * ease) }]);
  if (sInMain > 0) segments.push({ name: "진입 직선", length: sInMain, drop: round3(rest), slope: round3(rest / sInMain) });

  return {
    kind: "curved",
    ok: !reason,
    reason,
    pieces,
    polygons,
    path,
    segments,
    total: round1(sOut + arc + sIn),
    approach: sIn > 0 ? pieces[pieces.length - 1] : null,
    lip: null,
    turn: sgn,
    externalCurve: true,
    footprint: pieces[0],
  };
}
