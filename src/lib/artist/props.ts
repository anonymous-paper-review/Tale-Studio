// Artist 소품(D7, 오너 2026-11-22 "배경처럼 소품도 shot 이미지 생성 시 참조 · 소품도 한 장 · 중요한 소품만") — 순수 규칙.
//   소품 = props 행 — 어디서 왔든(출처는 prop-source.ts, 지금은 [만들기] 때 AI 가 이야기에서 고른 것 + Producer 사물 · 오너 E5) 같은 규칙으로 읽는다. 출처 칸으로 거르지 않는다.
//   어느 씬 · 샷에 나오는지: 씬 등장 목록(scenes.characters_present)에 그 id, 샷 소품 칸(static_spec.prop_placement[].prop)에 그 id 나 이름.
//   서버(실사 참고 그림)와 화면(카드)이 같은 규칙을 쓴다 — 서버 전용 의존성 금지. 약속: tests/artist/prop-cards.test.ts
import type { PropAsset } from '@/types/asset'

/** props 표 행(필요한 칸만). */
export interface PropRow {
  prop_id: string
  name: string
  appearance: string | null
  appearance_native: string | null
  image_url: string | null
  source_hash: string | null
  origin: string | null
}

const ORIGINS = new Set<PropAsset['origin']>(['producer', 'writer', 'user'])

/** props 행 → 소품 카드. 같은 id 가 인물 행(characters)에도 있으면 뺀다 — 예전 저장 고장으로 둘 다 있는 프로젝트에서 카드가 둘이 되지 않게. */
export function propAssetsFromRows(rows: readonly PropRow[], personIds: ReadonlySet<string>): PropAsset[] {
  return rows
    .filter((row) => row.prop_id?.trim() && !personIds.has(row.prop_id))
    .map((row) => {
      const appearance = row.appearance ?? ''
      return {
        propId: row.prop_id,
        name: row.name,
        appearance,
        appearanceNative: row.appearance_native?.trim() ? row.appearance_native : appearance,
        imageUrl: row.image_url?.trim() ? row.image_url : null,
        sourceHash: row.source_hash ?? null,
        origin: ORIGINS.has(row.origin as PropAsset['origin']) ? (row.origin as PropAsset['origin']) : 'writer',
      }
    })
}

/** 이름 비교용 — 대소문자 · 밑줄 · 붙임표 · 앞 관사(a/an/the)를 지운다. */
function plain(text: string): string {
  return text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(a|an|the) /, '')
}

/** 샷 소품 칸 값이 이 소품인가 — 소품 id 그대로이거나, 대소문자 · 밑줄 · 관사만 다른 이름. */
export function propPlacementMatches(prop: Pick<PropAsset, 'propId' | 'name'>, value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  const raw = value.trim()
  if (raw === prop.propId) return true
  const text = plain(raw)
  return !!text && (text === plain(prop.propId) || text === plain(prop.name))
}

/** 샷 소품 칸(static_spec.prop_placement) 의 prop 값들 — 모양이 아니면 빈 목록. */
export function placementValues(placement: unknown): string[] {
  if (!Array.isArray(placement)) return []
  return placement.flatMap((entry) => {
    const value = (entry as { prop?: unknown } | null)?.prop
    return typeof value === 'string' && value.trim() ? [value] : []
  })
}

export type PropUsage = Record<string, { scenes: number; shots: number }>

/** 소품마다 나오는 샷 수(샷 소품 칸) · 씬 수(씬 등장 목록에 그 id 가 있는 씬 + 그 소품이 나오는 샷의 씬). */
export function propUsage(
  props: ReadonlyArray<Pick<PropAsset, 'propId' | 'name'>>,
  scenes: ReadonlyArray<{ sceneId: string; charactersPresent: readonly string[] }>,
  shots: ReadonlyArray<{ shotId: string; sceneId?: string | null; propPlacement: unknown }>,
): PropUsage {
  const out: PropUsage = {}
  for (const prop of props) {
    const inShots = shots.filter((shot) => placementValues(shot.propPlacement).some((value) => propPlacementMatches(prop, value)))
    const sceneIds = new Set([
      ...scenes.filter((scene) => scene.charactersPresent.includes(prop.propId)).map((scene) => scene.sceneId),
      ...inShots.flatMap((shot) => (shot.sceneId ? [shot.sceneId] : [])),
    ])
    out[prop.propId] = { scenes: sceneIds.size, shots: inShots.length }
  }
  return out
}

/** 카드 순서 — 나오는 샷이 많은 소품 먼저, 같으면 씬이 많은 것, 그다음은 원래 순서. */
export function orderPropsByUsage<T extends Pick<PropAsset, 'propId'>>(props: readonly T[], usage: PropUsage): T[] {
  return props
    .map((prop, index) => ({ prop, index }))
    .sort((a, b) => {
      const ua = usage[a.prop.propId] ?? { scenes: 0, shots: 0 }
      const ub = usage[b.prop.propId] ?? { scenes: 0, shots: 0 }
      return ub.shots - ua.shots || ub.scenes - ua.scenes || a.index - b.index
    })
    .map(({ prop }) => prop)
}

/** 화면이 소품을 저절로 이어 그리는 때(리드 결정 2) — [만들기] 뒤 · [완료하기] 전(카드 단계)이고 인물 · 배경 그림이 다 그려진 뒤.
 *  완료한 프로젝트를 열었다고 저절로 그리지 않는다(빈 그림 이어 그리기와 같은 규칙). 데모는 그리지 않는다. */
export function propsAutoDrawOpen(input: { phase: string; done: boolean; demo: boolean }): boolean {
  return input.phase === 'cards' && input.done && !input.demo
}

/** 저절로 그릴 소품 — 그림이 없고 · 그리는 중이 아니고 · 실패하지 않았고(실패는 사람의 [다시 그리기]) · 이번에 아직 청하지 않은 것. 카드 순서대로. */
export function propsToAutoDraw(
  props: ReadonlyArray<Pick<PropAsset, 'propId' | 'imageUrl'>>,
  state: { generating: readonly string[]; failures: Readonly<Record<string, unknown>>; tried: ReadonlySet<string> },
): string[] {
  return props
    .filter((prop) => !prop.imageUrl && !state.generating.includes(prop.propId) && !state.failures[prop.propId] && !state.tried.has(prop.propId))
    .map((prop) => prop.propId)
}

/** Artist 채팅 문맥의 소품 줄 — "- 이름 (id) — has image|no image". 인물 · 장소 줄과 같은 꼴(모델이 id 를 지어내지 않게). */
export function artistPropContextLines(props: ReadonlyArray<Pick<PropAsset, 'propId' | 'name' | 'imageUrl'>>): string[] {
  return props.map((prop) => `- ${prop.name} (${prop.propId}) — ${prop.imageUrl ? 'has image' : 'no image'}`)
}
