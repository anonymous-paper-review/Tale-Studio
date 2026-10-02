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

export function NextStepButton({ className, hidden = false }: { className?: string; hidden?: boolean }) {
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
      variant={action.kind === 'open' ? 'outline' : 'default'}
      disabled={chatBusy || confirmOpen || checking || (stage === 'producer' && proposalPending)}
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
