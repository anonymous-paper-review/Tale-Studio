'use client'

// 산문 본문(리뉴얼 1차 2026-10-19, 프로토타입 W1 w-prose). S1 · S2 … 문단, 다시 쓰기 안을 미리 볼 때는 바뀐 문단만
//   이전 글 · 새 글로 함께, 대본을 그대로 쓰는 프로젝트는 원본 대본을 그대로 보인다.
//   v3(2026-11-03 오너 결정 7): 직접 고칠 수 있을 때(tools.manual) 문단은 눌리는 칸이다 — 누르면 그 문단이 채팅 입력칸 위에 붙고,
//   다시 누르면 떨어진다(붙은 문단은 단계 색 테두리). 확정 · 대본 그대로 · AI 작업 중에는 읽기만 한다. 규칙: lib/prose/paragraph-pick.
import { useState } from 'react'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { AlertTriangle, Loader2, RotateCcw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { paragraphLabel } from '@/lib/prose/paragraph-pick'
import { TreatmentDiffView } from '@/features/producer/treatment-diff-view'
import { useProducerStore } from '@/stores/producer-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import type { ProseState } from '@/features/prose/use-prose'

// 산문 박스는 안에서 따로 스크롤하지 않는다 — 글이 길면 박스가 길어지고, 화면 영역(화면에서 고치기)이나
//   채팅 영역(채팅으로 고치기)이 스크롤된다(2026-10-20 오너 "박스 안 스크롤 말고 메인 뷰가 스크롤").
export function ProseDocument({ prose }: { prose: ProseState }) {
  const t = useT()
  const [starting, setStarting] = useState(false)
  const pick = useWriterRoomStore((s) => s.paragraph)
  // [산문 쓰기]를 누른 뒤 Writer 가 쓰기 시작했다고 알릴 때까지도 왼쪽 사이드바를 막는다(2026-10-27) — 그 사이 다른 단계로 옮겨 갈 수 있었다.
  useAiBusyHold(starting)
  const { view, diffRows, phase, draftLive } = prose

  const startDraft = async () => {
    if (starting) return
    setStarting(true)
    try {
      const ok = await useProducerStore.getState().startTreatment()
      if (!ok) toast.error(t('Could not start writing the prose. Please try again.'))
    } finally {
      setStarting(false)
    }
  }

  if (draftLive && phase === 'failed') {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center" data-testid="prose-failed">
        <AlertTriangle className="size-8 text-warning" aria-hidden />
        <p className="text-sm font-medium">{t('Could not write the prose')}</p>
        <p className="max-w-md text-xs text-muted-foreground">{t('Your material and settings are kept. Please try again.')}</p>
        <Button size="sm" className="mt-2" onClick={() => void startDraft()} disabled={starting} data-testid="prose-retry">
          {starting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{t('Try again')}
        </Button>
      </div>
    )
  }
  // v3 판 안쪽 여백 — 문단 줄(16)과 같게 둔다.
  if (diffRows) return <div className="px-4 py-3"><TreatmentDiffView rows={diffRows} /></div>
  if (view.kind === 'original') {
    return <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-6 text-foreground/90" data-testid="prose-original">{view.text}</pre>
  }
  // 실행 기록(산문 본문)을 읽는 중 — 그 전에 저장된 씬 한 줄 요약을 본문처럼 그리지 않는다(디자이너 QA 1차 #09).
  if (view.kind === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status" data-testid="prose-loading">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {t('Loading…')}
      </p>
    )
  }
  if (view.kind === 'scenes' && prose.paragraphs.length) {
    const pickable = prose.tools.manual
    return (
      <article className="space-y-1" data-testid="prose-article">
        {prose.paragraphs.map((paragraph, index) => {
          const label = <span className="w-4 shrink-0 pt-1 font-num text-micro font-semibold text-foreground">{paragraphLabel(index)}</span>
          if (!pickable) {
            return (
              <div key={index} className="flex gap-4 rounded-[14px] py-4 pl-4 pr-6">
                {label}
                <p className="min-w-0 text-prose text-foreground">{paragraph}</p>
              </div>
            )
          }
          const attached = pick?.projectId === prose.projectId && pick.index === index
          return (
            <button
              key={index}
              type="button"
              aria-pressed={attached}
              onClick={() => {
                if (prose.projectId) useWriterRoomStore.getState().toggleParagraph({ projectId: prose.projectId, index, text: paragraph }, pickable)
              }}
              className={cn(
                'flex w-full gap-4 rounded-[14px] py-4 pl-4 pr-6 text-left transition-colors duration-100 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                attached ? 'bg-stage/12 ring-[1.5px] ring-inset ring-stage' : 'hover:bg-accent/60',
              )}
              data-testid={`prose-paragraph-${index + 1}`}
            >
              {label}
              <span className="block min-w-0 text-prose text-foreground">{paragraph}</span>
            </button>
          )
        })}
      </article>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center" data-testid="prose-empty">
      <ScrollText className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{t('No prose yet')}</p>
      {/* [산문 쓰기]는 진행 상태를 읽어 Writer 가 아직 쓴 적이 없다고 안 뒤에만(디자이너 QA 1차 #07). */}
      {prose.startOffered ? (
        <>
          <p className="max-w-md text-xs text-muted-foreground">{t('Your story is ready. Writer writes the prose first, then you can rewrite or edit it here.')}</p>
          <Button size="sm" className="mt-2" onClick={() => void startDraft()} disabled={starting} data-testid="prose-start">
            {starting ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}{t('Write the prose')}
          </Button>
        </>
      ) : (
        <p className="max-w-md text-xs text-muted-foreground">{t('Writer is still writing the scenes. They appear here as they are ready.')}</p>
      )}
    </div>
  )
}
