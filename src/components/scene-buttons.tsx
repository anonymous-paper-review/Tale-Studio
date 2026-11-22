'use client'

// 씬 단추 줄(오너 D8 2026-11-22) — 씬을 누르면 그 화면이 그 씬만 보인다. Director 노드 보기와 Camera 가 같이 쓴다(리드 11/22 답 b).
//   ⌘/Ctrl+클릭은 씬을 바꾸지 않고 그 씬의 @이름을 채팅에 넣는다(오너 D9 — Producer 카드와 같은 길: 멘션 토글 요청 + 비행).
//   생김새는 옛 Director [러프 | 실사] 알약과 같은 segmented 칸(design.md §2.11 — 고른 칸 bg-accent · 글자 600).
//   씬이 많아 한 줄에 다 안 들어가면 옆으로 밀어 보고(휠도 옆으로), 고른 씬 단추는 늘 보이게 끌어온다.
//   지금 보는 씬 기억: stores/current-scene-store.ts. 약속: tests/director/scene-buttons.test.ts
import { useEffect, useRef } from 'react'

import { AltArrowHint } from '@/components/alt-arrow-hint'
import { useModifierHeld } from '@/hooks/use-modifier-held'
import { isMentionModifierClick } from '@/lib/card-mention'
import { useT } from '@/lib/i18n'
import { chatInputHasMention, launchMentionFlight } from '@/lib/mention-flight'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { cn } from '@/lib/utils'
import { useChatUiStore } from '@/stores/chat-ui-store'

export interface SceneButtonItem {
  /** 씬 열쇠 — 지금 보는 씬 기억에 쓰는 값(Writer 씬 id 등). */
  key: string
  /** 단추 글자("씬 2" · "Scene 2"). */
  label: string
  /** 마우스를 올리면 보이는 한 줄(예: 장소 · 샷 수). */
  title?: string
  /** ⌘/Ctrl+클릭 때 채팅 입력칸에 넣을 @이름. 없으면 멘션하지 않는다. */
  mentionLabel?: string | null
}

export type SceneButtonPress = { kind: 'select'; key: string } | { kind: 'mention'; label: string } | null

/** 단추를 눌렀을 때 할 일 — ⌘/Ctrl 을 눌렀으면 멘션(씬은 그대로), 아니면 그 씬 고르기. 이미 보는 씬이거나 멘션 이름이 없으면 아무것도 안 한다. */
export function sceneButtonPress(
  event: { metaKey: boolean; ctrlKey: boolean },
  item: SceneButtonItem,
  current: string | null,
): SceneButtonPress {
  if (isMentionModifierClick(event)) {
    const label = item.mentionLabel?.trim()
    return label ? { kind: 'mention', label } : null
  }
  return item.key === current ? null : { kind: 'select', key: item.key }
}

const NO_CYCLE: readonly string[] = []

export function SceneButtons({
  items,
  value,
  onChange,
  cycleWithAltArrows = false,
  className,
}: {
  /** 씬 순서대로. */
  items: readonly SceneButtonItem[]
  /** 지금 보는 씬 열쇠. */
  value: string | null
  onChange: (key: string) => void
  /** Alt+←/→ 로 앞 · 뒤 씬(끝에서는 처음으로). 그 키를 다른 데 쓰는 화면은 끈다. */
  cycleWithAltArrows?: boolean
  className?: string
}) {
  const t = useT()
  const armed = useModifierHeld()
  const keys = items.map((item) => item.key)
  useAltArrowCycle(cycleWithAltArrows ? keys : NO_CYCLE, value ?? '', (next) => {
    if (next !== value) onChange(next)
  })
  // 고른 씬 단추가 줄 밖(옆으로 밀린 자리)에 있으면 보이게 끌어온다.
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [value])

  if (items.length === 0) return null

  const row = (
    <div
      role="group"
      aria-label={t('Scenes')}
      className={cn(
        'flex h-9 min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-background p-1 shadow-node',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      // 넘칠 때는 세로 휠을 옆으로 — 가로 휠이 없는 마우스로도 뒤 씬 단추에 닿는다.
      onWheel={(event) => {
        const scroller = event.currentTarget
        if (scroller.scrollWidth <= scroller.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
        scroller.scrollLeft += event.deltaY
      }}
    >
      {items.map((item) => {
        const selected = item.key === value
        return (
          <button
            key={item.key}
            ref={selected ? selectedRef : undefined}
            type="button"
            data-scene-key={item.key}
            aria-pressed={selected}
            title={item.title}
            // ⌘/Ctrl 클릭은 멘션 전용(#b5 · 오너 D9) — 캡처 단계에서 포커스 · 고르기를 끊는다(Producer readiness-board 와 같은 규칙).
            onPointerDownCapture={(event) => {
              if (!isMentionModifierClick(event)) return
              event.preventDefault()
              event.stopPropagation()
            }}
            onClickCapture={(event) => {
              if (!isMentionModifierClick(event)) return
              event.preventDefault()
              event.stopPropagation()
              const press = sceneButtonPress(event, item, value)
              if (press?.kind !== 'mention') return
              // 방향은 입력칸 글이 진실(#b2) — 토글 전에 본다.
              const removing = chatInputHasMention(press.label)
              useChatUiStore.getState().requestMentionToggle(press.label)
              launchMentionFlight({ label: press.label, clickX: event.clientX, clickY: event.clientY, toChat: !removing })
            }}
            onClick={(event) => {
              const press = sceneButtonPress(event, item, value)
              if (press?.kind === 'select') onChange(press.key)
            }}
            className={cn(
              'h-full shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-100',
              selected ? 'bg-accent font-semibold text-foreground' : 'font-medium text-subtle-foreground hover:text-foreground',
              armed && item.mentionLabel && 'cursor-copy',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
  return cycleWithAltArrows ? <AltArrowHint>{row}</AltArrowHint> : row
}
