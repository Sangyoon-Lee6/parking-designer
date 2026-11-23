/**
 * AutoCAD DXF AC1015 (2000) ASCII 내보내기.
 * 단위: 평면 m. unitScale — mm면 ×1000.
 * 한글: \U+XXXX 이스케이프, 스타일 malgun.ttf.
 */
import { closedRing, polygonFromPlate } from "./polygon.js?v=275";
import { rampFootprint, rampShape, siteMarginsOf } from "./layout.js?v=275";
import { buildChain } from "./rampModules.js?v=275";

const LAYERS = [
  ["PD-PLATE", 7, "CONTINUOUS"],
  ["PD-SETBACK", 8, "DASHED"],
  ["PD-AISLE", 2, "CONTINUOUS"],
  ["PD-ARROW", 2, "CONTINUOUS"],
  ["PD-STALL", 4, "CONTINUOUS"],
  ["PD-STALL-EXT", 3, "CONTINUOUS"],
  ["PD-STALL-ACC", 5, "CONTINUOUS"],
  ["PD-STALL-EV", 6, "CONTINUOUS"],
  ["PD-STALL-PAR", 4, "CONTINUOUS"],
  ["PD-COLUMN", 8, "CONTINUOUS"],
  ["PD-CORE", 1, "CONTINUOUS"],
  ["PD-TOWER", 9, "CONTINUOUS"],
  ["PD-RAMP", 30, "CONTINUOUS"],
  ["PD-DIM", 7, "CONTINUOUS"],
  ["PD-TEXT", 7, "CONTINUOUS"],
];

const STALL_LAYER = {
  general: "PD-STALL",
  extended: "PD-STALL-EXT",
  disabled: "PD-STALL-ACC",
  eco: "PD-STALL-EV",
  parallel: "PD-STALL-PAR",
};

function r3(v) { return Math.round(Number(v) * 1000) / 1000; }

/** 한글·비ASCII → DXF \U+XXXX */
export function dxfText(str) {
  const s = String(str ?? "");
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 128 && ch !== "\\") out += ch;
    else if (ch === "\\") out += "\\\\";
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

function pair(code, value) {
  return `${code}\n${value}\n`;
}

function lwpoly(layer, pts, closed = true, scale = 1) {
  const ring = closed ? closedRing(pts) : pts.slice();
  const verts = closed
    && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-6
    ? ring.slice(0, -1)
    : ring;
  let s = pair(0, "LWPOLYLINE") + pair(8, layer) + pair(90, verts.length) + pair(70, closed ? 1 : 0);
  verts.forEach((p) => {
    s += pair(10, r3(p.x * scale)) + pair(20, r3(p.y * scale));
  });
  return s;
}

function line(layer, x1, y1, x2, y2, scale = 1) {
  return pair(0, "LINE") + pair(8, layer)
    + pair(10, r3(x1 * scale)) + pair(20, r3(y1 * scale))
    + pair(11, r3(x2 * scale)) + pair(21, r3(y2 * scale));
}

function text(layer, x, y, h, str, scale = 1, align = 0) {
  let s = pair(0, "TEXT") + pair(8, layer)
    + pair(10, r3(x * scale)) + pair(20, r3(y * scale))
    + pair(40, r3(h * scale))
    + pair(1, dxfText(str))
    + pair(7, "MALGUN")
    + pair(72, align);
  if (align) s += pair(11, r3(x * scale)) + pair(21, r3(y * scale));
  return s;
}

function hatchSolidProper(layer, verts, scale, pattern = "SOLID") {
  let s = pair(0, "HATCH") + pair(8, layer) + pair(2, pattern === "SOLID" ? "SOLID" : pattern);
  s += pair(70, pattern === "SOLID" ? 1 : 0) + pair(71, 0) + pair(91, 1) + pair(92, 1) + pair(93, verts.length);
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    s += pair(72, 1)
      + pair(10, r3(a.x * scale)) + pair(20, r3(a.y * scale))
      + pair(11, r3(b.x * scale)) + pair(21, r3(b.y * scale));
  }
  s += pair(97, 0);
  if (pattern !== "SOLID") {
    s += pair(75, 0) + pair(76, 1) + pair(52, 45) + pair(41, 1) + pair(77, 0) + pair(78, 1)
      + pair(53, 45) + pair(43, 0) + pair(44, 0) + pair(45, -0.707) + pair(46, 0.707) + pair(79, 0);
  }
  s += pair(98, 1) + pair(10, r3(verts[0].x * scale)) + pair(20, r3(verts[0].y * scale));
  return s;
}

function rectPts(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.d },
    { x: r.x, y: r.y + r.d },
  ];
}

function expandOutwardManual(poly, m) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs) - (m.w || 0);
  const y0 = Math.min(...ys) - (m.s || 0);
  const x1 = Math.max(...xs) + (m.e || 0);
  const y1 = Math.max(...ys) + (m.n || 0);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function arrow(layer, x1, y1, x2, y2, scale) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const ah = Math.min(1.2, L * 0.25);
  const px = -uy;
  const py = ux;
  const left = { x: x2 - ux * ah + px * ah * 0.4, y: y2 - uy * ah + py * ah * 0.4 };
  const right = { x: x2 - ux * ah - px * ah * 0.4, y: y2 - uy * ah - py * ah * 0.4 };
  return line(layer, x1, y1, x2, y2, scale)
    + line(layer, x2, y2, left.x, left.y, scale)
    + line(layer, x2, y2, right.x, right.y, scale);
}

function dimSimple(layer, x1, y1, x2, y2, label, scale, textH = 0.5) {
  return line(layer, x1, y1, x2, y2, scale)
    + text(layer, (x1 + x2) / 2, (y1 + y2) / 2 + 0.3, textH, label, scale, 1);
}

function dxfHeader(unit) {
  return pair(0, "SECTION") + pair(2, "HEADER")
    + pair(9, "$ACADVER") + pair(1, "AC1015")
    + pair(9, "$DWGCODEPAGE") + pair(3, "ANSI_949")
    + pair(9, "$INSUNITS") + pair(70, unit === "mm" ? 4 : 6)
    + pair(9, "$MEASUREMENT") + pair(70, 1)
    + pair(0, "ENDSEC");
}

function dxfTables() {
  let s = pair(0, "SECTION") + pair(2, "TABLES");
  s += pair(0, "TABLE") + pair(2, "VPORT") + pair(70, 0) + pair(0, "ENDTAB");
  s += pair(0, "TABLE") + pair(2, "LTYPE") + pair(70, 2);
  s += pair(0, "LTYPE") + pair(2, "CONTINUOUS") + pair(70, 0) + pair(3, "Solid line") + pair(72, 65) + pair(73, 0) + pair(40, 0);
  s += pair(0, "LTYPE") + pair(2, "DASHED") + pair(70, 0) + pair(3, "Dashed") + pair(72, 65) + pair(73, 2) + pair(40, 0.75)
    + pair(49, 0.5) + pair(74, 0) + pair(49, -0.25) + pair(74, 0);
  s += pair(0, "ENDTAB");
  s += pair(0, "TABLE") + pair(2, "LAYER") + pair(70, LAYERS.length);
  LAYERS.forEach(([name, color, ltype]) => {
    s += pair(0, "LAYER") + pair(2, name) + pair(70, 0) + pair(62, color) + pair(6, ltype);
  });
  s += pair(0, "ENDTAB");
  s += pair(0, "TABLE") + pair(2, "STYLE") + pair(70, 1);
  s += pair(0, "STYLE") + pair(2, "MALGUN") + pair(70, 0) + pair(40, 0) + pair(41, 1) + pair(50, 0)
    + pair(71, 0) + pair(42, 1) + pair(3, "malgun.ttf") + pair(4, "");
  s += pair(0, "ENDTAB") + pair(0, "ENDSEC");
  return s;
}

/**
 * @param {object} state
 * @param {object} info summary-like
 * @param {object} opts { unit:'m'|'mm', floorIndex:number, allFloors:boolean, version:string }
 */
export function buildDxf(state, info = {}, opts = {}) {
  const unit = opts.unit === "m" ? "m" : "mm";
  const scale = unit === "mm" ? 1000 : 1;
  const floors = opts.allFloors
    ? Array.from({ length: Math.max(1, info.floors || state.metrics?.floors || 1) }, (_, i) => i)
    : [opts.floorIndex ?? 0];
  const plate = state.plate;
  if (!plate) throw new Error("평면이 없습니다.");
  const poly = polygonFromPlate(plate);
  const gap = Math.max(plate.width, plate.depth) * 0.25 + 8;

  let entities = "";
  let stallCount = 0;

  floors.forEach((fi, idx) => {
    const ox = idx * (plate.width + gap);
    const shift = (p) => ({ x: p.x + ox, y: p.y });
    const shiftR = (r) => ({ ...r, x: r.x + ox, y: r.y });

    entities += lwpoly("PD-PLATE", poly.map(shift), true, scale);

    const m = siteMarginsOf({
      ...plate,
      siteMargin: plate.siteMargin != null ? plate.siteMargin : state.siteMargin,
      siteMargins: plate.siteMargins || state.siteMargins,
    });
    entities += lwpoly("PD-SETBACK", expandOutwardManual(poly, m).map(shift), true, scale);

    (state.aisles || []).forEach((a) => {
      entities += lwpoly("PD-AISLE", rectPts(shiftR(a)), true, scale);
    });

    (state.drives || []).forEach((d) => {
      entities += arrow("PD-ARROW", d.x1 + ox, d.y1, d.x2 + ox, d.y2, scale);
    });

    (state.stalls || []).forEach((stall, i) => {
      const type = stall.parallel || stall.type === "parallel" ? "parallel" : (stall.type || "general");
      const layer = STALL_LAYER[type] || "PD-STALL";
      entities += lwpoly(layer, rectPts(shiftR(stall)), true, scale);
      entities += text("PD-TEXT", stall.x + stall.w / 2 + ox, stall.y + stall.d / 2, 0.4, String(stall.no || i + 1), scale, 1);
      stallCount += 1;
    });

    (state.columns || []).forEach((col) => {
      const pts = rectPts(shiftR(col));
      entities += lwpoly("PD-COLUMN", pts, true, scale);
      entities += hatchSolidProper("PD-COLUMN", pts, scale, "SOLID");
    });

    (state.cores || []).forEach((core) => {
      entities += lwpoly("PD-CORE", rectPts(shiftR(core)), true, scale);
    });

    (state.buildings || []).forEach((b) => {
      const core = (state.cores || []).find((c) => c.buildingId === b.id && (c.kind || "building") !== "stair");
      if (!core || !b.tower) return;
      const tw = b.tower;
      const r = { x: core.x + (tw.dx || 0) + ox, y: core.y + (tw.dy || 0), w: tw.w, d: tw.d };
      const pts = rectPts(r);
      entities += lwpoly("PD-TOWER", pts, true, scale);
      entities += hatchSolidProper("PD-TOWER", pts, scale, "ANSI31");
      entities += text("PD-TEXT", r.x + r.w / 2, r.y + r.d / 2, 0.8, b.name || "동", scale, 1);
    });

    (state.ramps || []).forEach((ramp) => {
      try {
        if (ramp.modules?.length) {
          buildChain(ramp).modules.forEach((mod) => {
            (mod.rects || []).forEach((r) => {
              entities += lwpoly("PD-RAMP", rectPts(shiftR(r)), true, scale);
            });
          });
        } else {
          const shape = rampShape(ramp, plate);
          const box = shape.footprint || rampFootprint(ramp, plate);
          entities += lwpoly("PD-RAMP", rectPts(shiftR(box)), true, scale);
          (shape.pieces || []).forEach((p) => {
            entities += lwpoly("PD-RAMP", rectPts(shiftR(p)), true, scale);
          });
        }
      } catch (e) {
        const box = rampFootprint(ramp, plate);
        entities += lwpoly("PD-RAMP", rectPts(shiftR(box)), true, scale);
      }
      const box = rampFootprint(ramp, plate);
      entities += text("PD-RAMP", box.x + box.w / 2 + ox, box.y + box.d / 2, 0.5, "램프", scale, 1);
    });

    entities += dimSimple("PD-DIM", ox, -2, ox + plate.width, -2, `${plate.width.toFixed(1)} m`, scale);
    entities += dimSimple("PD-DIM", ox + plate.width + 2, 0, ox + plate.width + 2, plate.depth, `${plate.depth.toFixed(1)} m`, scale);
    const gx = state.gridX || [];
    if (gx.length >= 2) {
      entities += dimSimple("PD-DIM", ox + gx[0], plate.depth + 2, ox + gx[1], plate.depth + 2, `${(gx[1] - gx[0]).toFixed(1)} m`, scale);
    }

    const title = [
      `프로젝트: ${info.demand?.projectName || state.demand?.projectName || "주차장"}`,
      `층: 지하 ${fi + 1}층` + (opts.allFloors ? ` (${idx + 1}/${floors.length})` : ""),
      `배치 대수: ${info.placed ?? state.stalls?.length ?? 0}대`,
      `법정 대수: ${info.required ?? plate.legalStalls ?? 0}대`,
      `날짜: ${info.checkedOn || new Date().toISOString().slice(0, 10)}`,
      `버전: ${opts.version || "r275"} · 단위 ${unit}`,
    ];
    title.forEach((t, i) => {
      entities += text("PD-TEXT", ox, -6 - i * 1.2, 0.6, t, scale, 0);
    });
  });

  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const meta = {
    layers: LAYERS.map((l) => l[0]),
    stallEntities: stallCount,
    plateClosed: true,
    bounds: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    poly,
  };

  const dxf = dxfHeader(unit) + dxfTables()
    + pair(0, "SECTION") + pair(2, "ENTITIES") + entities + pair(0, "ENDSEC")
    + pair(0, "EOF");
  return { dxf, meta, stallCount, unit, scale };
}

export function dxfFilename(state, floorIndex, allFloors) {
  const v = state.variantIndex != null ? `V${state.variantIndex + 1}` : "plan";
  const floor = allFloors ? "all" : `B${(floorIndex ?? 0) + 1}`;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `parking_${v}_${floor}_${day}.dxf`;
}

export function downloadDxf(filename, dxfString) {
  const blob = new Blob([dxfString], { type: "application/dxf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export { LAYERS, expandOutwardManual };
