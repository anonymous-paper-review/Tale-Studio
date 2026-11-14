// 씬 · 샷 이름 — 화면 언어를 따른다(오너 2026-11-14 답 7 "언어가 한국어일 때는 한국어로 영어일 때는 영어로 해줘. 이 규칙은 전역으로").
//   8/26 단일형(로케일 무관 "Scene 2 · Shot 8")을 바꿨다 — 한국어 화면은 "씬 2 · 샷 8", 영어 화면은 "Scene 2 · Shot 8".
//   이름은 그 이름이 들어가는 글의 언어로 짓는다: 화면은 화면 언어, 채팅 줄 · Lumi 에게 보내는 글은 채팅 언어, 내보낸 파일은 프로젝트 언어.
//   번호 셈은 보드 하나(board-summary 의 boardShots — 씬마다 다시 세지 않는 전체 번호, 오너 2026-11-02)이고 여기서는 말만 고른다.
//   약속: tests/ui-text/scene-shot-names.test.ts · tests/chat/scene-shot-names.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'

/** "씬 2" · "Scene 2" */
export function sceneName(locale: AppLocale, no: number | string): string {
  return translate(locale, 'Scene {n}', { n: no })
}

/** "샷 8" · "Shot 8" */
export function shotName(locale: AppLocale, no: number | string): string {
  return translate(locale, 'Shot {n}', { n: no })
}

/** "샷 3" · "샷 3·5" / "Shot 3" · "Shots 3 · 5" — 보드 번호 여럿을 한 이름으로, 번호 순서로(채팅 줄). Director 채팅의 shotListLabel 과 같은 꼴이다. */
export function shotNumbersName(locale: AppLocale, nos: readonly number[]): string {
  const sorted = [...new Set(nos)].sort((a, b) => a - b)
  if (sorted.length === 1) return shotName(locale, sorted[0])
  return translate(locale, 'Shots {list}', { list: sorted.join(locale === 'ko' ? '·' : ' · ') })
}

/** "씬 2 · 샷 8" · "Scene 2 · Shot 8" — 씬 맥락 없이 샷 하나를 부를 때(보드 카드 · 넘기기 창 · 채팅). */
export function sceneShotName(locale: AppLocale, sceneNo: number | string, shotNo: number | string): string {
  return translate(locale, 'Scene {scene} · Shot {shot}', { scene: sceneNo, shot: shotNo })
}

/** 파이프라인 점검이 쓰는 자리 글("shot_2~shot_3" · "scene_1")의 순번을 화면 언어 이름으로 — 관리자 연출 점검 줄. */
export function pipelineLocationName(location: string, locale: AppLocale): string {
  return location
    .replace(/shot_(\d+)/g, (_, n: string) => shotName(locale, Number(n)))
    .replace(/scene_(\d+)/g, (_, n: string) => sceneName(locale, Number(n)))
}
