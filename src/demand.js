import {
  CHECKED_ON,
  defaultAreaPerStall,
  housingAreaDivisor,
  housingMinimumPerUnit,
  uses,
  zoneFactors,
} from "./parkingRules.js?v=82";

export function emptyDemand() {
  return {
    region: "seoul",
    zone: "general2",
    ordinance: 1,
    areaPerStall: defaultAreaPerStall,
    plannedFloors: 2,
    projectName: "주차장 개략 설계",
    active: { apartment: true },
    bands: {
      apartment: [{ count: 100, area: 84 }],
      multifamily: [{ count: 0, area: 59 }],
      officetel: [{ count: 0, area: 40 }],
    },
    areas: {
      detached: 0,
      neighborhood1: 0,
      neighborhood2: 0,
      office: 0,
      retail: 0,
      lodging: 0,
      culture: 0,
      medical: 0,
      amusement: 0,
      warehouse: 0,
      factory: 0,
    },
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function housingRaw(bands, region) {
  const rule = housingAreaDivisor[region] || housingAreaDivisor.seoul;
  let areaLe = 0;
  let areaGt = 0;
  let minimum = 0;
  let households = 0;
  for (const band of bands) {
    const count = Math.max(0, Number(band.count) || 0);
    const area = Math.max(0, Number(band.area) || 0);
    if (!count) continue;
    households += count;
    const sum = count * area;
    if (area <= 85) areaLe += sum;
    else areaGt += sum;
    minimum += count * (area <= 60 ? housingMinimumPerUnit.le60 : housingMinimumPerUnit.default);
  }
  const byArea = (rule.le85 ? areaLe / rule.le85 : 0) + (rule.gt85 ? areaGt / rule.gt85 : 0);
  return {
    households,
    raw: Math.max(byArea, minimum),
    basis: `${rule.label} · 85㎡ 이하 ${rule.le85}㎡당 1대, 초과 ${rule.gt85}㎡당 1대. 세대당 최소 ${housingMinimumPerUnit.default}대(60㎡ 이하 ${housingMinimumPerUnit.le60}대) 중 큰 값`,
    input: `${households}세대 · 전용 ${round1(areaLe + areaGt)}㎡`,
  };
}

function detachedRaw(area) {
  const value = Math.max(0, Number(area) || 0);
  let raw = 0;
  let basis = "50㎡ 이하: 면적/100. 50㎡ 초과 150㎡ 이하: 1대. 150㎡ 초과: 1+(면적-150)/100";
  if (value <= 50) raw = value / 100;
  else if (value <= 150) raw = 1;
  else raw = 1 + (value - 150) / 100;
  return { raw, basis, input: `시설면적 ${round1(value)}㎡` };
}

/** 별표 1 비고 6. 합이 1 미만이면 0, 아니면 0.5 이상은 올린다. */
export function roundFacility(raw) {
  const tenths = round1(raw);
  if (tenths < 1) return 0;
  const whole = Math.floor(tenths + 1e-9);
  const fraction = tenths - whole;
  return fraction >= 0.5 - 1e-9 ? whole + 1 : whole;
}

export function calculateDemand(demand, plate, spacing = 8) {
  const source = demand || emptyDemand();
  const zone = zoneFactors[source.zone] || zoneFactors.general2;
  const typed = Number(source.ordinance);
  const ordinance = Number.isFinite(typed) && typed > 0 ? typed : 0.05;
  const factor = ordinance * zone.factor;
  const rows = [];
  let households = 0;
  let housingSum = 0;
  let facilityRaw = 0;

  for (const use of uses) {
    if (!source.active?.[use.id]) continue;
    if (use.kind === "housing") {
      const result = housingRaw(source.bands?.[use.id] || [], source.region);
      const scaled = result.raw * factor;
      const stalls = scaled <= 0 ? 0 : Math.ceil(scaled - 1e-9);
      households += use.id === "officetel" ? 0 : result.households;
      housingSum += stalls;
      rows.push({
        use: use.label,
        basis: result.basis,
        input: result.input,
        stalls,
        article: use.article,
      });
    } else if (use.kind === "detached") {
      const result = detachedRaw(source.areas?.detached);
      const scaled = result.raw * factor;
      facilityRaw += scaled;
      rows.push({
        use: use.label,
        basis: result.basis,
        input: result.input,
        stalls: round1(scaled),
        article: use.article,
      });
    } else {
      const area = Math.max(0, Number(source.areas?.[use.id]) || 0);
      const raw = (area / use.per) * factor;
      facilityRaw += raw;
      rows.push({
        use: use.label,
        basis: `시설면적 ${use.per}㎡당 1대`,
        input: `시설면적 ${round1(area)}㎡`,
        stalls: round1(raw),
        article: use.article,
      });
    }
  }

  const facilityStalls = roundFacility(facilityRaw);

  const legalStalls = housingSum + facilityStalls;
  const areaPerStall = Math.max(1, Number(source.areaPerStall) || defaultAreaPerStall);
  const totalArea = legalStalls * areaPerStall;
  const plannedFloors = Math.max(1, Math.round(Number(source.plannedFloors) || 1));
  const floorArea = legalStalls ? totalArea / plannedFloors : 0;
  const actualArea = plate ? plate.width * plate.depth : 0;
  const neededFloors = actualArea > 0 && legalStalls ? Math.max(1, Math.ceil(totalArea / actualArea)) : plannedFloors;
  return {
    rows,
    legalStalls,
    households,
    areaPerStall,
    totalArea,
    plannedFloors,
    floorArea,
    recommended: recommendPlate(floorArea, spacing),
    actualArea,
    neededFloors,
    shortfall: actualArea > 0 && actualArea + 0.5 < floorArea,
    checkedOn: CHECKED_ON,
    zoneLabel: zone.label,
    factor,
  };
}

export function recommendPlate(floorArea, spacing) {
  const step = Math.max(4, Number(spacing) || 8);
  if (!floorArea) return { width: step * 4, depth: step * 3 };
  const long = Math.sqrt(floorArea * 1.2);
  const short = floorArea / long;
  const baysLong = Math.max(3, Math.ceil(long / step));
  const baysShort = Math.max(3, Math.ceil(short / step));
  return { width: baysLong * step, depth: baysShort * step };
}
