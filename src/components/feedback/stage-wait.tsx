'use client'

// 단계 화면을 여는 동안 기다리는 카드(오너 2026-11-26 m1126 G1 "탭 전환 시 로딩되기 전에 Editor의 탭처럼 로딩창 띄우기").
//   Editor 의 "클립 준비 중…"과 같은 카드(AiBusyCard — 그 단계 옷 Lumi L · 제목 한 줄 · 설명 없음)를 화면 가운데에 둔다.
//   잠금이 아니다: 덮개 · inert · 레일 붙잡기가 없어 읽는 동안에도 레일로 다른 단계에 가고 채팅을 쓴다(Editor 와 같다).
//   언제 보일지는 lib/stage-wait · hooks/use-stage-wait, 레일을 누른 순간(경로 코드가 오기 전)은 app/studio/<단계>/loading.tsx 가 같은 카드를 그린다.
//   cover = 이미 붙여 둔 판(Director 캔버스) 위를 덮는다 — 판은 그대로 두고 보이지만 않게. 약속: tests/project/stage-wait.test.ts
import { useSyncExternalStore } from 'react'
import { AiBusyCard } from '@/components/ai-busy-overlay'
import { useT } from '@/lib/i18n'
import { STAGE_WAIT_TITLE, stageWaitPersona, type StageWaitScreen } from '@/lib/stage-wait'
import { cn } from '@/lib/utils'

const subscribeNothing = () => () => {}

export function StageWaitCard({ stage, cover = false }: { stage: StageWaitScreen; cover?: boolean }) {
  const t = useT()
  // 서버는 그 사람 화면 언어를 모른다(언어는 브라우저 저장소 · 계정에만) — 서버 · 하이드레이션 첫 그림에서는 제목 줄 자리만 두고 글을 보이지 않게,
  //   앱이 붙은 뒤 그 언어로 보인다(m-qa 2026-11-27: 첫 0.1~0.2초 영어 "Loading the prose…"). 화면 안 이동(앱이 붙은 뒤)은 처음부터 보인다.
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false)
  return (
    <div
      className={cn('flex flex-1 items-center justify-center p-6', cover && 'absolute inset-0 z-sticky bg-background', !inBrowser && '[&_h2]:invisible')}
      role="status"
      aria-busy
      data-testid="stage-wait"
      data-stage-wait={stage}
    >
      {/* 설명은 비워 둔다 — 비우지 않으면 카드가 AI 작업 잠금 안내를 붙인다(읽기는 AI 작업이 아니다). */}
      <AiBusyCard lumi={stageWaitPersona(stage)} title={t(STAGE_WAIT_TITLE[stage])} description="" />
    </div>
  )
}
