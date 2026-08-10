'use client'

import { Sparkles } from 'lucide-react'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

/**
 * writer-pipeline 의 raw stage 키 → 위트있는 한글 진행 문구.
 * 키는 /api/writer/status STAGE_FILES 의 `stage` 값 + PIPELINE/persist 마커.
 * 매핑에 없으면 raw 값을 그대로 노출(디버깅용).
 */
const STAGE_LABELS: Record<string, string> = {
  PIPELINE: '시동 거는 중…',
  genre: '이야기의 결을 고르는 중…',
  narrativeStructure: '기승전결을 짜는 중…',
  characters: '캐릭터에 숨을 불어넣는 중…',
  scenes: '장면을 나누는 중…',
  storyCheck: '이야기에 구멍이 없나 살피는 중…',
  renderFormat_artDirection: '화면의 톤앤매너를 잡는 중…',
  productionDesign: '세트를 짓고 소품을 채우는 중…',
  sceneCinematography: '카메라 자리를 잡는 중…',
  shotDesign: '샷을 설계하는 중…',
  shotCheck: '샷을 한 컷씩 검수하는 중…',
  shotSequence: '샷 순서를 엮는 중…',
  renderPrompts: '프롬프트를 빚는 중…',
  assets: '소품을 챙기는 중…',
  shotImages: '한 컷씩 그려내는 중…',
  shotVideos: '카메라를 돌리는 중…',
  persistAssets: '캐릭터·배경을 정리하는 중…',
  persistShots: '콘티를 정리하는 중…',
}

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '막을 올리는 중…'
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
  return (
    <div className="mx-auto w-full max-w-md space-y-4 text-center">
      <Sparkles className="mx-auto size-8 animate-pulse text-primary" />
      <h1 className="text-xl font-bold">AI 자동 생성 진행 중…</h1>
      <div className="text-sm text-muted-foreground">
        <div className="text-base font-medium text-foreground">
          {note ?? stageLabel(status?.current_stage)}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${note ? 100 : (status?.progress_percent ?? 0)}%` }}
          />
        </div>
        <div className="mt-1 text-xs font-mono">
          {note ? '이미지 생성' : `${status?.progress_percent ?? 0}%`}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {note ??
          '스토리, 캐릭터, 씬, 샷, 프롬프트를 백그라운드에서 생성 중. 약 3-5분.'}
      </p>
    </div>
  )
}
