'use client'

// 효과 컨트롤(시안 E1 409:4652–4713) — 타임라인에서 고른 클립의 이름 · 자리와, 지금 우클릭 메뉴에 있던 시작 전환(검정으로 물들이기) ·
//   속도 · 소리 볼륨을 고른 자리에서 바로 바꾼다(2단계 ① 새 배치, 2026-11-14). 우클릭 메뉴도 그대로 남는다.
//   모션 · 불투명도는 효과 컨트롤 조각(④), 끝 전환 · 교차 디졸브는 효과 탭 조각(⑤)에서 더한다 — 없는 칸을 미리 그리지 않는다.
//   약속: tests/editor/panels.test.ts
import type { ReactNode } from 'react'
import { ChoiceChip } from '@/components/controls/choice-chip'
import { Slider } from '@/components/ui/slider'
import { DISSOLVE_CHOICES } from '@/lib/editor/transition'
import { clipSpanLine, shotLabel } from '@/features/editor/editor-labels'
import { useT } from '@/lib/i18n'
import { isSyntheticShotId, isTitleCardShotId, rootShotIdOf, selectVideoLayout, useEditorStore } from '@/stores/editor-store'

/** 효과 컨트롤의 속도 칸(시안 E1 409:4707–4713). 지금 빠르기가 그 밖이면(우클릭으로 0.25~4배) 그 값 칸을 하나 더 붙인다. */
export const SPEED_CHOICES = [0.5, 1, 1.5, 2] as const
export function speedChoices(current: number): number[] {
  return SPEED_CHOICES.some((v) => Math.abs(v - current) < 1e-6) ? [...SPEED_CHOICES] : [...SPEED_CHOICES, current]
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-14 shrink-0 text-meta text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-meta font-semibold text-subtle-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function EffectControls() {
  const t = useT()
  const shots = useEditorStore((s) => s.shots)
  const videoClips = useEditorStore((s) => s.videoClips)
  const clipOrder = useEditorStore((s) => s.clipOrder)
  const overlay = useEditorStore((s) => s.overlay)
  const selectedShotIds = useEditorStore((s) => s.selectedShotIds)
  const anchorShotId = useEditorStore((s) => s.selectedClipShotId)
  const selectedAudioIds = useEditorStore((s) => s.selectedAudioIds)
  const anchorAudioId = useEditorStore((s) => s.selectedAudioId)
  const audioClips = useEditorStore((s) => s.audioClips)
  const audioTracks = useEditorStore((s) => s.audioTracks)
  const setSpeed = useEditorStore((s) => s.setSpeed)
  const setTransitionIn = useEditorStore((s) => s.setTransitionIn)
  const setAudioVolume = useEditorStore((s) => s.setAudioVolume)
  const pushHistory = useEditorStore((s) => s.pushHistory)

  // ── 소리 조각 ──
  const audio = selectedAudioIds.length > 0 ? audioClips.find((a) => a.id === (anchorAudioId ?? selectedAudioIds[0])) : undefined
  if (audio) {
    const trackIndex = Math.max(0, audioTracks.findIndex((tr) => tr.id === audio.trackId))
    const volume = Math.max(0, Math.min(1, audio.volume ?? 1))
    return (
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">{audio.name}</p>
          <p className="mt-0.5 font-num text-meta text-subtle-foreground tabular-nums">
            {clipSpanLine({ track: `A${trackIndex + 1}`, startSec: audio.startSec, durationSec: audio.durationSec }, t)}
          </p>
        </div>
        <Section title={t('Volume')}>
          <Row label={t('Volume')}>
            <Slider
              className="w-40"
              min={0}
              max={100}
              step={1}
              value={[Math.round(volume * 100)]}
              onPointerDown={() => pushHistory()}
              onValueChange={([v]) => setAudioVolume(audio.id, v / 100)}
              aria-label={t('Volume')}
            />
            <span className="w-10 font-num text-meta font-medium text-foreground tabular-nums">{Math.round(volume * 100)}%</span>
          </Row>
        </Section>
      </div>
    )
  }

  // ── 영상 클립 — 모든 줄(V2 · V3 포함, 검토 c ② 낮음 2) ──
  const layout = selectVideoLayout({ shots, videoClips, clipOrder, overlay })
  const targets = selectedShotIds.filter((id) => layout.some((l) => l.shotId === id))
  const anchor = targets.includes(anchorShotId ?? '') ? (anchorShotId as string) : targets[0]
  const item = anchor ? layout.find((l) => l.shotId === anchor) : undefined
  if (!item) {
    // 시안 E4 409:6662 안내에서 지금 바꿀 수 있는 것만 — 위치 · 비율 · 불투명도 · 효과는 그 조각에서 안내에 더한다.
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-6 py-4 text-center">
        <p className="text-label text-muted-foreground">{t('Select a clip on the timeline to change its speed, transition and volume here.')}</p>
        <p className="text-meta text-subtle-foreground">{t('Click a gap between cuts to get "Ripple delete" right there.')}</p>
      </div>
    )
  }

  const isTitleCard = isTitleCardShotId(item.shotId)
  const shot = shots.find((s) => s.shotId === item.shotId)
  const clip = videoClips.find((c) => c.shotId === item.shotId)
  const rootId = rootShotIdOf(item.shotId)
  const number = shots.filter((s) => !isSyntheticShotId(s.shotId)).findIndex((s) => s.shotId === rootId)
  const rootClip = videoClips.find((c) => c.shotId === rootId)
  const title =
    targets.length > 1
      ? t('{count} clips', { count: targets.length })
      : shotLabel({ number: number >= 0 ? number + 1 : null, shotType: shot?.shotType, takeNumber: rootClip?.takeNumber, isTitleCard }, t)
  const speed = clip?.speed ?? 1
  const transition = clip?.transitionIn ?? null
  const applyAll = (fn: (shotId: string) => void) => {
    pushHistory()
    targets.forEach(fn)
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-foreground">{title}</p>
        {targets.length === 1 ? (
          <p className="mt-0.5 font-num text-meta text-subtle-foreground tabular-nums">
            {clipSpanLine({ track: item.trackId.toUpperCase(), startSec: item.startSec, durationSec: item.durationSec }, t)}
          </p>
        ) : null}
      </div>

      <Section title={t('Transition')}>
        <Row label={t('Start')}>
          <span className="mr-1 text-label text-foreground">{t('Dip to black')}</span>
          <ChoiceChip selected={!transition} onClick={() => targets.forEach((id) => setTransitionIn(id, null))}>
            {t('None')}
          </ChoiceChip>
          {DISSOLVE_CHOICES.map((sec) => (
            <ChoiceChip
              key={sec}
              selected={!!transition && Math.abs(transition.durationSec - sec) < 1e-6}
              onClick={() => targets.forEach((id) => setTransitionIn(id, { type: 'dissolve', durationSec: sec }))}
            >
              {t('{seconds}s', { seconds: sec })}
            </ChoiceChip>
          ))}
        </Row>
      </Section>

      {isTitleCard ? null : (
        <Section title={t('Speed')}>
          <Row label={t('Speed')}>
            {speedChoices(speed).map((rate) => (
              <ChoiceChip
                key={rate}
                className="font-num tabular-nums"
                selected={Math.abs(rate - speed) < 1e-6}
                onClick={() => applyAll((id) => setSpeed(id, rate))}
              >
                {`${Math.round(rate * 100)}%`}
              </ChoiceChip>
            ))}
          </Row>
        </Section>
      )}
    </div>
  )
}
