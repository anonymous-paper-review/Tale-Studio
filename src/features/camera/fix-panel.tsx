'use client'

// Camera 샷 줄 안에서 고치기(오너 2026-11-22 D2~D5 "채팅 및 버튼으로 수정") — 샷 상세의 이미지 고치기 · 영상 고치기와 같은 규칙을 줄 안 작은 칸으로(시안 없음).
//   [이미지 고치기]: 바꿀 점(이번 그림에만) + 시작 · 끝 다시 그리기(Takes 0, 지금 그림은 판으로 남는다 — 11/14 답 5).
//   [영상 만들기]: 바꿀 점 + 늘 새 Take(가장 새 Take 의 모델 · 해상도 · 배선을 이어받는다, 단추에 Take 값 — 약속 E). 모델 · 해상도 · 참고 그림은 ⤢ 상세에서.
//   영상 방식(기본 시작+끝 외 넷 — D2~D5)은 영상 방식 조각에서 이 칸에 더한다. 약속: tests/camera/fix.test.ts
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { fetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { VIDEO_MODELS, VIDEO_MODEL_ASPECT_TEXT, clampDuration, effectiveVideoResolution, videoModelFitsAspectRatio } from '@/lib/video-models'
import { videoAspectRatioFromFormat } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { imageChangedForTake, latestShotTake, newTakeRequest, shotDetailFrames, shotDetailTakes, takePhaseOf, takeSettings } from '@/lib/director/shot-detail'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { useWriterStore } from '@/stores/writer-store'
import type { ShotNodeData, VideoOverride } from '@/types/director'
import { cn } from '@/lib/utils'
import { videoModeAvailability, type VideoMode } from '@/lib/director/video-modes'
import { prepareContinueFrom } from '@/lib/director/video-frame-capture'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { newTakeButton } from './new-take'
import { CAMERA_VIDEO_MODES, VIDEO_MODE_HINT, VIDEO_MODE_LABEL, cameraModeFacts, defaultVideoMode, freshTakeFields, videoModeBlockText } from './video-mode'

const PANEL = 'flex flex-col gap-2 rounded-[12px] bg-card p-2.5'
// 줄 왼쪽 칸(폭 240)에 든 단추 — 긴 이름("시작·끝 이미지 다시 만들기 · Takes 0")이 칸 밖으로 잘리지 않게 줄을 바꾼다(조각 6 화면 확인).
const PANEL_BUTTON = 'h-auto min-h-8 w-full whitespace-normal py-1.5 text-left leading-snug'

export function ImageFixPanel({ shotNodeId, data }: { shotNodeId: string; data: ShotNodeData }) {
  const t = useT()
  const [imageChange, setImageChange] = useState('')
  const hasImage = !!shotDetailFrames(data.storyboardImage).start
  return (
    <div className={PANEL} data-testid="camera-fix-image">
      <Textarea
        value={imageChange}
        onChange={(event) => setImageChange(event.target.value)}
        rows={2}
        className="min-h-0 text-caption"
        placeholder={t('Write only what you want to change in the images (e.g. show the umbrella handle)')}
      />
      <StoryboardImageButton
        nodeId={shotNodeId}
        data={data}
        changeNote={imageChange}
        className={PANEL_BUTTON}
        idleLabel={hasImage ? t('Remake images · Takes 0') : t('Make images · Takes 0')}
      />
    </div>
  )
}

export function VideoMakePanel({ shotNodeId, data }: { shotNodeId: string; data: ShotNodeData }) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const generateVideoForShot = useDirectorCanvasStore((s) => s.generateVideoForShot)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const writerShots = useWriterStore((s) => s.shots)
  // 프로젝트 화면비(오너 V3 — Veo 는 16:9 · 9:16 만). 포맷을 아직 모르면 16:9(서버와 같은 대비값).
  const aspectRatio = videoAspectRatioFromFormat(useProjectFormatStore((s) => s.format)) ?? '16:9'
  const takeBalance = useTakeBalance()
  const imageGeneration = useStoryboardImageGeneration(data)
  // 이어받는 Take = 가장 새 Take(다시 만들기와 같은 규칙) — 그 Take 의 바꿀 점을 미리 채우고, 고치거나 지울 수 있다(쌓이지 않는다).
  const base = latestShotTake(nodes, shotNodeId)
  const [note, setNote] = useState(((base?.data.override ?? {}) as VideoOverride).changeNote ?? '')
  const [sending, setSending] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 방식(오너 D2~D5) — 처음엔 가장 새 Take 의 방식(없으면 기본). 고를 수 없는 방식은 까닭과 함께 꺼진다(fb-video videoModeAvailability).
  const [mode, setMode] = useState<VideoMode>(() => defaultVideoMode(base?.data ?? null))
  const { facts, previous, previousNoRecord } = useMemo(() => cameraModeFacts({ shotNodeId, nodes, writerShots: writerShots ?? [] }), [shotNodeId, nodes, writerShots])
  const modeState = videoModeAvailability(mode, facts)
  const { takes } = shotDetailTakes(nodes, shotNodeId)
  const setup = takeSettings(data, base?.data ?? null)
  const count = takeCostForVideo(setup.model, setup.resolution)
  // 모델이 받는 길이로 맞춘 영상 길이 — 샷 길이와 다르면 샷 상세 영상 탭과 같은 한 줄로 알린다(fb-video QA 발견 2 · 리드 2026-11-23, 예: Seedance 최소 4초).
  const videoSeconds = clampDuration(VIDEO_MODELS[setup.model], data.durationSeconds)
  const hasImage = !!shotDetailFrames(data.storyboardImage).start
  const button = newTakeButton({
    hasImage,
    imageBusy: hasImage && (imageGeneration.generating || data.storyboardImage?.status === 'pending'),
    takeMaking: takes.some((take) => takePhaseOf(take.data) === 'making'),
    batchBusy: videoBatchBusy,
    sending,
    hasTake: !!base,
    imageChanged: !!base && imageChangedForTake(data.storyboardImage, base.data),
    modelFits: videoModelFitsAspectRatio(setup.model, aspectRatio),
  })
  // 단추 값이 곧 동의인 자리 — 잔액을 못 읽어도 값을 보이고, 숨기는 것은 과금이 꺼졌을 때뿐이다(entry D8 과 같은 말).
  //   방식은 Take 값을 바꾸지 않는다(값 = 모델 · 해상도).
  const label = takeValuesShown(takeBalance) ? countText(t, count, button.label.one, button.label.many, { count }) : t(button.label.plain)
  const blockedReason = button.reason ?? (modeState.enabled ? null : videoModeBlockText(modeState.reason, { previousNoRecord }))
  const disabled = button.disabled || !modeState.enabled || capturing

  const make = async () => {
    if (disabled) return
    setSending(true)
    setNotice(null)
    try {
      // 누를 때 Take 를 다시 읽는다 — 못 읽으면 시작하지 않고 까닭을 보인다(다시 누르면 다시 읽는다).
      if ((await fetchTakeBalance()).failed) {
        setNotice(t("I couldn't check your Takes, so I didn't start. Please try again in a moment."))
        return
      }
      // ① 이어서: 앞 샷의 Editor 로 가는 Take 영상에서 마지막 장면을 잡아 올린다(fb-video). 못 잡으면 Take 를 쓰지 않고 까닭을 보인다.
      let continueFrom = null
      if (mode === 'continue') {
        if (!previous || !projectId) return
        setCapturing(true)
        const prepared = await prepareContinueFrom({ projectId, source: { videoClipId: previous.videoClipId, generationJobId: previous.generationJobId, videoUrl: previous.videoUrl }, plannedSec: previous.plannedSec }).finally(() => setCapturing(false))
        if (!prepared.ok) {
          setNotice(t(
            prepared.reason === 'black_frame'
              ? 'The previous video ends on a black screen, so there is no scene to continue from.'
              : prepared.reason === 'upload_failed'
                ? 'Unable to upload the source video last frame.'
                : 'Unable to capture the source video last frame.',
          ))
          return
        }
        continueFrom = prepared.continueFrom
      }
      // 첫 영상에는 이어받을 앞 영상이 없어 바꿀 점을 싣지 않는다(샷 상세와 같다).
      const change = base ? note : ''
      await generateVideoForShot(shotNodeId, newTakeRequest({
        takeId: base?.id ?? null,
        take: base?.data ?? null,
        shotPrompt: effectivePrompt(data),
        change,
        // 방식 · 사람 말 · 만든 길은 Take 마다 새로 적는다(옛 Take 의 말이 새 판 요약에 붙지 않게).
        fresh: freshTakeFields({ mode, change, continueFrom }),
      }))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={PANEL} data-testid="camera-make-video">
      {/* 방식 다섯(오너 D2~D5) — 고를 수 없는 방식은 꺼지고 마우스를 올리면 까닭이 보인다. 고른 방식이 하는 일은 아래 한 줄. */}
      <div role="radiogroup" aria-label={t('How to make the video')} className="flex flex-wrap gap-1">
        {CAMERA_VIDEO_MODES.map((option) => {
          const state = videoModeAvailability(option, facts)
          const chosen = option === mode
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen}
              // 막힌 방식도 지금 고른 것이면 누를 수 있게 둔다(까닭을 보고 다른 방식으로 바꾼다).
              disabled={!state.enabled && !chosen}
              title={state.enabled ? t(VIDEO_MODE_HINT[option]) : t(videoModeBlockText(state.reason, { previousNoRecord }))}
              onClick={() => setMode(option)}
              className={cn(
                'h-6 rounded-full px-2 text-micro font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                chosen ? 'bg-accent text-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t(VIDEO_MODE_LABEL[option])}
            </button>
          )
        })}
      </div>
      <p className="text-micro leading-snug text-subtle-foreground">{t(VIDEO_MODE_HINT[mode])}</p>
      {/* 꺼진 방식마다 까닭 한 줄(꺼진 단추 아래 이유 한 줄) — 그림이 없어서 모두 꺼진 때는 아래 단추 까닭이 말한다. */}
      {CAMERA_VIDEO_MODES.map((option) => {
        const state = videoModeAvailability(option, facts)
        if (state.enabled || state.reason === 'storyboard_missing' || option === mode) return null
        return (
          <p key={option} className="text-micro leading-snug text-subtle-foreground">
            {t(VIDEO_MODE_LABEL[option])} · {t(videoModeBlockText(state.reason, { previousNoRecord }))}
          </p>
        )
      })}
      {base ? (
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="min-h-0 text-caption"
          placeholder={t('What to change in the motion or camera · Leave it empty to keep the shot prompt')}
        />
      ) : null}
      <p className="text-micro text-subtle-foreground">
        {VIDEO_MODELS[setup.model].label} · {effectiveVideoResolution(setup.model, setup.resolution)}
      </p>
      {videoSeconds !== data.durationSeconds ? (
        <p className="text-micro text-warning">{t('Length: shot {shot}s → video {video}s', { shot: data.durationSeconds, video: videoSeconds })}</p>
      ) : null}
      <Button type="button" size="sm" variant="outline" className={PANEL_BUTTON} disabled={disabled} onClick={() => void make()}>
        {label}
      </Button>
      {capturing ? <p className="text-micro text-subtle-foreground">{t("Getting the last frame of the previous shot's video…")}</p> : null}
      {/* 이어받은 모델이 화면비에 안 맞으면(V3) 어디서 바꾸는지까지 — 이 칸에는 모델 고르기가 없다(⤢ 상세). */}
      {blockedReason ? (
        <p className="text-micro text-subtle-foreground">
          {blockedReason === VIDEO_MODEL_ASPECT_TEXT ? `${t(blockedReason)} ${t('Change the model in Details.')}` : t(blockedReason)}
        </p>
      ) : null}
      {notice ? <p className="text-micro text-destructive">{notice}</p> : null}
    </div>
  )
}
