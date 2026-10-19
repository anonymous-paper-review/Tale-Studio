'use client'

// Storyboard 공용 헤더 — 단계 이름 · 보드 숫자 · [다음: Director로 →], 인라인 탭, 뷰별 액션 슬롯.
//   리뉴얼 1차(2026-10-19, 프로토타입 S1): 이름은 단계 이름 Storyboard(예전 Writers' Room 은 지금 산문 단계 Writer 와 헷갈린다).
//   러닝타임은 목표가 아니라 지표 — 제목 옆에 "씬 3 · 샷 8 · 20초"만 작게 보이고 샷을 고치거나 더하면 같이 바뀐다.

import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { WriterTabs } from '@/features/writer/writer-tabs'
import { WriterEnginePicker } from '@/features/writer/writer-engine-picker'
import { STAGE_LABEL } from '@/lib/constants'
import { useLocale, useT } from '@/lib/i18n'
import { boardStats, boardStatsLabel } from '@/lib/writer/board-summary'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

interface WriterHeaderProps {
  description?: string
  actions?: ReactNode
  /** [다음: Director로 →]를 숨긴다 — 넘김 창을 그리는 러프 보드가 붙지 않는 화면(관리자 V2 미리보기)용. */
  hideNextStep?: boolean
}

export function WriterHeader({ description, actions, hideNextStep = false }: WriterHeaderProps) {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((state) => state.projectId)
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const stats = boardStats(sceneManifest, shots)
  // [다음: Director로 →] — 일반 다음 단계 버튼은 이 단계에서 넘길 곳이 없어 아무것도 보이지 않았다. 넘김 창은 러프 보드가 그린다.
  const openDirectorConfirm = useBoardUiStore((state) => state.setDirectorConfirmOpen)
  const chatBusy = useGlobalChatStore((state) => state.loading)
  const handoffRunning = useGlobalChatStore(
    (state) => state.directorHandoff?.phase === 'checking' || state.directorHandoff?.phase === 'navigating',
  )

  // 탭은 타이틀 아래 행으로 — artist 헤더(제목 → TabsList) 구조와 통일(#c1 2026-07-13).
  // 액션(씬 추가 등)은 탭과 같은 행 우측 — 수직 위치를 탭과 맞춘다(#c8 2026-07-14).
  // 도움말은 상시 설명문 대신 "?" 뱃지 호버로 (2026-08-06).
  return (
    <header className="shrink-0 border-b border-border px-6 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="text-lg font-semibold">{STAGE_LABEL.writer}</h1>
        {description ? <StageHelpBadge text={description} /> : null}
        {stats.shots > 0 ? (
          <span
            className="ml-2 truncate font-mono text-xs tabular-nums text-muted-foreground"
            title={t('Running time: the sum of the shot lengths')}
          >
            {boardStatsLabel(stats, locale)}
          </span>
        ) : null}
        {!hideNextStep ? (
          <Button
            size="sm"
            className="ml-auto shrink-0"
            disabled={stats.shots === 0 || chatBusy || handoffRunning}
            onClick={() => openDirectorConfirm(true)}
            data-testid="storyboard-next-director"
          >
            {t('Next: Director')}
            <ArrowRight className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <WriterTabs />
        <div className="flex shrink-0 items-center gap-3">
          <WriterEnginePicker projectId={projectId} />
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}
