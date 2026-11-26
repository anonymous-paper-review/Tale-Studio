// Storyboard 카드 · 씬 머리 ⌘(맥) · Ctrl+클릭 멘션(오너 2026-11-26 m1126 G3 · dev D9 "모든 탭에서 같은 연출") — Producer · Artist · Director 카드와 같은 길:
//   넣고 빼기 전에 입력칸 글로 방향을 보고(chatInputHasMention) → 멘션을 토글하고(requestMentionToggle) → 누른 자리 ↔ 입력칸으로 난다(launchMentionFlight).
//   이름은 Storyboard 채팅의 @ 고르기 목록(script-lines writerSceneShotMentions — 보드 전체 번호 · 화면 언어)과 같다. 붙음 표시 ref 도 같은 목록의 ref.
//   약속: tests/writer/real-mention.test.ts
import { isMentionModifierClick, sceneShotMentionRef } from '@/lib/card-mention'
import type { AppLocale } from '@/lib/locale'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { writerSceneShotMentions } from '@/lib/script-lines'
import { useChatUiStore } from '@/stores/chat-ui-store'
import type { SceneManifest, Shot } from '@/types'

/** 채팅이 입력 글에서 찾은 멘션(mentionedRefs)과 견주는 ref — Storyboard 채팅 @ 목록과 같다. */
export function storyboardMentionRef(kind: 'scene' | 'shot', id: string): string {
  return sceneShotMentionRef('writer', kind, id)
}

/** 샷 id · 씬 id → 멘션 이름("샷 8" · "Scene 2"). */
export function storyboardMentionLabels(
  manifest: SceneManifest | null,
  shots: readonly Shot[],
  locale: AppLocale,
): { shots: Map<string, string>; scenes: Map<string, string> } {
  const byRef = new Map(writerSceneShotMentions(manifest, shots, locale).map((m) => [m.ref, m.label]))
  const label = (kind: 'scene' | 'shot', id: string) => byRef.get(storyboardMentionRef(kind, id))
  const scenes = new Map<string, string>()
  for (const scene of manifest?.scenes ?? []) {
    const name = label('scene', scene.sceneId)
    if (name) scenes.set(scene.sceneId, name)
  }
  const shotLabels = new Map<string, string>()
  for (const shot of shots) {
    const name = label('shot', shot.shotId)
    if (name) shotLabels.set(shot.shotId, name)
  }
  return { shots: shotLabels, scenes }
}

export interface ModifierClick {
  ctrlKey: boolean
  metaKey: boolean
  clientX: number
  clientY: number
  preventDefault: () => void
  stopPropagation: () => void
}

/** ⌘/Ctrl+클릭이면 멘션을 넣고 빼며 날린다 — 그랬으면 true(카드의 원래 일은 하지 않는다). 조작키가 없거나 이름을 모르면 false. */
export function mentionOnModifierClick(event: ModifierClick, label: string | undefined): boolean {
  if (!label || !isMentionModifierClick(event)) return false
  event.preventDefault()
  event.stopPropagation()
  const removing = chatInputHasMention(label)
  useChatUiStore.getState().requestMentionToggle(label)
  launchMentionFlight({ label, clickX: event.clientX, clickY: event.clientY, toChat: !removing })
  return true
}

/** ⌘/Ctrl 를 누르고 시작한 누르기는 카드 안 단추 · 그림이 먼저 반응하지 않게 누르기 시작부터 끊는다(Producer · Artist 카드와 같다). */
export function stopModifierPointerDown(event: Pick<ModifierClick, 'ctrlKey' | 'metaKey' | 'preventDefault' | 'stopPropagation'>): void {
  if (!isMentionModifierClick(event)) return
  event.preventDefault()
  event.stopPropagation()
}
