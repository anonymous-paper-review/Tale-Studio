// 내부 id → 사용자용 표시명 (#internal-id-scrub 2026-08-26, 오너 정책 확정).
//
// 정책: 내부 id(sh_../sc_../char_../loc_..)는 사용자 화면 어디에도 보이지 않는다(디버그 예외
// 없음 — 디버깅은 콘솔·DB 로만). 샷의 규칙 생성명은 "씬2 · 샷7"(EN: "Scene 2 · Shot 7"),
// 인물·장소는 사용자가 지은 표시 이름. 챗 발화·멘션 후보·캔버스 라벨이 같은 규칙을 쓴다.
//
// 1차 방어는 각 스테이지 챗 시스템 프롬프트의 금지 규칙이지만, 모델은 확률적으로 어기고
// 과거 메시지는 이미 저장돼 있다 — 그래서 표시 직전 스크럽이 최종 방어다(과거分 포함 소급).

import type { AppLocale } from '@/lib/locale'

/** sh_02_07 → "씬2 · 샷7" / "Scene 2 · Shot 7". 패턴 밖이면 null. */
export function shotIdDisplayName(shotId: string, locale: AppLocale): string | null {
  const m = /^sh[_-]0*(\d+)[_-]0*(\d+)$/i.exec(shotId.trim())
  if (!m) return null
  const scene = Number(m[1])
  const shot = Number(m[2])
  return locale === 'ko' ? `씬${scene} · 샷${shot}` : `Scene ${scene} · Shot ${shot}` // i18n-ok: 로케일 분기 표시명
}

/** sc_04 → "씬4" / "Scene 4". 패턴 밖이면 null. */
export function sceneIdDisplayName(sceneId: string, locale: AppLocale): string | null {
  const m = /^sc[_-]0*(\d+)$/i.exec(sceneId.trim())
  if (!m) return null
  const scene = Number(m[1])
  return locale === 'ko' ? `씬${scene}` : `Scene ${scene}` // i18n-ok: 로케일 분기 표시명
}

/**
 * 산문(챗 말풍선 등)에 새어 나온 내부 id 를 표시명으로 치환하고 내부 마커를 걷는다.
 *   - sh_XX_YY / sc_XX → 규칙 생성명
 *   - nameById 가 오면 char_../loc_.. 류 id 도 이름으로 (맵은 호출부의 스테이지 진실에서)
 *   - [p3] 같은 대괄호 문단 마커 제거([L3] 스크립트 라인 참조는 실제 기능이라 보존)
 * 사용자 발화에는 적용하지 않는다 — 사용자가 직접 쓴 원문은 불가침.
 */
export function scrubInternalIdsInProse(
  text: string,
  locale: AppLocale,
  nameById?: ReadonlyMap<string, string>,
): string {
  let out = text.replace(/\bsh[_-]\d+[_-]\d+\b/gi, (id) => shotIdDisplayName(id, locale) ?? id)
  out = out.replace(/\bsc[_-]\d+\b/gi, (id) => sceneIdDisplayName(id, locale) ?? id)
  // [p3] 문단 마커 — 모델이 붙이는 내부 인용 표기. 붙은 공백 한 칸까지 함께 걷는다.
  out = out.replace(/\[p\d+\]\s?/gi, '')
  if (nameById && nameById.size > 0) {
    for (const [id, name] of nameById) {
      const label = name.trim()
      if (!id.trim() || !label) continue
      out = out.replace(new RegExp(`\\b${escapeRegExp(id)}\\b`, 'g'), label)
    }
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
