'use client'

// Storyboard 공용 헤더 — 단계 이름 · 보드 숫자 · [다음: Director로 →], 인라인 탭, 뷰별 액션 슬롯.
//   O1(오너 2026-11-26): 같은 보드가 콘티(id conti)에서도 쓰인다 — 콘티 머리는 이름 "콘티"와 [Artist로 가기](다음 단계 단추와 같은 길)다.
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
import { boardStageOf } from '@/lib/writer/board-stage'
import { StoryboardHeader } from '@/features/storyboard/storyboard-header'

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
  const boardStage = useProjectStore((s) => boardStageOf(s.currentStage))
  const handoffConfirmOpen = useGlobalChatStore((state) => state.handoffConfirm !== null)
  // [다음: Director로 →] — 일반 다음 단계 버튼은 이 단계에서 넘길 곳이 없어 아무것도 보이지 않았다. 넘김 창은 러프 보드가 그린다.
  const openDirectorConfirm = useBoardUiStore((state) => state.setDirectorConfirmOpen)
  const chatBusy = useGlobalChatStore((state) => state.loading)
  const handoffRunning = useGlobalChatStore(
    (state) => state.directorHandoff?.phase === 'checking' || state.directorHandoff?.phase === 'navigating',
  )

  // Storyboard(id writer, /studio/writer)는 실사 보기 머리를 쓴다(오너 2026-11-26 m1126 S1 · S2 · S4) — 탭 [스토리보드 | 대사] · [시작]/[멈추기] · [다음: Director로 →].
  //   대사 탭이 이 머리를 부르므로 여기서 넘긴다. 콘티 · 관리자 V2 미리보기(hideNextStep)는 아래 그대로.
  if (boardStage === 'writer' && !hideNextStep) return <StoryboardHeader description={description} tools={actions} />

  // 도움말은 상시 설명문 대신 제목 옆 "?" 뱃지 호버로 (2026-08-06) — v3 에서도 제목 바로 옆에 둔다.
  return (
    <header className="shrink-0 px-7 pt-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {boardStage === 'conti' ? t('Rough storyboard') : STAGE_LABEL.writer}
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
          hideNextStep ? undefined : boardStage === 'conti' ? (
            // 콘티 → Artist(O1 · W4): 다음 단계 단추와 같은 길(넘김 문장을 채팅에 남기며 넘김). 씬 · 샷이 생기기 전에는 꺼진다 — 러프는 다 그리지 않아도 된다.
            <Button
              className="shrink-0"
              disabled={stats.shots === 0 || chatBusy || handoffConfirmOpen}
              onClick={() => void useGlobalChatStore.getState().requestNextStep()}
              data-testid="conti-next-artist"
            >
              {t('Go to Artist')}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              className="shrink-0"
              disabled={stats.shots === 0 || chatBusy || handoffRunning}
              onClick={() => openDirectorConfirm(true)}
              data-testid="storyboard-next-director"
            >
              {t('Next: Director')}
              <ArrowRight className="size-4" />
            </Button>
          )
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
