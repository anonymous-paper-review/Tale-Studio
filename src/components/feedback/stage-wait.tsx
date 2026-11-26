'use client'

// 단계 화면을 여는 동안 기다리는 카드(오너 2026-11-26 m1126 G1 "탭 전환 시 로딩되기 전에 Editor의 탭처럼 로딩창 띄우기").
//   Editor 의 "클립 준비 중…"과 같은 카드(AiBusyCard — 그 단계 옷 Lumi L · 제목 한 줄 · 설명 없음)를 화면 가운데에 둔다.
//   잠금이 아니다: 덮개 · inert · 레일 붙잡기가 없어 읽는 동안에도 레일로 다른 단계에 가고 채팅을 쓴다(Editor 와 같다).
//   언제 보일지는 lib/stage-wait · hooks/use-stage-wait, 레일을 누른 순간(경로 코드가 오기 전)은 app/studio/<단계>/loading.tsx 가 같은 카드를 그린다.
//   cover = 이미 붙여 둔 판(Director 캔버스) 위를 덮는다 — 판은 그대로 두고 보이지만 않게. 약속: tests/project/stage-wait.test.ts
import { AiBusyCard } from '@/components/ai-busy-overlay'
import { useT } from '@/lib/i18n'
import { STAGE_PERSONA } from '@/lib/lumi'
import { STAGE_WAIT_TITLE } from '@/lib/stage-wait'
import { cn } from '@/lib/utils'
import type { StageId } from '@/types'

export function StageWaitCard({ stage, cover = false }: { stage: StageId; cover?: boolean }) {
  const t = useT()
  return (
    <div
      className={cn('flex flex-1 items-center justify-center p-6', cover && 'absolute inset-0 z-sticky bg-background')}
      role="status"
      aria-busy
      data-testid="stage-wait"
      data-stage-wait={stage}
    >
      {/* 설명은 비워 둔다 — 비우지 않으면 카드가 AI 작업 잠금 안내를 붙인다(읽기는 AI 작업이 아니다). */}
      <AiBusyCard lumi={STAGE_PERSONA[stage]} title={t(STAGE_WAIT_TITLE[stage])} description="" />
    </div>
  )
}
