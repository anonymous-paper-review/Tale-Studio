// 내부 id → 사용자용 표시명 (#internal-id-scrub 2026-08-26, 오너 정책 확정).
//
// 정책: 내부 id(sh_../sc_../char_../loc_..)는 사용자 화면 어디에도 보이지 않는다(디버그 예외
// 없음 — 디버깅은 콘솔·DB 로만). 인물·장소는 사용자가 지은 표시 이름.
// 샷 · 씬의 규칙 생성명은 그 글의 언어(오너 2026-11-14 답 7 — 8/26 의 로케일 무관 단일형을 바꿈):
// 한국어 대화는 "씬 2 · 샷 7", 영어 대화는 "Scene 2 · Shot 7". 말풍선은 지금 채팅 언어로 바꾼다.
//
// 1차 방어는 각 스테이지 챗 시스템 프롬프트의 금지 규칙이지만, 모델은 확률적으로 어기고
// 과거 메시지는 이미 저장돼 있다 — 그래서 표시 직전 스크럽이 최종 방어다(과거分 포함 소급).
import { sceneName, sceneShotName } from '@/lib/board-names'
import type { AppLocale } from '@/lib/locale'
import { collapseDoubledArticles, insideWrittenName, writtenNameSpans } from '@/lib/writer/resolve-entity-names'

/** sh_02_07 → "씬 2 · 샷 7" · "Scene 2 · Shot 7". 패턴 밖이면 null. */
export function shotIdDisplayName(shotId: string, locale: AppLocale): string | null {
  const m = /^sh[_-]0*(\d+)[_-]0*(\d+)$/i.exec(shotId.trim())
  if (!m) return null
  return sceneShotName(locale, Number(m[1]), Number(m[2]))
}

/** sc_04 → "씬 4" · "Scene 4". 패턴 밖이면 null. */
export function sceneIdDisplayName(sceneId: string, locale: AppLocale): string | null {
  const m = /^sc[_-]0*(\d+)$/i.exec(sceneId.trim())
  if (!m) return null
  return sceneName(locale, Number(m[1]))
}

/**
 * 산문(챗 말풍선 등)에 새어 나온 내부 id 를 표시명으로 치환하고 내부 마커를 걷는다. 이름은 locale(지금 채팅 언어)로 짓는다.
 *   - sh_XX_YY → shotLabelById 가 오면 지금 보드의 전체 번호 이름("씬 2 · 샷 8", board-summary.boardShotLabels — 같은 locale 로 지어 넘긴다) —
 *     id 숫자는 샷을 더하거나 지우면 보드와 어긋난다(오너 2026-11-02 "전체 번호로 통일"). 맵에 없으면 규칙 생성명.
 *   - sc_XX → 규칙 생성명
 *   - nameById 가 오면 char_../loc_.. 류 id 도 이름으로 (맵은 호출부의 스테이지 진실에서) — 이미 쓴 이름 자리 안의 id 낱말은
 *     그대로 두고, 관사로 시작하는 이름 앞에 겹친 관사는 하나로("the keeper" → "The Keeper", qa1110 C12 · resolveEntityNames 와 같은 규칙)
 *   - 과거 스테이지 대괄호 마커 제거([L3] 스크립트 라인 참조는 실제 기능이라 보존)
 * 사용자 발화에는 적용하지 않는다 — 사용자가 직접 쓴 원문은 불가침. 저장된 글 속 이름("Scene 2 · Shot 8")도 그대로 둔다(옛 줄을 고쳐 보이지 않음).
 */
export function scrubInternalIdsInProse(
  text: string,
  locale: AppLocale,
  nameById?: ReadonlyMap<string, string>,
  shotLabelById?: ReadonlyMap<string, string>,
): string {
  let out = text.replace(/\bsh[_-]\d+[_-]\d+\b/gi, (id) => shotLabelById?.get(id) ?? shotIdDisplayName(id, locale) ?? id)
  out = out.replace(/\bsc[_-]\d+\b/gi, (id) => sceneIdDisplayName(id, locale) ?? id)
  out = stripLegacyStageMarkers(out)
  if (nameById && nameById.size > 0) {
    // 한 번에 바꾼다(긴 id 먼저) — 앞에서 넣은 이름 안의 낱말을 뒤의 id 가 또 바꾸지 않게.
    const labels = new Map<string, string>()
    for (const [id, name] of nameById) {
      const label = name.trim()
      if (id.trim() && label && !labels.has(id)) labels.set(id, label)
    }
    if (labels.size > 0) {
      const names = [...new Set(labels.values())]
      const written = writtenNameSpans(out, names)
      const keys = [...labels.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
      out = out.replace(new RegExp(`\\b(?:${keys.join('|')})\\b`, 'g'), (id, offset: number) =>
        insideWrittenName(written, offset, id.length) ? id : labels.get(id) ?? id,
      )
      out = collapseDoubledArticles(out, names)
    }
  }
  return out
}

/** 과거 채팅에 저장된 스테이지 마커를 새 요청·표시에서 제거한다. */
export function stripLegacyStageMarkers(text: string): string {
  return text.replace(/\[p[1-5]\]\s?/gi, '')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
