'use client'

// Storyboard(id writer, /studio/writer) 작업 공간(오너 2026-11-26 m1126 S1 "현재 UI 그대로 — 스토리보드랑 대사").
//   두 칸을 함께 올려 두고(칸 안 상태 보존) 보이는 칸만 보인다 — 지금 작업 공간과 같은 방식 · 같은 옆으로 미는 움직임.
//   스토리보드 = 실사 보기 보드(처음엔 Writer 콘티 그림, [시작] → 실사), 대사 = 지금 대사 탭 그대로.
//   씬 · 샷 나누기 · 러프 그리기 · 관리자 V2 미리보기는 Writer 콘티(/studio/conti)에 있다.
import { useState } from 'react'
import { StageWaitCard } from '@/components/feedback/stage-wait'
import { DialogueView } from '@/features/writer/dialogue-view'
import { useStoryboardWait } from '@/hooks/use-stage-wait'
import { RealBoardView } from '@/features/storyboard/real-board-view'
import { STORYBOARD_TABS } from '@/features/storyboard/storyboard-header'
import { cn } from '@/lib/utils'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'

export function StoryboardWorkspace() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  // 샷을 아직 다 읽기 전에는 "아직 생성된 씬·샷이 없어요" 대신 Storyboard 기다리는 카드(오너 2026-11-26 m1126 G1 — 지금 작업 공간과 같다).
  const storyboardWait = useStoryboardWait()
  // 콘티에서 고른 칸(관리자 V2 미리보기 등)이 넘어와도 스토리보드 칸으로 본다.
  const visible: WriterTab = activeTab === 'dialogue' ? 'dialogue' : 'storyboard'
  // 칸을 옮길 때 옆으로 미는 움직임(#c1) — 두 칸이 함께 올라가 있어 다시 그리기 연출을 못 쓰니 보이는 칸에만 animate-in 을 얹는다.
  const [prev, setPrev] = useState(visible)
  const [slide, setSlide] = useState<'forward' | 'back' | 'none'>('none')
  if (visible !== prev) {
    setSlide(STORYBOARD_TABS.indexOf(visible) > STORYBOARD_TABS.indexOf(prev) ? 'forward' : 'back')
    setPrev(visible)
  }
  const slideClass =
    slide === 'forward'
      ? 'animate-in fade-in-25 slide-in-from-right-6 duration-500 ease-out motion-reduce:animate-none'
      : slide === 'back'
        ? 'animate-in fade-in-25 slide-in-from-left-6 duration-500 ease-out motion-reduce:animate-none'
        : undefined
  if (storyboardWait) return <StageWaitCard stage="writer" />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden={visible !== 'storyboard'} className={visible === 'storyboard' ? cn('flex min-h-0 flex-1 flex-col', slideClass) : 'hidden'}>
        <RealBoardView />
      </div>
      <div aria-hidden={visible !== 'dialogue'} className={visible === 'dialogue' ? cn('flex min-h-0 flex-1 flex-col', slideClass) : 'hidden'}>
        <DialogueView />
      </div>
    </div>
  )
}
