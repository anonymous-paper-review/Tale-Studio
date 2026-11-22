// Camera 의 ⌘/Ctrl+클릭 멘션(오너 2026-11-22 D9 "모든 탭에서 · 애니메이션도 동일하게") — 샷 줄 · 판 카드 · 씬 이름.
//   이름은 채팅 고르기 목록과 같은 화면 언어 이름("실사 샷 3" · "Real Shot 3", 오너 11/14 답 7)에 판 이름을 붙인다("· 그림 v2" · "· Take 4").
//   넣기 · 빼기는 입력칸 글이 진실(requestMentionToggle), 배지는 넣을 때 입력칸으로 날아가고 뺄 때 돌아온다(Producer · Artist 카드와 같은 부품).
//   약속: tests/camera/chat.test.ts
import type { MouseEvent, PointerEvent } from 'react'
import { isMentionModifierClick, sceneShotMentions } from '@/lib/card-mention'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { storyboardImageVersions } from '@/lib/director/storyboard-image-versions'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

export type CameraMentionTarget =
  | { kind: 'scene' | 'shot'; label: string }
  | { kind: 'image' | 'take'; label: string; n: number }

/** label = 보드 이름("샷 3" · "씬 1", 화면 언어). 판이면 그 샷 이름 뒤에 판 이름을 붙인다. */
export function cameraMentionLabel(target: CameraMentionTarget, locale: AppLocale): string {
  const kind = target.kind === 'scene' ? 'scene' : 'shot'
  const base = sceneShotMentions([{ kind, id: target.label, label: target.label }], 'real', locale)[0]?.label ?? target.label
  if (target.kind === 'image') return `${base} · ${translate(locale, 'Image v{n}', { n: target.n })}`
  if (target.kind === 'take') return `${base} · ${translate(locale, 'Take {n}', { n: target.n })}`
  return base
}

/**
 * 판 카드가 넣는 이름 전부(샷마다 그림 판 · Take, 차례대로) — 채팅 넣고 빼기에 함께 넘긴다. 판 이름은 샷 이름으로 시작해서
 *   이 목록이 없으면 "@실사 샷 1"을 뺄 때 "@실사 샷 1 · 그림 v1"의 앞부분까지 지운다. 고르기 목록에는 넣지 않는다.
 *   labelOf = 그 샷의 보드 이름(화면 언어, 판 줄과 같은 directorNodeLabel).
 */
export function cameraCardMentionLabels(nodes: readonly DirectorNode[], labelOf: (node: DirectorNode) => string, locale: AppLocale): string[] {
  return nodes.flatMap((node) => {
    if (!isShotData(node.data)) return []
    const label = labelOf(node)
    const images = storyboardImageVersions(node.data.storyboardImage)
      .map((version) => version.n)
      .sort((a, b) => a - b)
      .map((n) => cameraMentionLabel({ kind: 'image', label, n }, locale))
    const takes = nodes
      .flatMap((other) => (isVideoData(other.data) && other.data.parentShotNodeId === node.id ? [other.data.takeNumber] : []))
      .sort((a, b) => a - b)
      .map((n) => cameraMentionLabel({ kind: 'take', label, n }, locale))
    return [...images, ...takes]
  })
}

/** ⌘/Ctrl 을 누른 채 누르면 포커스 · 열기가 먼저 일어나지 않게 끊는다(Producer 카드와 같은 까닭 — 포커스는 pointerdown 에서 일어난다). */
export function stopModifierPointerDown(event: PointerEvent): void {
  if (!isMentionModifierClick(event)) return
  event.preventDefault()
  event.stopPropagation()
}

/** ⌘/Ctrl+클릭이면 멘션만 하고 true — 고르기 · 열기 · 재생은 막는다(캡처 단계에서 부른다). 아니면 false. */
export function mentionOnModifierClick(event: MouseEvent, label: string): boolean {
  if (!isMentionModifierClick(event)) return false
  event.preventDefault()
  event.stopPropagation()
  // 방향은 입력칸 글이 진실 — 토글 반영 전 값으로 판정한다.
  const removing = chatInputHasMention(label)
  useChatUiStore.getState().requestMentionToggle(label)
  launchMentionFlight({ label, clickX: event.clientX, clickY: event.clientY, toChat: !removing })
  return true
}
