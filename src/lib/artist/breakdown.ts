// Artist 화면 규칙(리뉴얼 1차 2026-10-19, 프로토타입 A1 · A4 · A5 · A9).
//   확정 산문의 인물 · 배경 글 목록(브레이크다운) → [만들기](스타일) → 디자인 · 그림 진행 → 그림 카드 → [완료하기].
//   [완료하기] 조건은 서버(artist-complete)와 같은 규칙이다(completion-gaps).
import { completionGaps, type CompletionGaps } from '@/lib/artist/completion-gaps'

export interface BreakdownRow {
  id: string
  kind: 'person' | 'background'
  name: string
  description: string
}

/** 확정 산문에서 뽑은 인물 · 배경(Producer 목록) → 글 목록 줄. 사물은 Artist 카드가 없어 넣지 않는다. */
export function breakdownRows(
  cast: ReadonlyArray<{ localId: string; name: string; entityType: 'person' | 'object'; appearance: string }>,
  backgrounds: ReadonlyArray<{ localId: string; name: string; visualDescription: string }>,
): BreakdownRow[] {
  return [
    ...cast.filter((member) => member.entityType !== 'object').map((member) => ({ id: member.localId, kind: 'person' as const, name: member.name, description: member.appearance })),
    ...backgrounds.map((background) => ({ id: background.localId, kind: 'background' as const, name: background.name, description: background.visualDescription })),
  ]
}

export type ArtistPhase = 'list' | 'making' | 'cards' | 'done'

/** 디자인 단계(Writer 05~07) — 이 동안 [만들기]가 이어 간 실행이 인물 · 배경을 디자인한다. */
const DESIGN_STEPS = new Set(['visualFormat', 'actVisualArc', 'v2Design'])

export function artistPhase(input: {
  /** 산문을 확정해 잠갔다. */
  proseLocked: boolean
  /** 실행이 아직 산문 초안이다([만들기] 전). */
  draftRun: boolean
  status: { started?: boolean; current_status?: string | null; current_stage?: string | null; pipeline_completed?: boolean; pipeline_failed?: boolean } | null | undefined
  /** 인물 · 배경 행이 하나라도 있다(그림 카드로 보일 것). */
  hasAssets: boolean
}): ArtistPhase {
  if (input.draftRun) return 'list'
  const status = input.status
  if (status?.current_status === 'awaiting_artist') return input.hasAssets ? 'cards' : 'making'
  if (status?.started && !status.pipeline_completed && !status.pipeline_failed && DESIGN_STEPS.has(status.current_stage ?? '')) return 'making'
  return 'done'
}

/** 이어 만들던 실행이 멈췄다 — 카드가 보여도 Artist 화면 위에 멈춘 이유와 [이어서 다시 시도]를 보인다(리뉴얼 1차 검토).
 *  아직 [만들기] 전인 산문 초안 실행은 Writer 화면의 [다시 시도]가 맡는다. */
export function artistRunStopped(input: { draftRun: boolean; status: { pipeline_failed?: boolean } | null | undefined }): boolean {
  return !input.draftRun && input.status?.pipeline_failed === true
}

export interface AssetProgress {
  charsReady: number
  charsTotal: number
  worldsReady: number
  worldsTotal: number
}

/** 만드는 중 표시 — 0 인물 · 배경 디자인, 1 그림 그리기 시작, 2 그림 그리는 중(k/N). 다 그리면 done. */
export function makingProgress(
  status: { current_stage?: string | null; current_status?: string | null } | null | undefined,
  assets: AssetProgress | null | undefined,
): { step: 0 | 1 | 2; drawn: number; total: number; done: boolean } {
  const total = (assets?.charsTotal ?? 0) + (assets?.worldsTotal ?? 0)
  const drawn = (assets?.charsReady ?? 0) + (assets?.worldsReady ?? 0)
  const designed = status?.current_status === 'awaiting_artist'
  if (designed && total > 0 && drawn >= total) return { step: 2, drawn, total, done: true }
  if (designed) return { step: 2, drawn, total, done: false }
  if (status?.current_stage === 'v2Design') return { step: 1, drawn, total, done: false }
  return { step: 0, drawn, total, done: false }
}

/** 화면의 Artist 자산으로 [완료하기] 조건을 본다(서버와 같은 규칙). */
export function assetCompletionGaps(
  characters: ReadonlyArray<{ characterId: string; name: string; entityType: 'person' | 'object'; appearances: ReadonlyArray<{ isDefault: boolean; sheetUrl: string | null }> }>,
  worlds: ReadonlyArray<{ locationId: string; name: string; wideShot: string | null }>,
): CompletionGaps {
  return completionGaps(
    characters.map((c) => ({ character_id: c.characterId, name: c.name, entity_type: c.entityType })),
    characters.flatMap((c) => c.appearances.map((a) => ({ character_id: c.characterId, is_default: a.isDefault, sheet_url: a.sheetUrl }))),
    worlds.map((w) => ({ location_id: w.locationId, name: w.name, wide_shot: w.wideShot })),
  )
}
