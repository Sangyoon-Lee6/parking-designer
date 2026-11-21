import { calculateDemand, emptyDemand } from "./demand.js?v=240";
import {
  basementCount,
  clampCore,
  clampOpening,
  defaultCore,
  defaultRampLength,
  generateVariants,
  intervalsOverlap,
  layoutParking,
  referenceCase,
} from "./layout.js?v=240";

export const state = {
  step: 1,
  households: 100,
  demand: emptyDemand(),
  floorView: "all",
  resultTab: "model",
  parkWidth: 48,
  parkDepth: 42,
  columnSpacing: 8.1,
  columnWidth: 0.5,
  columnDepth: 0.5,
  minClear: 0,
  siteMargin: 20,
  siteMargins: { n: null, s: null, e: null, w: null },
  floorHeight: 3.2,
  spansX: "",
  spansY: "",
  trimDeadEnds: true,
  wallColumns: "front",
  noGroundAccess: false,
  roadEdge: "w",
  rampPos: "auto",
  stallRules: {
    disabled: true,
    disabledRate: 0.04,
    parallel: true,
    ecoMode: "auto",
    ecoRate: 0.05,
  },
  coreAuto: true,
  coreSearch: null,
  rampPlacement: "internal",
  entranceMode: "separate",
  circulation: "ccw",
  entranceWidth: 6,
  rampWidth: 6,
  rampLength: 20.4,
  plate: null,
  columns: [],
  stalls: [],
  aisles: [],
  drives: [],
  route: [],
  connected: false,
  issues: [],
  columnConflicts: [],
  clearance: null,
  debugColumns: false,
  metrics: null,
  gridX: [],
  gridY: [],
  axis: "x",
  fixedAlong: "가로",
  flexAlong: "세로",
  cores: [],
  coreIndex: 0,
  core: null,
  openings: [],
  ramps: [],
  variants: [],
  variantIndex: 0,
  spec: null,
  revealStage: 6,
  referenceNotes: [],
  overlay: { url: "", mode: "off", opacity: 0.4, scale: 1, x: 0, y: 0 },
  tool: "core",
  selection: null,
  nextId: 1,
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit() {
  listeners.forEach((listener) => listener());
}

export function plateFromState() {
  const rules = currentStallRules();
  const spansX = parseSpans(state.spansX);
  const spansY = parseSpans(state.spansY);
  return {
    width: round1(state.parkWidth),
    depth: round1(state.parkDepth),
    spacing: round1(state.columnSpacing),
    columnWidth: round1(state.columnWidth),
    columnDepth: round1(state.columnDepth),
    minClear: round1(state.minClear * 100) / 100,
    siteMargin: round1(state.siteMargin),
    siteMargins: { ...(state.siteMargins || {}) },
    floorHeight: round1(state.floorHeight),
    spansX: spansX.values,
    spansY: spansY.values,
    trimDeadEnds: Boolean(state.trimDeadEnds),
    wallColumns: state.wallColumns || "front",
    noGroundAccess: Boolean(state.noGroundAccess),
    roadEdge: state.roadEdge || "w",
    rampPos: state.rampPos || "auto",
    rampPlacement: state.rampPlacement,
    legalStalls: rules.legalStalls,
    stallRules: rules,
  };
}

/** "4, 5, 6" → 숫자 배열. 비우면 null(기존 단일 간격). 3~15m 밖이면 error */
export function parseSpans(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { values: null, error: null };
  const parts = raw.split(/[,，\s]+/).filter(Boolean);
  const values = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) return { values: null, error: `"${part}"는 숫자가 아닙니다` };
    if (n < 3 || n > 15) return { values: null, error: `${n}m는 3~15m 범위 밖입니다` };
    values.push(n);
  }
  return { values, error: null };
}

export function currentStallRules() {
  const demand = demandResult();
  const base = { ...(state.stallRules || {}) };
  const legalStalls = demand.legalStalls || 0;
  const ecoAuto = Boolean(demand.ecoAuto);
  return {
    ...base,
    legalStalls,
    ecoAuto,
    ecoBasis: demand.ecoBasis || "",
    disabledRate: Number(base.disabledRate) || 0.04,
    ecoRate: Number(base.ecoRate) || 0.05,
    parallel: base.parallel !== false,
  };
}

export function updateSiteMargins(all, partial) {
  if (all != null && Number.isFinite(Number(all))) {
    state.siteMargin = Math.max(0, Number(all));
  }
  if (partial && typeof partial === "object") {
    state.siteMargins = { ...(state.siteMargins || {}), ...partial };
  }
  emit();
}

export function issueGroups() {
  const errors = [];
  const warnings = [];
  for (const issue of state.issues || []) {
    const label = issue.label || issue.message || String(issue.type || issue);
    if (issue.type === "notice" || issue.type === "warn" || issue.type === "roadless") warnings.push(label);
    else errors.push(label);
  }
  if (state.metrics && state.metrics.columnHits > 0) {
    errors.push(`기둥이 주차칸과 ${state.metrics.columnHits}곳 겹칩니다.`);
  }
  if (state.plate && !state.connected) {
    errors.push("차로가 하나로 이어지지 않거나 배치가 유효하지 않습니다.");
  }
  return { errors, warnings };
}

export function rampFallback(plate) {
  // 도로변 내부 램프가 전부 불가일 때 옆 변 끝 후보(원본 휴리스틱의 축소판)
  if (!plate) return null;
  const edge = plate.roadEdge || state.roadEdge || "w";
  const side = edge === "n" || edge === "s" ? "w" : "s";
  return { edge: side, t: 8, note: "도로 쪽 끝" };
}

export function autoPlaceCore() {
  if (!state.plate) return;
  const core = defaultCore(state.plate);
  state.cores = [clampCore(core, state.plate)];
  state.coreIndex = 0;
  syncCore();
  state.coreAuto = true;
  rebuildLayout();
  emit();
}

function syncCore() {
  state.core = state.cores[state.coreIndex] || state.cores[0] || null;
  if (state.core && state.coreIndex >= state.cores.length) state.coreIndex = 0;
}

function adopt(result, keepObjects) {
  state.stalls = result.stalls;
  state.aisles = result.aisles;
  state.columns = result.columns;
  state.drives = result.drives;
  state.route = result.route;
  state.issues = result.issues;
  state.columnConflicts = result.columnConflicts || [];
  state.clearance = result.clearance || null;
  state.metrics = result.metrics;
  state.connected = Boolean(result.metrics.valid);
  state.gridX = result.gridX;
  state.gridY = result.gridY;
  state.axis = result.axis;
  state.fixedAlong = result.fixedAlong;
  state.flexAlong = result.flexAlong;
  state.spec = result.spec;
  if (!keepObjects) {
    state.cores = result.cores;
    state.openings = result.openings;
    state.ramps = result.ramps;
    state.coreIndex = Math.min(state.coreIndex, Math.max(0, state.cores.length - 1));
    syncCore();
  }
}

export function refreshVariants() {
  if (!state.plate) return;
  state.variants = generateVariants({
    plate: state.plate,
    cores: state.cores,
    openings: state.openings,
    ramps: state.ramps,
    rampPlacement: state.rampPlacement,
    entranceMode: state.entranceMode,
    circulation: state.circulation,
  });
}

export function applyVariant(index) {
  const variant = state.variants[index];
  if (!variant) return;
  state.variantIndex = index;
  adopt(variant, false);
  emit();
}

export function rebuildLayout() {
  if (!state.plate) return;
  const result = layoutParking({
    plate: state.plate,
    cores: state.cores,
    openings: state.openings,
    ramps: state.ramps,
    rampPlacement: state.rampPlacement,
    entranceMode: state.entranceMode,
    circulation: state.circulation,
    lockRamp: true,
    spec: state.spec || {
      axis: "x",
      dir: state.circulation === "cw" ? "cw" : "ccw",
      packFrom: "start",
      bayMode: "max",
      rampShift: 0,
      rampPlacement: state.rampPlacement,
      entranceMode: "follow",
    },
  });
  adopt(result, true);
}

function seedAccess() {
  if (!state.ramps.length) {
    const edge = "w";
    state.ramps = [{
      id: state.nextId++,
      edge,
      t: round1(state.plate.depth / 2),
      width: state.rampWidth,
      length: defaultRampLength(state.plate, edge),
      placement: state.rampPlacement,
    }];
  } else {
    state.ramps = state.ramps.map((ramp) => ({ ...ramp, placement: state.rampPlacement }));
  }
}

export function generatePlate() {
  state.plate = plateFromState();
  if (!state.cores.length) state.cores = [defaultCore(state.plate)];
  state.cores = state.cores.map((core) => clampCore(core, state.plate));
  syncCore();
  seedAccess();
  state.referenceNotes = [];
  refreshVariants();
  const best = Math.max(0, state.variants.findIndex((variant) => variant.recommended));
  state.step = 2;
  state.revealStage = 6;
  state.tool = "core";
  applyVariant(best);
}

export function loadReference() {
  const sample = referenceCase;
  state.parkWidth = sample.width;
  state.parkDepth = sample.depth;
  state.columnSpacing = sample.spacing;
  state.columnWidth = sample.columnWidth;
  state.columnDepth = sample.columnDepth;
  state.minClear = sample.minClear;
  state.siteMargin = sample.siteMargin;
  state.rampPlacement = sample.rampPlacement;
  state.entranceMode = sample.entranceMode;
  state.circulation = sample.circulation;
  state.rampWidth = sample.ramp.width;
  state.rampLength = sample.ramp.length;
  state.entranceWidth = sample.ramp.width;
  state.demand.projectName = sample.projectName;
  state.referenceNotes = sample.notes.slice();
  state.overlay = {
    url: "assets/reference-basement.png",
    mode: "off",
    opacity: 0.42,
    scale: 1,
    x: 0,
    y: 0,
  };
  state.plate = plateFromState();
  state.cores = sample.cores.map((core) => clampCore({ ...core }, state.plate));
  state.coreIndex = 0;
  syncCore();
  state.openings = [];
  state.ramps = [{
    id: state.nextId++,
    ...sample.ramp,
    placement: "external",
  }];
  state.selection = null;
  refreshVariants();
  const best = Math.max(0, state.variants.findIndex((variant) => variant.recommended));
  state.step = 2;
  state.revealStage = 6;
  state.tool = "core";
  applyVariant(best);
}

export function setReveal(stage) {
  state.revealStage = stage;
  emit();
}

export function setStep(step) {
  if (step === 2 && !state.plate) return;
  if (step === 3 && !readyFor3d()) return;
  state.step = step;
  emit();
}

export function readyFor3d() {
  const columnBlocked = state.issues.some((issue) => issue.type === "column") || (state.metrics && state.metrics.columnHits > 0);
  return Boolean(state.plate && state.cores.length && state.openings.length && state.ramps.length && state.connected && !columnBlocked);
}

export function demandResult() {
  return calculateDemand(state.demand, state.plate, state.columnSpacing);
}

export function summary() {
  const plate = state.plate;
  const placed = state.stalls.length;
  const demand = demandResult();
  state.households = demand.households;
  const required = demand.legalStalls;
  const floors = basementCount(required, placed);
  const totalStalls = placed * floors;
  const metrics = state.metrics;
  return {
    width: plate ? plate.width : 0,
    depth: plate ? plate.depth : 0,
    plateArea: plate ? plate.width * plate.depth : 0,
    columns: state.columns.length,
    placed,
    required,
    floors,
    totalStalls,
    areaPerStall: placed ? (plate ? (plate.width * plate.depth) / placed : 0) : 0,
    coreArea: state.cores.reduce((sum, core) => sum + core.w * core.d, 0),
    access: accessLabel(),
    fixedAlong: state.fixedAlong,
    flexAlong: state.flexAlong,
    connected: state.connected,
    similarity: metrics ? metrics.similarity : 0,
    aisleRatio: metrics ? metrics.aisleRatio : 0,
    demand,
  };
}

export function updateCore(partial) {
  const current = state.cores[state.coreIndex];
  if (!current || !state.plate) return;
  const next = clampCore({ ...current, ...partial }, state.plate);
  if (![next.x, next.y, next.w, next.d].every(Number.isFinite)) return;
  state.cores[state.coreIndex] = next;
  syncCore();
  state.selection = { type: "core", index: state.coreIndex };
  rebuildLayout();
  emit();
}

export function selectCore(index) {
  if (!state.cores[index]) return;
  state.coreIndex = index;
  syncCore();
  state.selection = { type: "core", index };
  emit();
}

export function addCore() {
  if (!state.plate) return;
  const core = defaultCore(state.plate);
  core.x = round1(core.x + state.cores.length * 2);
  state.cores.push(clampCore(core, state.plate));
  state.coreIndex = state.cores.length - 1;
  syncCore();
  rebuildLayout();
  emit();
}

export function updateCoreArea(area) {
  const core = state.cores[state.coreIndex];
  if (!core || !Number.isFinite(area) || area <= 0) return;
  const current = core.w * core.d;
  if (current <= 0) return;
  const scale = Math.sqrt(area / current);
  updateCore({ w: core.w * scale, d: core.d * scale });
}

export function placeOpening(kind, edge, t) {
  if (state.entranceMode === "integrated") return;
  const opening = clampOpening({
    id: state.nextId++,
    kind,
    edge,
    t,
    width: state.entranceWidth,
  }, state.plate);
  state.openings.push(opening);
  state.selection = { type: "opening", id: opening.id };
  rebuildLayout();
  emit();
}

export function moveOpening(id, edge, t) {
  const index = state.openings.findIndex((item) => item.id === id);
  if (index < 0) return;
  const current = state.openings[index];
  if (current.linkedRamp) return;
  state.openings[index] = clampOpening({ ...current, edge, t }, state.plate);
  state.selection = { type: "opening", id };
  rebuildLayout();
  emit();
}

export function placeRamp(edge, t) {
  const length = defaultRampLength(state.plate, edge);
  state.rampLength = length;
  const ramp = clampOpening({
    id: state.nextId++,
    edge,
    t,
    width: state.rampWidth,
    length,
    placement: state.rampPlacement,
  }, state.plate);
  ramp.placement = state.rampPlacement;
  state.ramps.push(ramp);
  if (state.entranceMode === "integrated") syncIntegrated(ramp);
  state.selection = { type: "ramp", id: ramp.id };
  rebuildLayout();
  emit();
}

export function moveRamp(id, edge, t) {
  const index = state.ramps.findIndex((item) => item.id === id);
  if (index < 0) return;
  state.ramps[index] = clampOpening({
    ...state.ramps[index],
    edge,
    t,
    placement: state.rampPlacement,
  }, state.plate);
  state.ramps[index].placement = state.rampPlacement;
  if (state.entranceMode === "integrated") syncIntegrated(state.ramps[index]);
  state.selection = { type: "ramp", id };
  rebuildLayout();
  emit();
}

function syncIntegrated(ramp) {
  const width = ramp.width;
  const existing = state.openings.filter((opening) => opening.linkedRamp === ramp.id);
  if (existing.length >= 2) {
    existing.forEach((opening) => {
      opening.edge = ramp.edge;
      opening.t = ramp.t;
      opening.width = width;
    });
    return;
  }
  state.openings = state.openings.filter((opening) => !opening.linkedRamp);
  state.openings.push(
    clampOpening({ id: state.nextId++, kind: "in", edge: ramp.edge, t: ramp.t, width, linkedRamp: ramp.id }, state.plate),
    clampOpening({ id: state.nextId++, kind: "out", edge: ramp.edge, t: ramp.t, width, linkedRamp: ramp.id }, state.plate),
  );
}

export function updateEntranceWidth(width) {
  state.entranceWidth = width;
  const selected = selectedOpening();
  if (selected && !selected.linkedRamp) {
    const index = state.openings.findIndex((item) => item.id === selected.id);
    state.openings[index] = clampOpening({ ...selected, width }, state.plate);
    rebuildLayout();
  }
  if (state.entranceMode === "integrated" && state.ramps[0]) {
    updateRampSize({ width });
    return;
  }
  emit();
}

export function updateRampSize(partial) {
  if (partial.width != null) state.rampWidth = partial.width;
  if (partial.length != null) state.rampLength = partial.length;
  const selected = selectedRamp() || state.ramps[0];
  if (selected) {
    const index = state.ramps.findIndex((item) => item.id === selected.id);
    state.ramps[index] = clampOpening({ ...selected, ...partial, placement: state.rampPlacement }, state.plate);
    state.ramps[index].placement = state.rampPlacement;
    state.rampLength = state.ramps[index].length;
    if (state.entranceMode === "integrated") syncIntegrated(state.ramps[index]);
    rebuildLayout();
  }
  emit();
}

export function selectItem(selection) {
  state.selection = selection;
  if (selection?.type === "core" && Number.isInteger(selection.index)) {
    state.coreIndex = selection.index;
    syncCore();
  }
  emit();
}

export function removeSelection() {
  if (!state.selection) return;
  if (state.selection.type === "opening") {
    const opening = state.openings.find((item) => item.id === state.selection.id);
    if (opening?.linkedRamp) return;
    state.openings = state.openings.filter((item) => item.id !== state.selection.id);
  }
  if (state.selection.type === "ramp") {
    const id = state.selection.id;
    state.ramps = state.ramps.filter((item) => item.id !== id);
    state.openings = state.openings.filter((item) => item.linkedRamp !== id);
  }
  if (state.selection.type === "core" && state.cores.length > 1) {
    state.cores.splice(state.coreIndex, 1);
    state.coreIndex = 0;
    syncCore();
  }
  state.selection = null;
  rebuildLayout();
  emit();
}

export function placeSplitExample() {
  if (!state.plate) return;
  state.entranceMode = "separate";
  state.openings = [];
  const width = state.plate.width;
  state.openings.push(
    clampOpening({ id: state.nextId++, kind: "in", edge: "s", t: width * 0.32, width: state.entranceWidth }, state.plate),
    clampOpening({ id: state.nextId++, kind: "out", edge: "s", t: width * 0.68, width: state.entranceWidth }, state.plate),
  );
  state.selection = null;
  rebuildLayout();
  emit();
}

export function placeOverlapExample() {
  if (!state.plate || !state.ramps.length) return;
  state.entranceMode = "integrated";
  syncIntegrated(state.ramps[0]);
  state.selection = null;
  rebuildLayout();
  emit();
}

export function setTool(tool) {
  state.tool = tool;
  emit();
}

export function selectedOpening() {
  if (!state.selection || state.selection.type !== "opening") return null;
  return state.openings.find((item) => item.id === state.selection.id) || null;
}

export function selectedRamp() {
  if (!state.selection || state.selection.type !== "ramp") return null;
  return state.ramps.find((item) => item.id === state.selection.id) || null;
}

function accessLabel() {
  const ins = state.openings.filter((item) => item.kind === "in");
  const outs = state.openings.filter((item) => item.kind === "out");
  if (!ins.length && !outs.length) return "미지정";
  if (state.entranceMode === "integrated") return "램프 일체";
  if (!ins.length || !outs.length) return "겸용";
  const overlapped = ins.some((entry) => outs.some((exit) => intervalsOverlap(entry, exit)));
  return overlapped ? "겹침" : "분리";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}
