import { stallsPerBay } from "./layout.js?v=84";
import { housingAreaDivisor, uses, zoneFactors } from "./parkingRules.js?v=82";
import { drawThumb, mountPlan } from "./plan.js?v=84";
import { downloadBlob, drawSheet, printSheet, sheetSvg } from "./sheet.js?v=84";
import {
  addCore,
  applyVariant,
  emit,
  generatePlate,
  loadReference,
  placeOverlapExample,
  placeSplitExample,
  readyFor3d,
  removeSelection,
  selectCore,
  selectItem,
  selectedOpening,
  selectedRamp,
  setReveal,
  setStep,
  setTool,
  state,
  subscribe,
  summary,
  updateCore,
  updateCoreArea,
  updateEntranceWidth,
  updateRampSize,
} from "./state.js?v=84";

const $ = (id) => document.getElementById(id);
const edgeName = { s: "남", n: "북", w: "서", e: "동" };

const fields = {
  width: $("park-width"),
  depth: $("park-depth"),
  spacing: $("column-spacing"),
  coreArea: $("core-area"),
  coreW: $("core-w"),
  coreD: $("core-d"),
  coreX: $("core-x"),
  coreY: $("core-y"),
  entranceWidth: $("entrance-width"),
  rampWidth: $("ramp-width"),
  rampLength: $("ramp-length"),
};

buildDemandForm();
fields.width.addEventListener("input", () => {
  state.parkWidth = numberOr(fields.width.value, state.parkWidth);
  render();
});
fields.depth.addEventListener("input", () => {
  state.parkDepth = numberOr(fields.depth.value, state.parkDepth);
  render();
});
fields.spacing.addEventListener("input", () => {
  state.columnSpacing = numberOr(fields.spacing.value, state.columnSpacing);
  render();
});
$("column-size").addEventListener("input", () => {
  const size = numberOr($("column-size").value, state.columnWidth);
  state.columnWidth = size;
  state.columnDepth = size;
  render();
});
$("min-clear").addEventListener("input", () => {
  state.minClear = numberOr($("min-clear").value, state.minClear);
  render();
});
$("site-margin").addEventListener("input", () => {
  state.siteMargin = numberOr($("site-margin").value, state.siteMargin);
  render();
});
$("ramp-placement").addEventListener("change", () => {
  state.rampPlacement = $("ramp-placement").value;
  render();
});
$("entrance-mode").addEventListener("change", () => {
  state.entranceMode = $("entrance-mode").value;
  render();
});
$("circulation").addEventListener("change", () => {
  state.circulation = $("circulation").value;
  render();
});
$("load-reference").addEventListener("click", () => {
  if (!inputsValid()) return;
  loadReference();
});

$("generate").addEventListener("click", () => {
  if (!inputsValid()) return;
  generatePlate();
});

document.querySelectorAll("#tools button").forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

fields.coreArea.addEventListener("change", () => updateCoreArea(Number(fields.coreArea.value)));
fields.coreW.addEventListener("change", () => updateCore({ w: Number(fields.coreW.value) }));
fields.coreD.addEventListener("change", () => updateCore({ d: Number(fields.coreD.value) }));
fields.coreX.addEventListener("change", () => updateCore({ x: Number(fields.coreX.value) }));
fields.coreY.addEventListener("change", () => updateCore({ y: Number(fields.coreY.value) }));
fields.entranceWidth.addEventListener("change", () => updateEntranceWidth(Number(fields.entranceWidth.value)));
fields.rampWidth.addEventListener("change", () => updateRampSize({ width: Number(fields.rampWidth.value) }));
fields.rampLength.addEventListener("change", () => updateRampSize({ length: Number(fields.rampLength.value) }));

$("place-split").addEventListener("click", placeSplitExample);
$("place-overlap").addEventListener("click", placeOverlapExample);
$("add-core").addEventListener("click", addCore);
$("core-pick").addEventListener("change", () => selectCore(Number($("core-pick").value)));
$("play-build").addEventListener("click", playBuild);
$("show-conflicts").addEventListener("click", () => {
  state.debugColumns = !state.debugColumns;
  emit();
});
$("overlay-file").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.overlay.url = String(reader.result);
    state.overlay.mode = "overlay";
    emit();
  };
  reader.readAsDataURL(file);
});
["overlay-opacity", "overlay-scale", "overlay-x", "overlay-y"].forEach((id) => {
  $(id).addEventListener("input", () => {
    state.overlay.opacity = numberOr($("overlay-opacity").value, 0.4);
    state.overlay.scale = numberOr($("overlay-scale").value, 1);
    state.overlay.x = numberOr($("overlay-x").value, 0);
    state.overlay.y = numberOr($("overlay-y").value, 0);
    emit();
  });
});
$("overlay-on").addEventListener("click", () => {
  state.overlay.mode = state.overlay.mode === "overlay" ? "off" : "overlay";
  emit();
});
$("overlay-side").addEventListener("click", () => {
  state.overlay.mode = state.overlay.mode === "side" ? "off" : "side";
  emit();
});
$("remove-selected").addEventListener("click", removeSelection);
$("to-3d").addEventListener("click", open3d);
$("back-plan").addEventListener("click", () => setStep(2));
$("tab-model").addEventListener("click", () => { state.resultTab = "model"; emit(); });
$("tab-sheet").addEventListener("click", () => { state.resultTab = "sheet"; emit(); });
$("sheet-png").addEventListener("click", () => {
  const canvas = $("sheet");
  canvas.toBlob((blob) => downloadBlob("parking-plan.png", blob));
});
$("sheet-svg").addEventListener("click", () => {
  const info = summary();
  const svg = sheetSvg(state, { ...info, checkedOn: info.demand.checkedOn }, sheetFloor());
  downloadBlob("parking-plan.svg", new Blob([svg], { type: "image/svg+xml" }));
});
$("sheet-print").addEventListener("click", () => printSheet($("sheet")));
$("floor-picker").addEventListener("click", (event) => {
  const floor = event.target.dataset.floor;
  if (!floor) return;
  state.floorView = floor === "all" ? "all" : Number(floor);
  emit();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (!state.selection || state.selection.type === "core") return;
  event.preventDefault();
  removeSelection();
});

document.querySelectorAll("#steps li").forEach((item) => {
  item.addEventListener("click", () => {
    const step = Number(item.dataset.step);
    if (step === 3) open3d();
    else setStep(step);
  });
});

mountPlan($("plan"));
subscribe(render);
render();

let sceneMount = null;
let playTimer = 0;
let compareKey = "";

function playBuild() {
  window.clearInterval(playTimer);
  const stages = [1, 2, 3, 4, 5, 6];
  let cursor = 0;
  setReveal(stages[0]);
  playTimer = window.setInterval(() => {
    cursor += 1;
    if (cursor >= stages.length) {
      window.clearInterval(playTimer);
      return;
    }
    setReveal(stages[cursor]);
  }, 700);
}

async function ensureScene() {
  if (!sceneMount) {
    sceneMount = import("./scene.js?v=84")
      .then((module) => module.mountScene($("scene-root")))
      .catch((error) => {
        sceneMount = null;
        throw error;
      });
  }
  return sceneMount;
}

async function open3d() {
  if (!readyFor3d()) return;
  try {
    await ensureScene();
    setStep(3);
  } catch (error) {
    $("step2-error").hidden = false;
    $("step2-error").textContent = "3D 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.";
  }
}

function render() {
  const step = state.step;
  document.querySelectorAll(".pane").forEach((pane) => {
    pane.hidden = Number(pane.dataset.pane) !== step;
  });
  document.querySelectorAll("#steps li").forEach((item) => {
    const value = Number(item.dataset.step);
    item.classList.toggle("on", value === step);
    item.classList.toggle("done", value < step);
  });
  const showSheet = step === 3 && state.resultTab === "sheet";
  $("plan-view").hidden = step === 3;
  $("scene-view").hidden = step !== 3 || showSheet;
  $("sheet-view").hidden = !showSheet;
  $("sheet-tools").hidden = !showSheet;
  $("reset-camera").hidden = showSheet;

  const valid = inputsValid();
  $("generate").disabled = !valid;
  $("input-error").hidden = valid;
  if (!valid) $("input-error").textContent = "가로·세로는 18–300m, 기둥 간격은 5–12m로 입력하세요.";

  const area = (state.parkWidth > 0 ? state.parkWidth : 0) * (state.parkDepth > 0 ? state.parkDepth : 0);
  const bay = stallsPerBay(state.columnSpacing, state.columnWidth, state.minClear);
  $("bay-readout").textContent = `구간당 ${bay.count}대, 이격 ${bay.gap.toFixed(2)}m (순간격 ${bay.clear.toFixed(2)}m)`;
  $("plate-preview").innerHTML = statList([
    ["주차장 크기", `${formatMeters(state.parkWidth)} × ${formatMeters(state.parkDepth)}`],
    ["주차장 면적", formatArea(area)],
    ["기둥 중심 간격", formatMeters(state.columnSpacing)],
    ["구간당 주차", `${bay.count}대 · 이격 ${bay.gap.toFixed(2)}m`],
  ]);
  setIfIdle($("column-size"), state.columnWidth);
  if (document.activeElement !== $("min-clear")) $("min-clear").value = Number(state.minClear).toFixed(2);
  setIfIdle($("site-margin"), state.siteMargin);
  if (document.activeElement !== $("ramp-placement")) $("ramp-placement").value = state.rampPlacement;
  if (document.activeElement !== $("entrance-mode")) $("entrance-mode").value = state.entranceMode;
  if (document.activeElement !== $("circulation")) $("circulation").value = state.circulation;
  if (document.activeElement !== $("project-name")) $("project-name").value = state.demand.projectName;

  const info = summary();
  renderDemand(info);
  const rows = [
    ["법정 필요 대수", `${info.required}대`],
    ["실제 배치 대수", `${info.placed}대`],
    ["필요 지하층", info.floors ? `${info.floors}층` : "—"],
    ["총 주차대수", `${info.totalStalls}대`],
    ["1대당 면적", info.placed ? formatArea(info.areaPerStall) : "—"],
    ["유사도", state.metrics ? `${info.similarity}점` : "—"],
    ["차로 면적 비율", state.metrics ? `${Math.round(info.aisleRatio * 100)}%` : "—"],
    ["동선 연결", state.plate ? (info.connected ? "연결" : "끊김") : "—"],
  ];
  $("plan-stats").innerHTML = statList(rows, 3);
  $("scene-stats").innerHTML = statList(rows, 3);
  $("floor-stack").innerHTML = floorStack(info.floors);
  $("floor-picker").innerHTML = floorPicker(info.floors);
  if (showSheet) drawSheet($("sheet"), state, { ...info, checkedOn: info.demand.checkedOn }, sheetFloor());

  if (state.core && document.activeElement !== fields.coreArea) fields.coreArea.value = String(Math.round(state.core.w * state.core.d));
  if (state.core) {
    setIfIdle(fields.coreW, state.core.w);
    setIfIdle(fields.coreD, state.core.d);
    setIfIdle(fields.coreX, state.core.x);
    setIfIdle(fields.coreY, state.core.y);
  }
  const opening = selectedOpening();
  const ramp = selectedRamp();
  setIfIdle(fields.entranceWidth, opening ? opening.width : state.entranceWidth);
  setIfIdle(fields.rampWidth, ramp ? ramp.width : state.rampWidth);
  setIfIdle(fields.rampLength, ramp ? ramp.length : state.rampLength);
  renderPicks();

  document.querySelectorAll("#tools button").forEach((button) => {
    button.classList.toggle("on", button.dataset.tool === state.tool);
  });

  $("reference-notes").textContent = state.referenceNotes.join(" ");
  $("compare-dock").hidden = step !== 2 || !state.variants.length;
  renderCompare();
  renderCorePick();

  const messages = [];
  if (!state.openings.length) messages.push("입구 또는 출구를 평면 외곽에 놓으세요.");
  if (!state.ramps.length) messages.push("램프를 평면 외곽에 놓으세요.");
  if (state.openings.length && state.ramps.length && !state.connected) {
    messages.push(...(state.issues.length ? state.issues.map((issue) => issue.label) : ["입구, 램프, 출구가 하나의 차로로 이어지지 않습니다."]));
  }
  $("step2-error").hidden = messages.length === 0;
  $("step2-error").textContent = messages.join(" ");
  $("to-3d").disabled = !readyFor3d();
  $("show-conflicts").classList.toggle("on", state.debugColumns);

  const stageText = ["", "외곽 주차칸", "순환 차로", "내부 베이", "기둥", "코어 우회", "동선 화살표"];
  const status = {
    1: "주차장 크기와 기둥 간격을 입력하거나, 기준 사례를 불러오세요.",
    2: state.revealStage < 6 ? `생성 과정: ${stageText[state.revealStage]}` : toolStatus(),
    3: info.floors
      ? `법정 ${info.required}대, 층당 ${info.placed}대라 지하 ${info.floors}층입니다.`
      : "한 층에 주차칸이 없어 지하층수를 계산하지 못했습니다.",
  };
  $("status").textContent = status[step];
}

function renderCorePick() {
  const select = $("core-pick");
  const markup = state.cores.map((core, index) => `<option value="${index}">코어 ${index + 1} · ${core.w.toFixed(1)}×${core.d.toFixed(1)}m</option>`).join("");
  if (select.innerHTML !== markup) select.innerHTML = markup;
  if (state.cores.length) select.value = String(state.coreIndex);
}

function renderCompare() {
  const dock = $("compare-dock");
  if (dock.hidden) return;
  const key = state.variants.map((variant) => `${variant.id}:${variant.metrics.stalls}:${variant.metrics.valid}:${variant.recommended}`).join("|") + `#${state.variantIndex}`;
  if (key === compareKey && dock.childElementCount) {
    dock.querySelectorAll(".compare-card").forEach((card, index) => {
      card.classList.toggle("on", index === state.variantIndex);
    });
    return;
  }
  compareKey = key;
  dock.innerHTML = "";
  state.variants.forEach((variant, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `compare-card${index === state.variantIndex ? " on" : ""}${variant.recommended ? " best" : ""}`;
    const canvas = document.createElement("canvas");
    const metrics = variant.metrics;
    button.innerHTML = `<p>${variant.recommended ? '<span class="tag">추천</span> ' : ""}${variant.id} ${variant.name}<br>${metrics.stalls}대 · ${metrics.areaPerStall.toFixed(1)}㎡/대 · 유사 ${metrics.similarity}<br>${metrics.connected ? "연결" : "끊김"} · 충돌 ${metrics.columnHits} · 막다른 ${metrics.deadEnds}${metrics.valid ? "" : ` · 탈락 ${metrics.rejected}`}</p>`;
    button.prepend(canvas);
    button.addEventListener("click", () => applyVariant(index));
    dock.appendChild(button);
    drawThumb(canvas, variant);
  });
}

function renderPicks() {
  const list = $("opening-list");
  const items = [
    ...state.openings.map((opening) => ({
      type: "opening",
      id: opening.id,
      text: `${opening.kind === "in" ? "입구" : "출구"} · ${edgeName[opening.edge]}측 ${opening.t.toFixed(1)}m`,
    })),
    ...state.ramps.map((ramp, index) => ({
      type: "ramp",
      id: ramp.id,
      text: `램프 ${index + 1} · ${edgeName[ramp.edge]}측 ${ramp.t.toFixed(1)}m`,
    })),
  ];
  list.innerHTML = items.map((item) => {
    const on = state.selection && state.selection.type === item.type && state.selection.id === item.id;
    return `<li><button type="button" data-type="${item.type}" data-id="${item.id}" class="${on ? "on" : ""}">${item.text}</button></li>`;
  }).join("");
  list.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectItem({ type: button.dataset.type, id: Number(button.dataset.id) });
    });
  });
}

function toolStatus() {
  if (state.tool === "core") return "코어를 끌어 옮기세요. 우클릭으로 화면을 이동합니다.";
  if (state.tool === "entrance") return "외곽을 클릭해 입구를 추가하세요. 이미 있는 입구·출구는 끌어서 겹치거나 나눌 수 있습니다.";
  if (state.tool === "exit") return "외곽을 클릭해 출구를 추가하세요. 입구와 같은 곳이면 겸용, 떨어지면 분리입니다.";
  if (state.tool === "ramp") return "외곽을 클릭해 램프를 추가하세요. 점선 차로를 따라 램프까지 회차할 수 있습니다.";
  return "드래그해서 화면을 이동하세요.";
}

function inputsValid() {
  return state.parkWidth >= 18 && state.parkWidth <= 300
    && state.parkDepth >= 18 && state.parkDepth <= 300
    && state.columnSpacing >= 5 && state.columnSpacing <= 12;
}

function buildDemandForm() {
  $("zone").innerHTML = Object.entries(zoneFactors).map(([id, zone]) => `<option value="${id}">${zone.label}</option>`).join("");
  $("region").innerHTML = Object.entries(housingAreaDivisor).map(([id, region]) => `<option value="${id}">${region.label}</option>`).join("");
  $("zone").value = state.demand.zone;
  $("region").value = state.demand.region;
  $("project-name").value = state.demand.projectName;
  $("ordinance").value = String(state.demand.ordinance);
  $("area-per-stall").value = String(state.demand.areaPerStall);
  $("planned-floors").value = String(state.demand.plannedFloors);
  $("use-form").innerHTML = uses.map((use) => `
    <label class="check"><input type="checkbox" data-use="${use.id}" ${state.demand.active[use.id] ? "checked" : ""}/> ${use.label}</label>
    <div class="use-fields" data-fields="${use.id}"></div>
  `).join("");
  syncUseFields();
  const read = () => {
    state.demand.zone = $("zone").value;
    state.demand.region = $("region").value;
    state.demand.projectName = $("project-name").value;
    const ordinance = numberOr($("ordinance").value, 1);
    state.demand.ordinance = ordinance > 0 ? ordinance : 0.05;
    state.demand.areaPerStall = numberOr($("area-per-stall").value, 33);
    state.demand.plannedFloors = Math.max(1, Math.round(numberOr($("planned-floors").value, 1)));
    emit();
  };
  ["zone", "region", "project-name", "ordinance", "area-per-stall", "planned-floors"].forEach((id) => {
    $(id).addEventListener("input", read);
    $(id).addEventListener("change", read);
  });
  $("use-form").addEventListener("change", (event) => {
    const useId = event.target.dataset.use;
    if (!useId) return;
    state.demand.active[useId] = event.target.checked;
    document.querySelector(`[data-fields="${useId}"]`).innerHTML = "";
    syncUseFields();
    emit();
  });
  $("use-form").addEventListener("input", (event) => {
    const areaId = event.target.dataset.area;
    if (areaId) state.demand.areas[areaId] = numberOr(event.target.value, 0);
    const bandUse = event.target.dataset.band;
    if (bandUse) {
      const band = state.demand.bands[bandUse][Number(event.target.dataset.index)];
      band[event.target.dataset.key] = numberOr(event.target.value, 0);
    }
    if (areaId || bandUse) emit();
  });
  $("use-form").addEventListener("click", (event) => {
    const add = event.target.dataset.add;
    if (!add) return;
    state.demand.bands[add].push({ count: 0, area: 84 });
    document.querySelector(`[data-fields="${add}"]`).innerHTML = "";
    syncUseFields();
    emit();
  });
}

function syncUseFields() {
  uses.forEach((use) => {
    const box = document.querySelector(`[data-fields="${use.id}"]`);
    if (!state.demand.active[use.id] || box.childElementCount) return;
    if (use.kind === "housing") {
      box.innerHTML = state.demand.bands[use.id].map((band, index) => `
        <div class="split">
          <label>세대수 <input data-band="${use.id}" data-index="${index}" data-key="count" type="number" min="0" step="1" value="${band.count}" /></label>
          <label>전용면적 <input data-band="${use.id}" data-index="${index}" data-key="area" type="number" min="0" step="1" value="${band.area}" /></label>
        </div>
      `).join("") + `<button type="button" class="ghost tiny" data-add="${use.id}">구간 추가</button>`;
    } else {
      box.innerHTML = `<label>시설면적 (㎡) <input data-area="${use.id}" type="number" min="0" step="1" value="${state.demand.areas[use.id] || 0}" /></label>`;
    }
  });
}

function renderDemand(info) {
  const demand = info.demand;
  const body = demand.rows.map((row) => `<tr><td>${row.use}</td><td>${row.basis}</td><td>${row.input}</td><td>${row.stalls}</td></tr>`).join("");
  $("demand-table").innerHTML = `<thead><tr><th>용도</th><th>산정 기준</th><th>입력값</th><th>대수</th></tr></thead><tbody>${body}</tbody>`;
  const recommend = `${demand.recommended.width.toFixed(0)}×${demand.recommended.depth.toFixed(0)}m`;
  const placed = info.placed;
  const byPlaced = placed ? Math.max(1, Math.ceil(demand.legalStalls / placed)) : demand.neededFloors;
  $("demand-note").textContent = `법정 필요 ${demand.legalStalls}대 · 실제 배치 ${state.plate ? placed : "—"}대 · 배치 기준 지하 ${state.plate && placed ? byPlaced : "—"}층 · 추천 평면 ${recommend}. 확인 ${demand.checkedOn}.`;
}

function floorPicker(count) {
  if (!count) return "";
  const buttons = [`<button type="button" data-floor="all" class="${state.floorView === "all" ? "on" : ""}">전체</button>`];
  for (let level = 0; level < count; level += 1) {
    buttons.push(`<button type="button" data-floor="${level}" class="${state.floorView === level ? "on" : ""}">B${level + 1}</button>`);
  }
  return buttons.join("");
}

function sheetFloor() {
  return state.floorView === "all" ? 0 : state.floorView;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function setIfIdle(input, value) {
  if (document.activeElement === input) return;
  input.value = String(Math.round(value * 10) / 10);
}

function formatMeters(value) {
  return `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}m`;
}

function formatArea(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}㎡`;
}

function statList(rows, strongIndex = -1) {
  return rows
    .map(([label, value], index) => `<div class="${index === strongIndex ? "strong" : ""}"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function floorStack(count) {
  if (!count) return "";
  const shown = Math.min(count, 8);
  const chips = ['<span class="grade">지상</span>'];
  for (let level = 1; level <= shown; level += 1) chips.push(`<span>지하 ${level}층</span>`);
  if (count > shown) chips.push(`<span>… 지하 ${count}층까지</span>`);
  return chips.join("");
}
