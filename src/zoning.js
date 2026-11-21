// 용도지역·필지·주변 매스 조회 (업로드에 원본이 없어 API 맞춤 최소 구현).
// 브이월드 연동·주소 검색 전체 로직은 원본 zoning.js가 필요합니다.

export const MAX_FEATURES = 1000;

const VWORLD_KEY = "E5B6187B-4BAD-3EE8-9692-55E91044EB82"; // 공개 예시 키 자리; 원본 키와 다를 수 있음
const SERVICE_DOMAIN = "https://dlrldbs0517-cpu.github.io";

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

export async function lookupZoning(address) {
  // 원본은 브이월드 지오코더 + 용도지역 WFS. 키가 맞는 환경에서만 동작합니다.
  const q = encodeURIComponent(String(address || "").trim());
  if (!q) throw new Error("주소가 비어 있습니다");
  const url = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${q}&refine=true&simple=false&format=json&type=road&key=${VWORLD_KEY}&domain=${encodeURIComponent(SERVICE_DOMAIN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const point = data?.response?.result?.point;
  const text = data?.response?.refined?.text || address;
  if (!point) {
    return { address: text, zones: [], limits: {}, notFound: true, point: null };
  }
  return {
    address: text,
    point: { x: Number(point.x), y: Number(point.y) },
    zones: [],
    limits: {},
    notFound: false,
    note: "용도지역 상세는 원본 zoning.js가 필요합니다(좌표만 해석됨).",
  };
}

export async function parcelAt(x, y) {
  return null;
}

export async function roadAccess(site) {
  if (!site) return null;
  return { sides: [], main: null, edges: [] };
}

export async function surroundingsBox(bbox) {
  return {
    bbox,
    center: {
      x: ((bbox.minX ?? bbox[0]) + (bbox.maxX ?? bbox[2])) / 2,
      y: ((bbox.minY ?? bbox[1]) + (bbox.maxY ?? bbox[3])) / 2,
    },
    parcels: [],
    buildings: [],
    roads: [],
  };
}
