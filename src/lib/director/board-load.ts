// 판(씬 · 샷 노드와 그 그림 · Take)을 DB 에서 다 읽었나 — "불러오는 중" · "못 불러옴"을 "아직 샷이 없어요"와 가른다(fb-blur QA 2026-11-23 · 리드).
//   상태는 stores/board-load-store.ts 에 있고, 적는 곳은 동기화 훅(use-writer-director-sync.ts), 읽는 곳은 Cinema 판 · 위쪽 만들기 줄.
//   약속: tests/camera/board-load.test.ts
import { createClient } from '@/lib/supabase/client'

/** loading = 읽는 중(자동 다시 시도 중 포함) · ready = 다 읽음(샷이 0개여도) · failed = 자동 다시 시도까지 다 실패. */
export type BoardLoadStatus = 'loading' | 'ready' | 'failed'

/** 판 자리에 무엇을 세우나 — 다 읽기 전 · 못 읽었으면 그 상태(이 브라우저에 남은 옛 샷 줄이 있어도), 다 읽었으면 샷 줄 또는 "아직 샷이 없어요". */
export type CameraBoardView = 'loading' | 'failed' | 'empty' | 'board'

export function cameraBoardView(input: { status: BoardLoadStatus; shotCount: number; hasScene: boolean }): CameraBoardView {
  if (input.status !== 'ready') return input.status
  return input.shotCount === 0 || !input.hasScene ? 'empty' : 'board'
}

/** 화면 말(영어 = 번역 열쇠). */
export const BOARD_LOAD_TEXT = {
  loading: 'Loading the shots.',
  failed: 'Could not load the shots.',
  failedNote: 'Your shots are still there. Try loading them again.',
  retry: 'Load again',
} as const

/** 위쪽 만들기 단추가 꺼진 까닭 한 줄 — 다 읽었으면 null(그때는 지금처럼 단추마다의 까닭). */
export function boardLoadBlockText(status: BoardLoadStatus): string | null {
  if (status === 'ready') return null
  return status === 'loading' ? BOARD_LOAD_TEXT.loading : BOARD_LOAD_TEXT.failed
}

/**
 * Writer 를 읽은 뒤 씬이 하나도 없을 때 — 정말 없는지 씬 수를 센다. writer-store.loadProject 는 읽기 실패를 삼키고
 * "씬 없음"과 똑같이 끝나기 때문이다. 0 이면 true, 씬이 있으면 false(= 읽기가 실패했다), 셀 수 없으면 던진다(다시 시도로 간다).
 */
export async function writerProjectHasNoScenes(projectId: string): Promise<boolean> {
  const { count, error } = await createClient()
    .from('scenes')
    .select('scene_id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  if (error) throw new Error(`scene count failed: ${error.message}`)
  if (typeof count !== 'number') throw new Error('scene count missing')
  return count === 0
}
