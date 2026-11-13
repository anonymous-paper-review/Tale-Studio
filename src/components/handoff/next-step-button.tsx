'use client'

// 단계 화면 오른쪽 위 "다음 단계" 버튼(2026-10-01 오너 — 채팅 위 버튼을 여기로 옮겼다).
//   누르면 넘김 문장이 채팅에 그대로 입력돼 넘어간다(버튼 = 타이핑). Producer→Writer(확정 창)와
//   Artist→Director(준비가 덜 된 샷 창)는 창을 먼저 연다. 판단은 global-chat-store.requestNextStep 하나뿐이다.
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nextStepAction } from '@/lib/handoff-intent'
import { useT } from '@/lib/i18n'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function NextStepButton({
  className,
  hidden = false,
  blocked = false,
  blockedReason,
  emphasis = 'primary',
}: {
  className?: string
  hidden?: boolean
  /** 화면이 아직 넘길 수 없다고 본다(Director: 완성 영상이 하나도 없음, 시안 R). */
  blocked?: boolean
  /** 막혔을 때 마우스를 올리면 보일 이유. */
  blockedReason?: string
  /** 지금 할 일이 아니면 보조 단추(시안 R "가장 밝은 버튼 = 지금 할 일 하나"). 기본은 지금처럼 크림. */
  emphasis?: 'primary' | 'secondary'
}) {
  const t = useT()
  const stage = useProjectStore((s) => s.currentStage)
  const producerLocked = useProjectStore((s) => s.producerLocked)
  const projectId = useProjectStore((s) => s.projectId)
  const chatBusy = useGlobalChatStore((s) => s.loading)
  const confirmOpen = useGlobalChatStore((s) => s.handoffConfirm !== null)
  // 트리트먼트 수정안 · 다시 쓰기 안을 정하기 전에는 넘기지 않는다(2026-10-02 시안 v04 — 고르는 동안 넘기기 잠김).
  const proposalPending = useGlobalChatStore((s) => !!projectId && s.sceneStoryProposalPending?.projectId === projectId)
  const requestNextStep = useGlobalChatStore((s) => s.requestNextStep)
  const [checking, setChecking] = useState(false)
  const action = nextStepAction(stage, { producerLocked })
  if (!action || !projectId || hidden) return null

  const run = async () => {
    setChecking(true)
    try {
      await requestNextStep()
    } finally {
      setChecking(false)
    }
  }

  return (
    <Button
      size="sm"
      variant={action.kind === 'open' ? 'outline' : emphasis === 'secondary' ? 'secondary' : 'default'}
      disabled={blocked || chatBusy || confirmOpen || checking || (stage === 'producer' && proposalPending)}
      title={blocked ? blockedReason : undefined}
      onClick={() => void run()}
      className={className}
      data-testid="next-step-button"
    >
      {checking ? <Loader2 className="size-4 animate-spin" /> : null}
      {t(action.label)}
      <ArrowRight className="size-4" />
    </Button>
  )
}
