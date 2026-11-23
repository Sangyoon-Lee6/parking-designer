import { CLEAR_HEIGHT, SLAB_T, clearHeightOf, requiredClearHeight, minStraightRampLength, rampPositionCheck, rampShape, rampTransitions, recommendCoreCells, stallsPerBay } from "./layout.js?v=270";
import { housingAreaDivisor, uses, zoneFactors, zoneUseStatus } from "./parkingRules.js?v=270";
import { drawThumb, mountPlan } from "./plan.js?v=270";
import { stallRuleTargets } from "./stallTypes.js?v=270";
import { downloadBlob, drawSheet, printSheet, sheetSvg } from "./sheet.js?v=270";
import { eumLandUrl, lookupZoning, lookupZoningAt, parcelAt, regionFromAddress, roadAccess } from "./zoning.js?v=270";
import { bindContextDialog, closeContext, openContext, openSitePicker, updatePickerMarker } from "./context.js?v=270";
import { addBuilding, addCore, addStairCore, applyVariant, autoPlaceCore, buildingOfCore, coreLabel, currentStallRules, demandResult, emit, generatePlate, loadReference, optimizeLayout, parseSpans, placeOverlapExample, placeSplitExample, readyFor3d, issueGroups, rampFallback, removeBuilding, removeSelection, selectCore, selectItem, selectedOpening, selectedRamp, setReveal, setSiteType, setStep, setTool, state, subscribe, summary, syncPlateMeta, updateBuilding, updateCore, updateCoreArea, updateEntranceWidth, updateRampSize, updateSiteMargins, plateFromState } from "./state.js?v=270";

const $ = (id) => document.getElementById(id);
const edgeName = { s: "남", n: "북", w: "서", e: "동" };
let wizardSlide = 1;
let wizardAnimating = false;
const WIZARD_MAX = 7;
const WIZARD_LABELS = {
  1: "주소를 입력한 뒤 다음으로 진행하세요.",
  2: "용도와 건물 형태를 고른 뒤 다음으로 진행하세요.",
  3: "주차장 크기·기둥 간격·층고를 정하세요.",
  4: "도로가 접한 변과 대지 이격을 고르세요.",
  5: "램프를 배치하고 왼쪽 평면에서 위치를 조정하세요.",
  6: "코어를 배치하고 왼쪽 평면에서 위치를 조정하세요.",
  7: "추천 후보 3안을 비교해 고르세요.",
};

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
$("wall-columns").addEventListener("change", () => {
  state.wallColumns = $("wall-columns").value;
  render();
});
$("min-clear").addEventListener("input", () => {
  state.minClear = numberOr($("min-clear").value, state.minClear);
  render();
});
$("no-ground-access").addEventListener("change", () => {
  state.noGroundAccess = $("no-ground-access").checked;
  render();
});
$("floor-height").addEventListener("input", () => {
  state.floorHeight = numberOr($("floor-height").value, state.floorHeight);
  render();
});
$("spans-x").addEventListener("input", () => {
  state.spansX = $("spans-x").value;
  render();
});
$("spans-y").addEventListener("input", () => {
  state.spansY = $("spans-y").value;
  render();
});
$("trim-dead").addEventListener("change", () => {
  state.trimDeadEnds = $("trim-dead").checked;
  render();
});
$("stall-types").addEventListener("change", () => {
  state.stallRules = { ...state.stallRules, disabled: $("stall-types").checked };
  render();
});
$("disabled-rate").addEventListener("change", () => {
  state.stallRules = { ...state.stallRules, disabledRate: Number($("disabled-rate").value) };
  render();
});
$("parallel-fill").addEventListener("change", () => {
  state.stallRules = { ...state.stallRules, parallel: $("parallel-fill").checked };
  render();
});
$("eco-mode").addEventListener("change", () => {
  state.stallRules = { ...state.stallRules, ecoMode: $("eco-mode").value };
  render();
});
$("eco-rate").addEventListener("change", () => {
  const pct = Math.min(20, Math.max(1, Number($("eco-rate").value) || 5));
  $("eco-rate").value = pct;
  state.stallRules = { ...state.stallRules, ecoRate: pct / 100 };
  render();
});
function bindMarginInput(id, key) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    if (key) {
      const v = el.value.trim();
      updateSiteMargins(null, { [key]: v === "" ? null : Math.max(0, numberOr(v, 0)) });
    } else {
      updateSiteMargins(numberOr(el.value, state.siteMargin));
    }
  });
}
bindMarginInput("site-margin", null);
bindMarginInput("site-margin-step4", null);
["n", "s", "e", "w"].forEach((k) => {
  bindMarginInput(`margin-${k}`, k);
  bindMarginInput(`margin-${k}-step4`, k);
});
$("open-margin-dialog")?.addEventListener("click", () => $("margin-dialog").showModal());
$("close-margin-dialog")?.addEventListener("click", () => { $("margin-dialog").close(); render(); });
$("road-edge").addEventListener("change", () => {
  state.roadEdge = $("road-edge").value;
  if (state.plate) {
    state.plate = { ...state.plate, roadEdge: state.roadEdge };
    generatePlate();
  } else {
    render();
  }
});
$("ramp-pos").addEventListener("change", () => {
  state.rampPos = $("ramp-pos").value;
  if (state.plate) {
    state.plate = { ...state.plate, rampPos: state.rampPos };
    generatePlate();
  } else {
    render();
  }
});

// 도로 변에 따라 램프 위치 이름을 바꾼다: 남·북 변 → 왼쪽/가운데/오른쪽, 서·동 변 → 아래쪽/가운데/위쪽
function rampPosOptions(edge) {
  const horizontal = edge === "n" || edge === "s";
  return [
    ["auto", "자동"],
    ["start", horizontal ? "왼쪽" : "아래쪽"],
    ["mid", "가운데"],
    ["end", horizontal ? "오른쪽" : "위쪽"],
  ];
}

// 위치마다 램프가 들어가는지 미리 확인해 선택칸·칩에 "(불가)"처럼 표시한다.
let rampCheckKey = "";
let rampCheck = {};
function renderRampPos() {
  const select = $("ramp-pos");
  const chips = $("ramp-pos-choice");
  if (!select) return;
  const plate = plateFromState();
  const key = [state.roadEdge, plate.width, plate.depth, plate.spacing, state.floorHeight, state.rampPlacement, plate.legalStalls].join("|");
  if (key !== rampCheckKey) {
    rampCheckKey = key;
    try { rampCheck = rampPositionCheck(plate, state.rampPlacement, state.floorHeight); } catch (error) { rampCheck = {}; }
    const opts = rampPosOptions(state.roadEdge);
    select.innerHTML = opts.map(([value, label]) => {
      const why = rampCheck[value];
      return `<option value="${value}">${label}${why ? ` (불가: ${why})` : ""}</option>`;
    }).join("");
    if (chips) {
      chips.innerHTML = opts.map(([value, label]) => {
        const why = rampCheck[value];
        const blocked = Boolean(why);
        return `<button type="button" data-value="${value}"${blocked ? ` title="불가: ${why}"` : ""}>${label}${blocked ? " ·불가" : ""}</button>`;
      }).join("");
      chips.querySelectorAll("button[data-value]").forEach((button) => {
        button.addEventListener("click", () => {
          select.value = button.dataset.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    }
  }
  if (document.activeElement !== select) select.value = state.rampPos;
  if (chips) {
    chips.querySelectorAll("button[data-value]").forEach((button) => {
      button.classList.toggle("on", button.dataset.value === state.rampPos);
    });
  }
  const why = rampCheck[state.rampPos];
  const allBlocked = state.rampPlacement === "internal" && ["start", "mid", "end"].every((pos) => rampCheck[pos]);
  const fb = allBlocked ? rampFallback(plate) : null;
  $("ramp-pos-note").textContent = allBlocked
    ? (fb
      ? `도로변 어디에도 내부 램프가 들어가지 않습니다(${why}). 평면을 만들면 옆 변의 도로 쪽 끝에 램프를 둡니다.`
      : `도로변 어디에도 내부 램프가 들어가지 않습니다(${why}). 외부 램프를 고르거나 평면 크기를 바꾸세요.`)
    : why
      ? `이 크기에서는 이 위치에 램프가 들어가지 않습니다(${why}). 자동이나 다른 위치를 고르세요.`
      : "";
}
$("ramp-form").addEventListener("change", () => {
  state.rampForm = $("ramp-form").value;
  state.ramps = (state.ramps || []).map((r) => ({ ...r, form: state.rampForm }));
  if (state.plate) {
    state.plate = { ...state.plate, rampForm: state.rampForm, lowerRampForm: state.lowerRampForm };
    generatePlate();
  }
  emit();
});
$("lower-ramp-form").addEventListener("change", () => {
  state.lowerRampForm = $("lower-ramp-form").value;
  if (state.plate) {
    state.plate = { ...state.plate, lowerRampForm: state.lowerRampForm };
    generatePlate();
  }
  emit();
});
$("lower-ramp-mode").addEventListener("change", () => {
  state.lowerRampMode = $("lower-ramp-mode").value;
  if (state.plate) {
    state.plate = { ...state.plate, lowerRampMode: state.lowerRampMode, lowerRampForm: state.lowerRampForm };
    generatePlate();
  }
  emit();
});
$("ramp-placement").addEventListener("change", () => {
  state.rampPlacement = $("ramp-placement").value;
  if (state.plate) {
    state.plate = { ...state.plate, rampPlacement: state.rampPlacement };
    generatePlate();
  } else {
    render();
  }
});
$("entrance-mode").addEventListener("change", () => {
  state.entranceMode = $("entrance-mode").value;
  render();
});
$("circulation").addEventListener("change", () => {
  state.circulation = $("circulation").value;
  render();
});
// 무거운 계산(배치안 여러 개 생성) 동안 "만드는 중" 표시. 화면이 먼저 그려지도록 한 프레임 쉰 뒤 계산한다.
let busyNow = false;
function busy(label, work) {
  if (busyNow) return;
  busyNow = true;
  const overlay = $("busy");
  $("busy-text").textContent = label;
  overlay.hidden = false;
  document.body.classList.add("is-busy");
  requestAnimationFrame(() => setTimeout(() => {
    try {
      work();
    } finally {
      overlay.hidden = true;
      document.body.classList.remove("is-busy");
      busyNow = false;
    }
  }, 30));
}

$("load-reference").addEventListener("click", () => {
  busy("기준 사례 불러오는 중…", () => {
    loadReference();
    setWizard(5, { silent: true });
  });
});

$("generate").addEventListener("click", () => {
  if (!inputsValid()) return;
  busy("평면 만드는 중… (배치안 여러 개를 비교해요)", () => {
    generatePlate();
    setWizard(5, { silent: true });
  });
});

function wizardStepFromSlide(slide) {
  if (slide <= 4) return 1;
  if (slide <= 6) return 2;
  return 3; // 결과 슬라이드(7): 평면·3D·평면도 탭
}

function canLeaveWizard(slide) {
  if (slide === 3 && !inputsValid()) {
    $("input-error").hidden = false;
    return false;
  }
  return true;
}

function setWizard(next, { silent = false } = {}) {
  next = Math.max(1, Math.min(WIZARD_MAX, Number(next) || 1));
  if (wizardAnimating) return;
  if (next === wizardSlide && !silent) {
    render();
    return;
  }
  if (next > wizardSlide && !canLeaveWizard(wizardSlide)) return;

  const enter = () => {
    const prev = wizardSlide;
    const curEl = document.querySelector(`.slide[data-slide="${prev}"]`);
    const nextEl = document.querySelector(`.slide[data-slide="${next}"]`);
    if (!nextEl) return;
    if (next === 7 && state.resultTab !== "sheet" && state.resultTab !== "model") {
      state.resultTab = "plan";
    }
    if (next === 7 && state.resultTab === "model" && !sceneMount) {
      state.resultTab = "plan";
    }
    // 결과 단계 진입: 램프·코어 배치를 고정한 채 최적 주차 배치를 다시 찾는다
    if (next === 7 && state.plate) {
      busy("최적 주차 배치를 다시 찾는 중…", () => {
        syncPlateMeta();
        optimizeLayout();
      });
    }
    wizardAnimating = true;
    nextEl.hidden = false;
    if (curEl && prev !== next) {
      curEl.classList.add("leaving");
      curEl.classList.remove("on");
    }
    requestAnimationFrame(() => {
      nextEl.classList.add("on");
    });
    window.setTimeout(() => {
      if (curEl && prev !== next) {
        curEl.classList.remove("leaving", "on");
        curEl.hidden = true;
      }
      wizardSlide = next;
      state.step = wizardStepFromSlide(next);
      wizardAnimating = false;
      document.body.dataset.wizard = String(next);
      render();
      if (next >= 5) {
        requestAnimationFrame(() => { const fit = $("fit"); if (fit) fit.click(); });
      }
    }, 360);
  };

  if (next >= 5 && !state.plate) {
    if (!inputsValid()) {
      setWizard(3, { silent: true });
      return;
    }
    busy("평면 만드는 중… (배치안 여러 개를 비교해요)", () => {
      generatePlate();
      enter();
    });
    return;
  }
  enter();
}

$("wizard-next").addEventListener("click", () => {
  if (wizardSlide >= WIZARD_MAX) {
    if (readyFor3d()) open3d();
    return;
  }
  setWizard(wizardSlide + 1);
});
$("wizard-back").addEventListener("click", () => setWizard(wizardSlide - 1));
document.querySelectorAll("#wizard-steps li").forEach((item) => {
  item.addEventListener("click", () => {
    const slide = Number(item.dataset.slide);
    if (slide < wizardSlide || (slide <= wizardSlide + 1) || (slide <= 4) || state.plate) {
      setWizard(slide);
    }
  });
});
if ($("plan-expand-hit")) $("plan-expand-hit").addEventListener("click", () => setWizard(Math.max(5, wizardSlide)));
if ($("collapse-plan")) $("collapse-plan").addEventListener("click", () => setWizard(Math.min(4, wizardSlide)));

document.querySelectorAll(".choice[data-for]").forEach((group) => {
  const select = $(group.dataset.for);
  if (!select) return;
  group.querySelectorAll("button[data-value]").forEach((button) => {
    button.addEventListener("click", () => {
      if (select.disabled) return;
      select.value = button.dataset.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncChoiceGroup(group, select.value);
    });
  });
});

$("size-presets")?.querySelectorAll("button[data-w]").forEach((button) => {
  button.addEventListener("click", () => {
    state.parkWidth = Number(button.dataset.w);
    state.parkDepth = Number(button.dataset.d);
    render();
  });
});

$("floor-height-choice")?.querySelectorAll("button[data-value]").forEach((button) => {
  button.addEventListener("click", () => {
    state.floorHeight = Number(button.dataset.value);
    render();
  });
});

$("site-type-choice")?.querySelectorAll("button[data-value]").forEach((button) => {
  button.addEventListener("click", () => {
    const radio = document.querySelector(`input[name="site-type"][value="${button.dataset.value}"]`);
    if (!radio) return;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

document.querySelectorAll("#tools button").forEach((button) => {
  // 입구·출구 추가는 켜고 끄는 버튼. 끄면 기본(끌어 옮기기) 상태로 돌아간다.
  button.addEventListener("click", () => setTool(state.tool === button.dataset.tool ? "core" : button.dataset.tool));
});

fields.coreArea.addEventListener("change", () => updateCoreArea(Number(fields.coreArea.value)));
$("core-nx").addEventListener("change", () => updateCore({ nx: Number($("core-nx").value), ny: Number($("core-ny").value) }));
$("core-ny").addEventListener("change", () => updateCore({ nx: Number($("core-nx").value), ny: Number($("core-ny").value) }));
$("open-core-dialog").addEventListener("click", () => $("core-dialog").showModal());
$("auto-core").addEventListener("click", () => busy("코어 자리 찾는 중…", autoPlaceCore));
$("close-core-dialog").addEventListener("click", () => $("core-dialog").close());
fields.coreW.addEventListener("change", () => updateCore({ w: Number(fields.coreW.value) }));
fields.coreD.addEventListener("change", () => updateCore({ d: Number(fields.coreD.value) }));
fields.coreX.addEventListener("change", () => updateCore({ x: Number(fields.coreX.value) }));
fields.coreY.addEventListener("change", () => updateCore({ y: Number(fields.coreY.value) }));
fields.entranceWidth.addEventListener("change", () => updateEntranceWidth(Number(fields.entranceWidth.value)));
fields.rampWidth.addEventListener("change", () => updateRampSize({ width: Number(fields.rampWidth.value) }));
$("open-ramp-dialog").addEventListener("click", () => $("ramp-dialog").showModal());
$("close-ramp-dialog").addEventListener("click", () => $("ramp-dialog").close());
$("ramp-auto").addEventListener("click", () => {
  const auto = autoRampLength();
  updateRampSize({ length: auto, width: autoRampWidth() });
});
// 램프 길이는 층고로 자동 고정(읽기 전용)

$("place-split").addEventListener("click", placeSplitExample);
$("place-overlap").addEventListener("click", placeOverlapExample);
$("add-core").addEventListener("click", addCore);
$("add-stair").addEventListener("click", () => addStairCore());
$("add-building").addEventListener("click", addBuilding);
document.querySelectorAll('input[name="site-type"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    setSiteType(radio.value);
    const apt = document.querySelector('[data-fields="apartment"]');
    if (apt) apt.innerHTML = "";
    syncUseFields();
  });
});
$("building-rows").addEventListener("change", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const id = Number(row.dataset.id);
  const key = event.target.dataset.key;
  if (!key) return;
  if (key === "blockUnder") updateBuilding(id, { blockUnder: event.target.checked });
  else if (key === "name") updateBuilding(id, { name: event.target.value });
  else if (key === "floors") updateBuilding(id, { floors: Number(event.target.value) });
  else if (key === "towerW") updateBuilding(id, { tower: { w: Number(event.target.value) } });
  else if (key === "towerD") updateBuilding(id, { tower: { d: Number(event.target.value) } });
});
$("building-rows").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-remove]");
  if (!btn) return;
  removeBuilding(Number(btn.dataset.remove));
});
["building-floors", "building-tower-w", "building-tower-d", "building-block-under"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", () => {
    const building = buildingOfCore(state.core);
    if (!building) return;
    if (id === "building-floors") updateBuilding(building.id, { floors: Number(el.value) });
    else if (id === "building-tower-w") updateBuilding(building.id, { tower: { w: Number(el.value) } });
    else if (id === "building-tower-d") updateBuilding(building.id, { tower: { d: Number(el.value) } });
    else if (id === "building-block-under") updateBuilding(building.id, { blockUnder: el.checked });
  });
});
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
$("back-plan").addEventListener("click", () => { state.resultTab = "plan"; setWizard(6); });
$("tab-model").addEventListener("click", () => {
  state.resultTab = "model";
  if (wizardSlide !== 7) setWizard(7);
  open3d();
});
$("tab-sheet").addEventListener("click", () => {
  state.resultTab = "sheet";
  const show = () => {
    state.resultTab = "sheet";
    state.step = 3;
    emit();
    requestAnimationFrame(() => {
      const info = summary();
      const canvas = $("sheet");
      if (canvas && state.plate) {
        drawSheet(canvas, state, { ...info, checkedOn: info.demand.checkedOn }, sheetFloor());
      }
    });
  };
  if (wizardSlide !== 7) {
    setWizard(7);
    window.setTimeout(show, 420);
  } else {
    show();
  }
});
if ($("tab-plan")) {
  $("tab-plan").addEventListener("click", () => {
    state.resultTab = "plan";
    state.step = 2;
    emit();
  });
}
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
// 주변 매스는 조건 단계에서만 오른쪽에 띄운다. 평면·결과로 넘어가면 닫는다.
subscribe(() => { if (wizardSlide > 4 && !$("context-view").hidden) closeContext(); });
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
    sceneMount = import("./scene.js?v=270")
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
    state.resultTab = "model";
    state.step = 3;
    if (wizardSlide !== 7) {
      wizardSlide = 7;
      document.body.dataset.wizard = "7";
      document.querySelectorAll(".slide").forEach((slide) => {
        const on = Number(slide.dataset.slide) === 7;
        slide.hidden = !on;
        slide.classList.toggle("on", on);
      });
    }
    emit();
  } catch (error) {
    $("step2-error").hidden = false;
    $("step2-error").textContent = "3D 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.";
  }
}

function syncChoiceGroup(group, value) {
  group.querySelectorAll("button[data-value]").forEach((button) => {
    button.classList.toggle("on", button.dataset.value === String(value));
  });
}

function syncChoiceButtons() {
  document.querySelectorAll(".choice[data-for]").forEach((group) => {
    const select = $(group.dataset.for);
    if (!select) return;
    syncChoiceGroup(group, select.value);
    group.querySelectorAll("button[data-value]").forEach((button) => {
      button.disabled = select.disabled;
    });
  });
  const sizeGroup = $("size-presets");
  if (sizeGroup) {
    sizeGroup.querySelectorAll("button[data-w]").forEach((button) => {
      const on = Number(button.dataset.w) === Number(state.parkWidth)
        && Number(button.dataset.d) === Number(state.parkDepth);
      button.classList.toggle("on", on);
    });
  }
  const floorGroup = $("floor-height-choice");
  if (floorGroup) {
    const fh = Number(state.floorHeight);
    floorGroup.querySelectorAll("button[data-value]").forEach((button) => {
      button.classList.toggle("on", Math.abs(Number(button.dataset.value) - fh) < 1e-6);
    });
  }
  const siteGroup = $("site-type-choice");
  if (siteGroup) syncChoiceGroup(siteGroup, state.siteType);
}

function rankTopRecommendations(variants, limit = 3) {
  const priorities = [
    "동선 연결·충돌 없음 (배치 유효성)",
    "주차대수 최대",
    "1대당 면적 효율 (작을수록 유리)",
    "차로 비율·배치 균형",
  ];
  const scored = variants.map((variant, index) => {
    const m = variant.metrics || {};
    const reasons = [];
    let total = 0;
    if (m.valid) {
      total += 100000;
      reasons.push("동선·법규 통과");
    } else {
      reasons.push(`탈락 요인 있음${m.rejected ? ` (${m.rejected})` : ""}`);
    }
    total += (m.stalls || 0) * 120;
    reasons.push(`주차 ${m.stalls || 0}대`);
    const aps = Number(m.areaPerStall) || 99;
    // 1대당 면적이 크면(비효율·조각 배치) 강하게 감점
    total += Math.max(-8000, (48 - aps) * 80);
    reasons.push(`1대당 ${Number(aps).toFixed(1)}㎡`);
    if (aps > 60) reasons.push("면적 효율 낮음");
    const aisle = Number(m.aisleRatio) || 0;
    total += Math.max(0, 40 - aisle * 40);
    if (m.connected) total += 25;
    if ((m.deadEnds || 0) > 3) total -= (m.deadEnds - 3) * 40;
    if (variant.recommended) {
      total += 15;
      reasons.push("엔진 추천안");
    }
    if (variant.maxStalls) reasons.push("최대 주차칸");
    return { index, variant, total, reasons, priorities };
  });
  scored.sort((a, b) => b.total - a.total || a.index - b.index);
  return { priorities, picks: scored.slice(0, limit) };
}

function renderRecommendations() {
  const list = $("recommend-list");
  const legend = $("priority-legend");
  if (!list || !legend) return;
  if (wizardSlide !== 7 || !state.variants.length) {
    list.innerHTML = "";
    legend.innerHTML = "";
    return;
  }
  const { priorities, picks } = rankTopRecommendations(state.variants, 3);
  legend.innerHTML = `<strong>선정 우선순위</strong><ol>${priorities.map((p) => `<li>${p}</li>`).join("")}</ol>`;
  list.innerHTML = "";
  picks.forEach((pick, rank) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `recommend-card${pick.index === state.variantIndex ? " on" : ""}`;
    const canvas = document.createElement("canvas");
    const m = pick.variant.metrics;
    const title = pick.variant.recommended ? `${pick.variant.id} · 엔진 추천` : pick.variant.id;
    button.innerHTML = `<div></div><div><h3><span class="rank">${rank + 1}</span>${title}</h3><p>${pick.variant.name}<br>${m.stalls}대 · ${m.areaPerStall.toFixed(1)}㎡/대 · ${m.connected ? "연결" : "끊김"} · 충돌 ${m.columnHits}</p><p class="why">${pick.reasons.slice(0, 3).join(" · ")}</p></div>`;
    button.children[0].replaceWith(canvas);
    button.addEventListener("click", () => {
      applyVariant(pick.index);
      state.resultTab = "plan";
      state.step = 2;
      emit();
    });
    list.appendChild(button);
    drawThumb(canvas, pick.variant);
  });
}

function render() {
  const step = wizardStepFromSlide(wizardSlide);
  state.step = step;
  document.body.dataset.wizard = String(wizardSlide);
  document.body.classList.toggle("plan-expanded", wizardSlide >= 5);
  document.body.classList.toggle("step-result", step === 3);
  document.querySelectorAll("#wizard-steps li").forEach((item) => {
    const value = Number(item.dataset.slide);
    item.classList.toggle("on", value === wizardSlide);
    item.classList.toggle("done", value < wizardSlide);
  });
  const back = $("wizard-back");
  const next = $("wizard-next");
  if (back) back.disabled = wizardSlide <= 1 || wizardAnimating;
  if (next) {
    next.textContent = wizardSlide >= WIZARD_MAX ? (readyFor3d() ? "3D 보기" : "완료") : "다음";
    next.disabled = wizardAnimating;
  }
  document.querySelectorAll("#steps li").forEach((item) => {
    const value = Number(item.dataset.step);
    item.classList.toggle("on", value === step);
    item.classList.toggle("done", value < step);
  });
  const showSheet = step === 3 && state.resultTab === "sheet";
  const showModel = step === 3 && state.resultTab === "model";
  $("plan-view").hidden = showSheet || showModel;
  $("scene-view").hidden = !showModel;
  $("sheet-view").hidden = !showSheet;
  $("sheet-tools").hidden = !showSheet;
  $("reset-camera").hidden = showSheet || !showModel;
  if ($("tab-plan")) $("tab-plan").classList.toggle("on", !showSheet && !showModel);
  if ($("tab-model")) $("tab-model").classList.toggle("on", showModel);
  if ($("tab-sheet")) $("tab-sheet").classList.toggle("on", showSheet);

  const valid = inputsValid();
  $("generate").disabled = !valid;
  $("input-error").hidden = valid;
  if (!valid) {
    const sx = parseSpans(state.spansX).error;
    const sy = parseSpans(state.spansY).error;
    $("input-error").textContent = !floorHeightOk()
      ? `층고 ${state.floorHeight}m는 사용할 수 없습니다. 유효높이(층고 − 슬래브 ${SLAB_T}m)가 차로 기준 ${needClear()}m 이상이 되도록 ${(needClear() + SLAB_T).toFixed(2)}–6m로 입력하세요.`
      : sx ? `기둥 간격 가로: ${sx}. 쉼표로 구분한 3–15m 숫자로 입력하세요.`
      : sy ? `기둥 간격 세로: ${sy}. 쉼표로 구분한 3–15m 숫자로 입력하세요.`
        : "가로·세로는 18–300m, 기둥 간격은 5–12m로 입력하세요.";
  }
  $("spans-x").classList.toggle("bad", Boolean(parseSpans(state.spansX).error));
  $("floor-height").classList.toggle("bad", !floorHeightOk());
  {
    const clear = clearHeightOf(Number(state.floorHeight) || 0);
    const need = needClear();
    const okText = clear >= need - 1e-9 ? "✓" : `✗ ${need}m 미만`;
    const tr = rampTransitions({ legalStalls: currentStallRules().legalStalls });
    const ease = [tr.top ? `윗부분 ${tr.top}m` : "", tr.bottom ? `아랫부분 ${tr.bottom}m` : ""].filter(Boolean).join("·");
    const apt = Boolean(state.demand.active && state.demand.active.apartment);
    $("ground-access-row").hidden = !apt;
    if (document.activeElement !== $("no-ground-access")) $("no-ground-access").checked = state.noGroundAccess;
    $("clear-readout").textContent = `유효 ${clear.toFixed(2)}m ${clear >= need - 1e-9 ? "✓" : "✗"} (기준 ${need}m)`;
  }
  $("spans-y").classList.toggle("bad", Boolean(parseSpans(state.spansY).error));

  const area = (state.parkWidth > 0 ? state.parkWidth : 0) * (state.parkDepth > 0 ? state.parkDepth : 0);
  const bay = stallsPerBay(state.columnSpacing, state.columnWidth, state.minClear);
  const bayText = `구간당 ${bay.count}대`;
  $("plate-preview").innerHTML = statList([
    ["주차장 크기", `${formatMeters(state.parkWidth)} × ${formatMeters(state.parkDepth)}`],
    ["주차장 면적", formatArea(area)],
    ["기둥 중심 간격", formatMeters(state.columnSpacing)],
    ["구간당 주차", `${bay.count}대 · 이격 ${bay.gap.toFixed(2)}m`],
  ]);
  $("type-readout").textContent = typeReadout();
  {
    const spanText = (v) => (v && String(v).trim() ? String(v).trim() : "기본");
    $("demand-summary").textContent = `조례 배율 ${state.demand.ordinance} · 크기 추천: 1대당 ${state.demand.areaPerStall}㎡, 지하 ${state.demand.plannedFloors}층`;
    {
      const sx = spanText($("spans-x").value);
      const sy = spanText($("spans-y").value);
      const custom = $("spans-x").value.trim() || $("spans-y").value.trim() ? ` · 가로 ${sx} · 세로 ${sy}` : "";
      $("column-summary").textContent = `기둥 ${$("column-size").value}m · ${bayText}${Number($("min-clear").value) ? ` · 이격 ${$("min-clear").value}m` : ""}${custom}`;
    }
  }
  setIfIdle(fields.width, state.parkWidth);
  setIfIdle(fields.depth, state.parkDepth);
  setIfIdle(fields.spacing, state.columnSpacing);
  setIfIdle($("floor-height"), state.floorHeight);
  setIfIdle($("column-size"), state.columnWidth);
  if (document.activeElement !== $("min-clear")) $("min-clear").value = Number(state.minClear).toFixed(2);
  setIfIdle($("site-margin"), state.siteMargin);
  setIfIdle($("site-margin-step4"), state.siteMargin);
  {
    const sm = state.siteMargins || {};
    ["n", "s", "e", "w"].forEach((k) => {
      const a = $(`margin-${k}`);
      const b = $(`margin-${k}-step4`);
      const val = sm[k] == null ? "" : String(sm[k]);
      if (a && document.activeElement !== a) a.value = val;
      if (b && document.activeElement !== b) b.value = val;
    });
    const show = (k) => (sm[k] == null ? `${state.siteMargin}` : `${sm[k]}*`);
    if ($("setback-summary")) {
      $("setback-summary").textContent = `북 ${show("n")} · 남 ${show("s")} · 서 ${show("w")} · 동 ${show("e")} m${["n", "s", "e", "w"].some((k) => sm[k] != null) ? " (*방향별)" : ""}`;
    }
  }
  if (document.activeElement !== $("ramp-placement")) $("ramp-placement").value = state.rampPlacement;
  if (document.activeElement !== $("ramp-form")) $("ramp-form").value = state.rampForm || "auto";
  if ($("lower-ramp-form") && document.activeElement !== $("lower-ramp-form")) {
    $("lower-ramp-form").value = state.lowerRampForm || "auto";
  }
  if (document.activeElement !== $("lower-ramp-mode")) $("lower-ramp-mode").value = state.lowerRampMode || "alternate";
  if (document.activeElement !== $("road-edge")) $("road-edge").value = state.roadEdge;
  renderRampPos();
  if ($("site-margin-row")) $("site-margin-row").hidden = state.rampPlacement !== "external";
  {
    const sm = state.siteMargins || {};
    const show = (k) => (sm[k] == null ? `${state.siteMargin}` : `${sm[k]}*`);
    if ($("margin-summary")) {
      $("margin-summary").textContent = `북 ${show("n")} · 남 ${show("s")} · 서 ${show("w")} · 동 ${show("e")} m${["n", "s", "e", "w"].some((k) => sm[k] != null) ? " (*방향별)" : ""}`;
    }
  }
  if (state.rampPlacement !== "external") state.entranceMode = "integrated";
  $("entrance-mode").disabled = state.rampPlacement !== "external";
  if (document.activeElement !== $("entrance-mode")) $("entrance-mode").value = state.entranceMode;
  if (document.activeElement !== $("circulation")) $("circulation").value = state.circulation;
  if (document.activeElement !== $("project-name")) $("project-name").value = state.demand.projectName;
  syncChoiceButtons();

  const info = summary();
  renderDemand(info);
  const rows = [
    ["법정 필요 대수", `${info.required}대`],
    ["실제 배치 대수", `${info.placed}대`],
    ["필요 지하층", info.floors ? `${info.floors}층` : "—"],
    ["총 주차대수", `${info.totalStalls}대`],
    ["1대당 면적", info.placed ? formatArea(info.areaPerStall) : "—"],
    ...(isReference() ? [["예시 도면 유사도", state.metrics ? `${info.similarity}점` : "—"]] : []),
    ["차로 면적 비율", state.metrics ? `${Math.round(info.aisleRatio * 100)}%` : "—"],
    ["동선 연결", state.plate ? (info.connected ? "연결" : "끊김") : "—"],
  ];
  if (state.siteType === "complex" && info.buildingCount) {
    rows.splice(1, 0, ["단지 구성", `동 ${info.buildingCount}개 · 최고 ${info.maxBuildingFloors}층 · 계단 코어 ${info.stairCores}개`]);
  }
  renderBuildingList();
  document.querySelectorAll('input[name="site-type"]').forEach((radio) => {
    radio.checked = radio.value === state.siteType;
  });
  $("complex-hint").hidden = state.siteType !== "complex";
  $("building-list-wrap").hidden = state.siteType !== "complex";
  $("add-core").textContent = state.siteType === "complex" ? "동 추가" : "코어 추가";
  if (state.metrics && state.metrics.rampKind) {
    const ramp = state.ramps[0];
    const kind = state.metrics.rampKind;
    const formName = (f) => (f === "spiral" ? "외곽 회전" : f === "curve90" ? "90° 곡선" : f === "straight" ? "직선" : f === "same" ? "지상과 같음" : "자동");
    const formLabel = state.rampForm === "spiral" || kind === "spiral" ? "외곽 회전"
      : kind === "curved" ? "직선+곡선 90°"
        : "직선";
    rows.push(["지상→B1 램프", `${state.rampPlacement === "external" ? "외부" : "내부"} · ${formLabel} ${state.metrics.rampTotal || (ramp && ramp.length) || "—"}m`]);
    const lowerMode = state.lowerRampMode || "alternate";
    const lowerForm = state.lowerRampForm || "auto";
    rows.push(["지하2층↓ 형태", formName(lowerForm)]);
    rows.push(["지하 2층+ 경로", lowerMode === "same" ? "전 층 동일 XY" : (kind === "spiral" && lowerForm === "spiral" ? "같은 외곽 경로" : "반대쪽 변 층간 램프")]);
    if (kind === "straight" && Number.isFinite(state.metrics.rampLowerSlope)) {
      rows.push(["층간 본 경사", `${(state.metrics.rampLowerSlope * 100).toFixed(1)}% (도로변 3m 없음)`]);
    }
  }
  if (state.metrics && state.trimDeadEnds) {
    rows.push(["진입 불가 제외", `${state.metrics.unreachable || 0}칸`]);
    rows.push(["정리한 막다른 차로", `${state.metrics.trimmedAisles || 0}곳`]);
  }
  if (info.stallTypes && info.stallTargets && info.stallTypes.total) {
    const c = info.stallTypes;
    const t = info.stallTargets;
    const mark = (have, need) => (need ? `${have}/${need}${have >= need ? "" : " ⚠"}` : `${have}`);
    rows.push(["장애인전용", mark(c.disabled, t.disabled)]);
    if (t.extended) rows.push(["확장형 (30%)", mark(c.extended, t.extended)]);
    if (t.eco) rows.push([`친환경차 (${Math.round((t.ecoRate || 0.05) * 100)}%)`, mark(c.eco || 0, t.eco)]);
    if (c.parallel) rows.push(["평행주차 (자투리)", `${c.parallel}칸`]);
  }
  $("plan-stats").innerHTML = statList(rows, 3);
  $("scene-stats").innerHTML = statList(rows, 3);
  $("floor-stack").innerHTML = floorStack(info.floors);
  $("floor-picker").innerHTML = floorPicker(info.floors);
  if (showSheet) drawSheet($("sheet"), state, { ...info, checkedOn: info.demand.checkedOn }, sheetFloor());

  if (state.core && document.activeElement !== fields.coreArea) fields.coreArea.value = String(Math.round(state.core.w * state.core.d));
  if (state.core) {
    const rec = state.plate ? recommendCoreCells(state.plate) : null;
    const recText = rec ? ` · 추천 ${rec.nx}×${rec.ny}칸` : "";
    if (state.core.grid === false) {
      $("core-size-note").textContent = `직접 입력 ${state.core.w}×${state.core.d}m (${Math.round(state.core.w * state.core.d)}㎡) · 격자 맞춤 꺼짐${recText}`;
    } else {
      if (document.activeElement !== $("core-nx")) $("core-nx").value = String(state.core.nx || 1);
      if (document.activeElement !== $("core-ny")) $("core-ny").value = String(state.core.ny || 1);
      $("core-size-note").textContent = `${state.core.w}×${state.core.d}m (${Math.round(state.core.w * state.core.d)}㎡)${recText}`;
    }
    $("core-search-note").textContent = state.cores.length !== 1
      ? "코어가 여러 개면 자동 찾기를 하지 않습니다."
      : state.coreSearch
        ? `자동 탐색: 가운데 ${state.coreSearch.before}대 → ${state.coreSearch.after}대`
        : state.coreAuto ? "자동 탐색: 지금 자리가 가장 많음" : "직접 둔 자리";
    setIfIdle(fields.coreW, state.core.w);
    setIfIdle(fields.coreD, state.core.d);
    setIfIdle(fields.coreX, state.core.x);
    setIfIdle(fields.coreY, state.core.y);
  }
  const opening = selectedOpening();
  const ramp = selectedRamp();
  setIfIdle(fields.entranceWidth, opening ? opening.width : state.entranceWidth);
  setIfIdle(fields.rampWidth, ramp ? ramp.width : state.rampWidth);
  {
    const len = ramp ? ramp.length : state.rampLength;
    const wid = ramp ? ramp.width : state.rampWidth;
    const auto = autoRampLength();
    const custom = Math.abs(len - auto) > 0.05 || Math.abs(wid - autoRampWidth()) > 0.05;
    $("ramp-summary").textContent = `램프 폭 ${wid}m · 길이 ${len}m ${custom ? `(직접 입력 · 자동 ${autoRampWidth()}m · ${auto}m)` : `(층고 ${state.floorHeight}m 기준 자동)`}`;
  }
  setIfIdle(fields.rampLength, ramp ? ramp.length : state.rampLength);
  renderPicks();

  // 입구·출구를 따로 찍는 건 외부 램프 + 분리 출입구일 때만. 내부 램프·램프 일체형은 램프 입구가 곧 입출구다.
  const separateDoors = state.rampPlacement === "external" && state.entranceMode !== "integrated";
  if (!separateDoors && (state.tool === "entrance" || state.tool === "exit")) state.tool = "core";
  $("door-mode-row").hidden = state.rampPlacement !== "external";   // 내부 램프는 램프 입구가 곧 입출구
  $("tools").hidden = !separateDoors;
  document.querySelectorAll("#tools button").forEach((button) => {
    button.classList.toggle("on", button.dataset.tool === state.tool);
  });

  $("reference-notes").textContent = state.referenceNotes.join(" ");
  $("compare-dock").hidden = wizardSlide < 5 || wizardSlide > 6 || !state.variants.length;
  renderCompare();
  renderCorePick();

  // 불가능한 배치 → 빨간 상자에 원인(3D 막힘), 가능하지만 알릴 것 → 노란 상자(3D 가능)
  const { errors, warnings } = issueGroups();
  const listHtml = (items) => `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
  $("step2-error").hidden = errors.length === 0;
  $("step2-error").innerHTML = errors.length ? `<strong>3D를 만들 수 없습니다 — 원인</strong>${listHtml(errors)}` : "";
  $("step2-warn").hidden = warnings.length === 0;
  $("step2-warn").innerHTML = warnings.length ? `<strong>주의 (3D는 만들 수 있음)</strong>${listHtml(warnings)}` : "";
  // 같은 내용을 평면 위(오른쪽 아래)에도 띄워, 끌어 옮기는 중에 바로 보이게 한다.
  const alert = $("plan-alert");
  const boxes = [];
  if (errors.length) boxes.push(`<div class="issue-box error"><strong>3D 불가 — 원인</strong>${listHtml(errors)}</div>`);
  if (warnings.length) boxes.push(`<div class="issue-box warn"><strong>주의</strong>${listHtml(warnings)}</div>`);
  alert.hidden = wizardSlide < 5 || wizardSlide > 6 || !state.variants.length || boxes.length === 0;
  alert.innerHTML = boxes.join("");
  const ready = readyFor3d();
  $("to-3d").disabled = !ready;
  $("to-3d").title = ready ? "이 배치로 3D 모델을 만듭니다." : `3D 불가: ${errors.join(" / ")}`;
  $("show-conflicts").classList.toggle("on", state.debugColumns);

  const stageText = ["", "외곽 주차칸", "순환 차로", "내부 베이", "기둥", "코어 우회", "동선 화살표"];
  let statusText = WIZARD_LABELS[wizardSlide] || "";
  if (wizardSlide >= 5 && wizardSlide <= 6 && state.revealStage < 6) {
    statusText = `생성 과정: ${stageText[state.revealStage]}`;
  } else if (wizardSlide >= 5 && wizardSlide <= 6 && state.plate) {
    statusText = toolStatus();
  } else if (wizardSlide === 7) {
    statusText = info.floors
      ? `법정 ${info.required}대 · 층당 ${info.placed}대 → 지하 ${info.floors}층 규모`
      : WIZARD_LABELS[7];
  }
  $("status").textContent = statusText;
  renderRecommendations();
}

function renderCorePick() {
  const select = $("core-pick");
  const markup = state.cores.map((core, index) => {
    const name = coreLabel(core, index);
    return `<option value="${index}">${name} · ${core.w.toFixed(1)}×${core.d.toFixed(1)}m</option>`;
  }).join("");
  if (select.innerHTML !== markup) select.innerHTML = markup;
  if (state.cores.length) select.value = String(state.coreIndex);
  const building = buildingOfCore(state.core);
  const fields = $("building-core-fields");
  if (fields) {
    fields.hidden = !building;
    if (building) {
      setIfIdle($("building-floors"), building.floors);
      setIfIdle($("building-tower-w"), building.tower.w);
      setIfIdle($("building-tower-d"), building.tower.d);
      if (document.activeElement !== $("building-block-under")) $("building-block-under").checked = Boolean(building.blockUnder);
    }
  }
}

function renderBuildingList() {
  const body = $("building-rows");
  if (!body) return;
  const focus = document.activeElement;
  const focusKey = focus && focus.dataset && focus.closest("tr[data-id]")
    ? `${focus.closest("tr[data-id]").dataset.id}:${focus.dataset.key}`
    : null;
  body.innerHTML = state.buildings.map((b) => `
    <tr data-id="${b.id}">
      <td><input data-key="name" type="text" value="${escapeAttr(b.name)}" /></td>
      <td><input data-key="floors" type="number" min="1" step="1" value="${b.floors}" /></td>
      <td><input data-key="towerW" type="number" min="5" step="0.1" value="${b.tower.w}" /></td>
      <td><input data-key="towerD" type="number" min="5" step="0.1" value="${b.tower.d}" /></td>
      <td><input data-key="blockUnder" type="checkbox" ${b.blockUnder ? "checked" : ""} /></td>
      <td><button type="button" class="ghost tiny" data-remove="${b.id}" ${state.buildings.length <= 1 ? "disabled" : ""}>삭제</button></td>
    </tr>
  `).join("");
  if (focusKey) {
    const [id, key] = focusKey.split(":");
    const input = body.querySelector(`tr[data-id="${id}"] [data-key="${key}"]`);
    if (input) input.focus();
  }
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderCompare() {
  const dock = $("compare-dock");
  if (dock.hidden) return;
  const key = state.variants.map((variant) => `${variant.id}:${variant.metrics.stalls}:${variant.metrics.valid}:${variant.recommended}:${variant.maxStalls}`).join("|") + `#${state.variantIndex}#${isReference()}`;
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
    const tags = [
      variant.recommended ? '<span class="tag">추천</span>' : "",
      variant.maxStalls ? '<span class="tag max">최대 주차칸</span>' : "",
      variant.complex || variant.loopFirst ? '<span class="tag">단지형</span>' : "",
      variant.uniform ? '<span class="tag uniform">방향 통일</span>' : "",
      variant.coreSide ? '<span class="tag uniform">장애인 코어 인접</span>' : "",
      variant.coreRamp ? '<span class="tag uniform">코어 램프 인접</span>' : "",
    ].filter(Boolean).join(" ");
    const access = Array.isArray(metrics.coreAccess)
      ? ` · 동 접근 ${metrics.coreAccess.map((ok, i) => `${i + 1}${ok ? "✓" : "✗"}`).join(" ")}`
      : "";
    const links = metrics.links ? ` · 연결 ${metrics.links}` : "";
    button.innerHTML = `<p>${tags ? `${tags} ` : ""}${variant.id} ${variant.name}<br>${metrics.stalls}대 · ${metrics.areaPerStall.toFixed(1)}㎡/대${isReference() ? ` · 유사 ${metrics.similarity}` : ""}<br>${metrics.connected ? "연결" : "끊김"} · 충돌 ${metrics.columnHits} · 막다른 ${metrics.deadEnds}${access}${links}${metrics.valid ? "" : ` · 탈락 ${metrics.rejected}`}</p>`;
    button.prepend(canvas);
    button.addEventListener("click", () => applyVariant(index));
    dock.appendChild(button);
    drawThumb(canvas, variant);
  });
}

function renderPicks() {
  const list = $("opening-list");
  const items = [
    ...state.openings.filter((opening) => !opening.linkedRamp).map((opening) => ({
      type: "opening",
      id: opening.id,
      text: `${opening.kind === "in" ? "입구" : "출구"} · ${edgeName[opening.edge]}측 ${opening.t.toFixed(1)}m`,
    })),
    ...state.ramps.map((ramp, index) => ({
      type: "ramp",
      id: ramp.id,
      text: `램프 ${index + 1} · ${edgeName[ramp.edge]}측 ${ramp.t.toFixed(1)}m · 폭 ${ramp.width}m${state.openings.some((o) => o.linkedRamp === ramp.id) ? " · 출입구 겸용(양방향)" : ""}`,
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
  if (state.tool === "core" || state.tool === "pan" || state.tool === "ramp") return "코어·램프·출입구는 끌어 옮기고, 빈 곳을 끌면 화면 이동, 휠로 확대합니다.";
  if (state.tool === "entrance") return "외곽을 클릭해 입구를 추가하세요. 다 했으면 '입구 추가'를 다시 눌러 끄세요.";
  if (state.tool === "exit") return "외곽을 클릭해 출구를 추가하세요. 다 했으면 '출구 추가'를 다시 눌러 끄세요.";
  if (state.tool === "ramp") return "외곽을 클릭하면 램프를 그 자리로 옮깁니다(램프는 2차로 양방향 1개). 점선 차로를 따라 램프까지 회차할 수 있습니다.";
  return "드래그해서 화면을 이동하세요.";
}

function inputsValid() {
  return state.parkWidth >= 18 && state.parkWidth <= 300
    && state.parkDepth >= 18 && state.parkDepth <= 300
    && state.columnSpacing >= 5 && state.columnSpacing <= 12
    && !parseSpans(state.spansX).error && !parseSpans(state.spansY).error
    && floorHeightOk();
}

/** 유효높이(층고 − 슬래브)가 차로 기준 2.3m 이상이고, 층고가 6m 이하인지 */
function floorHeightOk() {
  const h = Number(state.floorHeight);
  return h > 0 && h <= 6 && clearHeightOf(h) >= needClear() - 1e-9;
}

// 차로 유효높이 기준: 공동주택 + 지상공원형이면 2.7m, 아니면 2.3m
function needClear() {
  return requiredClearHeight({ apartment: Boolean(state.demand.active && state.demand.active.apartment), noGroundAccess: state.noGroundAccess });
}

function showZoneCurrent() {
  const el = $("zone-current");
  if (!el) return;
  const zone = (zoneFactors[$("zone").value] || {}).label || "";
  const region = (housingAreaDivisor[$("region").value] || {}).label || "";
  const auto = !$("zone-auto").hidden ? " (주소로 자동)" : "";
  el.textContent = `용도지역 ${zone} · 지역 ${region}${auto}`;
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
  renderUseList();
  showZoneCurrent();
  const read = () => {
    const zoneChanged = state.demand.zone !== $("zone").value || state.demand.region !== $("region").value;
    state.demand.zone = $("zone").value;
    state.demand.region = $("region").value;
    if (zoneChanged) renderUseList();
    showZoneCurrent();
    state.demand.projectName = $("project-name").value;
    const ordinance = numberOr($("ordinance").value, 1);
    state.demand.ordinance = Math.min(1.5, Math.max(0.5, ordinance));
    $("ordinance").classList.toggle("bad", ordinance < 0.5 || ordinance > 1.5);
    state.demand.areaPerStall = numberOr($("area-per-stall").value, 33);
    state.demand.plannedFloors = Math.max(1, Math.round(numberOr($("planned-floors").value, 1)));
    emit();
  };
  // 주차대수 산정 고급 설정 창
  $("open-demand-dialog").addEventListener("click", () => $("demand-dialog").showModal());
  $("close-demand-dialog").addEventListener("click", () => { $("demand-dialog").close(); render(); });
  // 기둥 고급 설정 창
  $("open-column-dialog").addEventListener("click", () => $("column-dialog").showModal());
  $("open-disabled-dialog").addEventListener("click", () => $("disabled-dialog").showModal());
  $("close-disabled-dialog").addEventListener("click", () => { $("disabled-dialog").close(); render(); });
  $("close-column-dialog").addEventListener("click", () => { $("column-dialog").close(); render(); });
  // 크기 추천: 법정 대수 × 1대당 면적 ÷ 계획 지하층 수 → 기둥 간격 배수로 맞춘 가로·세로를 칸에 채움
  $("suggest-size").addEventListener("click", () => {
    const demand = demandResult();
    if (!demand.legalStalls) {
      $("suggest-note").textContent = "용도와 세대수(또는 시설면적)를 먼저 넣어 주세요.";
      return;
    }
    const rec = demand.recommended;
    state.parkWidth = rec.width;
    state.parkDepth = rec.depth;
    $("park-width").value = String(rec.width);
    $("park-depth").value = String(rec.depth);
    $("suggest-note").textContent = `→ ${rec.width}×${rec.depth}m (${demand.legalStalls}대 × ${demand.areaPerStall}㎡ ÷ ${demand.plannedFloors}층)`;
    emit();
  });
  // 주소 → 용도지역 조회(브이월드 + OSM 폴백). 지도 클릭으로도 채운다.
  const squash = (s) => String(s || "").replace(/\s+/g, "");
  const applyZoningResult = async (r, { openMap = true } = {}) => {
    const box = $("zone-result");
    box.hidden = false;
    state.demand.siteAddress = r.address;
    state.demand.siteZones = r.zones || [];
    if (r.point && Number.isFinite(r.point.x) && Number.isFinite(r.point.y)) {
      state.demand.sitePoint = { x: r.point.x, y: r.point.y };
    }
    if (r.address) $("site-address").value = r.address;
    const region = regionFromAddress(r.address);
    if (region) {
      $("region").value = region;
      $("region").disabled = true;
      $("zone-auto").hidden = false;
    }
    const eum = r.eumUrl || (r.point ? eumLandUrl(r.point.x, r.point.y) : eumLandUrl());
    const eumLine = `<p class="note"><a href="${eum}" target="_blank" rel="noopener">토지이음·부동산 열람에서 용도지역 확인</a></p>`;

    if (r.notFound) {
      box.className = "zone-result warn";
      box.innerHTML = `<p>주소를 찾지 못했습니다. «지도에서 찾기»로 위치를 고르거나 도로명·지번을 다시 넣어 보세요.</p>${eumLine}`;
      return;
    }

    let site = null;
    if (r.point) {
      try { site = await parcelAt(r.point.x, r.point.y); } catch (_) { site = null; }
    }
    let access = null;
    try { access = await roadAccess(site); } catch (_) { access = null; }
    if (access && access.main) {
      $("road-edge").value = access.main;
      $("road-edge").dispatchEvent(new Event("change"));
    }

    if (!r.zones.length) {
      box.className = "zone-result warn";
      $("zone").disabled = false;
      box.innerHTML = `<p>${r.address}</p><p>좌표는 찾았습니다. 용도지역 레이어를 아직 받지 못했습니다. 지도에서 줌인(15+)해 색을 확인하거나 «상세 입력»·토지이음에서 고르세요.</p>${eumLine}`
        + (r.point ? `<p class="cx-open"><button type="button" class="ghost tiny" data-cx="map">지도 열기</button></p>` : "");
      box.querySelectorAll("[data-cx]").forEach((b) => b.addEventListener("click", () => openContext(r.point, site, "map", r.address, access)));
      if (openMap && r.point) openContext(r.point, site, "map", r.address, access);
      read();
      return;
    }

    const lines = r.zones.map((z) => {
      const l = r.limits[z];
      return `<li><b>${z}</b>${l ? ` · 건폐율 ${l.bcr}% 이하 · 용적률 ${l.far}% 이하` : ""}</li>`;
    }).join("");
    const multi = r.zones.length > 1 ? "<p>필지가 둘 이상의 용도지역에 걸쳐 있을 수 있습니다.</p>" : "";
    const fmt = (v) => Math.round(v).toLocaleString("ko-KR");
    const lim = r.limits[r.zones[0]];
    const areaLine = site && site.area
      ? `<p>필지 ${site.address || ""}${site.jimok ? ` · ${site.jimok}` : ""} · <b>대지면적 ${fmt(site.area)}㎡</b>${lim ? ` → 건축면적 상한 약 ${fmt(site.area * lim.bcr / 100)}㎡ · 연면적 상한 약 ${fmt(site.area * lim.far / 100)}㎡` : ""}</p>`
      : "";
    const accessLine = access && access.sides && access.sides.length
      ? `<p>도로 접면: ${access.sides.map((sd) => `<b>${sd.label}</b> 약 ${sd.len}m`).join(" · ")}</p>`
      : "";
    const src = r.source === "nominatim" || r.source === "photon"
      ? "OpenStreetMap"
      : r.source === "map" ? "지도 선택" : "브이월드";
    box.className = "zone-result";
    box.innerHTML = `<p>${r.address} <span class="hint">(${src})</span></p><ul>${lines}</ul>${multi}${areaLine}${accessLine}`
      + `<p class="note">건폐율·용적률은 국토계획법 시행령 상한입니다. 실제 값은 시·군 조례로 더 낮을 수 있습니다.</p>${eumLine}`
      + `<p class="cx-open">주변 보기 <button type="button" class="ghost tiny" data-cx="map">지도</button> <button type="button" class="ghost tiny" data-cx="2d">2D</button> <button type="button" class="ghost tiny" data-cx="3d">3D</button></p>`;
    box.querySelectorAll("[data-cx]").forEach((b) => b.addEventListener("click", () => openContext(r.point, site, b.dataset.cx, r.address, access)));
    if (openMap && r.point) openContext(r.point, site, "map", r.address, access);

    const hit = Object.entries(zoneFactors).find(([, z]) => r.zones.some((name) => squash(name) === squash(z.label)));
    if (hit) $("zone").value = hit[0];
    if (region) $("region").value = region;
    $("zone").disabled = Boolean(hit);
    $("region").disabled = Boolean(region);
    $("zone-auto").hidden = !(hit || region);
    read();
  };

  const lookup = async () => {
    const address = $("site-address").value.trim();
    const box = $("zone-result");
    if (!address) {
      box.hidden = false;
      box.className = "zone-result warn";
      box.innerHTML = `주소를 넣거나 <button type="button" class="ghost tiny" id="zone-open-map-hint">지도에서 찾기</button>를 누르세요.`;
      $("zone-open-map-hint")?.addEventListener("click", () => $("map-pick").click());
      return;
    }
    box.hidden = false;
    box.className = "zone-result";
    box.textContent = "조회 중…";
    $("zone-lookup").disabled = true;
    try {
      const r = await lookupZoning(address);
      await applyZoningResult(r);
    } catch (e) {
      box.className = "zone-result warn";
      const fallback = e && e.fallback;
      if (fallback) {
        state.demand.siteAddress = fallback.address;
        const region = fallback.region || regionFromAddress(fallback.address);
        if (region) {
          $("region").value = region;
          $("region").disabled = true;
          $("zone-auto").hidden = false;
        }
        $("zone").disabled = false;
        const eum = fallback.eumUrl || eumLandUrl();
        box.innerHTML = `<p>${fallback.address}</p><p>${e.message}</p>`
          + `<p class="note">«지도에서 찾기»로 위치를 고르거나 <a href="${eum}" target="_blank" rel="noopener">토지이음</a>·상세 입력에서 용도지역을 고르세요.</p>`;
        read();
      } else {
        box.textContent = `조회 실패: ${e && e.message ? e.message : e}. «지도에서 찾기» 또는 상세 입력을 이용해 주세요.`;
      }
    } finally {
      $("zone-lookup").disabled = false;
    }
  };
  $("zone-lookup").addEventListener("click", lookup);
  $("map-pick").addEventListener("click", () => {
    const box = $("zone-result");
    box.hidden = false;
    box.className = "zone-result";
    box.textContent = "지도에서 대지를 클릭하세요. 휠로 확대하면 용도지역 색이 보입니다.";
    const known = state.demand?.sitePoint || null;
    openSitePicker(known, async (pt) => {
      box.textContent = "선택한 위치 조회 중…";
      updatePickerMarker(pt, "선택 중…");
      try {
        const r = await lookupZoningAt(pt.x, pt.y);
        state.demand.sitePoint = r.point;
        updatePickerMarker(r.point, r.zones[0] || r.address);
        await applyZoningResult(r, { openMap: false });
      } catch (e) {
        box.className = "zone-result warn";
        box.textContent = `지도 조회 실패: ${e && e.message ? e.message : e}`;
      }
    });
  });
  bindContextDialog();
  // 용도지역·지역 선택칸은 '상세 입력'을 열어야 보인다. 평소에는 현재 값만 한 줄로 보여 준다.
  $("open-zone-detail").addEventListener("click", () => {
    const box = $("zone-detail");
    box.hidden = !box.hidden;
    $("open-zone-detail").textContent = box.hidden ? "상세 입력" : "상세 입력 닫기";
  });
  $("zone-unlock").addEventListener("click", () => {
    $("zone").disabled = false;
    $("region").disabled = false;
    $("zone-auto").hidden = true;
    showZoneCurrent();
  });
  $("site-address").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); lookup(); } });
  ["zone", "region", "project-name", "ordinance", "area-per-stall", "planned-floors"].forEach((id) => {
    $(id).addEventListener("input", read);
    $(id).addEventListener("change", read);
  });
  $("use-form").addEventListener("change", (event) => {
    if (event.target.id !== "use-add" || !event.target.value) return;
    state.demand.active[event.target.value] = true;
    renderUseList();
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
    const del = event.target.dataset.del;
    if (del) {
      state.demand.active[del] = false;
      renderUseList();
      emit();
      return;
    }
    const bandDel = event.target.dataset.bandDel;
    if (bandDel) {
      // 첫 구간은 남긴다(용도 자체를 지우려면 위의 × 사용)
      const list = state.demand.bands[bandDel];
      const index = Number(event.target.dataset.index);
      if (list.length > 1 && index > 0) list.splice(index, 1);
      document.querySelector(`[data-fields="${bandDel}"]`).innerHTML = "";
      syncUseFields();
      emit();
      return;
    }
    const add = event.target.dataset.add;
    if (!add) return;
    state.demand.bands[add].push({ count: 0, area: 84 });
    document.querySelector(`[data-fields="${add}"]`).innerHTML = "";
    syncUseFields();
    emit();
  });
}

// 용도지역에 따라 고를 수 있는 용도만 보여 준다. 조례로만 가능한 용도는 "조례 확인" 표시, 불가 용도는 숨기고 한 줄로 알림.
function renderUseList() {
  const zone = state.demand.zone;
  const region = state.demand.region;
  const zoneLabel = (zoneFactors[zone] || {}).label || "";
  const shown = uses.filter((use) => zoneUseStatus(zone, use.id, region).s !== "no");
  const hidden = uses.filter((use) => zoneUseStatus(zone, use.id, region).s === "no");
  hidden.forEach((use) => { state.demand.active[use.id] = false; });
  const tag = (use) => {
    const st = zoneUseStatus(zone, use.id, region);
    const parts = [];
    if (st.s === "ord") parts.push(`<span class="zone-tag ord">조례 확인</span>`);
    if (st.seoul) parts.push(`<span class="zone-tag seoul">서울 조례</span>`);
    if (st.note) parts.push(`<span class="zone-note">${st.note}</span>`);
    return parts.join(" ");
  };
  const active = shown.filter((use) => state.demand.active[use.id]);
  const addable = shown.filter((use) => !state.demand.active[use.id]);
  const option = (use) => {
    const st = zoneUseStatus(zone, use.id, region);
    return `<option value="${use.id}">${use.label}${st.s === "ord" ? " (조례 확인)" : ""}</option>`;
  };
  // 용도는 드롭다운에서 골라 추가하고, 추가된 용도마다 입력 카드가 생긴다(× 로 삭제).
  $("use-form").innerHTML = `
    <label>용도
      <select id="use-add">
        <option value="">${active.length ? "+ 용도 추가" : "용도를 선택하세요"}</option>
        ${addable.map(option).join("")}
      </select>
    </label>`
    + active.map((use) => `
    <div class="use-card">
      <div class="use-head"><strong>${use.label}</strong> ${tag(use)}
        <button type="button" class="ghost tiny use-del" data-del="${use.id}" aria-label="${use.label} 삭제">×</button></div>
      <div class="use-fields" data-fields="${use.id}"></div>
    </div>`).join("")
    + (hidden.length ? `<p class="hint">${zoneLabel}에서 불가: ${hidden.map((use) => use.label).join(", ")} <span class="info" tabindex="0" title="${region === "seoul" ? "서울특별시 도시계획 조례 별표 4~10 반영(2026.7.13 시행본)." : "국토계획법 시행령 별표 4~10 개략. '조례 확인'은 해당 시·군 도시계획조례로 확인."} 도로 폭·면적 같은 세부 조건은 원문 확인.">ⓘ</span></p>` : "");
  syncUseFields();
}

function syncUseFields() {
  uses.forEach((use) => {
    const box = document.querySelector(`[data-fields="${use.id}"]`);
    if (!box || !state.demand.active[use.id] || box.childElementCount) return;
    if (use.kind === "housing") {
      const countLabel = state.siteType === "complex" && use.id === "apartment" ? "단지 전체 세대수" : "세대수";
      box.innerHTML = state.demand.bands[use.id].map((band, index) => `
        <div class="band-row">
          <label>${countLabel} <input data-band="${use.id}" data-index="${index}" data-key="count" type="number" min="0" step="1" value="${band.count}" /></label>
          <label>전용면적 <input data-band="${use.id}" data-index="${index}" data-key="area" type="number" min="0" step="1" value="${band.area}" /></label>
          ${index > 0 ? `<button type="button" class="ghost tiny band-del" data-band-del="${use.id}" data-index="${index}" aria-label="구간 ${index + 1} 삭제" title="이 구간 삭제">×</button>` : `<span class="band-del-space"></span>`}
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
  if (!input) return;
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


/** 구획 규칙이 이번 조건에 적용되는지 알려주는 안내문 */
function autoRampLength() {
  const legal = currentStallRules().legalStalls;
  return minStraightRampLength(state.floorHeight, rampTransitions({ legalStalls: legal }));
}

function autoRampWidth() {
  // 양방향 2차로: 직선만이면 6m, 내부 램프가 곡선으로 꺾이면 6.5m (주차장법 시행규칙 제6조①5 다목)
  const ramp = selectedRamp() || state.ramps[0];
  if (!ramp || !state.plate || ramp.placement === "external") return 6;
  return rampShape({ ...ramp, width: 6 }, state.plate).kind === "curved" ? 6.5 : 6;
}

// 예시 도면을 불러왔을 때만 "유사도"를 보여 준다(예시 도면과 비교한 점수라 직접 만든 평면에선 의미 없음).
function isReference() {
  return Boolean(state.referenceNotes && state.referenceNotes.length);
}

function typeReadout() {
  if (!$("stall-types").checked) return "일반형(2.5×5.0m)만 배치합니다.";
  const rules = currentStallRules();
  if (rules.legalStalls < 10) return "장애인 구획 의무 없음(10대 미만)";
  const t = stallRuleTargets(rules);
  const note = $("eco-note");
  if (note) note.textContent = `친환경자동차법 시행령 제18조의5·6: 총주차대수 50대 이상인 100세대 이상 아파트·공중이용시설(업무·판매·숙박·문화·의료·위락)은 신축 5% 이상(시·도 조례). 지금 조건: ${rules.ecoAuto ? `대상 (${rules.ecoBasis})` : rules.legalStalls < 50 ? "대상 아님 (50대 미만)" : "대상 아님 (아파트 100세대 미만·공중이용시설 없음)"}. 램프 도착 쪽에 모아 배치.`;
  const parts = [`장애인 ${Math.round(rules.disabledRate * 100)}%`];
  if (t.extendedRate) parts.push("확장형 30%");
  if (t.ecoRate) parts.push(`친환경차 ${Math.round(t.ecoRate * 100)}%`);
  return parts.join(" · ");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
