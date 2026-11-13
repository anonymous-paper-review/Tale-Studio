'use client'

// 효과 탭(시안 E2 409:5308–5347, 2단계 ⑤) — 비디오 전환 · 오디오 전환 · 비디오 효과를 타임라인 클립 위로 끌어 놓는다.
//   전환 · 페이드는 클립 앞쪽 절반이면 시작, 뒤쪽 절반이면 끝에 들어가고, 영상 효과는 클립 전체에 들어간다(타이틀 카드에는 놓이지 않는다).
//   끄는 동안 놓일 자리를 클립 위에 밝힌다(data-effect-drop — timeline-transitions.EFFECT_DROP_CLASS). 놓은 클립은 골라져 효과 컨트롤에 보인다.
//   약속: tests/editor/transitions-effects.test.ts
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { startBinDrag } from '@/lib/pointer-drag'
import { AUDIO_FADE_LABEL, TRANSITION_LABEL, VIDEO_TRANSITIONS, dropEdge, type TransitionEdge } from '@/lib/editor/transition'
import { VIDEO_EFFECTS, VIDEO_EFFECT_LABEL } from '@/lib/editor/video-effects'
import { useEditorStore } from '@/stores/editor-store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** 놓을 수 있는 클립 — 영상 효과는 타이틀 카드를 뺀다. */
const VIDEO_TARGET = '[data-clip-drop="video"]'
const EFFECT_TARGET = '[data-clip-drop="video"]:not([data-title-card])'
const AUDIO_TARGET = '[data-clip-drop="audio"]'

function EffectItem({ icon, label, active, onPointerDown }: { icon: string; label: string; active: boolean; onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        'flex h-7 cursor-grab items-center gap-2 rounded-md px-1.5 text-label text-foreground transition-colors hover:bg-chip/60 active:cursor-grabbing',
        active && 'bg-stage/18',
      )}
    >
      <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] bg-card text-[10px] font-bold leading-none">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  )
}

export function EffectsPanel() {
  const t = useT()
  // 끄고 있는 항목 — 그 줄을 밝힌다(시안 E2 409:5319).
  const [dragging, setDragging] = useState<string | null>(null)
  const markedRef = useRef<HTMLElement | null>(null)

  /** 놓일 자리를 클립에 밝힌다 — 다른 클립으로 옮기거나 끝나면 앞 클립의 표시를 지운다. */
  const mark = (target: Element | null, how: TransitionEdge | 'whole' | null) => {
    const el = target as HTMLElement | null
    if (markedRef.current && markedRef.current !== el) delete markedRef.current.dataset.effectDrop
    if (el && how) el.dataset.effectDrop = how
    markedRef.current = el
  }

  const drag = (
    e: ReactPointerEvent,
    key: string,
    ghost: string,
    selector: string,
    whole: boolean,
    drop: (target: HTMLElement, edge: TransitionEdge) => void,
  ) =>
    startBinDrag({
      event: e,
      label: ghost,
      dropSelector: selector,
      onDragStart: () => setDragging(key),
      onDragOver: (target, clientX) => mark(target, target ? (whole ? 'whole' : dropEdge(target.getBoundingClientRect(), clientX)) : null),
      onDragEnd: () => {
        mark(null, null)
        setDragging(null)
      },
      onDrop: ({ target, clientX }) => drop(target as HTMLElement, dropEdge(target.getBoundingClientRect(), clientX)),
    })

  const heading = (label: string) => <p className="px-1 pb-1 pt-2 text-meta font-medium text-subtle-foreground first:pt-0">{label}</p>

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-0.5 px-3 pb-4 pt-3">
        {heading(t('Video transitions'))}
        {VIDEO_TRANSITIONS.map((type) => {
          const label = t(TRANSITION_LABEL[type])
          return (
            <EffectItem
              key={type}
              icon="⇄"
              label={label}
              active={dragging === type}
              onPointerDown={(e) =>
                drag(e, type, `⇄ ${label}`, VIDEO_TARGET, false, (target, edge) => {
                  const shotId = target.dataset.shotId
                  if (shotId) useEditorStore.getState().dropTransition(shotId, edge, type)
                })
              }
            />
          )
        })}
        {heading(t('Audio transitions'))}
        <EffectItem
          icon="⇄"
          label={t(AUDIO_FADE_LABEL)}
          active={dragging === 'fade'}
          onPointerDown={(e) =>
            drag(e, 'fade', `⇄ ${t(AUDIO_FADE_LABEL)}`, AUDIO_TARGET, false, (target, edge) => {
              const id = target.dataset.audioId
              if (id) useEditorStore.getState().dropAudioFade(id, edge)
            })
          }
        />
        {heading(t('Video effects'))}
        {VIDEO_EFFECTS.map((kind) => {
          const label = t(VIDEO_EFFECT_LABEL[kind])
          return (
            <EffectItem
              key={kind}
              icon="fx"
              label={label}
              active={dragging === kind}
              onPointerDown={(e) =>
                drag(e, kind, `fx ${label}`, EFFECT_TARGET, true, (target) => {
                  const shotId = target.dataset.shotId
                  if (shotId) useEditorStore.getState().addVideoEffect(shotId, kind)
                })
              }
            />
          )
        })}
        <p className="px-1 pt-2 text-meta leading-[1.55] text-subtle-foreground">{t('Drag onto a clip · The front half goes to the start, the back half to the end')}</p>
      </div>
    </ScrollArea>
  )
}
