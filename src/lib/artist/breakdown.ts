// Artist 화면 규칙(리뉴얼 1차 2026-10-19, 프로토타입 A1 · A4 · A5 · A9).
//   확정 산문의 인물 · 배경 글 목록(브레이크다운) → [만들기](스타일) → 디자인 · 그림 진행 → 그림 카드 → [완료하기].
//   [완료하기] 조건은 서버(artist-complete)와 같은 규칙이다(completion-gaps).
import { completionGaps, type CompletionGaps } from '@/lib/artist/completion-gaps'

export interface BreakdownRow {
  id: string
  /** 인물 번호(characterId) · 장소 번호(locationId). 아직 없으면 null — 시리즈 다음 화가 이어받은 카드를 이 번호로 맞춘다. */
  refId: string | null
  kind: 'person' | 'background'
  name: string
  description: string
  /** 줄에 붙은 그림 — 브레이크다운에서 올린 레퍼런스, 또는 Producer 채팅에서 카드에 붙인 그림(#image-to-artist). 없으면 null. */
  imageUrl: string | null
  /** 붙은 그림을 그대로 이 카드의 그림으로 쓴다(2026-10-27 오너) — 배경은 늘(와이드샷), 인물은 레퍼런스로 올린 그림만.
   *  채팅에서 붙인 인물 그림은 시트의 출처라 시트를 새로 그린다. 넘길 때 서버가 하는 일(producer/source-image)과 같은 구분이다. */
  imageAsIs: boolean
  /** 산문에 나오는 다른 이름(또는) — 산문 재점검에서 이름을 고치거나 합치면 생긴다(2026-10-27 오너). */
  aliases: string[]
  /** 산문 재점검으로 새로 들어온 줄 — 이 화면을 보는 동안 "새로"로 보인다. */
  isNew: boolean
}

/** 확정 산문에서 뽑은 인물 · 배경(Producer 목록) → 글 목록 줄. 사물은 Artist 카드가 없어 넣지 않는다. */
export function breakdownRows(
  cast: ReadonlyArray<{ localId: string; characterId?: string; name: string; entityType: 'person' | 'object'; appearance: string; sourceImageUrl?: string; sourceImageAsIs?: boolean; aliases?: string[] }>,
  backgrounds: ReadonlyArray<{ localId: string; locationId?: string; name: string; visualDescription: string; sourceImageUrl?: string; aliases?: string[] }>,
  newIds: readonly string[] = [],
): BreakdownRow[] {
  const isNew = (localId: string) => newIds.includes(localId)
  return [
    ...cast
      .filter((member) => member.entityType !== 'object')
      .map((member) => ({
        id: member.localId, refId: member.characterId ?? null, kind: 'person' as const, name: member.name, description: member.appearance,
        imageUrl: member.sourceImageUrl ?? null, imageAsIs: !!member.sourceImageUrl && member.sourceImageAsIs === true,
        aliases: member.aliases ?? [], isNew: isNew(member.localId),
      })),
    ...backgrounds.map((background) => ({
      id: background.localId, refId: background.locationId ?? null, kind: 'background' as const, name: background.name, description: background.visualDescription,
      imageUrl: background.sourceImageUrl ?? null, imageAsIs: !!background.sourceImageUrl,
      aliases: background.aliases ?? [], isNew: isNew(background.localId),
    })),
  ]
}

/** [만들기]가 새로 그리는 줄과 그림을 그대로 쓰는 줄의 수(2026-10-27 오너 "이미지가 업로드되지 않은 것이 있다면 우리가 그려주면 되").
 *  만들기 창이 그리는 수(시리즈면 앞 화 그림 수까지)를 draw 로만 센다. */
export function rowsToDraw<T extends Pick<BreakdownRow, 'imageAsIs'>>(rows: readonly T[]): { draw: T[]; asIs: number } {
  const draw = rows.filter((row) => !row.imageAsIs)
  return { draw, asIs: rows.length - draw.length }
}

export type ArtistPhase = 'list' | 'making' | 'cards' | 'done'

type RunStatusLike = { started?: boolean; current_status?: string | null; current_stage?: string | null; pipeline_completed?: boolean; pipeline_failed?: boolean } | null | undefined

/** 디자인 단계(Writer 05~07) — 이 동안 [만들기]가 이어 간 실행이 인물 · 배경을 디자인한다. */
const DESIGN_STEPS = new Set(['visualFormat', 'actVisualArc', 'v2Design'])
/** 디자인 앞(Writer 01~04, 산문 초안) — 여기서 멈춘 실행은 아직 디자인 전이다. */
const PRE_DESIGN_STEPS = new Set(['dramaturgy', 'narrativeStructure', 'scenes', 'storyCheck'])

/** 인물 · 배경 디자인이 끝났다 — 예전 멈춤(awaiting_artist) · 씬 · 샷 나누기(08~15) 중 · 다 만듦 · 그 뒤에서 멈춤. */
export function designFinished(status: RunStatusLike): boolean {
  if (!status?.started) return false
  if (status.current_status === 'awaiting_artist' || status.pipeline_completed) return true
  const stage = status.current_stage ?? ''
  return !!stage && !DESIGN_STEPS.has(stage) && !PRE_DESIGN_STEPS.has(stage)
}

export function artistPhase(input: {
  /** 산문을 확정해 잠갔다. */
  proseLocked: boolean
  /** 실행이 아직 산문 초안이다([만들기] 전). */
  draftRun: boolean
  status: RunStatusLike
  /** 인물 · 배경 행이 하나라도 있다(그림 카드로 보일 것). */
  hasAssets: boolean
  /** [완료하기]를 해 Storyboard 가 열렸다(예전 흐름으로 끝까지 만든 프로젝트 포함) — 다시 완료하지 않는다. */
  artistCompleted?: boolean
}): ArtistPhase {
  if (input.draftRun) return 'list'
  const status = input.status
  if (status?.started && !status.pipeline_completed && !status.pipeline_failed && DESIGN_STEPS.has(status.current_stage ?? '') && status.current_status !== 'awaiting_artist') return 'making'
  if (input.artistCompleted) return 'done'
  // 2026-10-20: [만들기]는 디자인 뒤에도 멈추지 않고 씬 · 샷을 나눈다 — 디자인이 끝났으면 완료하기 전까지 카드와 [완료하기]다.
  if (designFinished(status)) return input.hasAssets ? 'cards' : 'making'
  return 'done'
}

/** 예전 흐름(리뉴얼 전) 진행 화면이 왼쪽 사이드바를 막을지 — Writer 실행이 정말 도는 동안만(2026-10-27 검토).
 *  상태를 읽기 전(새로고침 직후 깜빡임) · 사람을 기다리는 멈춤(씬 확인 · Artist 완료 대기) · 멈춘 뒤 · 다 만든 뒤에는 막지 않는다 —
 *  씬 확인을 기다리는데 막으면 Producer 로 가서 확인할 길이 없다. */
export function legacyProgressHolds(input: { gateOpen: boolean; phase: ArtistPhase | string; status: RunStatusLike }): boolean {
  const status = input.status
  if (input.gateOpen || input.phase !== 'done' || !status?.started) return false
  if (status.pipeline_completed || status.pipeline_failed) return false
  return status.current_status !== 'awaiting_confirmation' && status.current_status !== 'awaiting_artist'
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

/** 만드는 중 표시 — 0 인물 · 배경 디자인, 1 그림 그리기 시작, 2 그림 그리는 중(k/N). 다 그리면 done.
 *  디자인이 끝난 뒤(씬 · 샷을 나누는 중 · 다 만듦 포함)는 그린 장수로만 본다(2026-10-20 — [만들기]가 멈추지 않는다). */
export function makingProgress(
  status: RunStatusLike,
  assets: AssetProgress | null | undefined,
): { step: 0 | 1 | 2; drawn: number; total: number; done: boolean } {
  const total = (assets?.charsTotal ?? 0) + (assets?.worldsTotal ?? 0)
  const drawn = (assets?.charsReady ?? 0) + (assets?.worldsReady ?? 0)
  const designed = designFinished(status ? { started: true, ...status } : status)
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
