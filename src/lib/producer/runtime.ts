// 영상 길이 — 대본 그대로 쓰기(그대로 영상화)에서는 길이를 정하지 않는다 (2026-10-09 오너 "영상 길이 제한을 없애줘").
//   각색하는 이야기는 종전대로 설정한 길이를 Writer 에 보내고, 그대로 쓰기는 보내지 않는다 — Writer 가 대본 길이로 정한다
//   (/api/writer/start → preserveRuntime). 화면의 길이 칸은 "원작 길이대로"라고 보인다.
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

/** Writer 시작 요청에 싣는 길이(초) — 그대로 쓰기 · 설정 없음이면 싣지 않는다. */
export function writerRuntimeSeconds(playtime: number | null | undefined, preserveScript: boolean | null | undefined): number | undefined {
  if (preserveScript === true) return undefined
  return typeof playtime === 'number' && playtime > 0 ? playtime : undefined
}

/** 길이 칸에 보일 글 — 그대로 쓰기면 "원작 길이대로", 설정 없음이면 null. */
export function runtimeSettingLabel(voice: AppLocale, playtime: number | null | undefined, preserveScript: boolean | null | undefined): string | null {
  if (preserveScript === true) return translate(voice, 'As long as the original')
  return typeof playtime === 'number' && playtime > 0 ? translate(voice, '{sec}s', { sec: playtime }) : null
}
