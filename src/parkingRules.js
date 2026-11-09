/**
 * 법정 주차 산정표. 숫자만 고치면 계산식은 그대로다.
 * 확인 2026-11-08, 국가법령정보센터.
 * 주차장법 시행령 별표 1은 2026. 8. 25. 개정(대통령령 제36623호, 시행 2026. 8. 28.)이다.
 *
 * 공동주택: 주택건설기준 등에 관한 규정 제27조제1항제1호
 * (시행 2026. 11. 7., 대통령령 제36308호).
 * https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1026910127
 * 면적 비율표는 같은 조 본문 표. 찾기 쉬운 정리:
 * https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=2&cciNo=1&cnpClsNo=2&csmSeq=895
 *
 * 그 밖의 용도: 주차장법 시행령 [별표 1] (개정 2026. 8. 25.)
 * https://www.law.go.kr/flDownload.do?bylClsCd=110201&flSeq=168270377&gubun=
 * 끝수: 별표 1 비고 4·6. 주택 끝수는 제27조 본문(소수점 끝수는 한 대).
 */

export const CHECKED_ON = "2026-11-08";

/** 전용면적 85㎡ 이하 / 초과의 ㎡당 1대. 제27조제1항제1호 표. */
export const housingAreaDivisor = {
  seoul: { le85: 75, gt85: 65, label: "서울특별시" },
  metro: { le85: 85, gt85: 70, label: "광역시·수도권 시" },
  city: { le85: 95, gt85: 75, label: "그 밖의 시·수도권 군" },
  other: { le85: 110, gt85: 85, label: "그 밖의 지역" },
};

/** 세대당 최소 대수. 전용 60㎡ 이하는 0.7. 제27조제1항제1호. */
export const housingMinimumPerUnit = { default: 1, le60: 0.7 };

/**
 * 용도지역은 법령 표의 열이 아니다. 조례 할증은 ordinance로 넣고,
 * 여기 배율은 지역별 가산이 필요할 때 표만 고친다. 기본 1.
 */
export const zoneFactors = {
  general1: { label: "제1종 일반주거지역", factor: 1 },
  general2: { label: "제2종 일반주거지역", factor: 1 },
  general3: { label: "제3종 일반주거지역", factor: 1 },
  semi: { label: "준주거지역", factor: 1 },
  commercial: { label: "일반상업지역", factor: 1 },
  neighborhood: { label: "근린상업지역", factor: 1 },
};

/**
 * kind
 * - housing: 세대수 × 전용면적 구간. 다가구·오피스텔도 같은 조.
 * - detached: 별표 1 제4호
 * - area: 시설면적 ÷ per
 */
export const uses = [
  { id: "apartment", label: "공동주택", kind: "housing", article: "주택건설기준 제27조제1항, 시행령 별표 1 제5호" },
  { id: "multifamily", label: "다가구주택", kind: "housing", article: "시행령 별표 1 제5호" },
  { id: "officetel", label: "오피스텔", kind: "housing", article: "시행령 별표 1 제5호" },
  { id: "detached", label: "단독주택", kind: "detached", article: "시행령 별표 1 제4호" },
  { id: "neighborhood1", label: "제1종 근린생활시설", kind: "area", per: 200, article: "시행령 별표 1 제3호" },
  { id: "neighborhood2", label: "제2종 근린생활시설", kind: "area", per: 200, article: "시행령 별표 1 제3호" },
  { id: "office", label: "업무시설", kind: "area", per: 150, article: "시행령 별표 1 제2호" },
  { id: "retail", label: "판매시설", kind: "area", per: 150, article: "시행령 별표 1 제2호" },
  { id: "lodging", label: "숙박시설", kind: "area", per: 200, article: "시행령 별표 1 제3호" },
  { id: "culture", label: "문화·집회시설", kind: "area", per: 150, article: "시행령 별표 1 제2호" },
  { id: "medical", label: "의료시설", kind: "area", per: 150, article: "시행령 별표 1 제2호" },
  { id: "amusement", label: "위락시설", kind: "area", per: 100, article: "시행령 별표 1 제1호" },
  { id: "warehouse", label: "창고시설", kind: "area", per: 400, article: "시행령 별표 1 제8호" },
  { id: "factory", label: "공장", kind: "area", per: 350, article: "시행령 별표 1 제7호" },
  // 별표 1 제1호~제10호에 교육연구시설은 없다. 비고 1은 시설물 종류를 건축법 시행령 별표 1에 따른다고 하므로
  // 학교·연구소 등 교육연구시설은 제11호 그 밖의 건축물, 시설면적 300㎡당 1대.
  // 확인 2026-11-08. https://www.law.go.kr/flDownload.do?bylClsCd=110201&flSeq=168270377&gubun=
  { id: "education", label: "교육연구시설", kind: "area", per: 300, article: "시행령 별표 1 제11호(그 밖의 건축물)" },
];

/** 개략 배치용 1대당 면적. 법정 면적이 아니라 검토 기본값. */
export const defaultAreaPerStall = 33;
