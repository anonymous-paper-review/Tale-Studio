'use client'

// Writer "다음 단계" 카드(리뉴얼 1차 2026-10-19, 프로토타입 WP · WN). 고친 걸 적용하거나 직접 고친 걸 저장하면
//   채팅에 "적용했어요. 다음 단계로 넘어갈까요?"를 묻고(ask), 아니요면 할 일을 버튼으로 보인다(more).
//   1안(화면 탭)은 오른쪽 채팅 패널, 2안(채팅 탭)은 가운데 채팅 줄이 이 카드를 그린다 — 버튼은 같은 일을 한다.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Loader2, MessageSquare, Pencil, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { withDemoShare } from '@/lib/demo/context'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

/** 산문 확정 결과 → 안내. 실패 까닭마다 다음에 할 일을 알려 준다. */
export function proseConfirmError(code: string | undefined): string {
  if (code === 'scene_story_proposal_pending') return 'Apply or discard the AI proposal first, then confirm the prose.'
  if (code === 'prose_missing') return 'The prose is not ready yet. Wait until it is written, then confirm it.'
  return 'Could not confirm the prose. Please try again.'
}

export function useConfirmProse() {
  const router = useRouter()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return false
    setBusy(true)
    try {
      const result = await useGlobalChatStore.getState().confirmProse()
      if (!result.ok) {
        if (result.code !== 'busy') toast.error(t(proseConfirmError(result.code)))
        return false
      }
      useWriterRoomStore.getState().closeConfirm()
      toast.success(t('Prose confirmed. Artist is opening.'))
      router.push(withDemoShare('/studio/artist'))
      return true
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

export function WriterNextCard({ step, onChatFocus }: { step: 'ask' | 'more'; onChatFocus?: () => void }) {
  const t = useT()
  const confirm = useConfirmProse()
  const dismissCurrent = () => {
    const current = useGlobalChatStore.getState().suggestion
    if (current?.action?.kind === 'writerNext') useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
  }

  if (step === 'ask') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 px-1" data-testid="writer-next-ask">
        <Button size="sm" onClick={() => void confirm.run()} disabled={confirm.busy}>
          {confirm.busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {t('Yes, go to the next step')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => useGlobalChatStore.getState().offerWriterNext('more')} disabled={confirm.busy}>
          {t('No, I want to edit more')}
        </Button>
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-col items-start gap-1.5 px-1" data-testid="writer-next-more">
      <Button size="sm" variant="outline" onClick={() => { dismissCurrent(); useWriterRoomStore.getState().openRewrite() }}>
        <Sparkles className="size-4" />{t('Ask for a rewrite')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => { dismissCurrent(); useWriterRoomStore.getState().requestManual() }}>
        <Pencil className="size-4" />{t('Edit it myself')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismissCurrent()
          if (onChatFocus) onChatFocus()
          else useChatUiStore.getState().requestChatFocus()
        }}
      >
        <MessageSquare className="size-4" />{t('I will say it in the chat')}
      </Button>
    </div>
  )
}
