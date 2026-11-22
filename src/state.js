import { calculateDemand, emptyDemand } from "./demand.js?v=263";
import {
  basementCount,
  clampCore,
  clampOpening,
  defaultCore,
  defaultCores,
  defaultRampLength,
  defaultTower,
  externalRampClearance,
  generateVariants,
  intervalsOverlap,
  layoutParking,
  referenceCase,
  spaceCoresForTowers,
  stairCore,
  towerBlockRects,
  towerTransferNotes,
} from "./layout.js?v=263";

export const state = {
  step: 1,
  households: 100,
  demand: emptyDemand(),
  floorView: "all",
  resultTab: "plan",
  siteType: "single",
  buildings: [],
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
  rampForm: "auto",
  lowerRampForm: "auto",
  lowerRampMode: "alternate",
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
  const plate = {
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
    rampForm: state.rampForm || "auto",
    lowerRampForm: state.lowerRampForm || "auto",
    lowerRampMode: state.lowerRampMode || "alternate",
    legalStalls: rules.legalStalls,
    stallRules: rules,
  };
  if (state.siteType === "complex" && state.buildings.length) {
    plate.buildings = state.buildings;
    plate.blockRects = towerBlockRects(state.buildings, state.cores, plate);
  }
  return plate;
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
  let hasColumnIssue = false;
  let hasNetworkIssue = false;
  for (const issue of state.issues || []) {
    const label = issue.label || issue.message || String(issue.type || issue);
    if (issue.type === "notice" || issue.type === "warn" || issue.type === "roadless") {
      warnings.push(label);
      continue;
    }
    if (issue.type === "column") hasColumnIssue = true;
    if (issue.type === "opening" || issue.type === "ramp" || issue.type === "network") hasNetworkIssue = true;
    errors.push(label);
  }
  // metrics.columnHits는 이미 type:"column" 이슈로 들어가므로 중복 문구를 넣지 않는다.
  if (!hasColumnIssue && state.metrics && state.metrics.columnHits > 0) {
    errors.push(`기둥이 주차칸과 ${state.metrics.columnHits}곳 겹칩니다.`);
  }
  // state.connected는 metrics.valid(대지 밖 포함)라서, 실제 차로 끊김일 때만 동선 문구를 붙인다.
  if (hasNetworkIssue || (state.metrics && state.metrics.connected === false)) {
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
  state.issues = result.issues || [];
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
  appendTransferNotes();
}

function appendTransferNotes() {
  if (state.siteType !== "complex" || !state.buildings.length) return;
  const notes = towerTransferNotes(state.buildings, state.cores, state.columns);
  notes.forEach((note) => {
    state.issues.push({ type: "notice", label: note.label });
  });
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
  // 코어를 끌면 동 외곽(blockRects)도 새 위치로 다시 계산.
  if (state.siteType === "complex" && state.buildings.length) {
    state.plate = {
      ...state.plate,
      buildings: state.buildings,
      blockRects: towerBlockRects(state.buildings, state.cores, state.plate),
    };
  }
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
  const edge = state.roadEdge || "w";
  const along = edge === "n" || edge === "s" ? state.plate.width : state.plate.depth;
  const pos = state.rampPos && state.rampPos !== "auto" ? state.rampPos : undefined;
  if (!state.ramps.length) {
    state.ramps = [{
      id: state.nextId++,
      edge,
      t: round1(along / 2),
      width: state.rampWidth,
      length: defaultRampLength(state.plate, edge),
      placement: state.rampPlacement,
      form: state.rampForm || "auto",
      ...(pos ? { pos } : {}),
    }];
  } else {
    state.ramps = state.ramps.map((ramp) => {
      const next = {
        ...ramp,
        edge: edge || ramp.edge,
        placement: state.rampPlacement,
        form: state.rampForm || ramp.form || "auto",
      };
      if (pos) next.pos = pos;
      else delete next.pos;
      return next;
    });
  }
}

export function generatePlate() {
  const notes = [];
  state.plate = plateFromState();
  let resizedComplex = false;
  if (state.siteType === "complex") {
    // 동 외곽(blockUnder)까지 넣으면 80×58로는 타워가 겹쳐 배치가 망가진다 → 동 수·타워에 맞게 키운다.
    const n = Math.max(1, state.buildings.length || state.cores.filter((c) => (c.kind || "building") !== "stair").length || 3);
    const tw = Math.max(DEFAULT_TOWER_W, ...state.buildings.map((b) => Number(b.tower?.w) || DEFAULT_TOWER_W));
    const td = Math.max(DEFAULT_TOWER_D, ...state.buildings.map((b) => Number(b.tower?.d) || DEFAULT_TOWER_D));
    const minW = n >= 3 ? Math.max(98, Math.ceil(tw * 2 + 40)) : n >= 2 ? Math.max(70, Math.ceil(tw + 40)) : 48;
    const minD = n >= 3 ? Math.max(66, Math.ceil(td * 2 + 28)) : n >= 2 ? Math.max(54, Math.ceil(td + 36)) : 42;
    if (state.parkWidth < minW || state.parkDepth < minD) {
      state.parkWidth = Math.max(state.parkWidth, minW);
      state.parkDepth = Math.max(state.parkDepth, minD);
      state.plate = plateFromState();
      resizedComplex = true;
      notes.push(`단지형 동 ${n}개·동 외곽에 맞춰 평면을 ${state.parkWidth}×${state.parkDepth}m로 키웠습니다.`);
    }
  }
  const complexPlate = () => ({
    ...state.plate,
    expectTowerW: Math.max(DEFAULT_TOWER_W, ...state.buildings.map((b) => Number(b.tower?.w) || 0)),
    expectTowerD: Math.max(DEFAULT_TOWER_D, ...state.buildings.map((b) => Number(b.tower?.d) || 0)),
  });
  if (!state.cores.length) {
    if (state.siteType === "complex" && state.buildings.length) {
      linkBuildingsToCores(defaultCores(complexPlate(), state.buildings.length));
    } else {
      state.cores = [defaultCore(state.plate)];
    }
  } else if (state.siteType === "complex" && state.buildings.length) {
    // 평면 만들기 때 동 코어를 타워 footprint 간격으로 다시 고르게 둔다(계단 코어는 유지).
    const stairs = state.cores.filter((c) => c.kind === "stair").map((c) => clampCore(c, state.plate));
    linkBuildingsToCores(defaultCores(complexPlate(), state.buildings.length));
    state.cores = state.cores.concat(stairs);
  }
  state.cores = state.cores.map((core) => clampCore(core, state.plate));
  if (state.siteType === "complex" && state.buildings.length) {
    // 기존 코어가 타워끼리 겹치면 밀어 간격을 확보한 뒤 다시 clamp.
    const stairs = state.cores.filter((c) => c.kind === "stair");
    const spaced = spaceCoresForTowers(state.cores, state.buildings, state.plate);
    state.cores = spaced.filter((c) => (c.kind || "building") !== "stair").concat(stairs);
    // 타워 dx/dy를 현재 코어 크기에 맞게 재정렬(옛 30m 타워 잔존 방지).
    state.buildings.forEach((b) => {
      const core = state.cores.find((c) => c.buildingId === b.id && (c.kind || "building") !== "stair");
      if (!core || !b.tower) return;
      if (b.tower.w >= 28) {
        b.tower = defaultTower(core.w, core.d, DEFAULT_TOWER_W, DEFAULT_TOWER_D);
      } else {
        b.tower.dx = -(b.tower.w - core.w) / 2;
        b.tower.dy = -(b.tower.d - core.d) / 2;
      }
    });
  }
  syncCore();
  if (state.siteType === "complex") {
    state.plate.blockRects = towerBlockRects(state.buildings, state.cores, state.plate);
    state.plate.buildings = state.buildings;
    const rampNote = ensureComplexRampFits();
    if (rampNote) notes.push(rampNote);
  }
  seedAccess();
  state.referenceNotes = notes;
  refreshVariants();
  const best = Math.max(0, state.variants.findIndex((variant) => variant.recommended));
  state.step = 2;
  state.revealStage = 6;
  state.tool = "core";
  applyVariant(best);
  // 마법사 슬라이드는 main.js가 유지한다(생성 후 램프 단계에 머묾).
}

export function loadReference() {
  const sample = referenceCase;
  state.siteType = "single";
  state.buildings = [];
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
  const buildingFloors = state.buildings.reduce((sum, b) => sum + (b.floors || 0), 0);
  const stairCores = state.cores.filter((c) => c.kind === "stair").length;
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
    siteType: state.siteType,
    buildingCount: state.buildings.length,
    buildingFloors,
    maxBuildingFloors: state.buildings.reduce((m, b) => Math.max(m, b.floors || 0), 0),
    stairCores,
    stallTypes: metrics ? metrics.stallTypes : null,
    stallTargets: metrics ? metrics.stallTargets : null,
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
  if (state.siteType === "complex") {
    addBuilding();
    return;
  }
  if (!state.plate) return;
  // 겹치지 않게 빈 자리에 둔다(기존 +2m 스택 버그 수정).
  const placed = defaultCores(state.plate, state.cores.length + 1);
  const next = placed[placed.length - 1];
  next.kind = "building";
  state.cores.push(clampCore(next, state.plate));
  state.coreIndex = state.cores.length - 1;
  syncCore();
  rebuildLayout();
  emit();
}

const DEFAULT_TOWER_W = 22;
const DEFAULT_TOWER_D = 14;

function makeBuilding(index, core) {
  const name = `${101 + index}동`;
  const tower = defaultTower(core.w, core.d, DEFAULT_TOWER_W, DEFAULT_TOWER_D);
  return {
    id: state.nextId++,
    name,
    floors: 15,
    floorHeight: 2.9,
    tower,
    blockUnder: true,
  };
}

function linkBuildingsToCores(cores) {
  const list = cores.map((c) => ({ ...c, kind: c.kind || "building" }));
  while (state.buildings.length < list.length) {
    state.buildings.push(makeBuilding(state.buildings.length, list[state.buildings.length]));
  }
  list.forEach((core, i) => {
    const b = state.buildings[i];
    if (!b) return;
    core.buildingId = b.id;
    core.kind = "building";
    b.tower = b.tower || defaultTower(core.w, core.d);
  });
  state.cores = list;
  state.coreIndex = 0;
  syncCore();
}

export function setSiteType(type) {
  if (type !== "single" && type !== "complex") return;
  if (state.siteType === type) return;
  state.siteType = type;
  if (type === "complex") {
    if (!state.buildings.length) {
      // 평면이 아직 없으면 임시 크기로 코어를 잡고, generatePlate 때 다시 맞춤.
      const probe = {
        ...(state.plate || plateFromState()),
        expectTowerW: DEFAULT_TOWER_W,
        expectTowerD: DEFAULT_TOWER_D,
      };
      const cores = defaultCores(probe, 3);
      state.buildings = [];
      cores.forEach((core, i) => {
        const b = makeBuilding(i, core);
        core.buildingId = b.id;
        core.kind = "building";
        state.buildings.push(b);
      });
      state.cores = cores.map((c) => (state.plate ? clampCore(c, state.plate) : c));
      syncCore();
    }
    state.demand.active = { ...(state.demand.active || {}), apartment: true };
    state.noGroundAccess = true;
    // 단지형은 동·코어가 많아 외부 램프+짧은 대지 여유가 자주 깨진다 → 내부 램프를 기본으로.
    preferInternalRampForComplex("단지형으로 바꿔 내부 램프를 기본으로 썼습니다.");
  } else {
    state.buildings = [];
    if (state.plate) {
      state.cores = [clampCore({ ...defaultCore(state.plate), kind: "building" }, state.plate)];
    } else {
      state.cores = [];
    }
    state.coreIndex = 0;
    syncCore();
    if (state.plate) {
      state.plate.blockRects = [];
      state.plate.buildings = [];
    }
  }
  if (state.plate) rebuildLayout();
  emit();
}

/** 단지형은 내부 램프를 기본으로 쓴다(외부+짧은 대지 여유가 자주 깨짐). */
function preferInternalRampForComplex(notice) {
  if (state.rampPlacement === "internal"
    && (state.ramps || []).every((r) => (r.placement || "internal") === "internal")) {
    return;
  }
  state.rampPlacement = "internal";
  state.ramps = (state.ramps || []).map((r) => ({ ...r, placement: "internal" }));
  if (notice) state.referenceNotes = (state.referenceNotes || []).concat([notice]);
}

/** @returns {string|null} 사용자 안내 문장(바꿨을 때만). */
function ensureComplexRampFits() {
  if (state.siteType !== "complex") return null;
  const edge = state.roadEdge || (state.ramps[0] && state.ramps[0].edge) || "w";
  const length = defaultRampLength(state.plate || plateFromState(), edge);
  const external = state.rampPlacement === "external"
    || (state.ramps[0] && state.ramps[0].placement === "external");
  if (!external) return null;
  const ramp = {
    ...(state.ramps[0] || {}),
    edge,
    width: state.rampWidth || 6,
    length: state.rampLength || length,
    placement: "external",
  };
  const plate = {
    ...(state.plate || plateFromState()),
    buildings: state.buildings,
    siteMargin: state.siteMargin,
    siteMargins: state.siteMargins,
  };
  const clear = externalRampClearance(ramp, plate);
  if (clear.fits) return null;
  state.rampPlacement = "internal";
  state.ramps = (state.ramps || []).map((r) => ({ ...r, placement: "internal", length: r.length || length }));
  return `외부 램프(${clear.need}m)가 대지 여유 ${clear.have}m를 넘어 내부 램프로 바꿨습니다.`;
}

export function addBuilding() {
  if (state.siteType !== "complex") return;
  const probe = state.plate || plateFromState();
  const buildingCores = state.cores.filter((c) => (c.kind || "building") !== "stair");
  const stairs = state.cores.filter((c) => c.kind === "stair");
  const next = defaultCores(probe, buildingCores.length + 1);
  const core = next[next.length - 1];
  const building = makeBuilding(state.buildings.length, core);
  core.buildingId = building.id;
  core.kind = "building";
  state.buildings.push(building);
  state.cores = buildingCores.concat(
    [state.plate ? clampCore(core, state.plate) : core],
    stairs,
  );
  state.coreIndex = buildingCores.length;
  syncCore();
  if (state.plate) rebuildLayout();
  emit();
}

export function removeBuilding(id) {
  if (state.siteType !== "complex") return;
  if (state.buildings.length <= 1) return;
  state.buildings = state.buildings.filter((b) => b.id !== id);
  state.cores = state.cores.filter((c) => c.buildingId !== id);
  state.coreIndex = Math.min(state.coreIndex, Math.max(0, state.cores.length - 1));
  syncCore();
  if (state.plate) rebuildLayout();
  emit();
}

export function updateBuilding(id, partial) {
  const building = state.buildings.find((b) => b.id === id);
  if (!building) return;
  if (partial.name != null) building.name = String(partial.name);
  if (partial.floors != null) building.floors = Math.max(1, Number(partial.floors) || 1);
  if (partial.floorHeight != null) building.floorHeight = Math.max(2.5, Number(partial.floorHeight) || 2.9);
  if (partial.blockUnder != null) building.blockUnder = Boolean(partial.blockUnder);
  if (partial.tower) {
    building.tower = { ...building.tower, ...partial.tower };
  }
  if (state.plate) rebuildLayout();
  emit();
}

export function addStairCore(point) {
  const probe = state.plate || plateFromState();
  let near = point;
  if (!near) {
    // 빈 자리: 기존 코어와 겹치지 않는 후보
    const cx = probe.width / 2;
    const cy = probe.depth * 0.25;
    near = { x: cx, y: cy };
  }
  const core = stairCore(probe, near);
  // 다른 코어와 겹치면 x를 밀어 본다.
  const others = state.cores.slice();
  for (let k = 0; k < 8; k += 1) {
    const hit = others.some((o) => {
      const ox = Math.min(core.x + core.w, o.x + o.w) - Math.max(core.x, o.x);
      const oy = Math.min(core.y + core.d, o.y + o.d) - Math.max(core.y, o.y);
      return ox > 0.01 && oy > 0.01;
    });
    if (!hit) break;
    core.x = round1(core.x + 8);
    if (state.plate) Object.assign(core, clampCore(core, state.plate));
  }
  state.cores.push(state.plate ? clampCore(core, state.plate) : core);
  state.coreIndex = state.cores.length - 1;
  syncCore();
  state.selection = { type: "core", index: state.coreIndex };
  if (state.plate) rebuildLayout();
  emit();
}

export function buildingOfCore(core) {
  if (!core || core.buildingId == null) return null;
  return state.buildings.find((b) => b.id === core.buildingId) || null;
}

export function coreLabel(core, index) {
  if (!core) return `코어 ${index + 1}`;
  if (core.kind === "stair") {
    const stairIndex = state.cores.filter((c, i) => i <= index && c.kind === "stair").length;
    return `계단 ${stairIndex}`;
  }
  const building = buildingOfCore(core);
  if (building) return `${building.name} 코어`;
  return `코어 ${index + 1}`;
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
  if (state.selection.type === "core") {
    const core = state.cores[state.coreIndex];
    if (core && core.kind === "stair") {
      state.cores.splice(state.coreIndex, 1);
      state.coreIndex = 0;
      syncCore();
    } else {
      const buildingCores = state.cores.filter((c) => (c.kind || "building") !== "stair");
      if (buildingCores.length > 1) {
        if (core && core.buildingId != null) {
          state.buildings = state.buildings.filter((b) => b.id !== core.buildingId);
        }
        state.cores.splice(state.coreIndex, 1);
        state.coreIndex = 0;
        syncCore();
      }
    }
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
