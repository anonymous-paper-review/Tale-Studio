'use client'

// 넘김 확인 창 두 개를 한 곳에 단다(스튜디오 레이아웃). 어떤 창이 열릴지는 global-chat-store.handoffConfirm 이 정한다 —
//   다음 단계 버튼과 채팅 넘김이 같은 상태를 쓰므로 어느 쪽에서 열어도 같은 창이다.
import { DirectorReadinessDialog } from './director-readiness-dialog'
import { ProducerLockDialog } from './producer-lock-dialog'
import { useGlobalChatStore } from '@/stores/global-chat-store'

export function HandoffConfirmDialogs() {
  const confirm = useGlobalChatStore((s) => s.handoffConfirm)
  return (
    <>
      <ProducerLockDialog open={confirm?.kind === 'producerLock'} />
      <DirectorReadinessDialog
        open={confirm?.kind === 'directorReadiness'}
        report={confirm?.kind === 'directorReadiness' ? confirm.report : null}
        gateGaps={confirm?.kind === 'directorReadiness' ? confirm.gateGaps : []}
      />
    </>
  )
}
