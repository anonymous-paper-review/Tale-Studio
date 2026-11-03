'use client'

// Storyboard 공용 헤더 — 단계 이름 · 보드 숫자 · [다음: Director로 →], 인라인 탭, 뷰별 액션 슬롯.
//   리뉴얼 1차(2026-10-19, 프로토타입 S1): 이름은 단계 이름 Storyboard(예전 Writers' Room 은 지금 산문 단계 Writer 와 헷갈린다).
//   러닝타임은 목표가 아니라 지표 — 제목 옆에 "씬 3 · 샷 8 · 20초"만 작게 보이고 샷을 고치거나 더하면 같이 바뀐다.
//   v3(2026-11-03 오너 "v3로 적용", 시안 S1): 화면 머리(PageHeader — 큰 제목 · 메타 · 크림 단추) 아래 도구 줄 하나 —
//   알약 탭 · 탭 옆 도구(러프 보드의 [+ 씬 추가] · [+ 샷 추가]) · 오른쪽 액션(확대 · 축소 등). [마스터 시트]는 두지 않는다(오너 결정 3).

import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
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
  /** 탭 바로 옆 도구(러프 보드의 [+ 씬 추가] · [+ 샷 추가]). */
  tools?: ReactNode
  /** 도구 줄 오른쪽 액션(확대 · 축소 · 빠진 패널 그리기). */
  actions?: ReactNode
  /** [다음: Director로 →]를 숨긴다 — 넘김 창을 그리는 러프 보드가 붙지 않는 화면(관리자 V2 미리보기)용. */
  hideNextStep?: boolean
}

export function WriterHeader({ description, tools, actions, hideNextStep = false }: WriterHeaderProps) {
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

  // 도움말은 상시 설명문 대신 제목 옆 "?" 뱃지 호버로 (2026-08-06) — v3 에서도 제목 바로 옆에 둔다.
  return (
    <header className="shrink-0 px-7 pt-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {STAGE_LABEL.writer}
            {description ? <StageHelpBadge text={description} /> : null}
          </span>
        }
        meta={
          stats.shots > 0 ? (
            <span className="tabular-nums" title={t('Running time: the sum of the shot lengths')}>
              {boardStatsLabel(stats, locale)}
            </span>
          ) : undefined
        }
        actions={
          !hideNextStep ? (
            <Button
              className="shrink-0"
              disabled={stats.shots === 0 || chatBusy || handoffRunning}
              onClick={() => openDirectorConfirm(true)}
              data-testid="storyboard-next-director"
            >
              {t('Next: Director')}
              <ArrowRight className="size-4" />
            </Button>
          ) : undefined
        }
      />
      <div className="mt-[18px] flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <WriterTabs />
        {tools ? <div className="ml-2.5 flex flex-wrap items-center gap-1.5">{tools}</div> : null}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <WriterEnginePicker projectId={projectId} />
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}
