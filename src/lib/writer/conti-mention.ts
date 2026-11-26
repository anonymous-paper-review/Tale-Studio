// ⌘(맥) · Ctrl+클릭 멘션(D9 오너 2026-11-22 "모든 탭에서 작동 · 애니메이션도 동일하게", G3 2026-11-26 — dev eadbb00e 를 옮김) — Writer 콘티의 카드 · 씬 머리 · 대사 줄.
//   채팅 입력에 "@샷 N" · "@씬 N"을 넣거나 빼고(requestMentionToggle) 누른 자리 ↔ 입력칸 사이로 날아가는 연출(launchMentionFlight)을 한다 —
//   Producer · Artist 카드와 같은 문법. 이름은 채팅 @ 고르기 목록과 같은 이름(writerSceneShotMentions)이라 채팅이 그 샷을 찾는다.
//   같은 보드를 쓰는 Storyboard(id writer)에서도 같다. 씬 스토리 문단 연출(dev 의 paragraphFlightOnModifierClick)은 이 갈래 밖이라 옮기지 않았다.
//   ⌘/Ctrl 를 누르고 시작한 누르기는 카드 안 단추 · 입력칸이 먼저 반응하지 않게 누르기 시작(pointerdown)부터 끊는다.
//   약속: tests/writer/conti-mention.test.ts
//   이 파일은 i18n 묶음(@/lib/i18n)을 거치지 않는다 — 대사 탭처럼 사전을 일부만 흉내 내는 시험 화면에서도 깨지지 않게.
//   그래서 card-mention 의 ref · ⌘/Ctrl 판정과 script-lines 의 이름 짓기를 같은 규칙으로 여기서 짓는다(같은지는 시험이 본다).
import { sceneName, shotName } from '@/lib/board-names'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { boardShots } from '@/lib/writer/board-summary'
import type { AppLocale } from '@/lib/locale'
import { useChatUiStore } from '@/stores/chat-ui-store'
import type { SceneManifest, Shot } from '@/types'

export interface ModifierClickEvent {
  ctrlKey: boolean
  metaKey: boolean
  clientX: number
  clientY: number
  preventDefault: () => void
  stopPropagation: () => void
}

/** ⌘(맥) · Ctrl 를 누른 채 누른 것인가 — card-mention isMentionModifierClick 과 같다. */
function modifierClick(event: Pick<ModifierClickEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey
}

/** 콘티 카드 · 씬 머리의 채팅 멘션 ref(card-mention sceneShotMentionRef('writer', …)) — 채팅이 입력 글에서 찾은 멘션(mentionedRefs)과 견준다. */
export function contiMentionRef(kind: 'scene' | 'shot', id: string): string {
  return `writer:${kind}:${id}`
}

/** 샷 id · 씬 id → 멘션 이름("샷 8" · "Scene 2"). 채팅 @ 고르기 목록(script-lines writerSceneShotMentions)과 같은 셈(보드 전체 번호) · 같은 화면 언어. */
export function contiMentionLabels(
  manifest: SceneManifest | null,
  shots: readonly Shot[],
  locale: AppLocale,
): { shots: Map<string, string>; scenes: Map<string, string> } {
  const scenes = new Map((manifest?.scenes ?? []).map((scene, index) => [scene.sceneId, sceneName(locale, index + 1)]))
  const shotLabels = new Map<string, string>()
  for (const entry of boardShots(manifest, shots)) {
    if (!shotLabels.has(entry.shot.shotId)) shotLabels.set(entry.shot.shotId, shotName(locale, entry.shotNo))
  }
  return { shots: shotLabels, scenes }
}

/** ⌘/Ctrl 를 누른 채 누르기 시작하면 기본 동작(포커스 · 메뉴 열림)을 끊는다. 끊었으면 true. */
export function stopModifierPointerDown(event: Pick<ModifierClickEvent, 'ctrlKey' | 'metaKey' | 'preventDefault' | 'stopPropagation'>): boolean {
  if (!modifierClick(event)) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}

/** ⌘/Ctrl+클릭이면 채팅 입력에 @label 을 넣거나 빼고 날아가는 연출을 한다 — 누른 곳의 기본 동작(상세 · 접기 · 고치기)은 하지 않는다.
 *  ⌘/Ctrl 가 아니면 false(지금처럼 기본 동작). 이름이 없는 곳이면 기본 동작만 막는다. */
export function mentionOnModifierClick(event: ModifierClickEvent, label: string | null | undefined): boolean {
  if (!stopModifierPointerDown(event)) return false
  const name = label?.trim()
  if (!name) return true
  // 방향은 입력칸 글이 진실이다(#b2) — 토글하기 전에 본다.
  const removing = chatInputHasMention(name)
  useChatUiStore.getState().requestMentionToggle(name)
  launchMentionFlight({ label: name, clickX: event.clientX, clickY: event.clientY, toChat: !removing })
  return true
}
