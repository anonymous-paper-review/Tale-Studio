'use client'

import { Sparkles } from 'lucide-react'
import type { WriterStatus } from '@/lib/writer/use-writer-status'
import { useT } from '@/lib/i18n'

/**
 * writer-pipeline 의 raw stage 키 → 위트있는 진행 문구(영어 원문 = i18n 키, #i18n-s5-batch2).
 * 키는 /api/writer/status STAGE_FILES 의 `stage` 값 + PIPELINE/persist 마커.
 * 매핑에 없으면 raw 값을 그대로 노출(디버깅용) — 이 함수는 훅을 쓸 수 없는 순수 함수라
 * 반환값은 영어 키 문자열이고, 실제 번역은 렌더 지점(WriterProgress)에서 t() 로 한다.
 */
const STAGE_LABELS: Record<string, string> = {
  PIPELINE: 'Warming up…',
  genre: 'Choosing the tone of the story…',
  narrativeStructure: 'Structuring the plot…',
  characters: 'Breathing life into characters…',
  scenes: 'Breaking the story into scenes…',
  storyCheck: 'Checking the story for gaps…',
  renderFormat_artDirection: 'Setting the visual tone…',
  productionDesign: 'Building sets and props…',
  sceneCinematography: 'Framing the camera…',
  sceneStage: 'Laying out the stage…',
  shotDesign: 'Designing shots…',
  shotCheck: 'Reviewing shots one by one…',
  shotSequence: 'Sequencing the shots…',
  renderPrompts: 'Crafting prompts…',
  assets: 'Gathering props…',
  shotImages: 'Drawing each shot…',
  shotVideos: 'Rolling camera…',
  persistAssets: 'Finalizing characters and backgrounds…',
  persistShots: 'Finalizing the storyboard…',
}

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return 'Raising the curtain…'
  // "sceneCinematography (compact)" 같은 변형은 괄호 앞 키로 매핑
  const key = stage.split(' (')[0]
  return STAGE_LABELS[key] ?? stage
}

/**
 * writer-pipeline 백그라운드 생성 진행 표시 (artist 공용).
 * 호출 측이 레이아웃 컨테이너를 제공하고, 이 컴포넌트는 중앙 정렬 콘텐츠만 렌더.
 * decisions #37 — writer 백그라운드化 + artist 첫 진입 progress gating.
 */
export function WriterProgress({
  status,
  note,
}: {
  status: WriterStatus | null
  /** 텍스트 파이프라인 완료 후 대표 이미지 생성 대기 등, 단계별 보조 안내 */
  note?: string
}) {
  const t = useT()
  return (
    <div className="mx-auto w-full max-w-md space-y-4 text-center">
      <Sparkles className="mx-auto size-8 animate-pulse text-primary" />
      <h1 className="text-xl font-bold">{t('Generating with AI…')}</h1>
      <div className="text-sm text-muted-foreground">
        <div className="text-base font-medium text-foreground">
          {note ?? t(stageLabel(status?.current_stage))}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${note ? 100 : (status?.progress_percent ?? 0)}%` }}
          />
        </div>
        <div className="mt-1 text-xs font-mono">
          {note ? t('Generating images') : `${status?.progress_percent ?? 0}%`}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {note ??
          t('Generating story, characters, scenes, shots, and prompts in the background. About 3-5 minutes.')}
      </p>
    </div>
  )
}
