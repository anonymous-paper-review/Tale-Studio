'use client'

// Director 캔버스의 판 읽기 글(fb-blur QA 2026-11-23 · 리드) — 샷 정보를 다 읽기 전 · 못 읽었을 때 빈 캔버스 안내("Writer에서 씬을 만들면…")
//   대신 불러오는 중 · 불러오지 못함 + [다시 불러오기]를 세운다. 글 · 단추는 Cinema 와 같은 공용 조각(components/board-load-state).
//   판 읽기 상태는 stores/board-load-store(동기화 훅이 적는다). 약속: tests/director/board-load.test.ts
import { BoardLoadState } from '@/components/board-load-state'
import type { BoardLoadStatus } from '@/lib/director/board-load'

/** 캔버스 가운데에 무엇을 세우나 — loading · failed 는 빈 캔버스 안내 자리, failed-over-canvas 는 남은 노드 위 가운데, empty 는 지금 빈 캔버스 안내. */
export type DirectorCanvasNote = 'loading' | 'failed' | 'failed-over-canvas' | 'empty' | null

export function directorCanvasNote(input: { status: BoardLoadStatus; nodeCount: number }): DirectorCanvasNote {
  // 못 불러옴: 노드가 없으면 빈 캔버스 안내 대신, 이 브라우저에 남은 노드가 있으면 그대로 두고 가운데에 같은 글(같이 정한 것 1).
  if (input.status === 'failed') return input.nodeCount === 0 ? 'failed' : 'failed-over-canvas'
  // 다 읽기 전: 빈 캔버스 안내 자리에만(같이 정한 것 2) — 노드가 이미 보이면 가리지 않는다(혼자 정한 것).
  if (input.status === 'loading') return input.nodeCount === 0 ? 'loading' : null
  // 빈 캔버스 안내는 다 읽은 뒤 정말 노드가 0개일 때만(같이 정한 것 2).
  return input.nodeCount === 0 ? 'empty' : null
}

/** "이 씬에는 아직 샷이 없어요." 같은 "없음" 안내를 띄워도 되나 — 다 읽은 뒤에만(혼자 정한 것, 같이 정한 것 2 와 같은 뜻). */
export function noShotsNoteAllowed(status: BoardLoadStatus): boolean {
  return status === 'ready'
}

/** 캔버스를 두 번 눌러 카드를 만들어도 되나 — 다 읽은 판에서만(같이 정한 것 4: 읽지 못한 판 위에 새 카드를 만들지 않는다). */
export function canvasCreateAllowed(status: BoardLoadStatus): boolean {
  return status === 'ready'
}

/** 캔버스 위 판 읽기 글 — 바깥은 누름을 지나가게 두고(노드를 가리지 않게) 글 상자만 누를 수 있다. */
export function DirectorCanvasLoadNote({ note, onRetry }: { note: 'loading' | 'failed' | 'failed-over-canvas'; onRetry: () => void }) {
  const status = note === 'loading' ? 'loading' : 'failed'
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className={note === 'failed-over-canvas' ? 'pointer-events-auto flex rounded-2xl bg-background px-10 shadow-node' : 'pointer-events-auto flex'}>
        <BoardLoadState status={status} onRetry={onRetry} />
      </div>
    </div>
  )
}
