// 장애인전용·확장형·친환경차 구획 배정 (업로드에 원본이 없어 API 맞춤 최소 구현).
// 전체 베이 재분할 로직은 원본 stallTypes.js가 필요합니다.

const STALL_W = 2.5;
const DISABLED_W = 3.3;

function ceilRate(total, rate) {
  if (!rate || total <= 0) return 0;
  return Math.max(1, Math.ceil(total * rate));
}

/**
 * 조건(stallRules) → 목표 칸 수.
 * placedStalls(한 층 배치 수)가 있으면 그걸 분모로 비율을 잡는다.
 * (법정 대수 300 × 30% = 90을 층당 75칸과 비교하던 "75/300" 오류 방지)
 * placed가 없을 때만 legalStalls로 추정한다.
 */
export function stallRuleTargets(rules = {}) {
  rules = rules || {};
  const legalDeclared = Math.max(0, Number(rules.legalStalls) || 0);
  const placed = Math.max(0, Number(rules.placedStalls) || 0);
  const base = placed > 0 ? placed : legalDeclared;
  const disabledOn = rules.disabled !== false && base >= 10;
  const disabledRate = disabledOn ? Math.min(0.04, Math.max(0.02, Number(rules.disabledRate) || 0.02)) : 0;
  const disabled = disabledOn ? ceilRate(base, disabledRate) : 0;

  const extendedRate = base >= 50 ? 0.3 : 0;
  const extended = extendedRate ? Math.ceil(base * extendedRate) : 0;

  let ecoRate = 0;
  if (rules.ecoMode === "on") ecoRate = Math.min(0.2, Math.max(0.01, Number(rules.ecoRate) || 0.05));
  else if (rules.ecoMode === "off") ecoRate = 0;
  else if (rules.ecoAuto || (rules.ecoMode === "auto" && base >= 50)) {
    ecoRate = Math.min(0.2, Math.max(0.01, Number(rules.ecoRate) || 0.05));
  }
  const eco = ecoRate && base >= 50 ? ceilRate(base, ecoRate) : 0;

  return {
    disabled,
    extended,
    eco,
    disabledRate,
    extendedRate,
    ecoRate,
    legalStalls: legalDeclared || base,
    baseStalls: base,
  };
}

function emptyCounts() {
  return { general: 0, disabled: 0, extended: 0, eco: 0, parallel: 0, total: 0 };
}

/** 칸 목록을 세어 목표와 비교 */
export function tallyStallTypes(stalls = [], targets = stallRuleTargets()) {
  const counts = emptyCounts();
  for (const stall of stalls) {
    const type = stall.type || (stall.parallel ? "parallel" : "general");
    if (counts[type] == null) counts[type] = 0;
    counts[type] += 1;
    counts.total += 1;
  }
  const shortages = [];
  const need = (have, want, label) => {
    if (want > have) shortages.push(`${label} ${have}/${want}`);
  };
  need(counts.disabled || 0, targets.disabled || 0, "장애인전용");
  need(counts.extended || 0, targets.extended || 0, "확장형");
  need(counts.eco || 0, targets.eco || 0, "친환경차");
  return { counts, targets, shortages };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** 동 코어(kind !== "stair")만. 없으면 전체 코어. */
function buildingCoreEntries(cores = [], blockRects = []) {
  const building = cores
    .map((c, index) => ({ core: c, index }))
    .filter((e) => (e.core.kind || "building") !== "stair");
  const use = building.length ? building : cores.map((c, index) => ({ core: c, index }));
  return use.map((e) => {
    const block = e.core.buildingId != null
      ? blockRects.find((b) => b.buildingId === e.core.buildingId)
      : null;
    const anchor = block || e.core;
    return {
      index: e.index,
      x: anchor.x + anchor.w / 2,
      y: anchor.y + anchor.d / 2,
    };
  });
}

/**
 * 일반형으로 채워진 칸에 유형을 붙인다.
 * 동 코어가 2개 이상이고 장애인 목표가 동 수 이상이면 먼저 동마다 1대씩 배분.
 */
export function assignStallTypes(stalls = [], typeRules = stallRuleTargets(), opts = {}) {
  const targets = typeRules || stallRuleTargets();
  const list = stalls.map((s) => ({ ...s, type: s.type || (s.parallel ? "parallel" : "general") }));
  const anchors = buildingCoreEntries(opts.cores || [], (opts.plate && opts.plate.blockRects) || opts.blockRects || []);
  const scored = list
    .map((stall, index) => {
      const sx = stall.x + stall.w / 2;
      const sy = stall.y + stall.d / 2;
      let near = index;
      let nearCore = 0;
      if (anchors.length) {
        let best = Infinity;
        anchors.forEach((a) => {
          const d = dist2(sx, sy, a.x, a.y);
          if (d < best) {
            best = d;
            near = d;
            nearCore = a.index;
          }
        });
      }
      return { index, near, nearCore, stall };
    })
    .sort((a, b) => a.near - b.near);

  let disabledLeft = targets.disabled || 0;
  let ecoLeft = targets.eco || 0;
  let extendedLeft = targets.extended || 0;
  const used = new Set();

  const markDisabled = (item, { skipReach = false } = {}) => {
    const stall = list[item.index];
    if (stall.parallel || stall.type === "parallel") return false;
    if (!skipReach && opts.reach && !opts.reach(stall)) return false;
    if (stall.w + 0.01 < STALL_W) return false;
    stall.type = "disabled";
    // 폭을 3.3m로 키우면 옆 칸·기둥과 겹칠 수 있어, 여유가 있을 때만 넓힌다.
    if (stall.w + 0.01 >= DISABLED_W) stall.w = Math.max(stall.w, DISABLED_W);
    stall.nearCore = item.nearCore;
    used.add(item.index);
    return true;
  };

  // 동별 최소 1대(목표 ≥ 동 코어 수일 때): 각 동 코어에 가장 가까운 후보부터.
  // 동 아래 막기로 차로가 잘린 뒤 reach가 엄격하면 동별 1대가 빠질 수 있어, 1차 배분은 reach를 건너뛴다.
  const blocks = (opts.plate && opts.plate.blockRects) || opts.blockRects || [];
  const overlapsBlock = (stall) => blocks.some((b) => {
    const ox = Math.min(stall.x + stall.w, b.x + b.w) - Math.max(stall.x, b.x);
    const oy = Math.min(stall.y + stall.d, b.y + b.d) - Math.max(stall.y, b.y);
    return ox > 0.05 && oy > 0.05;
  });
  if (anchors.length >= 2 && disabledLeft >= anchors.length) {
    for (const anchor of anchors) {
      if (disabledLeft <= 0) break;
      const ranked = scored
        .filter((item) => !used.has(item.index) && !overlapsBlock(list[item.index]))
        .map((item) => {
          const stall = list[item.index];
          const sx = stall.x + stall.w / 2;
          const sy = stall.y + stall.d / 2;
          return { item, dist: dist2(sx, sy, anchor.x, anchor.y) };
        })
        .sort((a, b) => a.dist - b.dist);
      for (const { item } of ranked) {
        if (markDisabled({ ...item, nearCore: anchor.index }, { skipReach: true })) {
          disabledLeft -= 1;
          break;
        }
      }
    }
  }

  for (const item of scored) {
    if (used.has(item.index)) continue;
    const stall = list[item.index];
    if (stall.parallel || stall.type === "parallel") continue;
    if (opts.reach && !opts.reach(stall)) continue;

    if (disabledLeft > 0 && stall.w + 0.01 >= STALL_W) {
      stall.type = "disabled";
      if (stall.w + 0.01 >= DISABLED_W) stall.w = Math.max(stall.w, DISABLED_W);
      stall.nearCore = item.nearCore;
      disabledLeft -= 1;
      continue;
    }
    if (ecoLeft > 0) {
      stall.type = "eco";
      ecoLeft -= 1;
      continue;
    }
    if (extendedLeft > 0) {
      stall.type = "extended";
      // 확장형도 겹침을 만들지 않도록 이미 2.6 이상일 때만 표시용으로 유지
      if (stall.w + 0.01 >= 2.6) stall.w = Math.max(stall.w, 2.6);
      extendedLeft -= 1;
    }
  }

  const tally = tallyStallTypes(list, targets);
  return { stalls: list, counts: tally.counts, targets: tally.targets, shortages: tally.shortages };
}
