// Director 채팅의 빠른 칩 넷(11/13 시안 D5, 오너 2026-11-14 "추천대로") — 누르면 AI 를 거치지 않고 지금 보드 상태로 바로 한다.
//   샷 상태는 보드 테두리 · 상태 고르기와 같은 판정(shot-state.ts)을 쓴다. 칩이 겨누는 묶음은 위쪽 단추 숫자와 같다
//   (이미지 = 이미지 필요 · 이미지 실패, 영상 = 이미지 완료 · 영상 실패). 순수 함수만 둔다. 약속: tests/director/lumi-quick-chips.test.ts
import { DIRECTOR_QUICK_CHIPS } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { activeShotIds, type ActiveJob } from '@/lib/generation-queue'
import { shotFactsByNode, shotStageDots, shotState, type DirectorShotState } from '@/lib/director/shot-state'
import { shotListLabel } from '@/lib/director/lumi-chat-runs'
import type { DirectorNode } from '@/types/director'

export type DirectorQuickChip = 'images' | 'videos' | 'failed' | 'status'

/** DIRECTOR_QUICK_CHIPS 와 같은 순서. */
const CHIP_KINDS: readonly DirectorQuickChip[] = ['images', 'videos', 'failed', 'status']

/** 칩 말이면 그 칩 — 칩을 누르거나 칩 말을 그대로 쳤을 때(한국어 · 영어 어느 쪽이든). 다른 말은 null(AI 가 받는다). */
export function directorQuickChipOf(text: string): DirectorQuickChip | null {
  const said = text.trim()
  const index = DIRECTOR_QUICK_CHIPS.findIndex((key) => said === key || said === translate('ko', key))
  return index >= 0 ? CHIP_KINDS[index] : null
}

/** 샷마다 지금 상태(키 = 샷 노드 id, 캔버스 순서) — 보드(features/director/hooks/use-shot-states)와 같은 근거: 캔버스 노드 + 큐에 떠 있는 작업. */
export function directorShotStatesNow(nodes: readonly DirectorNode[], jobs: readonly ActiveJob[]): Map<string, DirectorShotState> {
  const facts = shotFactsByNode(nodes, {
    queuedImageShots: activeShotIds(jobs, ['shot_storyboard', 'storyboard_real_grid']),
    queuedVideoShots: activeShotIds(jobs, ['shot_video']),
  })
  return new Map([...facts].map(([id, fact]) => [id, shotState(fact)]))
}

/** 칩이 겨누는 샷(노드 id) — 이미지 칩은 이미지를, 영상 칩은 영상을, 실패 칩은 이미지 실패 샷의 이미지와 영상 실패 샷의 영상을 다시. */
export function quickChipTargets(
  chip: Exclude<DirectorQuickChip, 'status'>,
  states: ReadonlyMap<string, DirectorShotState>,
): { images: string[]; videos: string[] } {
  const having = (...wanted: DirectorShotState[]) => [...states].filter(([, state]) => wanted.includes(state)).map(([id]) => id)
  if (chip === 'images') return { images: having('image_needed', 'image_failed'), videos: [] }
  if (chip === 'videos') return { images: [], videos: having('image_done', 'video_failed') }
  return { images: having('image_failed'), videos: having('video_failed') }
}

/** "지금 어디까지 됐어?" — 이미지 a/전체 · 영상 b/전체 완성 · 만드는 중 c · 실패 d(샷 번호). 만드는 중 · 실패가 없으면 그 칸은 뺀다. */
export function directorProgressLine(
  locale: AppLocale,
  states: ReadonlyMap<string, DirectorShotState>,
  labelOf: (shotNodeId: string) => number | string,
): string {
  const all = [...states]
  if (all.length === 0) return translate(locale, 'There are no shots on the board yet.')
  const count = (test: (state: DirectorShotState) => boolean) => all.filter(([, state]) => test(state)).length
  const parts = [
    translate(locale, 'Images {images}/{total} · videos {videos}/{total} done', {
      images: count((state) => shotStageDots(state).image === 'image_done'),
      videos: count((state) => state === 'video_done'),
      total: all.length,
    }),
  ]
  const making = count((state) => state === 'image_generating' || state === 'video_generating')
  if (making > 0) parts.push(translate(locale, 'making {count}', { count: making })) // copy-ok: fragment
  const failed = all.filter(([, state]) => state === 'image_failed' || state === 'video_failed').map(([id]) => labelOf(id))
  if (failed.length > 0) parts.push(translate(locale, 'failed {count} ({shots})', { count: failed.length, shots: shotListLabel(locale, failed) })) // copy-ok: fragment
  return parts.join(' · ')
}
