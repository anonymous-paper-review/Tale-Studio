'use client'

// Director 샷 상세(디자이너 11/13 시안 D6 · D7, 오너 2026-11-14) — 샷 하나에 이미지 · 영상 탭.
//   스토리보드형은 팝업(DirectorNodePopup), 노드형은 왼쪽 패널(DirectorDetailPanel)이 이 부품을 같은 내용으로 연다.
//   규칙: lib/director/shot-detail · 약속: tests/director/shot-detail.test.ts · shot-detail-view.test.ts
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { cn } from '@/lib/utils'
import { latestShotTake, shotDetailFrames, shotDetailTakes, takePhaseOf, takeSettings, videoTabLabelKey, type ShotDetailTab } from '@/lib/director/shot-detail'
import { fetchTakeBalance, useTakeBalance } from '@/lib/billing/use-take-balance'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData } from '@/types/director'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { directorNodeLabel } from '@/features/director/node-label'
import { ShotImageTab } from './shot-image-tab'
import { ShotVideoTab } from './shot-video-tab'

export function DirectorShotDetail({ shotNodeId, initialTab = 'image', initialTakeId = null, openSeq, layout, onClose }: {
  shotNodeId: string
  initialTab?: ShotDetailTab
  /** 영상 노드에서 열었으면 그 Take 를 먼저 보인다. */
  initialTakeId?: string | null
  /** 상세를 연 차례(노드형 패널, openShotDetail) — 바뀌면 다시 붙이지 않고 탭만 initialTab 으로 맞춘다. */
  openSeq?: number
  layout: 'popup' | 'panel'
  onClose: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<ShotDetailTab>(initialTab)
  // 스크롤 칸 — 노드형 패널에서는 이 맨 바깥 칸이 스크롤된다.
  const rootRef = useRef<HTMLDivElement>(null)
  // 이미 열린 상세를 [바꾸기] · ⤢ 로 다시 열면 탭만 고른 탭으로 맞춘다 — 다시 붙이면 상세 안에서 보내기 전에 적던 글이 지워졌다(리드 11/14).
  //   탭이 바뀔 때는 맨 위로 올려 탭 머리가 보이게 한다 — 내려가 있던 채 바뀌면 탭 머리 · Take 머리가 화면 밖이었다(영어 재점검 qa-golden).
  useEffect(() => {
    if (openSeq !== undefined && tab !== initialTab && rootRef.current) rootRef.current.scrollTop = 0
    if (openSeq !== undefined) setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 여는 차례가 바뀔 때만 맞춘다(사람이 안에서 바꾼 탭은 그대로 둔다)
  }, [openSeq])
  // [다음: 영상 만들기]가 Take 를 확인하지 못해 시작하지 않은 까닭 — 이미지 탭 단추 아래에 보이고, 다음에 누를 때 지운다.
  const [nextNotice, setNextNotice] = useState<string | null>(null)
  // 잔액을 다시 읽는 동안 [다음: 영상 만들기]를 끈다 — 두 번 눌러 새 Take 가 두 번 나가지 않게(검토 b 탐침 D4, 영상 탭 단추와 같은 꼴).
  //   상태는 단추를 끄고, ref 는 같은 화면에서 빠르게 두 번 불려도 한 번만 시작하게 한다.
  const [nextStarting, setNextStarting] = useState(false)
  const nextStartingRef = useRef(false)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const remakeShotVideo = useDirectorCanvasStore((s) => s.remakeShotVideo)
  const videoBatchBusy = useDirectorCanvasStore((s) => s.videoBatchBusy)
  const takeBalance = useTakeBalance()
  // 이름은 캔버스 · 보드와 같은 것("Shot 4" · "Scene 1") — Writer 의 원래 id(sh_01_04)를 보이지 않는다.
  const boardNames = useBoardNodeNames()
  const node = nodes.find((n) => n.id === shotNodeId)
  const imageGeneration = useStoryboardImageGeneration(node && isShotData(node.data) ? node.data : null)
  if (!node || !isShotData(node.data)) return null
  const data = node.data
  const scene = data.parentSceneNodeId ? nodes.find((n) => n.id === data.parentSceneNodeId) : undefined
  const { takes } = shotDetailTakes(nodes, shotNodeId)
  const videoLabel = videoTabLabelKey(takes.length)
  // [다음: 영상 만들기 · N Take](D6) — 다시 만들기와 같은 설정(가장 최근 Take, 없으면 샷)으로 새 Take 를 만들고 영상 탭으로 간다.
  const settings = takeSettings(data, latestShotTake(nodes, shotNodeId)?.data ?? null)
  const count = takeCostForVideo(settings.model, settings.resolution)
  const makeVideo = {
    // 단추 값이 곧 동의인 자리 — 잔액을 못 읽어도 값을 보인다(영상 탭 단추 · entry D8 과 같은 말, 리드 2026-11-14).
    label: takeValuesShown(takeBalance) ? countText(t, count, 'Next: make the video · 1 Take', 'Next: make the video · {count} Takes', { count }) : t('Next: make the video'),
    // 시작 · 끝 이미지를 다시 만드는 중(또는 기다리는 중)이면 옛 그림으로 Take 가 나간다(리드 검토 c ①).
    disabled: !shotDetailFrames(data.storyboardImage).start || videoBatchBusy || takes.some((take) => takePhaseOf(take.data) === 'making')
      || imageGeneration.generating || data.storyboardImage?.status === 'pending' || nextStarting,
    // 누를 때 잔액을 다시 읽고, 못 읽으면 시작하지 않고 이미지 탭에 남아 까닭을 보인다.
    run: async () => {
      if (nextStartingRef.current) return
      nextStartingRef.current = true
      setNextStarting(true)
      setNextNotice(null)
      try {
        if ((await fetchTakeBalance()).failed) {
          setNextNotice(t("I couldn't check your Takes, so I didn't start. Please try again in a moment."))
          return
        }
        void remakeShotVideo(shotNodeId)
        setTab('video')
      } finally {
        nextStartingRef.current = false
        setNextStarting(false)
      }
    },
    notice: nextNotice,
  }
  const meta = [scene ? directorNodeLabel(scene.data, boardNames) : null, t('{seconds}s', { seconds: data.durationSeconds }), effectivePrompt(data)].filter(Boolean).join(' · ')

  return (
    <div ref={rootRef} className={cn('flex min-h-0 flex-col gap-4', layout === 'panel' && 'h-full overflow-y-auto p-5')} data-testid="director-shot-detail">
      {/* 패널은 높이가 정해진 세로 줄이라 머리 · 설명 줄이 눌려 사라지지 않게 shrink-0. */}
      <header className="flex shrink-0 items-center gap-3">
        <h2 className="text-h3 font-semibold">{directorNodeLabel(data, boardNames)}</h2>
        <Tabs value={tab} onValueChange={(value) => setTab(value as ShotDetailTab)}>
          <TabsList className="h-9 rounded-full bg-background p-1 shadow-node">
            <TabsTrigger value="image" className="rounded-full px-4">{t('Image')}</TabsTrigger>
            <TabsTrigger value="video" className="rounded-full px-4">{t(videoLabel.key, videoLabel.params)}</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* 팝업은 창 자신의 닫기(✕)를 쓴다 — 왼쪽 패널만 여기서 닫는다. */}
        {layout === 'panel' ? (
          <button type="button" onClick={onClose} aria-label={t('Close')} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <X className="size-5" />
          </button>
        ) : null}
      </header>
      <p className="line-clamp-2 shrink-0 text-caption text-subtle-foreground">{meta}</p>
      {tab === 'image'
        ? <ShotImageTab nodeId={shotNodeId} data={data} layout={layout} makeVideo={makeVideo} />
        : <ShotVideoTab shotNodeId={shotNodeId} data={data} layout={layout} initialTakeId={initialTakeId} />}
    </div>
  )
}
