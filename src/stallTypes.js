// 장애인전용·확장형·친환경차 구획 배정 (업로드에 원본이 없어 API 맞춤 최소 구현).
// 전체 베이 재분할 로직은 원본 stallTypes.js가 필요합니다.

const STALL_W = 2.5;
const DISABLED_W = 3.3;

function ceilRate(total, rate) {
  if (!rate || total <= 0) return 0;
  return Math.max(1, Math.ceil(total * rate));
}

/** 조건(stallRules) → 목표 칸 수 */
export function stallRuleTargets(rules = {}) {
  const legal = Math.max(0, Number(rules.legalStalls) || 0);
  const disabledOn = Boolean(rules.disabled) && legal >= 10;
  const disabledRate = disabledOn ? Math.min(0.04, Math.max(0.02, Number(rules.disabledRate) || 0.02)) : 0;
  const disabled = disabledOn ? ceilRate(legal, disabledRate) : 0;

  const extendedRate = legal >= 50 ? 0.3 : 0;
  const extended = extendedRate ? Math.ceil(legal * extendedRate) : 0;

  let ecoRate = 0;
  if (rules.ecoMode === "on") ecoRate = Math.min(0.2, Math.max(0.01, Number(rules.ecoRate) || 0.05));
  else if (rules.ecoMode === "off") ecoRate = 0;
  else if (rules.ecoAuto) ecoRate = Math.min(0.2, Math.max(0.01, Number(rules.ecoRate) || 0.05));
  const eco = ecoRate && legal >= 50 ? ceilRate(legal, ecoRate) : 0;

  return {
    disabled,
    extended,
    eco,
    disabledRate,
    extendedRate,
    ecoRate,
    legalStalls: legal,
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

function coreCenters(cores = []) {
  return cores.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.d / 2 }));
}

/**
 * 일반형으로 채워진 칸에 유형을 붙인다.
 * 원본은 베이를 3.3m로 다시 나누지만, 여기선 코어에 가까운 칸부터 폭만 넓혀 표시한다.
 */
export function assignStallTypes(stalls = [], typeRules = stallRuleTargets(), opts = {}) {
  const targets = typeRules || stallRuleTargets();
  const list = stalls.map((s) => ({ ...s, type: s.type || (s.parallel ? "parallel" : "general") }));
  const centers = coreCenters(opts.cores || []);
  const scored = list
    .map((stall, index) => {
      const sx = stall.x + stall.w / 2;
      const sy = stall.y + stall.d / 2;
      const near = centers.length
        ? Math.min(...centers.map((c) => dist2(sx, sy, c.x, c.y)))
        : index;
      return { index, near, stall };
    })
    .sort((a, b) => a.near - b.near);

  let disabledLeft = targets.disabled || 0;
  let ecoLeft = targets.eco || 0;
  let extendedLeft = targets.extended || 0;

  for (const item of scored) {
    const stall = list[item.index];
    if (stall.parallel || stall.type === "parallel") continue;
    if (opts.reach && !opts.reach(stall)) continue;

    if (disabledLeft > 0 && stall.w + 0.01 >= STALL_W) {
      stall.type = "disabled";
      stall.w = Math.max(stall.w, DISABLED_W);
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
      stall.w = Math.max(stall.w, 2.6);
      extendedLeft -= 1;
    }
  }

  const tally = tallyStallTypes(list, targets);
  return { stalls: list, counts: tally.counts, targets: tally.targets, shortages: tally.shortages };
}
