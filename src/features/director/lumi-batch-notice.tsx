'use client'

// D8 Lumi 알림 카드(11/13 시안 414:5066 "Lumi Toast · 다음 할 일", 오너 2026-11-14 "추천대로") — Director 에서 채팅을 접어 둔 채
//   일괄 생성이 끝나면 오른쪽 아래에 뜬다(global-chat 이 놓는다). 글 · 단추는 lib/director/lumi-batch-notice(지금 보드 상태로 고름).
//   [빼고 Editor로] · [Editor로 넘기기]는 다음 단계 단추와 같은 길(requestNextStep — 영상 없는 샷이 있으면 넘기기 창),
//   [샷 N 다시 만들기] · [영상 만들기 · N]은 Lumi 에게 부탁한 것과 같다(누른 말이 채팅에 남고 Take 를 세어 바로 만든다).
//   누르거나 ✕ 면 닫힌다. 시안 값: 폭 376 · 바탕 채팅색 · 테두리 1.5 초록(모두 실패면 기본) · 모서리 16 · 안쪽 18/16 · 사이 10.
//   약속: tests/director/lumi-batch-notice-ui.test.ts
import { X } from 'lucide-react'
import { LumiAvatar } from '@/components/lumi/lumi'
import { Button } from '@/components/ui/button'
import { useLocale, useT } from '@/lib/i18n'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { lumiBatchNoticeView, type LumiNoticeAction } from '@/lib/director/lumi-batch-notice'
import { shotLabelOf } from '@/lib/director/lumi-chat-runs'
import { STAGE_PERSONA } from '@/lib/lumi'
import { cn } from '@/lib/utils'
import { boardNodeNames } from '@/features/director/node-label'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLumiNoticeStore } from '@/stores/lumi-notice-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

export function LumiBatchNotice() {
  const t = useT()
  const locale = useLocale()
  const notice = useLumiNoticeStore((s) => s.notice)
  const collapsed = useChatUiStore((s) => s.collapsed)
  const projectId = useProjectStore((s) => s.projectId)
  const stage = useProjectStore((s) => s.currentStage)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const writerShots = useWriterStore((s) => s.shots)
  const states = useDirectorShotStates()
  const takes = useTakeBalance()
  const busy = useGlobalChatStore((s) => s.loading)

  if (!notice || !collapsed || stage !== 'director' || notice.projectId !== projectId) return null
  const names = boardNodeNames(sceneManifest, writerShots ?? [])
  const view = lumiBatchNoticeView({
    notice,
    states,
    labelOf: (id) => shotLabelOf(nodes.find((node) => node.id === id), names),
    takesReturned: takes.mode !== 'off' && takes.balance !== null,
    locale,
  })
  const run = (action: LumiNoticeAction) => {
    useLumiNoticeStore.getState().dismiss()
    if (action.kind === 'handoff') void useGlobalChatStore.getState().requestNextStep()
    else void useGlobalChatStore.getState().startDirectorVideos(action.shotIds, action.label)
  }

  return (
    <div
      role="status"
      data-testid="lumi-batch-notice"
      className={cn(
        'fixed bottom-6 right-6 z-40 flex w-[376px] max-w-[calc(100vw-32px)] flex-col gap-2.5 rounded-2xl border-[1.5px] bg-chat-bg px-[18px] py-4 shadow-node',
        view.done ? 'border-success' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2.5 pr-6">
        <LumiAvatar persona={STAGE_PERSONA.director} size={28} />
        <p className="text-label font-bold text-foreground">{view.title}</p>
      </div>
      {view.body && <p className="text-caption text-muted-foreground">{view.body}</p>}
      {view.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {view.actions.map((action, index) => (
            <Button
              key={action.label}
              variant={index === 0 ? 'default' : 'secondary'}
              disabled={busy}
              onClick={() => run(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => useLumiNoticeStore.getState().dismiss()}
        title={t('Close')}
        aria-label={t('Close')}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors duration-100 ease-out hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
