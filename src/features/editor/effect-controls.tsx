'use client'

// 효과 컨트롤(시안 E1 409:4652–4713) — 타임라인에서 고른 클립의 이름 · 자리와 속도 · 소리 볼륨을 고른 자리에서 바로 바꾼다
//   (2단계 ① 새 배치, 2026-11-14). 모션(위치 X · Y · 비율) · 불투명도는 슬라이더로 바꾸고 % 글자를 두 번 누르면 처음 값(2단계 ④).
//   전환은 시작 · 끝 줄 — 효과 탭에서 끌어 놓은 전환의 이름(맞닿은 컷이면 "앞 · 뒤 클립과 이어짐")과 0.5 · 1 · 2초 칸 · [빼기],
//   넣은 영상 효과는 "효과" 묶음에서 고치고 뺀다. 소리 조각은 볼륨과 시작 · 끝 페이드(2단계 ⑤). 제목 클립은 텍스트 · 크기 · 위치(⑥, 시안 E2
//   409:5233–5252)와 모션 · 불투명도 · 전환. 우클릭 메뉴도 그대로 남는다.
//   약속: tests/editor/panels.test.ts · tests/editor/motion-opacity.test.ts · tests/editor/transitions-effects.test.ts · tests/editor/title-clips.test.ts
import { useState, type ReactNode } from 'react'
import { ChoiceChip } from '@/components/controls/choice-chip'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { AUDIO_FADE_LABEL, TRANSITION_CHOICES, TRANSITION_LABEL, edgeTransition, type TransitionEdge } from '@/lib/editor/transition'
import { VIDEO_EFFECTS, VIDEO_EFFECT_DEFAULT, VIDEO_EFFECT_LABEL } from '@/lib/editor/video-effects'
import { TITLE_PLACES, TITLE_PLACE_LABEL, TITLE_SIZE_DEFAULT, TITLE_SIZE_MAX, TITLE_SIZE_MIN } from '@/lib/editor/title-clip'
import { clipSpanLine, shotLabel } from '@/features/editor/editor-labels'
import { useT } from '@/lib/i18n'
import { isSyntheticShotId, isTitleCardShotId, isTitleClipShotId, rootShotIdOf, selectVideoLayout, useEditorStore } from '@/stores/editor-store'

/** 효과 컨트롤의 속도 칸(시안 E1 409:4707–4713). 지금 빠르기가 그 밖이면(우클릭으로 0.25~4배) 그 값 칸을 하나 더 붙인다. */
export const SPEED_CHOICES = [0.5, 1, 1.5, 2] as const
export function speedChoices(current: number): number[] {
  return SPEED_CHOICES.some((v) => Math.abs(v - current) < 1e-6) ? [...SPEED_CHOICES] : [...SPEED_CHOICES, current]
}

/** 이름 · 내용 한 줄 — 내용이 두 줄로 넘어가도 이름은 첫 줄 높이에 선다(긴 영어 전환 이름). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3">
      <span className="w-14 shrink-0 text-meta leading-8 text-muted-foreground">{label}</span>
      <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * 슬라이더의 되돌리기 칸 — 누름 · 화살표는 준비만 하고, 값이 실제로 처음 바뀔 때 한 칸을 쌓는다. 슬라이더는 값이 그대로면 바뀜을 알리지
 *   않으므로, 누르기만 하거나 끝 값에서 화살표를 눌러도 칸이 생기지 않는다(검토 c (D) 낮음 2). 약속: tests/editor/motion-opacity.test.ts
 */
export function sliderHistory(push: () => void) {
  let armed = false
  return {
    arm: () => {
      armed = true
    },
    change: (apply: () => void) => {
      if (armed) {
        armed = false
        push()
      }
      apply()
    },
  }
}

/** 슬라이더 값을 한 칸씩 움직이는 키(화살표 · Page · Home · End). */
const isStepKey = (key: string) => key.startsWith('Arrow') || key.startsWith('Page') || key === 'Home' || key === 'End'

/** 슬라이더 한 줄 — 끄기 · 화살표로 값이 처음 바뀔 때 되돌리기 칸 하나(onStart), % 글자를 두 번 누르면 처음 값. */
function SliderRow({
  label,
  value,
  min,
  max,
  unit = '%',
  resetTitle,
  onStart,
  onChange,
  onReset,
}: {
  label: string
  value: number
  min: number
  max: number
  /** 값 뒤 글자 — 처음은 %(제목 크기는 숫자만, 시안 E2 409:5242). */
  unit?: string
  resetTitle: string
  onStart: () => void
  onChange: (value: number) => void
  onReset: () => void
}) {
  const [history] = useState(() => sliderHistory(onStart))
  return (
    <Row label={label}>
      <Slider
        className="w-40"
        min={min}
        max={max}
        step={1}
        value={[value]}
        onPointerDown={history.arm}
        onKeyDown={(e) => {
          if (isStepKey(e.key)) history.arm()
        }}
        onValueChange={([v]) => history.change(() => onChange(v))}
        aria-label={label}
      />
      <button
        type="button"
        onDoubleClick={onReset}
        title={resetTitle}
        className="w-12 text-left font-num text-meta font-medium text-foreground tabular-nums"
      >
        {`${value}${unit}`}
      </button>
    </Row>
  )
}

/** 줄 끝의 [빼기] — 넣은 전환 · 효과를 뺀다. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ml-auto rounded px-1 text-meta font-medium text-subtle-foreground transition-colors hover:text-foreground">
      {label}
    </button>
  )
}

/** 전환 한 줄(시안 E1 409:4689–4701) — 없으면 "없음 · 효과 탭에서 끌어 놓아요", 있으면 이름 · 0.5 · 1 · 2초 칸 · [빼기]. */
function TransitionRow({
  label,
  name,
  lengthSec,
  onLength,
  onRemove,
}: {
  label: string
  name: string | null
  lengthSec: number
  onLength: (sec: number) => void
  onRemove: () => void
}) {
  const t = useT()
  return (
    <Row label={label}>
      {name === null ? (
        <span className="text-label text-subtle-foreground">{t('None · Drag one from the Effects tab')}</span>
      ) : (
        <>
          <span className="mr-1 text-label text-foreground">{name}</span>
          {TRANSITION_CHOICES.map((sec) => (
            <ChoiceChip key={sec} selected={Math.abs(lengthSec - sec) < 1e-6} onClick={() => onLength(sec)}>
              {t('{seconds}s', { seconds: sec })}
            </ChoiceChip>
          ))}
          <RemoveButton label={t('Remove transition')} onClick={onRemove} />
        </>
      )}
    </Row>
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
  const setClipTransition = useEditorStore((s) => s.setClipTransition)
  const setTransitionLength = useEditorStore((s) => s.setTransitionLength)
  const setClipMotion = useEditorStore((s) => s.setClipMotion)
  const setClipOpacity = useEditorStore((s) => s.setClipOpacity)
  const setVideoEffect = useEditorStore((s) => s.setVideoEffect)
  const removeVideoEffect = useEditorStore((s) => s.removeVideoEffect)
  const setAudioVolume = useEditorStore((s) => s.setAudioVolume)
  const setAudioFade = useEditorStore((s) => s.setAudioFade)
  const updateTitleText = useEditorStore((s) => s.updateTitleText)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  // 소리 볼륨 슬라이더도 값이 처음 바뀔 때 한 칸(검토 c (D) 낮음 2 — 예전에는 누르기만 해도 쌓였고, 화살표로 바꾼 값은 쌓이지 않았다).
  const [volumeHistory] = useState(() => sliderHistory(pushHistory))
  // 제목 글자 칸 — 입력을 시작할 때(포커스 뒤 첫 글자) 되돌리기 한 칸(2단계 ⑥).
  const [textHistory] = useState(() => sliderHistory(pushHistory))

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
              onPointerDown={volumeHistory.arm}
              onKeyDown={(e) => {
                if (isStepKey(e.key)) volumeHistory.arm()
              }}
              onValueChange={([v]) => volumeHistory.change(() => setAudioVolume(audio.id, v / 100))}
              aria-label={t('Volume')}
            />
            <span className="w-10 font-num text-meta font-medium text-foreground tabular-nums">{Math.round(volume * 100)}%</span>
          </Row>
        </Section>
        {/* 소리의 전환 = 지속 가감(페이드) — 시작은 페이드 인, 끝은 페이드 아웃(2단계 ⑤). */}
        <Section title={t('Transition')}>
          {(['start', 'end'] as const).map((edge) => {
            const sec = edge === 'start' ? audio.fadeInSec : audio.fadeOutSec
            return (
              <TransitionRow
                key={edge}
                label={edge === 'start' ? t('Start') : t('End')}
                name={sec ? t(AUDIO_FADE_LABEL) : null}
                lengthSec={sec ?? 0}
                onLength={(value) => setAudioFade(audio.id, edge, value)}
                onRemove={() => setAudioFade(audio.id, edge, null)}
              />
            )
          })}
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
    // 시안 E4 409:6662 안내 — ④ 모션 · 불투명도와 ⑤ 효과가 생겨 시안 문장 그대로다.
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-6 py-4 text-center">
        <p className="text-label text-muted-foreground">{t('Select a clip on the timeline to change its position, scale, opacity, speed, effects, transitions and volume here.')}</p>
        <p className="text-meta text-subtle-foreground">{t('Click a gap between cuts to get "Ripple delete" right there.')}</p>
      </div>
    )
  }

  const isTitleCard = isTitleCardShotId(item.shotId)
  const isTitleClip = isTitleClipShotId(item.shotId)
  const shot = shots.find((s) => s.shotId === item.shotId)
  const titleText = isTitleClip ? (shot?.titleText ?? null) : null
  // 크기 · 위치는 고른 제목 클립 모두에 — 글자는 머리 클립 하나만(여러 제목에 같은 글자를 쓸 일이 없다).
  const titleTargets = targets.filter((id) => isTitleClipShotId(id))
  const clip = videoClips.find((c) => c.shotId === item.shotId)
  const rootId = rootShotIdOf(item.shotId)
  const number = shots.filter((s) => !isSyntheticShotId(s.shotId)).findIndex((s) => s.shotId === rootId)
  const rootClip = videoClips.find((c) => c.shotId === rootId)
  const title =
    targets.length > 1
      ? t('{count} clips', { count: targets.length })
      : shotLabel({ number: number >= 0 ? number + 1 : null, shotType: shot?.shotType, takeNumber: rootClip?.takeNumber, isTitleCard, titleText: titleText?.text ?? null }, t)
  const speed = clip?.speed ?? 1
  const motion = clip?.motion ?? { x: 0, y: 0, scale: 1 }
  const opacity = clip?.opacity ?? 1
  const effects = clip?.effects ?? {}
  const percent = (value: number) => Math.round(value * 100)
  const applyAll = (fn: (shotId: string) => void) => {
    pushHistory()
    targets.forEach(fn)
  }
  // % 글자를 두 번 누르면 처음 값 · 흑백 켬/끔 — 바뀐 것이 있을 때만 되돌리기 칸 하나(2단계 ④ · ⑤).
  const resetTo = (changed: boolean, fn: () => void) => {
    if (!changed) return
    pushHistory()
    fn()
  }
  // 시작 · 끝 전환의 이름 — 맞닿은 컷이면 "앞 · 뒤 클립과 이어짐", 빈 끝의 교차 디졸브면 "서서히 나타남 · 사라짐"(2단계 ⑤).
  const edgeShown = (edge: TransitionEdge) => {
    const { transition, joined } = edgeTransition(layout, videoClips, item.shotId, edge)
    if (!transition) return null
    const how = joined
      ? edge === 'start' ? 'Joined to previous clip' : 'Joined to next clip'
      : transition.type === 'cross' ? (edge === 'start' ? 'Fades in' : 'Fades out') : null
    const name = t(TRANSITION_LABEL[transition.type])
    return { name: how ? `${name} · ${t(how)}` : name, lengthSec: transition.durationSec }
  }
  const bc = effects.brightnessContrast ?? VIDEO_EFFECT_DEFAULT.brightnessContrast

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

      {titleText ? (
        // 제목 클립 글자 · 크기 · 위치(시안 E2 409:5233–5252).
        <Section title={t('Text')}>
          <Input
            className="h-8"
            value={titleText.text}
            aria-label={t('Text')}
            onFocus={textHistory.arm}
            onChange={(e) => {
              const value = e.target.value
              textHistory.change(() => updateTitleText(item.shotId, { text: value }))
            }}
          />
          <SliderRow
            label={t('Size')}
            value={titleText.size}
            min={TITLE_SIZE_MIN}
            max={TITLE_SIZE_MAX}
            unit=""
            resetTitle={t('Double-click to reset to {value}', { value: String(TITLE_SIZE_DEFAULT) })}
            onStart={() => pushHistory()}
            onChange={(v) => titleTargets.forEach((id) => updateTitleText(id, { size: v }))}
            onReset={() => resetTo(titleText.size !== TITLE_SIZE_DEFAULT, () => titleTargets.forEach((id) => updateTitleText(id, { size: TITLE_SIZE_DEFAULT })))}
          />
          <Row label={t('Position')}>
            {TITLE_PLACES.map((place) => (
              <ChoiceChip
                key={place}
                selected={titleText.place === place}
                onClick={() => resetTo(titleText.place !== place, () => titleTargets.forEach((id) => updateTitleText(id, { place })))}
              >
                {t(TITLE_PLACE_LABEL[place])}
              </ChoiceChip>
            ))}
          </Row>
        </Section>
      ) : null}

      {isTitleCard ? null : (
        <>
          {/* 모션 · 불투명도(시안 E1 409:4659–4685) — 고른 클립 모두에, 끄는 동안 모니터에 바로 보인다. */}
          <Section title={t('Motion')}>
            <SliderRow
              label={t('Position X')}
              value={percent(motion.x)}
              min={-100}
              max={100}
              resetTitle={t('Double-click to reset to {value}', { value: '0%' })}
              onStart={() => pushHistory()}
              onChange={(v) => setClipMotion(targets, { x: v / 100 })}
              onReset={() => resetTo(motion.x !== 0, () => setClipMotion(targets, { x: 0 }))}
            />
            <SliderRow
              label={t('Position Y')}
              value={percent(motion.y)}
              min={-100}
              max={100}
              resetTitle={t('Double-click to reset to {value}', { value: '0%' })}
              onStart={() => pushHistory()}
              onChange={(v) => setClipMotion(targets, { y: v / 100 })}
              onReset={() => resetTo(motion.y !== 0, () => setClipMotion(targets, { y: 0 }))}
            />
            <SliderRow
              label={t('Scale')}
              value={percent(motion.scale)}
              min={10}
              max={300}
              resetTitle={t('Double-click to reset to {value}', { value: '100%' })}
              onStart={() => pushHistory()}
              onChange={(v) => setClipMotion(targets, { scale: v / 100 })}
              onReset={() => resetTo(motion.scale !== 1, () => setClipMotion(targets, { scale: 1 }))}
            />
          </Section>
          <Section title={t('Opacity')}>
            <SliderRow
              label={t('Opacity')}
              value={percent(opacity)}
              min={0}
              max={100}
              resetTitle={t('Double-click to reset to {value}', { value: '100%' })}
              onStart={() => pushHistory()}
              onChange={(v) => setClipOpacity(targets, v / 100)}
              onReset={() => resetTo(opacity !== 1, () => setClipOpacity(targets, 1))}
            />
          </Section>
          {/* 넣은 영상 효과(2단계 ⑤) — 효과 탭에서 끌어 놓은 것만, 시안 차례대로. 값은 고른 클립 가운데 그 효과를 넣은 클립 모두에. */}
          {VIDEO_EFFECTS.some((kind) => effects[kind] !== undefined) ? (
            <Section title={t('Effects')}>
              {VIDEO_EFFECTS.filter((kind) => effects[kind] !== undefined).map((kind) => (
                <div key={kind} className="flex flex-col gap-1.5">
                  <div className="flex min-h-8 items-center gap-1.5">
                    <span className="mr-1.5 min-w-0 truncate text-label text-foreground">{t(VIDEO_EFFECT_LABEL[kind])}</span>
                    {kind === 'blackWhite' ? (
                      <>
                        <ChoiceChip selected={!!effects.blackWhite} onClick={() => resetTo(!effects.blackWhite, () => setVideoEffect(targets, { blackWhite: true }))}>
                          {t('On')}
                        </ChoiceChip>
                        <ChoiceChip selected={!effects.blackWhite} onClick={() => resetTo(!!effects.blackWhite, () => setVideoEffect(targets, { blackWhite: false }))}>
                          {t('Off')}
                        </ChoiceChip>
                      </>
                    ) : null}
                    <RemoveButton label={t('Remove effect')} onClick={() => removeVideoEffect(targets, kind)} />
                  </div>
                  {kind === 'blur' ? (
                    <SliderRow
                      label={t('Blur')}
                      value={percent(effects.blur ?? 0)}
                      min={0}
                      max={100}
                      resetTitle={t('Double-click to reset to {value}', { value: `${percent(VIDEO_EFFECT_DEFAULT.blur)}%` })}
                      onStart={() => pushHistory()}
                      onChange={(v) => setVideoEffect(targets, { blur: v / 100 })}
                      onReset={() => resetTo(effects.blur !== VIDEO_EFFECT_DEFAULT.blur, () => setVideoEffect(targets, { blur: VIDEO_EFFECT_DEFAULT.blur }))}
                    />
                  ) : null}
                  {kind === 'brightnessContrast' ? (
                    <>
                      <SliderRow
                        label={t('Brightness')}
                        value={percent(bc.brightness)}
                        min={-100}
                        max={100}
                        resetTitle={t('Double-click to reset to {value}', { value: '0%' })}
                        onStart={() => pushHistory()}
                        onChange={(v) => setVideoEffect(targets, { brightness: v / 100 })}
                        onReset={() => resetTo(bc.brightness !== 0, () => setVideoEffect(targets, { brightness: 0 }))}
                      />
                      <SliderRow
                        label={t('Contrast')}
                        value={percent(bc.contrast)}
                        min={-100}
                        max={100}
                        resetTitle={t('Double-click to reset to {value}', { value: '0%' })}
                        onStart={() => pushHistory()}
                        onChange={(v) => setVideoEffect(targets, { contrast: v / 100 })}
                        onReset={() => resetTo(bc.contrast !== 0, () => setVideoEffect(targets, { contrast: 0 }))}
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </Section>
          ) : null}
        </>
      )}

      {/* 시작 · 끝 전환(시안 E1 409:4687–4701) — 효과 탭에서 끌어 놓은 전환의 길이를 고르고 뺀다. 타이틀 카드도 전환은 넣는다. */}
      <Section title={t('Transition')}>
        {(['start', 'end'] as const).map((edge) => {
          const shown = edgeShown(edge)
          return (
            <TransitionRow
              key={edge}
              label={edge === 'start' ? t('Start') : t('End')}
              name={shown?.name ?? null}
              lengthSec={shown?.lengthSec ?? 0}
              onLength={(sec) => setTransitionLength(targets, edge, sec)}
              onRemove={() => setClipTransition(targets, edge, null)}
            />
          )
        })}
      </Section>

      {isTitleCard || isTitleClip ? null : (
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
