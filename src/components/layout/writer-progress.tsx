'use client'

import { Sparkles } from 'lucide-react'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

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
        <div>
          현재 단계:{' '}
          <span className="font-mono">
            {note ?? status?.current_stage ?? '시작 중'}
          </span>
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
