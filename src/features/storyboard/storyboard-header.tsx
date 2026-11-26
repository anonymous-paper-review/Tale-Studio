'use client'

// Storyboard 화면 머리(오너 2026-11-26 m1126 S1 · S4) — 지금 Storyboard 머리와 같은 자리: 단계 이름 · 보드 숫자 · 오른쪽 단추, 그 아래 알약 탭 줄.
//   탭은 [스토리보드 | 대사] — 첫 칸 이름이 "러프 스토리보드"에서 "스토리보드"가 됐다(S4). "러프 스토리보드"(→ 콘티)는 Writer 콘티의 칸 이름이다.
//   오른쪽 단추는 [시작] · [멈추기] · [다음: Director로 →](StoryboardHeaderActions — 크림은 하나). 두 칸 모두 이 머리를 쓴다.
//   약속: tests/writer/real-header.test.ts · tests/writer/real-tabs.test.ts
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { StageHelpBadge } from '@/components/stage-help-badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { StoryboardHeaderActions } from '@/features/storyboard/header-actions'
import { STAGE_LABEL } from '@/lib/constants'
import { useLocale, useT } from '@/lib/i18n'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { boardStats, boardStatsLabel } from '@/lib/writer/board-summary'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'

/** Storyboard 탭 순서 — 스토리보드 · 대사. 관리자 V2 미리보기 칸은 나누기 결과를 보는 칸이라 Writer 콘티에 둔다. */
export const STORYBOARD_TABS: readonly WriterTab[] = ['storyboard', 'dialogue']

export function StoryboardTabs() {
  const t = useT()
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const setActiveTab = useWriterUiStore((state) => state.setActiveTab)
  const value = STORYBOARD_TABS.includes(activeTab) ? activeTab : 'storyboard'
  // Alt+←/→ 로 스토리보드 ↔ 대사(#keyboard-only — 지금 탭과 같다).
  useAltArrowCycle(STORYBOARD_TABS, value, setActiveTab)
  return (
    <AltArrowHint>
      <Tabs value={value} onValueChange={(next) => setActiveTab(next as WriterTab)} className="w-fit shrink-0">
        <TabsList variant="pill">
          <TabsTrigger value="storyboard">{t('Storyboard')}</TabsTrigger>
          <TabsTrigger value="dialogue">{t('Dialogue')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </AltArrowHint>
  )
}

export function StoryboardHeader({ description, tools }: { description?: string; tools?: ReactNode }) {
  const locale = useLocale()
  const t = useT()
  const sceneManifest = useWriterStore((state) => state.sceneManifest)
  const shots = useWriterStore((state) => state.shots)
  const stats = boardStats(sceneManifest, shots)
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
        actions={<StoryboardHeaderActions />}
      />
      <div className="mt-[18px] flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <StoryboardTabs />
        {tools ? <div className="ml-auto flex shrink-0 items-center gap-3">{tools}</div> : null}
      </div>
    </header>
  )
}
