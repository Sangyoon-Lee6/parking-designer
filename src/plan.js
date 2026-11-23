import { edgePoint, pickEdge, rampFootprint, rampShape, rampsForLevel, siteMarginsOf } from "./layout.js?v=274";
import {
  analyzeOnPlate, buildChain, slopePlan, usesModuleLayout,
} from "./rampModules.js?v=274";
import {
  moveOpening, moveRamp, moveRampFree, placeOpening, placeRamp,
  selectCore, selectItem, state, subscribe, updateCore,
} from "./state.js?v=274";

const camera = { x: 0, y: 0, scale: 12 };
let fittedKey = "";
let drag = null;
const overlayCache = new Map();
let requestDraw = () => {};

const PHASE = { perimeter: 1, loop: 2, inner: 3, column: 4, bypass: 5, arrow: 6 };

function shown(phase) {
  return (PHASE[phase] || 1) <= (state.revealStage ?? 6);
}

export function mountPlan(canvas) {
  const ctx = canvas.getContext("2d");

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    draw();
  };

  requestDraw = () => draw();

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!state.plate) {
      drawPreviewShell(ctx, rect);
      return;
    }
    const key = `${state.plate.width}x${state.plate.depth}:${state.overlay.mode}:${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (key !== fittedKey) {
      fit(rect);
      fittedKey = key;
    }
    const side = state.overlay.mode === "side" && overlayImage();
    ctx.save();
    if (side) ctx.beginPath();
    ctx.translate(side ? rect.width * 0.25 : rect.width / 2, rect.height / 2);
    ctx.scale(camera.scale, -camera.scale);
    ctx.translate(-camera.x, -camera.y);
    paint(ctx);
    ctx.restore();
    if (side) {
      ctx.save();
      ctx.fillStyle = "#f7f4ee";
      ctx.fillRect(rect.width / 2, 0, rect.width / 2, rect.height);
      const image = side;
      const boundsW = rect.width / 2 - 24;
      const boundsH = rect.height - 24;
      const ratio = image.width / image.height;
      let w = boundsW;
      let h = w / ratio;
      if (h > boundsH) {
        h = boundsH;
        w = h * ratio;
      }
      ctx.globalAlpha = 0.95;
      ctx.drawImage(image, rect.width / 2 + (boundsW - w) / 2 + 12, (rect.height - h) / 2, w, h);
      ctx.restore();
    }
    paintNorth(ctx, rect);
  };

  const paint = (ctx) => {
    const plate = state.plate;
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, plate.width, plate.depth);

    drawOverlay(ctx, plate);
    drawSite(ctx, plate);

    ctx.fillStyle = "#eadcc4";
    state.aisles.forEach((aisle) => {
      const phase = aisle.role === "bypass" ? "bypass" : aisle.phase;
      if (!shown(phase)) return;
      ctx.fillRect(aisle.x, aisle.y, aisle.w, aisle.d);
    });

    state.stalls.forEach((stall) => {
      if (!shown(stall.phase)) return;
      const type = stall.parallel || stall.type === "parallel" ? "parallel" : (stall.type || "general");
      ctx.fillStyle = type === "disabled" ? "rgba(59, 130, 246, 0.38)"
        : type === "extended" ? "rgba(134, 239, 172, 0.45)"
          : type === "eco" ? "rgba(234, 179, 8, 0.4)"
            : type === "parallel" ? "rgba(148, 163, 184, 0.4)"
              : "#f7f4ee";
      ctx.strokeStyle = type === "disabled" ? "#1d4ed8"
        : type === "extended" ? "#15803d"
          : type === "eco" ? "#a16207"
            : type === "parallel" ? "#475569"
              : "#8a8478";
      ctx.lineWidth = 1 / camera.scale;
      ctx.fillRect(stall.x, stall.y, stall.w, stall.d);
      ctx.strokeRect(stall.x, stall.y, stall.w, stall.d);
      ctx.strokeStyle = "#3e6b4e";
      ctx.lineWidth = 1.6 / camera.scale;
      aisleMark(ctx, stall);
    });
    if (state.debugColumns) {
      (state.columnConflicts || []).forEach((stall) => {
        ctx.fillStyle = "rgba(180, 36, 24, 0.55)";
        ctx.strokeStyle = "#b42318";
        ctx.lineWidth = 1.8 / camera.scale;
        ctx.fillRect(stall.x, stall.y, stall.w, stall.d);
        ctx.strokeRect(stall.x, stall.y, stall.w, stall.d);
      });
    }

    const blockedRamps = new Set(state.issues.filter((issue) => issue.type === "ramp").map((issue) => issue.id));
    const groundDraw = rampsForLevel(state.ramps, plate, 0, "same");
    const lowerMode = state.lowerRampMode || (plate && plate.lowerRampMode) || "alternate";
    const drawList = groundDraw.concat(
      lowerMode === "alternate"
        ? rampsForLevel(state.ramps, plate, 1, "alternate").map((r) => ({ ...r, _lower: true }))
        : [],
    );
    drawList.forEach((ramp) => {
      const selected = !ramp._lower && state.selection?.type === "ramp" && state.selection.id === ramp.id;
      const selMod = selected ? state.selection?.module : null;
      const blocked = blockedRamps.has(ramp.id);
      const lower = ramp._lower;
      const useMod = !lower && ramp.modules?.length && usesModuleLayout(ramp, plate, null);
      if (useMod || (ramp.modules?.length && !lower)) {
        drawModuleRamp(ctx, ramp, plate, { selected, selMod, blocked, lower, camera });
        return;
      }
      const shape = rampShape(ramp, plate);
      const footprint = shape.footprint || rampFootprint(ramp, plate);
      ctx.fillStyle = blocked ? "rgba(180, 40, 32, 0.35)" : (lower ? "rgba(61, 107, 79, 0.28)" : "rgba(168, 116, 42, 0.34)");
      ctx.strokeStyle = blocked ? "#b42318" : selected ? "#1e1a16" : (lower ? "#3d6b4f" : "#a8742a");
      ctx.lineWidth = (blocked || selected ? 2.6 : 1.5) / camera.scale;
      ctx.setLineDash(lower ? [0.6, 0.4] : []);
      if (shape.polygons && shape.polygons.length) {
        shape.polygons.forEach((poly) => {
          if (!poly || poly.length < 3) return;
          ctx.beginPath();
          poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      } else {
        ctx.fillRect(footprint.x, footprint.y, footprint.w, footprint.d);
        ctx.strokeRect(footprint.x, footprint.y, footprint.w, footprint.d);
      }
      ctx.setLineDash([]);
      label(ctx, lower ? "층간 램프" : "램프", footprint.x + footprint.w / 2, footprint.y + footprint.d / 2, lower ? "#3d6b4f" : "#7a5418");
    });

    let stairNo = 0;
    state.cores.forEach((core, index) => {
      const selected = state.selection?.type === "core" && state.coreIndex === index;
      const building = core.buildingId != null
        ? (state.buildings || []).find((b) => b.id === core.buildingId)
        : null;
      if (building && building.tower) {
        const tw = building.tower;
        const tx = core.x + (tw.dx || 0);
        const ty = core.y + (tw.dy || 0);
        ctx.save();
        ctx.setLineDash([0.9, 0.55]);
        ctx.strokeStyle = "#6b5a45";
        ctx.lineWidth = 1.2 / camera.scale;
        if (building.blockUnder) {
          hatchRect(ctx, tx, ty, tw.w, tw.d, "rgba(107, 90, 69, 0.12)");
        }
        ctx.strokeRect(tx, ty, tw.w, tw.d);
        ctx.restore();
        label(ctx, building.name, tx + tw.w / 2, ty + 1.2, "#6b5a45");
      }
      const stair = core.kind === "stair";
      if (stair) stairNo += 1;
      ctx.fillStyle = stair ? "rgba(90, 90, 90, 0.18)" : "rgba(44, 74, 110, 0.16)";
      ctx.strokeStyle = selected ? "#1e1a16" : (stair ? "#555" : "#2c4a6e");
      ctx.lineWidth = (selected ? 2.6 : 1.8) / camera.scale;
      ctx.fillRect(core.x, core.y, core.w, core.d);
      ctx.strokeRect(core.x, core.y, core.w, core.d);
      const name = stair
        ? `계단 ${stairNo}`
        : (building ? building.name : `코어 ${index + 1}`);
      label(ctx, name, core.x + core.w / 2, core.y + core.d / 2, stair ? "#444" : "#2c4a6e");
    });

    if (shown("column")) {
      state.columns.forEach((column) => {
        ctx.fillStyle = "#2c2824";
        ctx.fillRect(column.x, column.y, column.w, column.d);
      });
    }

    const external = state.ramps.some((ramp) => ramp.placement === "external");
    ctx.save();
    ctx.strokeStyle = "#1e1a16";
    ctx.lineWidth = 2 / camera.scale;
    if (external) ctx.setLineDash([0.6, 0.45]);
    ctx.strokeRect(0, 0, plate.width, plate.depth);
    ctx.restore();

    const blockedOpenings = new Set(state.issues.filter((issue) => issue.type === "opening").map((issue) => issue.id));
    state.openings.forEach((opening) => {
      const blocked = blockedOpenings.has(opening.id);
      const color = blocked ? "#b42318" : opening.kind === "in" ? "#2f7a72" : "#b5522a";
      const text = opening.kind === "in" ? "입구" : "출구";
      drawOpening(ctx, opening, color, text);
    });
    dimension(ctx, plate);
    drawClearance(ctx);
    if (shown("loop")) label(ctx, "차로 6m", plate.width / 2, plate.depth / 2, "#8a5a22");
    drawRoute(ctx);
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!state.plate) return;
    const world = screenToWorld(canvas, event.clientX, event.clientY);
    if (event.button === 1 || event.button === 2 || state.tool === "pan") {
      drag = { mode: "pan", x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const opening = hitGate(world, state.openings);
    if (opening && (state.tool === "entrance" || state.tool === "exit" || state.tool === "core")) {
      selectItem({ type: "opening", id: opening.id });
      drag = { mode: "opening", id: opening.id };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const rampHit = hitRampDetail(world);
    if (rampHit && state.tool !== "entrance" && state.tool !== "exit") {
      selectItem({ type: "ramp", id: rampHit.id, module: rampHit.module });
      const free = rampHit.ramp?.modules?.length;
      drag = free
        ? { mode: "rampFree", id: rampHit.id, ox: world.x - (rampHit.ramp.x || 0), oy: world.y - (rampHit.ramp.y || 0) }
        : { mode: "ramp", id: rampHit.id, edge: rampHit.ramp.edge };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const coreHit = state.cores.findIndex((core) => hit(world, core));
    if (state.tool === "core" && coreHit >= 0) {
      selectCore(coreHit);
      selectItem({ type: "core", index: coreHit });
      const core = state.cores[coreHit];
      drag = { mode: "core", dx: world.x - core.x, dy: world.y - core.y };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const edge = pickEdge(world, state.plate);
    if (!edge) return;
    if (state.tool === "entrance") placeOpening("in", edge.edge, edge.t);
    if (state.tool === "exit") placeOpening("out", edge.edge, edge.t);
    if (state.tool === "ramp") placeRamp(edge.edge, edge.t);
  });

  canvas.addEventListener("pointermove", (event) => {
    const world = state.plate ? screenToWorld(canvas, event.clientX, event.clientY) : null;
    const readout = document.getElementById("readout");
    if (world) readout.textContent = `X ${world.x.toFixed(1)}  Y ${world.y.toFixed(1)} m`;
    if (!drag || !world) return;
    if (drag.mode === "pan") {
      camera.x = drag.cx - (event.clientX - drag.x) / camera.scale;
      camera.y = drag.cy + (event.clientY - drag.y) / camera.scale;
      draw();
      return;
    }
    if (drag.mode === "core") {
      updateCore({ x: world.x - drag.dx, y: world.y - drag.dy });
      return;
    }
    const edge = pickEdge(world, state.plate);
    if (drag.mode === "opening") {
      const current = state.openings.find((item) => item.id === drag.id);
      if (!current) return;
      moveOpening(drag.id, edge ? edge.edge : current.edge, edge ? edge.t : projectAlong(current.edge, world));
    }
    if (drag.mode === "rampFree") {
      moveRampFree(drag.id, world.x - drag.ox, world.y - drag.oy, { live: true });
      return;
    }
    if (drag.mode === "ramp") {
      const current = state.ramps.find((item) => item.id === drag.id);
      if (!current) return;
      moveRamp(drag.id, edge ? edge.edge : current.edge, edge ? edge.t : projectAlong(current.edge, world));
    }
  });

  canvas.addEventListener("pointerup", () => {
    if (drag?.mode === "rampFree") {
      const cur = state.ramps.find((item) => item.id === drag.id);
      if (cur) moveRampFree(drag.id, cur.x, cur.y, { live: false });
    }
    drag = null;
  });

  canvas.addEventListener("wheel", (event) => {
    if (!state.plate) return;
    event.preventDefault();
    const before = screenToWorld(canvas, event.clientX, event.clientY);
    camera.scale = Math.max(4, Math.min(90, camera.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
    const after = screenToWorld(canvas, event.clientX, event.clientY);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    draw();
  }, { passive: false });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  document.getElementById("fit").addEventListener("click", () => {
    fittedKey = "";
    draw();
  });

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  subscribe(draw);
  resize();
}

function viewBounds() {
  const plate = state.plate;
  const m = siteMarginsOf({
    ...plate,
    siteMargin: plate.siteMargin != null ? plate.siteMargin : state.siteMargin,
    siteMargins: plate.siteMargins || state.siteMargins,
  });
  let minX = -Math.max(1, m.w);
  let minY = -Math.max(1, m.s);
  let maxX = plate.width + Math.max(1, m.e);
  let maxY = plate.depth + Math.max(1, m.n);
  state.ramps.forEach((ramp) => {
    const box = rampFootprint(ramp, plate);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.d);
  });
  if (state.overlay.mode === "side") {
    return {
      width: (maxX - minX) * 2,
      height: maxY - minY,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };
  }
  return { width: maxX - minX, height: maxY - minY, x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function drawPreviewShell(ctx, rect) {
  const w = Math.max(18, Number(state.parkWidth) || 48);
  const d = Math.max(18, Number(state.parkDepth) || 42);
  const pad = 28;
  const scale = Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / d);
  const ox = (rect.width - w * scale) / 2;
  const oy = (rect.height - d * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy + d * scale);
  ctx.scale(scale, -scale);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5 / scale;
  ctx.fillRect(0, 0, w, d);
  ctx.strokeRect(0, 0, w, d);
  // light bay hints
  const spacing = Math.max(5, Number(state.columnSpacing) || 8.1);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1 / scale;
  for (let x = spacing; x < w - 0.1; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, d);
    ctx.stroke();
  }
  for (let y = spacing; y < d - 0.1; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // road edge accent
  const edge = state.roadEdge || "s";
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 4 / scale;
  ctx.beginPath();
  if (edge === "s") { ctx.moveTo(0, 0); ctx.lineTo(w, 0); }
  else if (edge === "n") { ctx.moveTo(0, d); ctx.lineTo(w, d); }
  else if (edge === "w") { ctx.moveTo(0, 0); ctx.lineTo(0, d); }
  else { ctx.moveTo(w, 0); ctx.lineTo(w, d); }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#64748b";
  ctx.font = "12px Pretendard, Noto Sans KR, sans-serif";
  ctx.fillText(`${w} × ${d} m`, 14, rect.height - 14);
}

function fit(rect) {
  const bounds = viewBounds();
  const width = state.overlay.mode === "side" ? rect.width / 2 : rect.width;
  camera.scale = Math.min(width / (bounds.width + 8), rect.height / (bounds.height + 8));
  camera.x = bounds.x;
  camera.y = bounds.y;
}

function screenToWorld(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: (x - rect.width / 2) / camera.scale + camera.x,
    y: (rect.height / 2 - y) / camera.scale + camera.y,
  };
}

function hit(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.d;
}

function hitGate(point, gates) {
  let best = null;
  let score = 1.6;
  gates.forEach((gate) => {
    const along = gate.edge === "n" || gate.edge === "s" ? point.x : point.y;
    let cross = 0;
    if (gate.edge === "s") cross = point.y;
    if (gate.edge === "n") cross = state.plate.depth - point.y;
    if (gate.edge === "w") cross = point.x;
    if (gate.edge === "e") cross = state.plate.width - point.x;
    if (cross < -0.3 || cross > 1.5) return;
    if (Math.abs(along - gate.t) > gate.width / 2 + 0.5) return;
    const dist = Math.abs(cross);
    if (dist < score) {
      score = dist;
      best = gate;
    }
  });
  return best;
}

function hitRamp(point) {
  const detail = hitRampDetail(point);
  return detail ? detail.ramp : null;
}

function hitRampDetail(point) {
  if (!state.plate) return null;
  for (const ramp of state.ramps) {
    if (ramp.modules?.length) {
      const chain = buildChain(ramp);
      for (let i = chain.modules.length - 1; i >= 0; i -= 1) {
        const m = chain.modules[i];
        if (m.rects?.some((r) => hit(point, r)) || (m.polygon && pointInPoly(point, m.polygon))) {
          return { id: ramp.id, ramp, module: i };
        }
      }
    }
    if (hit(point, rampFootprint(ramp, state.plate))) {
      return { id: ramp.id, ramp, module: null };
    }
  }
  const gate = hitGate(point, state.ramps);
  return gate ? { id: gate.id, ramp: gate, module: null } : null;
}

function pointInPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]; const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function slopeColor(slope) {
  const s = Math.max(0, Math.min(0.17, Number(slope) || 0));
  const t = s / 0.17;
  // 0% 초록 → 8.5% 노랑 → 17% 빨강
  const r = t < 0.5 ? Math.round(60 + t * 2 * 180) : Math.round(240 + (t - 0.5) * 2 * 15);
  const g = t < 0.5 ? Math.round(160 + t * 2 * 40) : Math.round(200 - (t - 0.5) * 2 * 160);
  const b = t < 0.5 ? Math.round(80 - t * 2 * 40) : Math.round(40 - (t - 0.5) * 2 * 20);
  return `rgba(${r},${g},${b},0.45)`;
}

function drawModuleRamp(ctx, ramp, plate, { selected, selMod, blocked, lower, camera }) {
  const legal = Number(plate.legalStalls) || Number(plate.stallRules?.legalStalls) || 0;
  const plan = slopePlan(ramp, { floorHeight: plate.floorHeight || 3.2, legalStalls: legal });
  const site = analyzeOnPlate(ramp, plate, { legalStalls: legal, blocks: plate.blockRects || [] });
  const chain = plan.chain || buildChain(ramp);
  // keepClear
  (site.keepClear || []).forEach((z) => {
    ctx.fillStyle = "rgba(60, 120, 200, 0.18)";
    ctx.strokeStyle = "rgba(60, 120, 200, 0.55)";
    ctx.lineWidth = 1 / camera.scale;
    ctx.fillRect(z.x, z.y, z.w, z.d);
    ctx.strokeRect(z.x, z.y, z.w, z.d);
    const name = z.role === "arrival" ? "도착 6m" : z.role === "top" ? "진입 6m" : z.role === "landing" ? "착지 6m" : "6m";
    label(ctx, name, z.x + z.w / 2, z.y + z.d / 2, "#2c5a8e");
  });
  (site.openings || []).forEach((op) => {
    ctx.strokeStyle = "#2f7a3e";
    ctx.lineWidth = 3.5 / camera.scale;
    const thick = 0.4;
    if (op.edge === "w") ctx.strokeRect(0, op.t - op.width / 2, thick, op.width);
    else if (op.edge === "e") ctx.strokeRect(plate.width - thick, op.t - op.width / 2, thick, op.width);
    else if (op.edge === "s") ctx.strokeRect(op.t - op.width / 2, 0, op.width, thick);
    else ctx.strokeRect(op.t - op.width / 2, plate.depth - thick, op.width, thick);
  });
  const err = blocked || (site.issues || []).some((i) => i.level === "error");
  chain.modules.forEach((m, i) => {
    const pm = (plan.perModule || [])[i] || {};
    const slope = pm.slope != null ? pm.slope : (plan.levels?.[0]?.pieces?.find((p) => p.module === i)?.slope);
    const fill = err ? "rgba(180, 40, 32, 0.35)" : slopeColor(slope);
    ctx.fillStyle = fill;
    ctx.strokeStyle = err ? "#b42318" : (selected && selMod === i ? "#1e1a16" : selected ? "#5a4a2a" : "#a8742a");
    ctx.lineWidth = (selected && selMod === i ? 3.2 : selected || err ? 2.4 : 1.5) / camera.scale;
    if (m.polygon && m.polygon.length >= 3) {
      ctx.beginPath();
      m.polygon.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (m.rects?.[0]) {
      const r = m.rects[0];
      ctx.fillRect(r.x, r.y, r.w, r.d);
      ctx.strokeRect(r.x, r.y, r.w, r.d);
    }
    const pct = slope != null ? `${(slope * 100).toFixed(1)}%` : "";
    const mid = m.polygon?.[0] && m.polygon[Math.floor(m.polygon.length / 2)]
      ? { x: (m.start.x + m.end.x) / 2, y: (m.start.y + m.end.y) / 2 }
      : (m.rects?.[0] ? { x: m.rects[0].x + m.rects[0].w / 2, y: m.rects[0].y + m.rects[0].d / 2 } : m.start);
    if (mid && pct) label(ctx, pct, mid.x, mid.y, "#5a3d10");
  });
  // 시작점·방향
  if (chain.modules[0]) {
    const s = chain.modules[0].start;
    ctx.fillStyle = "#1e1a16";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 0.45, 0, Math.PI * 2);
    ctx.fill();
    const rad = (s.h * Math.PI) / 180;
    ctx.strokeStyle = "#1e1a16";
    ctx.lineWidth = 2 / camera.scale;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(rad) * 2.5, s.y + Math.sin(rad) * 2.5);
    ctx.stroke();
  }
}

function projectAlong(edge, point) {
  return edge === "n" || edge === "s" ? point.x : point.y;
}

function aisleMark(ctx, stall) {
  ctx.beginPath();
  if (stall.aisle === "n") line(ctx, stall.x + 0.35, stall.y + stall.d - 0.25, stall.x + stall.w - 0.35, stall.y + stall.d - 0.25);
  if (stall.aisle === "s") line(ctx, stall.x + 0.35, stall.y + 0.25, stall.x + stall.w - 0.35, stall.y + 0.25);
  if (stall.aisle === "e") line(ctx, stall.x + stall.w - 0.25, stall.y + 0.35, stall.x + stall.w - 0.25, stall.y + stall.d - 0.35);
  if (stall.aisle === "w") line(ctx, stall.x + 0.25, stall.y + 0.35, stall.x + 0.25, stall.y + stall.d - 0.35);
}

function drawRoute(ctx) {
  if (!shown("arrow")) return;
  const drives = state.drives || [];
  if (drives.length) {
    ctx.save();
    ctx.strokeStyle = "#8a4b12";
    ctx.fillStyle = "#8a4b12";
    ctx.lineWidth = 1.2 / camera.scale;
    drives.forEach((segment) => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
      const angle = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
      const size = 0.85;
      ctx.beginPath();
      ctx.moveTo(segment.x2, segment.y2);
      ctx.lineTo(segment.x2 - size * Math.cos(angle - 0.45), segment.y2 - size * Math.sin(angle - 0.45));
      ctx.lineTo(segment.x2 - size * Math.cos(angle + 0.45), segment.y2 - size * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
    return;
  }
  const points = state.route || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "#8a4b12";
  ctx.fillStyle = "#8a4b12";
  ctx.lineWidth = 1.4 / camera.scale;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 1.15;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - 0.45), to.y - size * Math.sin(angle - 0.45));
    ctx.lineTo(to.x - size * Math.cos(angle + 0.45), to.y - size * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawOpening(ctx, opening, color, text) {
  const point = edgePoint(opening.edge, opening.t, state.plate);
  const selected = state.selection?.type === "opening" && state.selection.id === opening.id;
  ctx.save();
  ctx.translate(point.x, point.y);
  if (opening.edge === "n") ctx.rotate(Math.PI);
  if (opening.edge === "w") ctx.rotate(-Math.PI / 2);
  if (opening.edge === "e") ctx.rotate(Math.PI / 2);
  ctx.fillStyle = color;
  ctx.fillRect(-opening.width / 2, -0.85, opening.width, 0.85);
  if (selected) {
    ctx.strokeStyle = "#1e1a16";
    ctx.lineWidth = 1.6 / camera.scale;
    ctx.strokeRect(-opening.width / 2, -0.85, opening.width, 0.85);
  }
  const lift = opening.kind === "in" ? -1.5 : -2.7;
  label(ctx, text, 0, lift, color);
  ctx.restore();
}

function hatchRect(ctx, x, y, w, d, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, d);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, d);
  ctx.strokeStyle = "rgba(107, 90, 69, 0.35)";
  ctx.lineWidth = 0.8 / (ctx.getTransform?.().a || 1);
  const step = 1.2;
  for (let t = -d; t < w + d; t += step) {
    ctx.beginPath();
    ctx.moveTo(x + t, y);
    ctx.lineTo(x + t + d, y + d);
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, text, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = `${13 / camera.scale}px Segoe UI, Malgun Gothic, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawClearance(ctx) {
  const mark = state.clearance;
  if (!mark || !(mark.gap > 0)) return;
  ctx.save();
  ctx.strokeStyle = "#9a3412";
  ctx.fillStyle = "#9a3412";
  ctx.lineWidth = 1.2 / camera.scale;
  line(ctx, mark.x1, mark.y, mark.x2, mark.y);
  line(ctx, mark.x1, mark.y - 0.18, mark.x1, mark.y + 0.18);
  line(ctx, mark.x2, mark.y - 0.18, mark.x2, mark.y + 0.18);
  label(ctx, `${mark.gap.toFixed(2)}m`, (mark.x1 + mark.x2) / 2, mark.y - 0.35, "#9a3412");
  ctx.restore();
}

function dimension(ctx, plate) {
  let minX = 0;
  let minY = 0;
  state.ramps.forEach((ramp) => {
    const box = rampFootprint(ramp, plate);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
  });
  const y = minY - 2.4;
  const x = minX - 2.4;
  ctx.save();
  ctx.fillStyle = "#6f675f";
  ctx.strokeStyle = "#6f675f";
  ctx.lineWidth = 1 / camera.scale;
  line(ctx, 0, y, plate.width, y);
  line(ctx, x, 0, x, plate.depth);
  label(ctx, `${plate.width.toLocaleString("ko-KR")} m`, plate.width / 2, y - 1.2, "#6f675f");
  label(ctx, `${plate.depth.toLocaleString("ko-KR")} m`, x - 1.6, plate.depth / 2, "#6f675f");
  ctx.restore();
}

function drawSite(ctx, plate) {
  // 대지 이격: 외부 램프 여부와 무관하게 점선으로 표시 (공통·방향별)
  const m = siteMarginsOf({
    ...plate,
    siteMargin: plate.siteMargin != null ? plate.siteMargin : state.siteMargin,
    siteMargins: plate.siteMargins || state.siteMargins,
  });
  if (!(m.n > 0 || m.s > 0 || m.e > 0 || m.w > 0)) return;
  const x0 = -m.w;
  const y0 = -m.s;
  const x1 = plate.width + m.e;
  const y1 = plate.depth + m.n;
  ctx.save();
  ctx.strokeStyle = "#64748b";
  ctx.fillStyle = "#64748b";
  ctx.lineWidth = 1.4 / camera.scale;
  ctx.setLineDash([1.8, 1.2]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  // 이격 치수 라벨
  const fs = 12 / camera.scale;
  ctx.font = `${fs}px "Pretendard", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (m.s > 0.05) ctx.fillText(`이격 ${fmtM(m.s)}`, plate.width / 2, -m.s / 2);
  if (m.n > 0.05) ctx.fillText(`이격 ${fmtM(m.n)}`, plate.width / 2, plate.depth + m.n / 2);
  if (m.w > 0.05) {
    ctx.save();
    ctx.translate(-m.w / 2, plate.depth / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`이격 ${fmtM(m.w)}`, 0, 0);
    ctx.restore();
  }
  if (m.e > 0.05) {
    ctx.save();
    ctx.translate(plate.width + m.e / 2, plate.depth / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`이격 ${fmtM(m.e)}`, 0, 0);
    ctx.restore();
  }
  // 주차장 외벽(실선)과 구분
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2 / camera.scale;
  ctx.strokeRect(0, 0, plate.width, plate.depth);
  ctx.restore();
}

function fmtM(v) {
  const n = Number(v);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}m`;
}

function overlayImage() {
  const url = state.overlay?.url;
  if (!url) return null;
  if (!overlayCache.has(url)) {
    const image = new Image();
    image.src = url;
    image.onload = () => requestDraw();
    overlayCache.set(url, image);
  }
  const image = overlayCache.get(url);
  return image.complete && image.width ? image : null;
}

function drawOverlay(ctx, plate) {
  if (state.overlay.mode !== "overlay") return;
  const image = overlayImage();
  if (!image) return;
  const width = plate.width * (state.overlay.scale || 1);
  const height = width * (image.height / image.width);
  ctx.save();
  ctx.globalAlpha = state.overlay.opacity || 0.4;
  ctx.translate(state.overlay.x || 0, (state.overlay.y || 0) + height);
  ctx.scale(1, -1);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
}

export function drawThumb(canvas, model) {
  const ctx = canvas.getContext("2d");
  const width = 154;
  const height = 96;
  const ratio = 2;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#f6f1e8";
  ctx.fillRect(0, 0, width, height);
  const plate = model.plate;
  if (!plate) return;
  const boxes = (model.ramps || []).map((ramp) => rampFootprint(ramp, plate));
  const minX = Math.min(0, ...boxes.map((box) => box.x));
  const minY = Math.min(0, ...boxes.map((box) => box.y));
  const maxX = Math.max(plate.width, ...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(plate.depth, ...boxes.map((box) => box.y + box.d));
  const scale = Math.min((width - 10) / (maxX - minX), (height - 10) / (maxY - minY));
  ctx.translate(5 - minX * scale, height - 5 + minY * scale);
  ctx.scale(scale, -scale);
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, plate.width, plate.depth);
  ctx.fillStyle = "#eadcc4";
  (model.aisles || []).forEach((aisle) => ctx.fillRect(aisle.x, aisle.y, aisle.w, aisle.d));
  ctx.strokeStyle = "#8d877c";
  ctx.lineWidth = 1 / scale;
  (model.stalls || []).forEach((stall) => ctx.strokeRect(stall.x, stall.y, stall.w, stall.d));
  ctx.fillStyle = "rgba(44, 74, 110, 0.35)";
  (model.cores || []).forEach((core) => ctx.fillRect(core.x, core.y, core.w, core.d));
  ctx.fillStyle = "rgba(168, 116, 42, 0.45)";
  boxes.forEach((box) => ctx.fillRect(box.x, box.y, box.w, box.d));
  ctx.strokeStyle = "#1e1a16";
  ctx.setLineDash(model.ramps?.some((ramp) => ramp.placement === "external") ? [0.8, 0.5] : []);
  ctx.strokeRect(0, 0, plate.width, plate.depth);
}

function paintNorth(ctx, rect) {
  ctx.save();
  ctx.translate(rect.width - 42, 46);
  ctx.strokeStyle = "#1e1a16";
  ctx.fillStyle = "#1e1a16";
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, -14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(5, -6);
  ctx.lineTo(-5, -6);
  ctx.fill();
  ctx.font = "12px Segoe UI, Malgun Gothic, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -26);
  ctx.restore();
}
