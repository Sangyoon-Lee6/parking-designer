import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CLEAR_HEIGHT, CURB_H, CURB_W, FLOOR_H, LINE_W, WALL_T, rampFootprint, rampShape, rampsForLevel, siteMarginsOf } from "./layout.js?v=270";
import { state, subscribe, summary } from "./state.js?v=270";

const DRAW_CAP = 12;
let renderer;
let camera;
let controls;
let scene;
let building;
let host;
let signature = "";
let frame = 0;

export function mountScene(container) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#ddd6cb");
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.55;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };

  const hemi = new THREE.HemisphereLight("#fff7ee", "#c8b8a4", 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff5ea", 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  building = new THREE.Group();
  scene.add(building);

  const resize = () => {
    const rect = container.getBoundingClientRect();
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  subscribe(() => {
    if (state.step !== 3) return;
    requestAnimationFrame(() => {
      resize();
      rebuild(sun);
    });
  });

  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (!container.hidden && state.step === 3) {
      controls.update();
      renderer.render(scene, camera);
    }
  };
  loop();

  document.getElementById("reset-camera").addEventListener("click", () => {
    signature = "";
    if (state.step === 3) rebuild(sun);
  });
}

const paint = makePaint();

function rebuild(sun) {
  if (!state.plate) return;
  const info = summary();
  const floors = Math.max(1, info.floors);
  const drawn = Math.min(floors, DRAW_CAP);
  const single = state.floorView !== "all";
  const next = JSON.stringify({
    plate: state.plate,
    cores: state.cores,
    buildings: state.buildings,
    openings: state.openings,
    ramps: state.ramps,
    rampForm: state.rampForm,
    lowerRampForm: state.lowerRampForm,
    lowerRampMode: state.lowerRampMode,
    route: state.route,
    columns: state.columns.length,
    stalls: state.stalls.length,
    floors,
    floorView: state.floorView,
  });
  const keepCamera = signature === next;
  signature = next;
  host = building;
  clearGroup(building);

  const plate = state.plate;
  const concrete = standard("#d5d0c8", 0.86, paint.concrete);
  const columnMat = standard("#8d887f", 0.78, paint.concrete);
  const hazard = standard("#111", 0.6, paint.hazard);
  const coreMat = standard("#cfc8be", 0.82, paint.concrete);
  const rampMat = standard("#8d8680", 0.7, paint.groove);
  rampMat.side = THREE.DoubleSide;
  const aisleMat = standard("#2f6b45", 0.42, paint.epoxy);
  const stallMats = {
    general: standard("#b7b4ae", 0.8),
    extended: standard("#86efac", 0.72),
    disabled: standard("#3b82f6", 0.62),
    eco: standard("#eab308", 0.7),
    parallel: standard("#94a3b8", 0.7),
  };
  const lineMat = standard("#f4f1ea", 0.4);
  const inMat = standard("#1f6b62", 0.45);
  const outMat = standard("#b5522a", 0.45);

  const levels = single ? [Math.max(0, Math.min(drawn - 1, state.floorView))] : [...Array(drawn).keys()];
  levels.forEach((level) => {
    const base = single ? 0 : -level * FLOOR_H;
    const floor = new THREE.Group();
    building.add(floor);
    host = floor;
    addSlab(plate, base, concrete);
    addAisles(base, aisleMat);
    addStallPads(base, stallMats);
    host.add(stallLines(base, lineMat));
    addArrows(base);
    state.columns.forEach((column, index) => addColumn(column, index, base, columnMat, hazard));
    addClearance(base);
    state.cores.forEach((core) => addCore(core, coreMat, base));
    // B1(level 0): 지상→지하 진입 램프. B2+(level≥1): 층간 다른 경로(기본 alternate).
    const levelRamps = rampsForLevel(
      state.ramps,
      plate,
      level,
      state.lowerRampMode || (plate && plate.lowerRampMode) || "alternate",
    );
    levelRamps.forEach((ramp) => addRamp(ramp, rampMat, base, hazard));
    addSiteSetback(base);
    addWalls(concrete, base);
    addGates(base);
    state.openings.forEach((opening) => {
      addThreshold(opening, opening.kind === "in" ? inMat : outMat, base);
    });
    addLabel(`B${level + 1}`, plate.width / 2, base + 1.2, -2.2, 6.4);
  });

  host = building;
  let towerH = 0;
  if (!single) {
    addGrade(plate);
    addLabel("지상", plate.width / 2, FLOOR_H + 1.2, -3);
    if (state.floorView === "all") towerH = addTowers();
  }
  if (floors > drawn) addLabel(`외 ${floors - drawn}개 층`, plate.width + 8, -drawn * FLOOR_H / 2, plate.depth / 2);

  const stack = single ? 1 : drawn;
  const rampReach = state.ramps.reduce((reach, ramp) => {
    const box = rampFootprint(ramp, plate);
    return Math.max(reach, Math.max(0, -box.x), Math.max(0, -box.y), Math.max(0, box.x + box.w - plate.width), Math.max(0, box.y + box.d - plate.depth));
  }, 0);
  const siteM = siteMarginsOf({
    ...plate,
    siteMargin: plate.siteMargin != null ? plate.siteMargin : state.siteMargin,
    siteMargins: plate.siteMargins || state.siteMargins,
  });
  const marginReach = Math.max(siteM.n || 0, siteM.s || 0, siteM.e || 0, siteM.w || 0, rampReach);
  const span = Math.max(plate.width + marginReach, plate.depth + marginReach, stack * FLOOR_H, towerH + FLOOR_H);
  sun.position.set(-plate.width * 0.2, span, plate.depth * 0.2);
  sun.target.position.set(plate.width / 2, single ? 1 : -drawn * FLOOR_H / 2, plate.depth / 2);
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span * 1.4;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = span * 4;
  sun.shadow.camera.updateProjectionMatrix();

  if (!keepCamera) {
    const center = new THREE.Vector3(plate.width / 2, single ? 1.2 : -((drawn - 1) * FLOOR_H) / 2, plate.depth / 2);
    const dist = towerH > 0 ? 1.25 : 1;
    camera.position.set(center.x + plate.width * 0.9 * dist, center.y + span * 0.42 * dist, center.z + plate.depth * 1.05 * dist);
    controls.target.copy(center);
    controls.update();
  }
}

/** 지상선 위 반투명 타워 매스. B1·전체 층 보기일 때만. 반환: 최고 타워 높이(m). */
function addTowers() {
  let maxH = 0;
  const mat = new THREE.MeshStandardMaterial({
    color: "#9aa7b5",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0.02,
  });
  (state.buildings || []).forEach((b) => {
    const core = (state.cores || []).find((c) => c.buildingId === b.id && (c.kind || "building") !== "stair");
    if (!core || !b.tower) return;
    const tw = b.tower;
    const h = (b.floors || 1) * (b.floorHeight || 2.9);
    maxH = Math.max(maxH, h);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(tw.w, h, tw.d), mat);
    mesh.position.set(core.x + (tw.dx || 0) + tw.w / 2, FLOOR_H + h / 2, core.y + (tw.dy || 0) + tw.d / 2);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    host.add(mesh);
    addLabel(`${b.name} ${b.floors}F`, core.x + (tw.dx || 0) + tw.w / 2, FLOOR_H + h + 1.4, core.y + (tw.dy || 0) + tw.d / 2, 5);
  });
  return maxH;
}

function standard(color, roughness, map) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, map: map || null });
}

function addSlab(plate, base, material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(plate.width, 0);
  shape.lineTo(plate.width, plate.depth);
  shape.lineTo(0, plate.depth);
  shape.lineTo(0, 0);
  rampHoles(plate).forEach((hole) => {
    const path = new THREE.Path();
    path.moveTo(hole.x, hole.y);
    path.lineTo(hole.x, hole.y + hole.d);
    path.lineTo(hole.x + hole.w, hole.y + hole.d);
    path.lineTo(hole.x + hole.w, hole.y);
    path.lineTo(hole.x, hole.y);
    shape.holes.push(path);
  });
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  const slab = new THREE.Mesh(geometry, material);
  slab.position.set(0, base, 0);
  slab.receiveShadow = true;
  host.add(slab);
}

function rampHoles(plate) {
  const holes = [];
  state.ramps.forEach((ramp) => {
    const box = rampFootprint(ramp, plate);
    const x = Math.max(0.6, box.x);
    const y = Math.max(0.6, box.y);
    const x2 = Math.min(plate.width - 0.6, box.x + box.w);
    const y2 = Math.min(plate.depth - 0.6, box.y + box.d);
    if (x2 - x > 1.2 && y2 - y > 1.2) {
      holes.push({ x, y, w: x2 - x, d: y2 - y });
      return;
    }
    const mouth = 2.4;
    const half = ramp.width / 2;
    if (ramp.edge === "w") holes.push({ x: 0.6, y: ramp.t - half, w: mouth, d: ramp.width });
    if (ramp.edge === "e") holes.push({ x: plate.width - 0.6 - mouth, y: ramp.t - half, w: mouth, d: ramp.width });
    if (ramp.edge === "s") holes.push({ x: ramp.t - half, y: 0.6, w: ramp.width, d: mouth });
    if (ramp.edge === "n") holes.push({ x: ramp.t - half, y: plate.depth - 0.6 - mouth, w: ramp.width, d: mouth });
  });
  return holes.filter((hole) => hole.w > 0.8 && hole.d > 0.8 && hole.x > 0.2 && hole.y > 0.2);
}

function addAisles(base, material) {
  state.aisles.forEach((aisle) => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(Math.max(aisle.w, 0.05), 0.02, Math.max(aisle.d, 0.05)), material);
    pad.position.set(aisle.x + aisle.w / 2, base + 0.02, aisle.y + aisle.d / 2);
    pad.receiveShadow = true;
    host.add(pad);
  });
}

function stallLines(base, material) {
  const group = new THREE.Group();
  const across = new THREE.BoxGeometry(1, 0.012, LINE_W);
  const along = new THREE.BoxGeometry(LINE_W, 0.012, 1);
  state.stalls.forEach((stall) => {
    const y = base + 0.045;
    strip(group, across, material, stall.x + stall.w / 2, y, stall.y, stall.w, 1);
    strip(group, across, material, stall.x + stall.w / 2, y, stall.y + stall.d, stall.w, 1);
    strip(group, along, material, stall.x, y, stall.y + stall.d / 2, 1, stall.d);
    strip(group, along, material, stall.x + stall.w, y, stall.y + stall.d / 2, 1, stall.d);
  });
  return group;
}

function strip(group, geometry, material, x, y, z, sx, sz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, 1, sz);
  group.add(mesh);
}

function addCore(core, material, base) {
  const t = WALL_T;
  const h = FLOOR_H - 0.05;
  const door = 1.1;
  wallBox(core.x + core.w / 2, base, core.y + core.d - t / 2, core.w, t, material, h);
  wallBox(core.x + t / 2, base, core.y + core.d / 2, t, core.d, material, h);
  wallBox(core.x + core.w - t / 2, base, core.y + core.d / 2, t, core.d, material, h);
  const gap = Math.min(door, core.w * 0.34);
  const left = (core.w - gap) / 2;
  if (left > 0.2) {
    wallBox(core.x + left / 2, base, core.y + t / 2, left, t, material, h);
    wallBox(core.x + core.w - left / 2, base, core.y + t / 2, left, t, material, h);
  }
  const frame = standard("#2b2a28", 0.5);
  wallBox(core.x + core.w / 2, base, core.y + 0.08, gap + 0.16, 0.08, frame, 2.15);
  const doorMat = standard("#3d4a43", 0.55);
  wallBox(core.x + core.w / 2, base, core.y + 0.12, gap * 0.46, 0.04, doorMat, 2.05);
  wallBox(core.x + core.w / 2 + gap * 0.26, base, core.y + 0.16, gap * 0.42, 0.04, doorMat, 2.05);
  wallBox(core.x + core.w * 0.34, base, core.y + core.d / 2, t, core.d - t * 2, material, h);
  wallBox(core.x + core.w * 0.67, base, core.y + core.d / 2, t, core.d - t * 2, material, h);
  const cabin = standard("#1c1c1c", 0.4);
  wallBox(core.x + core.w * 0.17, base, core.y + core.d * 0.55, 0.9, 0.08, cabin, 2.1);
  wallBox(core.x + core.w * 0.5, base, core.y + core.d * 0.55, 0.9, 0.08, cabin, 2.1);
  addLabel("비상구", core.x + core.w / 2, base + h + 0.15, core.y + core.d / 2, 2.4);
}

function addRamp(ramp, material, base, hazard) {
  const plate = state.plate;
  const shape = rampShape(ramp, plate);
  const footprint = shape.footprint || rampFootprint(ramp, plate);
  const H = FLOOR_H;
  // path에 하강 h가 있으면 리본 메시로 그린다(곡선·원형·직선 공통).
  if (shape.path && shape.path.length >= 2 && shape.path.some((p) => p.h != null)) {
    addRampRibbon(shape, ramp, material, base, H);
  } else {
    addRampQuad(ramp, footprint, material, base, H);
  }
  addRampEdges(ramp, footprint, base, hazard);
}

/** 중심선 path(x,y,h)를 따라 폭 있는 경사 리본. */
function addRampRibbon(shape, ramp, material, base, H) {
  const path = shape.path;
  const half = Math.max(3, (ramp.width || shape.width || 6) / 2);
  const positions = [];
  const pushTri = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  for (let i = 0; i < path.length - 1; i += 1) {
    const p0 = path[i];
    const p1 = path[i + 1];
    const dx = p1.x - p0.x;
    const dz = p1.y - p0.y;
    const len = Math.hypot(dx, dz);
    if (len < 0.08) continue; // 모서리 중복점으로 생기는 팬/겹침 메시 방지
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const y0 = base + H - (p0.h == null ? 0 : p0.h);
    const y1 = base + H - (p1.h == null ? H : p1.h);
    const a = [p0.x + nx, y0, p0.y + nz];
    const b = [p0.x - nx, y0, p0.y - nz];
    const c = [p1.x - nx, y1, p1.y - nz];
    const d = [p1.x + nx, y1, p1.y + nz];
    pushTri(a, b, c);
    pushTri(a, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  host.add(mesh);
}

function addRampQuad(ramp, footprint, material, base, H) {
  const low = base + 0.12;
  const high = base + H;
  let corners;
  if (ramp.edge === "s") {
    corners = [
      [footprint.x, high, footprint.y],
      [footprint.x + footprint.w, high, footprint.y],
      [footprint.x + footprint.w, low, footprint.y + footprint.d],
      [footprint.x, low, footprint.y + footprint.d],
    ];
  } else if (ramp.edge === "n") {
    corners = [
      [footprint.x, low, footprint.y],
      [footprint.x + footprint.w, low, footprint.y],
      [footprint.x + footprint.w, high, footprint.y + footprint.d],
      [footprint.x, high, footprint.y + footprint.d],
    ];
  } else if (ramp.edge === "w") {
    corners = [
      [footprint.x, high, footprint.y],
      [footprint.x, high, footprint.y + footprint.d],
      [footprint.x + footprint.w, low, footprint.y + footprint.d],
      [footprint.x + footprint.w, low, footprint.y],
    ];
  } else {
    corners = [
      [footprint.x, low, footprint.y],
      [footprint.x, low, footprint.y + footprint.d],
      [footprint.x + footprint.w, high, footprint.y + footprint.d],
      [footprint.x + footprint.w, high, footprint.y],
    ];
  }
  const positions = new Float32Array([
    ...corners[0], ...corners[1], ...corners[2],
    ...corners[0], ...corners[2], ...corners[3],
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  host.add(mesh);
}

/** 대지 이격 경계(점선) — 결과 3D에서도 이격이 보이게 */
function addSiteSetback(base) {
  const plate = state.plate;
  if (!plate) return;
  const m = siteMarginsOf({
    ...plate,
    siteMargin: plate.siteMargin != null ? plate.siteMargin : state.siteMargin,
    siteMargins: plate.siteMargins || state.siteMargins,
  });
  if (!(m.n > 0 || m.s > 0 || m.e > 0 || m.w > 0)) return;
  const y = base + 0.08;
  const pts = [
    new THREE.Vector3(-m.w, y, -m.s),
    new THREE.Vector3(plate.width + m.e, y, -m.s),
    new THREE.Vector3(plate.width + m.e, y, plate.depth + m.n),
    new THREE.Vector3(-m.w, y, plate.depth + m.n),
    new THREE.Vector3(-m.w, y, -m.s),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({
    color: 0x64748b,
    dashSize: 1.6,
    gapSize: 1.0,
    linewidth: 1,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  host.add(line);
  const labelM = Math.max(m.n, m.s, m.e, m.w);
  addLabel(`대지 이격 ${labelM}m`, plate.width / 2, base + 0.55, -m.s - 1.2, 10);
}

function addWalls(material, base) {
  const plate = state.plate;
  const cuts = { s: [], n: [], w: [], e: [] };
  state.openings.concat(state.ramps).forEach((item) => {
    cuts[item.edge].push({ start: item.t - item.width / 2, end: item.t + item.width / 2 });
  });
  segments(plate.width, cuts.s).forEach(([a, b]) => wallBox((a + b) / 2, base, 0.12, b - a, 0.24, material, 1.15));
  segments(plate.width, cuts.n).forEach(([a, b]) => wallBox((a + b) / 2, base, plate.depth - 0.12, b - a, 0.24, material, 1.15));
  segments(plate.depth, cuts.w).forEach(([a, b]) => wallBox(0.12, base, (a + b) / 2, 0.24, b - a, material, 1.15));
  segments(plate.depth, cuts.e).forEach(([a, b]) => wallBox(plate.width - 0.12, base, (a + b) / 2, 0.24, b - a, material, 1.15));
}

function addThreshold(opening, material, base) {
  const plate = state.plate;
  const width = opening.width;
  const depth = 0.7;
  if (opening.edge === "s") boxAt(opening.t, base + 0.05, depth / 2, width, depth, material);
  if (opening.edge === "n") boxAt(opening.t, base + 0.05, plate.depth - depth / 2, width, depth, material);
  if (opening.edge === "w") boxAt(depth / 2, base + 0.05, opening.t, depth, width, material);
  if (opening.edge === "e") boxAt(plate.width - depth / 2, base + 0.05, opening.t, depth, width, material);
}

function addGrade(plate) {
  const y = FLOOR_H;
  const points = [
    new THREE.Vector3(0, y, 0),
    new THREE.Vector3(plate.width, y, 0),
    new THREE.Vector3(plate.width, y, plate.depth),
    new THREE.Vector3(0, y, plate.depth),
    new THREE.Vector3(0, y, 0),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  host.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#8d4030" })));
}

function addLabel(text, x, y, z, width = 12) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = text === "비상구" ? "#16824a" : "#1e1a16";
  context.font = "600 54px Segoe UI, Malgun Gothic, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width / 4, 1);
  host.add(sprite);
}

function boxAt(x, y, z, w, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), material);
  mesh.position.set(x, y, z);
  host.add(mesh);
}

function wallBox(x, base, z, w, d, material, height) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), material);
  mesh.position.set(x, base + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  host.add(mesh);
}

function segments(length, cuts) {
  let spans = [[0, length]];
  cuts.forEach((cut) => {
    const next = [];
    spans.forEach(([start, end]) => {
      if (cut.end <= start || cut.start >= end) {
        next.push([start, end]);
        return;
      }
      if (cut.start > start) next.push([start, cut.start]);
      if (cut.end < end) next.push([cut.end, end]);
    });
    spans = next.filter(([start, end]) => end - start > 0.2);
  });
  return spans;
}

function stallTypeOf(stall) {
  if (!stall) return "general";
  if (stall.parallel || stall.type === "parallel") return "parallel";
  return stall.type || "general";
}

function addStallPads(base, materials) {
  const fallback = materials.general || standard("#b7b4ae", 0.8);
  state.stalls.forEach((stall) => {
    const mat = materials[stallTypeOf(stall)] || fallback;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(stall.w - 0.04, 0.02, stall.d - 0.04), mat);
    pad.position.set(stall.x + stall.w / 2, base + 0.03, stall.y + stall.d / 2);
    pad.receiveShadow = true;
    host.add(pad);
  });
  if (!state.debugColumns) return;
  const alert = standard("#b42318", 0.35);
  (state.columnConflicts || []).forEach((stall) => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(stall.w - 0.04, 0.05, stall.d - 0.04), alert);
    pad.position.set(stall.x + stall.w / 2, base + 0.06, stall.y + stall.d / 2);
    host.add(pad);
  });
}

function addClearance(base) {
  const mark = state.clearance;
  if (!mark || !(mark.gap > 0)) return;
  const length = Math.max(0.02, mark.x2 - mark.x1);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, 0.06), standard("#9a3412", 0.2));
  bar.position.set((mark.x1 + mark.x2) / 2, base + 0.12, mark.y);
  host.add(bar);
  addLabel(`${mark.gap.toFixed(2)}m`, (mark.x1 + mark.x2) / 2, base + 0.45, mark.y - 0.15, 1.6);
}

function addColumn(column, index, base, concrete, hazard) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(column.w, FLOOR_H - 1, column.d), concrete);
  mesh.position.set(column.x + column.w / 2, base + 1 + (FLOOR_H - 1) / 2, column.y + column.d / 2);
  mesh.castShadow = true;
  host.add(mesh);
  const band = new THREE.Mesh(new THREE.BoxGeometry(column.w + 0.02, 1, column.d + 0.02), hazard);
  band.position.set(column.x + column.w / 2, base + 0.5, column.y + column.d / 2);
  band.castShadow = true;
  host.add(band);
  addLabel(`C${index + 1}`, column.x + column.w / 2, base + 2.2, column.y + column.d / 2, 1.3);
}

function addArrows(base) {
  const drives = state.drives || [];
  const material = standard("#f7f4ee", 0.35);
  drives.forEach((segment) => {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Math.hypot(dx, dy);
    if (length < 0.8) return;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, length - 0.7), 0.02, 0.38), material);
    shaft.position.set((segment.x1 + segment.x2) / 2, base + 0.07, (segment.y1 + segment.y2) / 2);
    shaft.rotation.y = -Math.atan2(dy, dx);
    host.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 6), material);
    head.position.set(segment.x2, base + 0.08, segment.y2);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dy).normalize());
    host.add(head);
  });
}

function addGates(base) {
  const used = new Set();
  state.openings.forEach((opening, index) => {
    if (used.has(index)) return;
    const twin = state.openings.findIndex((other, otherIndex) => otherIndex !== index && other.edge === opening.edge && Math.abs(other.t - opening.t) < 1.2);
    if (twin >= 0) used.add(twin);
    const label = twin >= 0 ? "입구·출구" : opening.kind === "in" ? "입구" : "출구";
    const spot = gatePoint(opening);
    const booth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.1), standard("#ece7df", 0.6));
    booth.position.set(spot.boothX, base + 1.1, spot.boothZ);
    booth.castShadow = true;
    host.add(booth);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(opening.width * 0.7, 0.08, 0.12), standard("#f2f2f2", 0.3, paint.hazard));
    arm.position.set(spot.x, base + 1.15, spot.z);
    if (opening.edge === "w" || opening.edge === "e") arm.rotation.y = Math.PI / 2;
    host.add(arm);
    addLabel(label, spot.x, base + CLEAR_HEIGHT + 0.35, spot.z, 3.2);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(opening.edge === "w" || opening.edge === "e" ? 0.12 : opening.width, 0.12, opening.edge === "w" || opening.edge === "e" ? opening.width : 0.12), standard("#111", 0.4, paint.hazard));
    bar.position.set(spot.x, base + CLEAR_HEIGHT, spot.z);
    host.add(bar);
  });
}

function gatePoint(opening) {
  const plate = state.plate;
  if (opening.edge === "s") return { x: opening.t, z: 1.2, boothX: opening.t + opening.width / 2 - 0.8, boothZ: 1.6 };
  if (opening.edge === "n") return { x: opening.t, z: plate.depth - 1.2, boothX: opening.t - opening.width / 2 + 0.8, boothZ: plate.depth - 1.6 };
  if (opening.edge === "w") return { x: 1.2, z: opening.t, boothX: 1.6, boothZ: opening.t + opening.width / 2 - 0.8 };
  return { x: plate.width - 1.2, z: opening.t, boothX: plate.width - 1.6, boothZ: opening.t - opening.width / 2 + 0.8 };
}

function addRampEdges(ramp, footprint, base, hazard) {
  const curb = standard("#d8d4cc", 0.7);
  const wall = standard("#c8c2b8", 0.75);
  const low = base + 0.12;
  const high = base + FLOOR_H;
  const outerHigh = ramp.edge === "s" || ramp.edge === "w";
  const samples = 10;
  const alongX = ramp.edge === "n" || ramp.edge === "s";
  for (let index = 0; index < samples; index += 1) {
    const t = (index + 0.5) / samples;
    const height = (outerHigh ? high : low) + ((outerHigh ? low : high) - (outerHigh ? high : low)) * t;
    if (alongX) {
      const z = footprint.y + footprint.d * t;
      slopedPiece(footprint.x + CURB_W / 2, height, z, CURB_W, footprint.d / samples, CURB_H, curb);
      slopedPiece(footprint.x + footprint.w - CURB_W / 2, height, z, CURB_W, footprint.d / samples, CURB_H, curb);
      slopedPiece(footprint.x + 0.18, height, z, 0.16, footprint.d / samples, 0.9, wall);
      slopedPiece(footprint.x + footprint.w - 0.18, height, z, 0.16, footprint.d / samples, 0.9, wall);
    } else {
      const x = footprint.x + footprint.w * t;
      slopedPiece(x, height, footprint.y + CURB_W / 2, footprint.w / samples, CURB_W, CURB_H, curb);
      slopedPiece(x, height, footprint.y + footprint.d - CURB_W / 2, footprint.w / samples, CURB_W, CURB_H, curb);
      slopedPiece(x, height, footprint.y + 0.18, footprint.w / samples, 0.16, 0.9, wall);
      slopedPiece(x, height, footprint.y + footprint.d - 0.18, footprint.w / samples, 0.16, 0.9, wall);
    }
  }
  if (state.openings.some((opening) => opening.edge === ramp.edge && Math.abs(opening.t - ramp.t) < 1)) return;
  const outer = gatePoint({ ...ramp, width: ramp.width, t: ramp.t, edge: ramp.edge });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? footprint.w : 0.12, 0.16, alongX ? 0.12 : footprint.d), hazard);
  bar.position.set(outer.x, base + CLEAR_HEIGHT, outer.z);
  host.add(bar);
}

function slopedPiece(x, surface, z, w, d, height, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.05), height, Math.max(d, 0.05)), material);
  mesh.position.set(x, surface + height / 2, z);
  host.add(mesh);
}

function curbBox(x, base, z, w, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, CURB_H, d), material);
  mesh.position.set(x, base + CURB_H / 2, z);
  host.add(mesh);
}

function makePaint() {
  return { concrete: speckle(), hazard: stripes(), groove: grooves(), epoxy: speckle("#1d4d32", "#3e8a5a") };
}

function canvasTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  draw(canvas.getContext("2d"), canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(a = "#c8c2b8", b = "#8f8a82") {
  return canvasTexture((ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 80; i += 1) {
      ctx.fillStyle = b;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
  });
}

function stripes() {
  return canvasTexture((ctx) => {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#f0c400";
    ctx.lineWidth = 14;
    for (let i = -128; i < 256; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 128);
      ctx.lineTo(i + 128, 0);
      ctx.stroke();
    }
  });
}

function grooves() {
  return canvasTexture((ctx) => {
    ctx.fillStyle = "#9a938c";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#6e675f";
    for (let y = 0; y < 128; y += 10) ctx.fillRect(0, y, 128, 3);
  });
}

function clearGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      const list = Array.isArray(child.material) ? child.material : [child.material];
      list.forEach((item) => materials.add(item));
    }
  });
  geometries.forEach((item) => item.dispose());
  materials.forEach((item) => item.dispose());
  group.clear();
}
