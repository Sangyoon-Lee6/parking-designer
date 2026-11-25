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

export const RAMP_FORMS = ["auto", "straight", "curve90", "outer9090", "outer180", "spiral"];
export const LOWER_RAMP_FORMS = ["auto", "same", "straight", "curve90", "outer9090", "outer180", "spiral"];
export const LOWER_RAMP_MODES = ["alternate", "same"];

export function rampFormOf(ramp, fallback = "auto") {
  const f = (ramp && ramp.form) || fallback || "auto";
  // 예전 «외곽 회전»은 외부형에서 90·직선·90으로 취급
  if (f === "spiral") return f;
  return RAMP_FORMS.includes(f) ? f : "auto";
}

/** 지상 형태 + 사용자 선택 → 층간(B2↓) 형태 */
export function resolveLowerRampForm(groundForm, lowerForm = "auto") {
  const g = RAMP_FORMS.includes(groundForm) ? groundForm : "auto";
  const pick = LOWER_RAMP_FORMS.includes(lowerForm) ? lowerForm : "auto";
  if (pick === "same") return g;
  if (pick !== "auto") return pick;
  // 자동: 출입 형태를 따르되, 외곽 회전은 90·직선·90으로
  if (g === "spiral") return "outer9090";
  if (g === "outer9090" || g === "outer180") return g;
  if (g === "straight") return "auto";
  if (g === "auto") return "curve90";
  return g;
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
 * 지하 2층 이하용 램프: 지상→B1과 경로·형태를 나눌 수 있다.
 * mode: alternate = 반대쪽 변 / same = 동일 XY
 * lowerForm: auto|same|straight|curve90|spiral (plate.lowerRampForm)
 */
export function lowerFloorRamp(groundRamp, plate, mode = "alternate", lowerForm = "auto", override = null) {
  if (!groundRamp) return null;
  const baseForm = rampFormOf(groundRamp, plate && plate.rampForm);
  const form = resolveLowerRampForm(baseForm, lowerForm || (plate && plate.lowerRampForm) || "auto");
  const tr = rampTransitions(plate, "lower");
  const needsCurveW = form === "curve90" || form === "spiral" || form === "outer9090" || form === "outer180";
  const outer = form === "outer9090" || form === "outer180" || form === "spiral";
  const width = needsCurveW
    ? Math.max(groundRamp.width || AISLE, RAMP_CURVE_W)
    : (groundRamp.width || AISLE);
  const length = outer && form === "spiral"
    ? groundRamp.length
    : minStraightRampLengthLocal(floorHeightOf(plate), tr);
  const placement = outer
    ? (override?.placement || groundRamp.placement || "external")
    : (override?.placement || "internal");

  if (mode === "same" && !override) {
    return {
      ...groundRamp,
      form,
      level: "lower",
      length,
      width,
      placement,
      groundId: groundRamp.id,
    };
  }
  const edge = override?.edge || (mode === "same" ? groundRamp.edge : oppositeEdge(groundRamp.edge));
  const along = edge === "n" || edge === "s" ? plate.width : plate.depth;
  const t = override?.t != null
    ? Number(override.t)
    : (mode === "same" ? groundRamp.t : round1(along - (groundRamp.t || along / 2)));
  const keepSpiralPath = form === "spiral" && baseForm === "spiral" && !override;
  return {
    ...groundRamp,
    id: (Number(groundRamp.id) || 1) + 1000,
    groundId: groundRamp.id,
    edge: keepSpiralPath ? groundRamp.edge : edge,
    t: keepSpiralPath ? groundRamp.t : t,
    placement,
    form,
    level: "lower",
    inset: AISLE,
    length,
    width,
    ...(override?.x != null ? { x: override.x, y: override.y } : {}),
  };
}

export function rampsForLevel(ramps, plate, level, lowerMode = "alternate", overrides = null) {
  const list = (ramps || []).filter(Boolean);
  if (!list.length) return [];
  const mode = lowerMode || (plate && plate.lowerRampMode) || "alternate";
  const lowerForm = (plate && plate.lowerRampForm) || "auto";
  const ov = overrides || plate?.lowerRampOverrides || {};
  if (level <= 0) {
    return list.map((r) => ({
      ...r,
      level: "ground",
      form: rampFormOf(r, plate && plate.rampForm),
    }));
  }
  return list.map((r) => lowerFloorRamp(
    r,
    plate,
    mode,
    lowerForm,
    ov[r.id] || ov[String(r.id)] || null,
  )).filter(Boolean);
}

export function occupancyRamps(ramps, plate, lowerMode = "alternate") {
  const ground = (ramps || []).filter(Boolean);
  if (!ground.length) return ground;
  const mode = lowerMode || (plate && plate.lowerRampMode) || "alternate";
  if (mode === "same") return ground;
  const lowerForm = (plate && plate.lowerRampForm) || "auto";
  const ov = plate?.lowerRampOverrides || {};
  const lowers = ground.map((r) => lowerFloorRamp(
    r,
    plate,
    "alternate",
    lowerForm,
    ov[r.id] || ov[String(r.id)] || null,
  )).filter(Boolean);
  const sameSpiral = lowers.every((r, i) => {
    const g = ground[i];
    return rampFormOf(g, plate && plate.rampForm) === "spiral"
      && rampFormOf(r) === "spiral"
      && r.edge === g.edge;
  });
  if (sameSpiral) return ground;
  return ground.concat(lowers);
}

/**
 * 외곽 회전 램프(한 층분): 주차장 외벽에 붙어 변을 따라가다 모서리에서 내변≥6m로 꺾으며 내려간다.
 * (가운데 원형 우물이 아님 — 차가 가장자리를 돌며 층고를 내려감)
 * placement=external 이면 건축선 밖(이격 안) 바깥 띠를 돈다.
 */
export function spiralRampShape(ramp, plate) {
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, ramp.level === "lower" ? "lower" : "ground");
  const Ri = innerCurveRadius(plate);
  const W = Math.max(RAMP_CURVE_W, ramp.width || RAMP_CURVE_W);
  const Rc = Ri + W / 2;
  const Ww = plate.width;
  const Dd = plate.depth;
  const external = (ramp.placement || plate.rampPlacement || "internal") === "external";
  // 중심선: 내부형은 외벽에서 W/2 안쪽, 외부형은 건축선 밖 W/2 (이격 띠).
  const wallInset = external ? -W / 2 : W / 2;

  let reason = "";
  if (Ww < 2 * (W + Ri) + AISLE || Dd < 2 * (W + Ri) + AISLE) {
    reason = "평면이 작아 외곽 회전 램프(내변 6m·폭 6.5m)를 둘 수 없습니다";
  }
  if (external) {
    const m = plate.siteMargins || {};
    const base = plate.siteMargin == null ? 20 : Number(plate.siteMargin);
    const have = (k) => (Number.isFinite(Number(m[k])) ? Number(m[k]) : base);
    const need = W + 0.2;
    const edge = ramp.edge || "w";
    if (have(edge) < need - 0.05) {
      reason = reason || `외부 외곽 회전에 ${edgeLabelKo(edge)}측 이격 ${need}m 이상이 필요합니다`;
    }
  }

  // 진행 방향: 진입 변에서 더 긴 쪽 직선이 나오도록 시계/반시계를 고른다.
  const startEdge = ramp.edge || "w";
  const along0 = startEdge === "n" || startEdge === "s" ? Ww : Dd;
  const t0 = clamp(Number(ramp.t) || along0 / 2, W + Ri, Math.max(W + Ri, along0 - (W + Ri)));
  // 외곽을 따라 도는 변 순서 (차 진행).
  const cw = { w: ["w", "s", "e", "n"], s: ["s", "e", "n", "w"], e: ["e", "n", "w", "s"], n: ["n", "w", "s", "e"] };
  const ccw = { w: ["w", "n", "e", "s"], s: ["s", "w", "n", "e"], e: ["e", "s", "w", "n"], n: ["n", "e", "s", "w"] };
  // 직선 구간 최대 경사 17%, 모서리 곡선 14%로 층고를 나눈다.
  const needStraight = minStraightRampLengthLocal(H, tr);
  const needCurve = minCurvePathLength(H, tr);
  const targetLen = Math.max(needStraight, needCurve);
  const minFirst = Math.max(8, Math.min(14, needStraight * 0.45));
  const lenCw = edgeRun(startEdge, startEdge, t0, true, W, Ri, Ww, Dd, true, wallInset).len;
  const lenCcw = edgeRun(startEdge, startEdge, t0, true, W, Ri, Ww, Dd, false, wallInset).len;
  let useCw = lenCw >= lenCcw;
  if (Math.max(lenCw, lenCcw) < minFirst - 0.05) {
    reason = reason || "진입 위치가 모서리에 너무 가까워 외곽 회전 램프를 둘 수 없습니다";
  }
  const order = (useCw ? cw : ccw)[startEdge];

  const path = [];
  const polygons = [];
  const pieces = [];
  const segments = [];
  let sAcc = 0;
  let hAcc = 0;
  let done = false;

  const pushPt = (x, y, ds, slope) => {
    if (done) return;
    // 중복·극소 구간은 점에 넣지 않아 팬 메시를 막는다
    if (ds < 0.05) return;
    const drop = Math.min(H - hAcc, ds * slope);
    sAcc += ds;
    hAcc += drop;
    path.push({ x: round3(x), y: round3(y), s: round3(sAcc), h: round3(hAcc) });
    if (hAcc >= H - 1e-6) done = true;
  };

  // 첫 점: 진입 변 위 중심선(내부=안쪽, 외부=건축선 밖).
  const start = edgePoint(startEdge, t0, wallInset, Ww, Dd);
  path.push({ x: round3(start.x), y: round3(start.y), s: 0, h: 0 });

  for (let ei = 0; ei < order.length * 2 && !done && !reason; ei += 1) {
    const edge = order[ei % 4];
    const next = order[(ei + 1) % 4];
    const run = edgeRun(edge, startEdge, t0, ei === 0, W, Ri, Ww, Dd, useCw, wallInset);
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
      polygons.push(edgeBandPoly(edge, run, W, Ww, Dd, external));
    }
    if (done) break;

    // 모서리 90° (내변 Ri) — 외부형은 건축선 밖 모서리
    const corner = cornerTurn(edge, next, W, Ri, Rc, Ww, Dd, useCw, external);
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
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // 모서리 한쪽만 도는 짧은 호는 팬처럼 보이므로 거절
  if (!reason && path.length >= 2 && Math.min(spanX, spanY) < W * 0.8 && Math.max(spanX, spanY) < needStraight * 0.85) {
    reason = "외곽 회전 경로가 모서리에만 몰려 자동 형태로 대체합니다";
  }
  const pad = W / 2 + 0.2;
  const footprint = {
    x: round3(Math.min(...xs) - pad),
    y: round3(Math.min(...ys) - pad),
    w: round3(Math.max(...xs) - Math.min(...xs) + 2 * pad),
    d: round3(Math.max(...ys) - Math.min(...ys) + 2 * pad),
  };

  // 도착 쪽: 마지막 변에서 평면 안쪽 차로와 닿는 띠
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
    external,
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

/** 외벽 기준 중심선. inset>0 안쪽, inset<0 건축선 밖(이격). */
function edgePoint(edge, t, inset, Ww, Dd) {
  if (edge === "w") return { x: inset, y: t };
  if (edge === "e") return { x: Ww - inset, y: t };
  if (edge === "s") return { x: t, y: inset };
  return { x: t, y: Dd - inset };
}

/** 한 변을 따라 달리는 직선 구간 (모서리 곡선 직전까지만). wallInset: 중심선 오프셋. */
function edgeRun(edge, startEdge, t0, isFirst, W, Ri, Ww, Dd, useCw, wallInset = W / 2) {
  const inset = wallInset;
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

/** 달린 직선 구간의 램프 띠 폴리곤. external이면 건축선 밖 띠. */
function edgeBandPoly(edge, run, W, Ww, Dd, external = false) {
  const a = run.at(0);
  const b = run.at(1);
  if (edge === "w") {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (external) return [{ x: -W, y: y0 }, { x: 0, y: y0 }, { x: 0, y: y1 }, { x: -W, y: y1 }];
    return [{ x: 0, y: y0 }, { x: W, y: y0 }, { x: W, y: y1 }, { x: 0, y: y1 }];
  }
  if (edge === "e") {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (external) return [{ x: Ww, y: y0 }, { x: Ww + W, y: y0 }, { x: Ww + W, y: y1 }, { x: Ww, y: y1 }];
    return [{ x: Ww - W, y: y0 }, { x: Ww, y: y0 }, { x: Ww, y: y1 }, { x: Ww - W, y: y1 }];
  }
  if (edge === "s") {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    if (external) return [{ x: x0, y: -W }, { x: x1, y: -W }, { x: x1, y: 0 }, { x: x0, y: 0 }];
    return [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: W }, { x: x0, y: W }];
  }
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  if (external) return [{ x: x0, y: Dd }, { x: x1, y: Dd }, { x: x1, y: Dd + W }, { x: x0, y: Dd + W }];
  return [{ x: x0, y: Dd - W }, { x: x1, y: Dd - W }, { x: x1, y: Dd }, { x: x0, y: Dd }];
}

function edgeInnerLip(edge, W, Ww, Dd) {
  if (edge === "w") return { x: W - 0.2, y: Dd * 0.25, w: 1.2, d: Dd * 0.5 };
  if (edge === "e") return { x: Ww - W - 1.0, y: Dd * 0.25, w: 1.2, d: Dd * 0.5 };
  if (edge === "s") return { x: Ww * 0.25, y: W - 0.2, w: Ww * 0.5, d: 1.2 };
  return { x: Ww * 0.25, y: Dd - W - 1.0, w: Ww * 0.5, d: 1.2 };
}

/** fromEdge → nextEdge 모서리 90° 곡선. external이면 건축선 밖 모서리. */
function cornerTurn(fromEdge, nextEdge, W, Ri, Rc, Ww, Dd, useCw, external = false) {
  const key = `${fromEdge}${nextEdge}`;
  // 내부: 외벽 모서리에 외변을 붙이려면 중심은 (Ri+W, Ri+W).
  // 외부: 건축선 밖 모서리 — 중심을 평면 밖으로 둔다.
  const Ro = Ri + W;
  const centersIn = {
    ws: { cx: Ro, cy: Ro, a0: Math.PI, a1: Math.PI * 1.5 },
    se: { cx: Ww - Ro, cy: Ro, a0: Math.PI * 1.5, a1: Math.PI * 2 },
    en: { cx: Ww - Ro, cy: Dd - Ro, a0: 0, a1: Math.PI * 0.5 },
    nw: { cx: Ro, cy: Dd - Ro, a0: Math.PI * 0.5, a1: Math.PI },
    wn: { cx: Ro, cy: Dd - Ro, a0: Math.PI, a1: Math.PI * 0.5 },
    ne: { cx: Ww - Ro, cy: Dd - Ro, a0: Math.PI * 0.5, a1: 0 },
    es: { cx: Ww - Ro, cy: Ro, a0: 0, a1: -Math.PI * 0.5 },
    sw: { cx: Ro, cy: Ro, a0: -Math.PI * 0.5, a1: -Math.PI },
  };
  // 외부: 내변이 건축선에 닿고 외변이 이격 쪽으로 나가도록 중심을 바깥에 둔다.
  const centersOut = {
    ws: { cx: -Ri, cy: -Ri, a0: Math.PI, a1: Math.PI * 1.5 },
    se: { cx: Ww + Ri, cy: -Ri, a0: Math.PI * 1.5, a1: Math.PI * 2 },
    en: { cx: Ww + Ri, cy: Dd + Ri, a0: 0, a1: Math.PI * 0.5 },
    nw: { cx: -Ri, cy: Dd + Ri, a0: Math.PI * 0.5, a1: Math.PI },
    wn: { cx: -Ri, cy: Dd + Ri, a0: Math.PI, a1: Math.PI * 0.5 },
    ne: { cx: Ww + Ri, cy: Dd + Ri, a0: Math.PI * 0.5, a1: 0 },
    es: { cx: Ww + Ri, cy: -Ri, a0: 0, a1: -Math.PI * 0.5 },
    sw: { cx: -Ri, cy: -Ri, a0: -Math.PI * 0.5, a1: -Math.PI },
  };
  const c = (external ? centersOut : centersIn)[key] || (external ? centersOut.ws : centersIn.ws);
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
  void Rc;
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

/**
 * 외부 90°·직선·90°: 건축선 밖에서 한 번 꺾고 변을 따라가다 다시 꺾어 평면 안으로 들어온다.
 */
export function externalBend9090Shape(ramp, plate, helpers) {
  const { localFrame, arcSectors, straightDrop, straightSegments, rectPoly } = helpers;
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, ramp.level === "lower" ? "lower" : "ground");
  const W = Math.max(AISLE, ramp.width || AISLE, RAMP_CURVE_W);
  const Ri = innerCurveRadius(plate);
  const Rc = Ri + W / 2;
  const Ro = Ri + W;
  const vertical = ramp.edge === "n" || ramp.edge === "s";
  const along = vertical ? plate.width : plate.depth;
  const toLocal = localFrame(ramp.edge, plate);
  const sgn = ramp.t <= along / 2 ? 1 : -1;

  // 바깥 짧은 돌출 → 1차 90° → 바깥 평행 직선 → 2차 90°(진입) → 안쪽 직선
  const sOut = Math.max(2, Math.min(8, Number(ramp.length) || 8));
  const arc = (Math.PI / 2) * Rc;
  const m = plate.siteMargin == null ? 20 : Number(plate.siteMargin);
  const sideBudget = Math.max(6, m - Ro);
  const sSide = Math.max(6, Math.min(sideBudget, Math.max(8, (Number(ramp.length) || 18) * 0.35)));

  const dropOut = straightDrop(sOut, tr.top);
  const dropArc1 = arc * RAMP_SLOPE_CURVE;
  const dropSide = sSide * RAMP_SLOPE_STRAIGHT;
  const dropArc2 = arc * RAMP_SLOPE_CURVE;
  const bottomDrop = Math.min(H, tr.bottom * GENTLE_SLOPE);
  const used = dropOut + dropArc1 + dropSide + dropArc2;
  const rest = Math.max(0, H - bottomDrop - used);
  const ease = rest + used + bottomDrop > 0
    ? Math.min(1, H / Math.max(1e-6, used + bottomDrop + rest))
    : 1;
  const sInMain = rest > 0 ? Math.ceil((rest / RAMP_SLOPE_STRAIGHT) * 10) / 10 : Math.max(4, tr.bottom);
  const sIn = round1(sInMain + (rest > 0 ? tr.bottom : 0));

  let reason = "";
  const needMargin = round1(Math.max(sOut, Ro));
  if (needMargin > m + 0.05) {
    reason = `90·직선·90 램프가 대지 여유 ${m}m를 넘습니다(필요 약 ${needMargin}m)`;
  }

  // 국소: v=바깥(-), u=변 방향. 1차 회전 중심 (uc1,vc1), 2차 (uc2,vc2)
  const vWall = 0;
  const vOuter = -Ro;
  const uc1 = ramp.t + sgn * Rc;
  const vc1 = vWall;
  const uc2 = uc1 + sgn * sSide;
  const vc2 = vOuter;

  const piecesLocal = [
    { u0: ramp.t - W / 2, u1: ramp.t + W / 2, v0: -sOut, v1: vWall },
    ...arcSectors(uc1, vc1, Ri, Ri + W, sgn, 3),
  ];
  // 바깥 평행 띠 (v = -Ro .. -Ri)
  piecesLocal.push({
    u0: Math.min(uc1, uc2),
    u1: Math.max(uc1, uc2),
    v0: -Ro,
    v1: -Ri,
  });
  // 2차 90°: 바깥에서 벽 쪽으로 (부호 반대로 안쪽 진입)
  piecesLocal.push(...arcSectors(uc2, 0, Ri, Ri + W, -sgn, 3).map((p) => ({
    ...p,
    // arcSectors는 vc=0 기준 — 바깥 평행선 끝에서 벽으로 말아 들임
  })));
  // 안쪽 진입 직선
  const uIn0 = uc2;
  const uIn1 = uc2 + sgn * sIn;
  piecesLocal.push({
    u0: Math.min(uIn0, uIn1),
    u1: Math.max(uIn0, uIn1),
    v0: Ri,
    v1: Ri + W,
  });

  // 2차 회전을 벽 모서리(vc=0)가 아니라 바깥 끝에서 안쪽으로: 수동 섹터
  const arc2Local = [];
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * (Math.PI / 2);
    const a1 = ((i + 1) / steps) * (Math.PI / 2);
    // 시작: 바깥 평행(방향 sgn), 끝: 안쪽(+v)
    // 중심을 (uc2, -Rc)에 두고 π→π/2 또는 0→-π/2
    const cx = uc2;
    const cy = -Rc;
    const th0 = sgn > 0 ? Math.PI - a0 : a0;
    const th1 = sgn > 0 ? Math.PI - a1 : a1;
    void th0;
    void th1;
    void cx;
    void cy;
  }
  // pieces를 단순화: footprint AABB + 경로 위주 (점유는 path/approach)
  const pieces = [
    toLocal.rect({ u0: ramp.t - W / 2, u1: ramp.t + W / 2, v0: -sOut, v1: 0 }),
    toLocal.rect({
      u0: Math.min(ramp.t, uc2 + sgn * Ro) - W / 2,
      u1: Math.max(ramp.t, uc2 + sgn * Ro) + W / 2,
      v0: -Ro,
      v1: 0,
    }),
    toLocal.rect({
      u0: Math.min(uIn0, uIn1),
      u1: Math.max(uIn0, uIn1),
      v0: 0,
      v1: Ri + W,
    }),
  ];

  const at = (p, h) => ({ ...p, h: round3(h) });
  const path = [at(toLocal.pt(ramp.t, -sOut, 0), 0)];
  let sAcc = 0;
  let hAcc = 0;
  const push = (u, v, ds, slope) => {
    sAcc += ds;
    hAcc = Math.min(H, hAcc + ds * slope * ease);
    path.push(at(toLocal.pt(u, v, sAcc), hAcc));
  };
  // 바깥 직선
  push(ramp.t, 0, sOut, RAMP_SLOPE_STRAIGHT);
  // 1차 90°
  for (let i = 1; i <= 12; i += 1) {
    const th = Math.PI - (i / 12) * (Math.PI / 2);
    const u = uc1 + sgn * Rc * Math.cos(th);
    const v = vc1 + Rc * Math.sin(th);
    const prev = path[path.length - 1];
    const world = toLocal.pt(u, v, 0);
    const ds = Math.hypot(world.x - prev.x, world.y - prev.y);
    push(u, v, ds || arc / 12, RAMP_SLOPE_CURVE);
  }
  // 바깥 평행
  push(uc2, -Rc, sSide, RAMP_SLOPE_STRAIGHT);
  // 2차 90° (바깥 → 안)
  for (let i = 1; i <= 12; i += 1) {
    const th = (sgn > 0 ? Math.PI : 0) + (sgn > 0 ? -1 : 1) * (i / 12) * (Math.PI / 2);
    // 중심 (uc2, -Rc): 시작 각도 π(왼쪽)에서 π/2(위/안) 또는 0→-π/2
    const a0 = sgn > 0 ? Math.PI : 0;
    const a = a0 + (sgn > 0 ? -1 : 1) * (i / 12) * (Math.PI / 2);
    const u = uc2 + Rc * Math.cos(a);
    const v = -Rc + Rc * Math.sin(a);
    const prev = path[path.length - 1];
    const world = toLocal.pt(u, v, 0);
    const ds = Math.hypot(world.x - prev.x, world.y - prev.y);
    push(u, v, ds || arc / 12, RAMP_SLOPE_CURVE);
  }
  // 안쪽 직선
  if (sIn > 0) push(uc2 + sgn * sIn, Rc, sIn, RAMP_SLOPE_STRAIGHT);
  if (hAcc < H - 0.05) {
    // 남은 낙차 보정
    const last = path[path.length - 1];
    path.push({ ...last, h: H, s: round3(sAcc + 0.01) });
    hAcc = H;
  }

  const polygons = pieces.map(rectPoly);
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const pad = W / 2;
  const footprint = {
    x: round3(Math.min(...xs) - pad),
    y: round3(Math.min(...ys) - pad),
    w: round3(Math.max(...xs) - Math.min(...xs) + 2 * pad),
    d: round3(Math.max(...ys) - Math.min(...ys) + 2 * pad),
  };

  void arc2Local;
  void piecesLocal;
  void dropSide;
  void dropArc1;
  void dropArc2;
  void dropOut;
  void straightSegments;
  void arcSectors;

  return {
    kind: "curved",
    ok: !reason && path.length > 4,
    reason,
    pieces,
    polygons,
    path,
    segments: [
      { name: "바깥 직선", length: round1(sOut), drop: round3(dropOut * ease), slope: round3(RAMP_SLOPE_STRAIGHT * ease) },
      { name: "1차 90°", length: round1(arc), drop: round3(dropArc1 * ease), slope: round3(RAMP_SLOPE_CURVE * ease) },
      { name: "바깥 평행", length: round1(sSide), drop: round3(dropSide * ease), slope: round3(RAMP_SLOPE_STRAIGHT * ease) },
      { name: "2차 90° 진입", length: round1(arc), drop: round3(dropArc2 * ease), slope: round3(RAMP_SLOPE_CURVE * ease) },
      { name: "안쪽 직선", length: round1(sIn), drop: round3(Math.max(0, H - (used * ease))), slope: round3(RAMP_SLOPE_STRAIGHT * ease) },
    ],
    total: round1(sAcc),
    approach: pieces[pieces.length - 1],
    lip: pieces[pieces.length - 1],
    turn: sgn,
    externalCurve: true,
    outerKind: "outer9090",
    footprint,
  };
}

/**
 * 외부 180° 회전: 건축선 밖에서 U턴해 같은 변으로 평면 안에 들어온다.
 */
export function externalUTurn180Shape(ramp, plate, helpers) {
  const { localFrame, straightDrop, rectPoly } = helpers;
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, ramp.level === "lower" ? "lower" : "ground");
  const W = Math.max(AISLE, ramp.width || AISLE, RAMP_CURVE_W);
  const Ri = innerCurveRadius(plate);
  const Rc = Ri + W / 2;
  const Ro = Ri + W;
  const vertical = ramp.edge === "n" || ramp.edge === "s";
  const along = vertical ? plate.width : plate.depth;
  const toLocal = localFrame(ramp.edge, plate);
  const sgn = ramp.t <= along / 2 ? 1 : -1;

  const sOut = Math.max(tr.top + 2, Math.min(12, Number(ramp.length) || 10));
  const arc = Math.PI * Rc; // 180°
  const m = plate.siteMargin == null ? 20 : Number(plate.siteMargin);
  const dropOut = straightDrop(sOut, tr.top);
  const dropArc = arc * RAMP_SLOPE_CURVE;
  const bottomDrop = Math.min(H, tr.bottom * GENTLE_SLOPE);
  const rest = Math.max(0, H - bottomDrop - dropOut - dropArc);
  const ease = Math.min(1, H / Math.max(1e-6, dropOut + dropArc + bottomDrop + rest));
  const sInMain = rest > 0 ? Math.ceil((rest / RAMP_SLOPE_STRAIGHT) * 10) / 10 : Math.max(4, tr.bottom);
  const sIn = round1(sInMain);

  let reason = "";
  // U턴 바깥 돌출 ≈ 2·Rc (중심선 반경)
  const needMargin = round1(Math.max(sOut, 2 * Rc + 0.5));
  if (needMargin > m + 0.05) {
    reason = `180° 회전 램프가 대지 여유 ${m}m를 넘습니다(필요 약 ${needMargin}m)`;
  }

  // U턴 중심: 벽 밖 Rc, 진입 차로와 출차로 간격 = 2*Rc
  const uc = ramp.t + sgn * Rc;
  const vc = -Rc;

  const pieces = [
    toLocal.rect({ u0: ramp.t - W / 2, u1: ramp.t + W / 2, v0: -sOut, v1: 0 }),
    toLocal.rect({
      u0: Math.min(ramp.t, uc + sgn * Ro) - 0.5,
      u1: Math.max(ramp.t, uc + sgn * Ro) + 0.5,
      v0: -2 * Ro,
      v1: 0,
    }),
    toLocal.rect({
      u0: Math.min(uc + sgn * Rc - W / 2, uc + sgn * Rc + sgn * sIn),
      u1: Math.max(uc + sgn * Rc - W / 2, uc + sgn * Rc + sgn * sIn),
      v0: 0,
      v1: Math.max(sIn, Ri + W),
    }),
  ];

  const at = (p, h) => ({ ...p, h: round3(h) });
  const path = [at(toLocal.pt(ramp.t, -sOut, 0), 0)];
  let sAcc = 0;
  let hAcc = 0;
  const push = (u, v, ds, slope) => {
    sAcc += ds;
    hAcc = Math.min(H, hAcc + ds * slope * ease);
    path.push(at(toLocal.pt(u, v, sAcc), hAcc));
  };
  push(ramp.t, 0, sOut, RAMP_SLOPE_STRAIGHT);
  // 180°: 시작 각도 π/2(벽쪽)에서 바깥으로 돌아 3π/2 또는 대칭
  const aStart = Math.PI / 2;
  const aEnd = aStart + sgn * Math.PI;
  for (let i = 1; i <= 24; i += 1) {
    const a = aStart + (aEnd - aStart) * (i / 24);
    const u = uc + Rc * Math.cos(a);
    const v = vc + Rc * Math.sin(a);
    const prev = path[path.length - 1];
    const world = toLocal.pt(u, v, 0);
    const ds = Math.hypot(world.x - prev.x, world.y - prev.y);
    push(u, v, ds || arc / 24, RAMP_SLOPE_CURVE);
  }
  const uIn = uc + sgn * Rc;
  if (sIn > 0) push(uIn, sIn, sIn, RAMP_SLOPE_STRAIGHT);
  if (hAcc < H - 0.05) {
    const last = path[path.length - 1];
    path.push({ ...last, h: H });
  }

  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const pad = W / 2;
  return {
    kind: "curved",
    ok: !reason && path.length > 4,
    reason,
    pieces,
    polygons: pieces.map(rectPoly),
    path,
    segments: [
      { name: "바깥 직선", length: round1(sOut), drop: round3(dropOut * ease), slope: round3(RAMP_SLOPE_STRAIGHT * ease) },
      { name: "180° 회전", length: round1(arc), drop: round3(dropArc * ease), slope: round3(RAMP_SLOPE_CURVE * ease) },
      { name: "안쪽 직선", length: round1(sIn), drop: round3(Math.max(0, H - (dropOut + dropArc) * ease)), slope: round3(RAMP_SLOPE_STRAIGHT * ease) },
    ],
    total: round1(sAcc),
    approach: pieces[pieces.length - 1],
    lip: pieces[pieces.length - 1],
    turn: sgn,
    externalCurve: true,
    outerKind: "outer180",
    footprint: {
      x: round3(Math.min(...xs) - pad),
      y: round3(Math.min(...ys) - pad),
      w: round3(Math.max(...xs) - Math.min(...xs) + 2 * pad),
      d: round3(Math.max(...ys) - Math.min(...ys) + 2 * pad),
    },
  };
}
