'use client'

// Camera 샷 줄 안에서 고치기(오너 2026-11-22 D2~D5 "채팅 및 버튼으로 수정") — 샷 상세의 이미지 고치기 · 영상 고치기와 같은 규칙을 줄 안 작은 칸으로(시안 없음).
//   [이미지 고치기]: 바꿀 점(이번 그림에만) + 시작 · 끝 다시 그리기(Takes 0, 지금 그림은 판으로 남는다 — 11/14 답 5).
//   [영상 만들기]: 바꿀 점 + 늘 새 Take(가장 새 Take 의 모델 · 해상도 · 배선을 이어받는다, 단추에 Take 값 — 약속 E). 모델 · 해상도 · 참고 그림은 ⤢ 상세에서.
//   영상 방식(기본 시작+끝 외 넷 — D2~D5)은 영상 방식 조각에서 이 칸에 더한다. 약속: tests/camera/fix.test.ts
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { fetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { VIDEO_MODELS, effectiveVideoResolution } from '@/lib/video-models'
import { imageChangedForTake, latestShotTake, newTakeRequest, shotDetailFrames, shotDetailTakes, takePhaseOf, takeSettings } from '@/lib/director/shot-detail'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import type { ShotNodeData, VideoOverride } from '@/types/director'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { StoryboardImageButton } from '@/features/director/storyboard-image-button'
import { newTakeButton } from './new-take'

const PANEL = 'flex flex-col gap-2 rounded-[12px] bg-card p-2.5'

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
        placeholder={t('Write only what you want to change in the start and end images (e.g. show the umbrella handle)')}
      />
      <StoryboardImageButton
        nodeId={shotNodeId}
        data={data}
        changeNote={imageChange}
        idleLabel={hasImage ? t('Remake start and end images · Takes 0') : t('Make start and end images · Takes 0')}
      />
    </div>
  )
}

export function VideoMakePanel({ shotNodeId, data }: { shotNodeId: string; data: ShotNodeData }) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const generateVideoForShot = useDirectorCanvasStore((s) => s.generateVideoForShot)
  const takeBalance = useTakeBalance()
  const imageGeneration = useStoryboardImageGeneration(data)
  // 이어받는 Take = 가장 새 Take(다시 만들기와 같은 규칙) — 그 Take 의 바꿀 점을 미리 채우고, 고치거나 지울 수 있다(쌓이지 않는다).
  const base = latestShotTake(nodes, shotNodeId)
  const [note, setNote] = useState(((base?.data.override ?? {}) as VideoOverride).changeNote ?? '')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { takes } = shotDetailTakes(nodes, shotNodeId)
  const setup = takeSettings(data, base?.data ?? null)
  const count = takeCostForVideo(setup.model, setup.resolution)
  const hasImage = !!shotDetailFrames(data.storyboardImage).start
  const button = newTakeButton({
    hasImage,
    imageBusy: hasImage && (imageGeneration.generating || data.storyboardImage?.status === 'pending'),
    takeMaking: takes.some((take) => takePhaseOf(take.data) === 'making'),
    batchBusy: videoBatchBusy,
    sending,
    hasTake: !!base,
    imageChanged: !!base && imageChangedForTake(data.storyboardImage, base.data),
  })
  // 단추 값이 곧 동의인 자리 — 잔액을 못 읽어도 값을 보이고, 숨기는 것은 과금이 꺼졌을 때뿐이다(entry D8 과 같은 말).
  const label = takeValuesShown(takeBalance) ? countText(t, count, button.label.one, button.label.many, { count }) : t(button.label.plain)

  const make = async () => {
    if (button.disabled) return
    setSending(true)
    setNotice(null)
    try {
      // 누를 때 Take 를 다시 읽는다 — 못 읽으면 시작하지 않고 까닭을 보인다(다시 누르면 다시 읽는다).
      if ((await fetchTakeBalance()).failed) {
        setNotice(t("I couldn't check your Takes, so I didn't start. Please try again in a moment."))
        return
      }
      // 첫 영상에는 이어받을 앞 영상이 없어 바꿀 점을 싣지 않는다(샷 상세와 같다).
      const change = base ? note : ''
      await generateVideoForShot(shotNodeId, newTakeRequest({
        takeId: base?.id ?? null,
        take: base?.data ?? null,
        shotPrompt: effectivePrompt(data),
        change,
      }))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={PANEL} data-testid="camera-make-video">
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
      <Button type="button" size="sm" variant="outline" disabled={button.disabled} onClick={() => void make()}>
        {label}
      </Button>
      {button.reason ? <p className="text-micro text-subtle-foreground">{t(button.reason)}</p> : null}
      {notice ? <p className="text-micro text-destructive">{notice}</p> : null}
    </div>
  )
}
