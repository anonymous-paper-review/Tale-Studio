'use client'

// 판을 다 읽기 전 · 못 읽었을 때 판 자리에 서는 글 — "아직 샷이 없어요" 대신(fb-blur QA 2026-11-23 · 리드).
//   Cinema 판이 쓰고, Director 도 같은 조각을 쓸 수 있게 공용 자리에 둔다. [다시 불러오기]는 새로 고치지 않고 그 자리에서 다시 읽는다.
//   약속: tests/camera/board-load.test.ts
import { Loader2, RotateCw } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { BOARD_LOAD_TEXT } from '@/lib/director/board-load'

export function BoardLoadState({ status, onRetry }: { status: 'loading' | 'failed'; onRetry: () => void }) {
  const t = useT()
  if (status === 'loading') {
    return (
      <div
        role="status"
        data-testid="board-load-state"
        data-status="loading"
        className="flex flex-1 items-center justify-center gap-2 py-24 text-label text-muted-foreground"
      >
        <Loader2 aria-hidden className="size-4 animate-spin" />
        <span>{t(BOARD_LOAD_TEXT.loading)}</span>
      </div>
    )
  }
  return (
    <div
      role="alert"
      data-testid="board-load-state"
      data-status="failed"
      className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center"
    >
      <p className="text-body font-semibold text-foreground">{t(BOARD_LOAD_TEXT.failed)}</p>
      <p className="text-label text-muted-foreground">{t(BOARD_LOAD_TEXT.failedNote)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-[13px] font-semibold text-foreground transition-colors duration-100 hover:bg-accent"
      >
        <RotateCw aria-hidden className="size-3.5" />
        <span>{t(BOARD_LOAD_TEXT.retry)}</span>
      </button>
    </div>
  )
}
