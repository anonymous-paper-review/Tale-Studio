// 개발자용 원본 id 라벨(sc_02 · shot_8 · sh_03_13)을 사람이 읽는 표기(Scene 2 · Shot 8)로.
//   표시 전용 변환(#e4 2026-07-13) — data.label(원본)은 편집·저장·매칭 경로에서 그대로 유지된다.
//   패턴 밖 라벨(사용자 커스텀 이름)은 무변환 통과.
// #internal-id-scrub(2026-08-26, 오너 E5): ko UI 는 "씬 N"/"샷 N" 표기 — locale 은 표시 전용
//   호출부(캔버스 노드)만 넘긴다. 멘션 라벨 등 매칭 키 경로는 기본값(en, 로케일 고정)을 유지.
export function prettyNodeLabel(label: string, locale: 'en' | 'ko' = 'en'): string {
  const raw = label.trim()
  const sceneWord = locale === 'ko' ? '씬' : 'Scene' // i18n-ok: 로케일 분기 표시명
  const shotWord = locale === 'ko' ? '샷' : 'Shot' // i18n-ok: 로케일 분기 표시명
  const scene = /^sc[_-]0*(\d+)$/i.exec(raw)
  if (scene) return `${sceneWord} ${Number(scene[1])}`
  const shot = /^shot[_-]0*(\d+)$/i.exec(raw)
  if (shot) return `${shotWord} ${Number(shot[1])}`
  // writer 산출 샷 id: sh_{scene}_{n} → 씬 컨텍스트는 그룹 헤더가 보여주므로 샷 번호만.
  const writerShot = /^sh[_-]0*(\d+)[_-]0*(\d+)$/i.exec(raw)
  if (writerShot) return `${shotWord} ${Number(writerShot[2])}`
  // 영상 테이크 라벨: take_v1 → Shot 1 (#e10 2026-07-14 — SHOT VIDEO 카드 표기 요청)
  const take = /^take[_-]?v0*(\d+)$/i.exec(raw)
  if (take) return `${shotWord} ${Number(take[1])}`
  return label
}
