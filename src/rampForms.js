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

/** 원형(나선) 램프 한 층분. */
export function spiralRampShape(ramp, plate) {
  const H = floorHeightOf(plate);
  const tr = rampTransitions(plate, ramp.level === "lower" ? "lower" : "ground");
  const Ri = innerCurveRadius(plate);
  const W = Math.max(RAMP_CURVE_W, ramp.width || RAMP_CURVE_W);
  const R = Ri + W / 2;
  const need = minCurvePathLength(H, tr);
  const theta = need / R;
  const turns = theta / (Math.PI * 2);
  const turnSgn = ramp.turn < 0 ? -1 : 1;

  const along = ramp.edge === "n" || ramp.edge === "s" ? plate.width : plate.depth;
  const across = ramp.edge === "n" || ramp.edge === "s" ? plate.depth : plate.width;
  const margin = Ri + W + 1;
  const t = clamp(ramp.t || along / 2, margin, Math.max(margin, along - margin));
  let cx;
  let cy;
  if (ramp.edge === "s") { cx = t; cy = margin; }
  else if (ramp.edge === "n") { cx = t; cy = plate.depth - margin; }
  else if (ramp.edge === "w") { cx = margin; cy = t; }
  else { cx = plate.width - margin; cy = t; }

  let reason = "";
  if (across < 2 * (Ri + W) + AISLE || along < 2 * (Ri + W) + AISLE) {
    reason = "평면이 작아 원형 램프(내변 6m·폭 6.5m)를 둘 수 없습니다";
  }

  const a0 = ramp.edge === "s" || ramp.edge === "w" ? Math.PI / 2 : -Math.PI / 2;
  const steps = Math.max(24, Math.ceil(theta / (Math.PI / 12)));
  const path = [];
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const a = a0 + turnSgn * theta * u;
    path.push({
      x: round3(cx + R * Math.cos(a)),
      y: round3(cy + R * Math.sin(a)),
      s: round3(need * u),
      h: round3(H * u),
    });
    outer.push({ x: round3(cx + (Ri + W) * Math.cos(a)), y: round3(cy + (Ri + W) * Math.sin(a)) });
    inner.push({ x: round3(cx + Ri * Math.cos(a)), y: round3(cy + Ri * Math.sin(a)) });
  }
  const polygon = outer.concat(inner.slice().reverse());

  // 배치용 장애물: 우물 외접 사각형 하나(안에 주차·차로 금지). 부채꼴 AABB는 구멍이 생겨 칸이 새어 든다.
  const footprint = {
    x: round3(Math.max(0, cx - (Ri + W))),
    y: round3(Math.max(0, cy - (Ri + W))),
    w: round3(Math.min(plate.width, cx + (Ri + W)) - Math.max(0, cx - (Ri + W))),
    d: round3(Math.min(plate.depth, cy + (Ri + W)) - Math.max(0, cy - (Ri + W))),
  };
  const pieces = [footprint];

  return {
    kind: "spiral",
    ok: !reason,
    reason,
    pieces,
    polygons: [polygon],
    path,
    segments: [{ name: "원형(나선)", length: round1(need), drop: round3(H), slope: round3(H / need) }],
    total: round1(need),
    approach: null,
    lip: null,
    center: { x: cx, y: cy },
    Ri,
    width: W,
    turns: round3(turns),
    footprint,
  };
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
