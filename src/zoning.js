// 용도지역·필지·주변 매스 조회 (브이월드).
// 키는 github.io 도메인으로 등록되어 있어, 실행 위치와 무관하게 그 domain을 보냄(CORS 회피: JSONP).

export const MAX_FEATURES = 1000;

const VWORLD_KEY = "E5B6187B-4BAD-3EE8-9692-55E91044EB82";
const SERVICE_DOMAIN = "https://dlrldbs0517-cpu.github.io";

/** 국토계획법 시행령 제84·85조 상한(조례로 더 낮을 수 있음). */
const ZONE_LIMITS = {
  "제1종전용주거지역": { bcr: 50, far: 100 },
  "제2종전용주거지역": { bcr: 50, far: 150 },
  "제1종일반주거지역": { bcr: 60, far: 200 },
  "제2종일반주거지역": { bcr: 60, far: 250 },
  "제3종일반주거지역": { bcr: 50, far: 300 },
  "준주거지역": { bcr: 70, far: 500 },
  "중심상업지역": { bcr: 90, far: 1500 },
  "일반상업지역": { bcr: 80, far: 1300 },
  "근린상업지역": { bcr: 70, far: 900 },
  "유통상업지역": { bcr: 80, far: 1100 },
  "전용공업지역": { bcr: 70, far: 300 },
  "일반공업지역": { bcr: 70, far: 350 },
  "준공업지역": { bcr: 70, far: 400 },
  "보전녹지지역": { bcr: 20, far: 80 },
  "생산녹지지역": { bcr: 20, far: 100 },
  "자연녹지지역": { bcr: 20, far: 100 },
  "보전관리지역": { bcr: 20, far: 80 },
  "생산관리지역": { bcr: 20, far: 80 },
  "계획관리지역": { bcr: 40, far: 100 },
  "농림지역": { bcr: 20, far: 80 },
  "자연환경보전지역": { bcr: 20, far: 80 },
};

const ZONE_LAYERS = ["LT_C_UQ111", "LT_C_UQ112", "LT_C_UQ113", "LT_C_UQ114"];

function serviceDomain() {
  return SERVICE_DOMAIN;
}

function jsonp(url, timeoutMs = 16000) {
  return new Promise((resolve, reject) => {
    const cb = `_vworld_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    let settled = false;
    const script = document.createElement("script");
    script.referrerPolicy = "no-referrer";
    const timer = window.setTimeout(() => finish(new Error("응답 시간 초과")), timeoutMs);
    function finish(err, data) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (err) reject(err);
      else resolve(data);
    }
    window[cb] = (data) => finish(null, data);
    script.onerror = () => finish(new Error("네트워크 연결 실패"));
    const join = url.includes("?") ? "&" : "?";
    script.src = `${url}${join}callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function vworldGet(url) {
  // 브라우저: JSONP(CORS 회피). Node/테스트: fetch.
  if (typeof document !== "undefined") {
    try {
      return await jsonp(url);
    } catch (err) {
      // JSONP 실패 시 fetch 한 번 더(일부 환경)
      try { return await fetchJson(url); } catch (_) { throw err; }
    }
  }
  return fetchJson(url);
}

export function WMTS(layer = "Base") {
  const map = layer === "Satellite" ? "Satellite" : "Base";
  return `https://xdworld.vworld.kr/2d/${map}/service/{z}/{x}/{y}.png`;
}

export function boxAround(x, y, half = 200) {
  return { minX: x - half, minY: y - half, maxX: x + half, maxY: y + half };
}

export function boxSize(bbox) {
  if (!bbox) return { w: 0, d: 0 };
  return {
    w: Math.max(0, (bbox.maxX ?? bbox[2]) - (bbox.minX ?? bbox[0])),
    d: Math.max(0, (bbox.maxY ?? bbox[3]) - (bbox.minY ?? bbox[1])),
  };
}

export function storyHeight(props = {}) {
  const use = String(props.bdtyp_nm || props.mainPurpsCdNm || "");
  if (/주택|아파트|다세대|연립|기숙/.test(use)) return 3.0;
  if (/근린|문화|집회|판매|의료|교육|연구|업무|숙박/.test(use)) return 4.0;
  return 3.3;
}

export function buildingHeight(props = {}) {
  const h = Number(props.height || props.hei || 0);
  if (h > 0) return h;
  const floors = Number(props.grnd_flr || props.floor || 0);
  return floors > 0 ? floors * storyHeight(props) : storyHeight(props);
}

export function heightEstimated(props = {}) {
  const h = Number(props.height || props.hei || 0);
  return !(h > 0) && Number(props.grnd_flr || props.floor || 0) > 0;
}

export function isRoadParcel(props = {}) {
  const jibun = String(props.jibun || props.addr || props.lndcgrCodeNm || "");
  return /도$/.test(jibun.trim()) || String(props.lndcgrCodeNm || "") === "도로";
}

export function outerRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates[0] || []];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((poly) => poly[0] || []).filter((r) => r.length);
  }
  return [];
}

export function lineParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

export function localizer(originX, originY) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((originY * Math.PI) / 180);
  return ([x, y]) => [(x - originX) * mPerDegLon, (y - originY) * mPerDegLat];
}

export function realRoads(roadParcels = [], buildings = []) {
  const buildingPts = buildings.flatMap((f) => {
    const rings = outerRings(f.geometry);
    return rings.map((ring) => {
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    });
  });
  return roadParcels.filter((f) => {
    const rings = outerRings(f.geometry);
    return !rings.some((ring) => {
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return buildingPts.some((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
    });
  });
}

/** 서울/광역시 등 주소 문자열로 주차장법 지역 키 추정 */
export function regionFromAddress(address = "") {
  const a = String(address);
  if (/서울/.test(a)) return "seoul";
  if (/과밀|성남|수원|고양|용인|창원|부산|대구|인천|광주|대전|울산/.test(a)) return "overcrowded";
  if (/특별시|광역시/.test(a)) return "metro";
  return "other";
}

function normalizeZoneName(name) {
  return String(name || "").replace(/\s+/g, "");
}

function limitsFor(name) {
  const key = normalizeZoneName(name);
  if (ZONE_LIMITS[key]) return ZONE_LIMITS[key];
  const hit = Object.entries(ZONE_LIMITS).find(([k]) => key.includes(k) || k.includes(key));
  return hit ? hit[1] : null;
}

async function geocodeAddress(address) {
  const q = encodeURIComponent(String(address || "").trim());
  const domain = encodeURIComponent(serviceDomain());
  const tries = ["road", "parcel"];
  let last = null;
  for (const type of tries) {
    const url = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${q}&refine=true&simple=false&format=json&type=${type}&key=${VWORLD_KEY}&domain=${domain}`;
    try {
      const data = await vworldGet(url);
      last = data;
      const status = data?.response?.status;
      const point = data?.response?.result?.point;
      if (status === "OK" && point) {
        return {
          address: data?.response?.refined?.text || address,
          point: { x: Number(point.x), y: Number(point.y) },
        };
      }
    } catch (err) {
      last = err;
    }
  }
  if (last && last.response) {
    const msg = last.response?.error?.text || last.response?.status || "주소를 찾지 못했습니다";
    const error = new Error(msg);
    error.notFound = true;
    throw error;
  }
  throw last instanceof Error ? last : new Error("주소 조회에 실패했습니다");
}

async function zonesAtPoint(x, y) {
  const domain = encodeURIComponent(serviceDomain());
  const geom = encodeURIComponent(`POINT(${x} ${y})`);
  const names = [];
  for (const layer of ZONE_LAYERS) {
    const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${layer}&key=${VWORLD_KEY}&domain=${domain}&size=20&page=1&geometry=false&attribute=true&crs=EPSG:4326&geomFilter=${geom}`;
    try {
      const data = await vworldGet(url);
      const features = data?.response?.result?.featureCollection?.features
        || data?.response?.result?.featureCollection?.feature
        || [];
      const list = Array.isArray(features) ? features : [features];
      list.forEach((f) => {
        const props = f?.properties || f?.attribute || {};
        const uname = props.uname || props.UNAME || props.zonename || props.zone_nm;
        if (uname && !names.includes(uname)) names.push(uname);
      });
    } catch (_) {
      // 레이어별 실패는 무시하고 다음 레이어
    }
  }
  return names;
}

export async function lookupZoning(address) {
  const text = String(address || "").trim();
  if (!text) throw new Error("주소가 비어 있습니다");

  try {
    const geo = await geocodeAddress(text);
    const zones = await zonesAtPoint(geo.point.x, geo.point.y);
    const limits = {};
    zones.forEach((z) => {
      const lim = limitsFor(z);
      if (lim) limits[z] = lim;
    });
    return {
      address: geo.address,
      point: geo.point,
      zones,
      limits,
      notFound: false,
      offline: false,
    };
  } catch (err) {
    // 네트워크/키 문제 시에도 지역 추정은 가능하게
    if (err && err.notFound) {
      return { address: text, zones: [], limits: {}, notFound: true, point: null };
    }
    const region = regionFromAddress(text);
    const soft = new Error(
      `${err && err.message ? err.message : "조회 실패"}. 브이월드에 연결하지 못해 주소로 지역만 추정했습니다. 상세 입력에서 용도지역을 직접 고르세요.`,
    );
    soft.offline = true;
    soft.fallback = {
      address: text,
      point: null,
      zones: [],
      limits: {},
      notFound: false,
      offline: true,
      region,
      note: soft.message,
    };
    throw soft;
  }
}

export async function parcelAt(x, y) {
  if (x == null || y == null) return null;
  const domain = encodeURIComponent(serviceDomain());
  const geom = encodeURIComponent(`POINT(${x} ${y})`);
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&domain=${domain}&size=5&page=1&geometry=true&attribute=true&crs=EPSG:4326&geomFilter=${geom}`;
  try {
    const data = await vworldGet(url);
    const features = data?.response?.result?.featureCollection?.features || [];
    const f = features[0];
    if (!f) return null;
    const props = f.properties || {};
    const area = Number(props.area || props.larea || props.pnucnt || 0);
    return {
      address: props.addr || props.jibun || props.pnu || "",
      jimok: props.jimok || props.lndcgrCodeNm || "",
      area: area > 0 ? area : null,
      geometry: f.geometry || null,
      props,
    };
  } catch (_) {
    return null;
  }
}

export async function surroundingsBox() {
  return null;
}

export async function roadAccess(site) {
  if (!site) return null;
  return null;
}
