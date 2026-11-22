import { edgePoint, pickEdge, rampFootprint, rampShape, rampsForLevel } from "./layout.js?v=262";
import { moveOpening, moveRamp, placeOpening, placeRamp, selectCore, selectItem, state, subscribe, updateCore } from "./state.js?v=262";

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
    const spiralOnly = groundDraw.every((r) => (r.form || state.rampForm) === "spiral");
    const drawList = groundDraw.concat(
      !spiralOnly && (state.lowerRampMode || "alternate") === "alternate"
        ? rampsForLevel(state.ramps, plate, 1, "alternate").map((r) => ({ ...r, _lower: true }))
        : [],
    );
    drawList.forEach((ramp) => {
      const shape = rampShape(ramp, plate);
      const footprint = shape.footprint || rampFootprint(ramp, plate);
      const selected = !ramp._lower && state.selection?.type === "ramp" && state.selection.id === ramp.id;
      const blocked = blockedRamps.has(ramp.id);
      const lower = ramp._lower;
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

    const ramp = hitRamp(world);
    if (ramp && state.tool !== "entrance" && state.tool !== "exit") {
      selectItem({ type: "ramp", id: ramp.id });
      drag = { mode: "ramp", id: ramp.id, edge: ramp.edge };
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
    if (drag.mode === "ramp") {
      const current = state.ramps.find((item) => item.id === drag.id);
      if (!current) return;
      moveRamp(drag.id, edge ? edge.edge : current.edge, edge ? edge.t : projectAlong(current.edge, world));
    }
  });

  canvas.addEventListener("pointerup", () => {
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
  let minX = -1;
  let minY = -1;
  let maxX = plate.width + 1;
  let maxY = plate.depth + 1;
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
  const body = state.ramps.find((ramp) => hit(point, rampFootprint(ramp, state.plate)));
  return body || hitGate(point, state.ramps);
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
  const margin = plate.siteMargin || state.siteMargin || 0;
  if (!state.ramps.some((ramp) => ramp.placement === "external")) return;
  ctx.save();
  ctx.strokeStyle = "#8a8175";
  ctx.lineWidth = 1 / camera.scale;
  ctx.strokeRect(-margin, -margin, plate.width + margin * 2, plate.depth + margin * 2);
  ctx.restore();
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
