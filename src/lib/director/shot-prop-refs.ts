// 실사 샷 이미지의 소품 참고(D7 2단계, 오너 2026-11-22 "배경처럼 소품도 shot 이미지 생성 시 참조") — 순수 규칙.
//   그 샷의 소품 칸(static_spec.prop_placement)에 나오는(소품 id 또는 이름) 소품 중 그림이 있는 것만, 한 샷 2장 · 일괄 한 장 3장까지.
//   참고 그림이 많으면(상한 MAX_REAL_REFERENCE_IMAGES) 소품부터 뺀다 — 인물 시트 · 배경 · 화풍 참고는 그대로.
//   참고 순서: [러프 시트, 인물 시트들, 배경, 추가 입력 · 앞 화 장면, 소품 그림들, 화풍] — 지금 지시문의 번호(인물 · 배경 · 추가)를 건드리지 않고
//   화풍은 여전히 "마지막"이다. 소품 역할 문장은 지시문 끝에 붙는다(storyboard-strip · photo-strip 은 바꾸지 않는다 — m1126 리드 R1: 그림체 길 · 실사 사진 길 모두).
//   소품 그림은 소품 양식(MAIN · FRONT · SIDE · BACK · TOP · DETAIL, m1126 A2)을 채운 시트라 첫 줄이 "물건 하나를 여러 방향에서 보인 시트"라고 적는다(리드 R1 승인 문장).
//   자리는 연필 러프가 정한다 — Writer 소품 칸의 자리(left_third 등)는 지시문에 적지 않는다. 러프와 어긋나면 모델이 물건을 옮긴다
//   (2026-11-22 실측: 러프 오른쪽 끝 자판기 + "left third" → 3번 모두 왼쪽 · 가운데로 옮겨 크게 그림).
//   서버 전용 의존성 금지(화면이 "참고: 소품 N" 을 보일 때 같은 규칙을 쓴다). 약속: tests/director/prop-references.test.ts
import { placementValues, propPlacementMatches } from '@/lib/artist/props'

export interface PropForRefs {
  propId: string
  name: string
  imageUrl: string | null
  /** 소품 모습(m1126 A3) — 씬의 이야기 속 때와 같은 모습 중 그림이 있는 첫 것(만든 순서)이 기본 그림 대신 쓰인다(배경 모습과 같다). */
  appearances?: Array<{ appearanceKey: string; narrativeTime: string | null; imageUrl: string | null }>
}

/** 그 씬(이야기 속 때)에서 이 소품의 그림 — 같은 때의 모습 중 그림이 있는 첫 것, 없으면 기본 그림(m1126 A3). */
function imageForScene(prop: PropForRefs, narrativeTime: string | null | undefined): string | null {
  if (narrativeTime) {
    const variant = (prop.appearances ?? []).find((a) => a.narrativeTime === narrativeTime && typeof a.imageUrl === 'string' && !!a.imageUrl.trim())
    if (variant) return variant.imageUrl
  }
  return prop.imageUrl
}

export interface ShotPropRef {
  propId: string
  name: string
  url: string
  /** 그 샷 소품 칸의 자리(position_in_frame) — 없으면 null. 지시문에는 쓰지 않는다(자리는 러프가 정한다). */
  position: string | null
}

/** 한 샷(실사 한 장)에 붙이는 소품 그림 수. */
export const SHOT_PROP_REF_LIMIT = 2
/** 일괄 한 장(4샷)에 붙이는 소품 그림 수. */
export const SHEET_PROP_REF_LIMIT = 3
/** 실사 한 번에 싣는 참고 그림 총수 상한 — 넘으면 소품부터 뺀다. */
export const MAX_REAL_REFERENCE_IMAGES = 12

/** 참고 그림 상한 안에 소품이 들어갈 자리 수. */
export function propRefRoom(otherRefCount: number, max = MAX_REAL_REFERENCE_IMAGES): number {
  return Math.max(0, max - otherRefCount)
}

/** 그 샷 소품 칸에서 이 소품이 놓인 자리 — 처음 맞는 항목. */
function placementPosition(staticSpec: unknown, prop: PropForRefs): string | null {
  const list = (staticSpec as { prop_placement?: unknown } | null)?.prop_placement
  if (!Array.isArray(list)) return null
  for (const entry of list) {
    const value = (entry as { prop?: unknown } | null)?.prop
    if (propPlacementMatches(prop, value)) {
      const position = (entry as { position_in_frame?: unknown }).position_in_frame
      return typeof position === 'string' && position.trim() ? position.trim() : null
    }
  }
  return null
}

/** 한 샷에 나오는 소품(그림 있는 것) — 소품 칸에 적힌 순서, 같은 소품은 한 번. 그림은 씬의 이야기 속 때에 맞는 모습(m1126 A3). */
function propsInShot(staticSpec: unknown, props: readonly PropForRefs[], narrativeTime?: string | null): ShotPropRef[] {
  const out: ShotPropRef[] = []
  for (const value of placementValues((staticSpec as { prop_placement?: unknown } | null)?.prop_placement)) {
    const prop = props.find((candidate) => imageForScene(candidate, narrativeTime) && propPlacementMatches(candidate, value))
    if (!prop || out.some((ref) => ref.propId === prop.propId)) continue
    out.push({ propId: prop.propId, name: prop.name, url: imageForScene(prop, narrativeTime) as string, position: placementPosition(staticSpec, prop) })
  }
  return out
}

/** 실사 한 장(한 샷)의 소품 참고 — 최대 limit 장. narrativeTime = 그 샷 씬의 이야기 속 때(소품 모습 고르기). */
export function planShotPropRefs(staticSpec: unknown, props: readonly PropForRefs[], limit = SHOT_PROP_REF_LIMIT, narrativeTime?: string | null): ShotPropRef[] {
  return propsInShot(staticSpec, props, narrativeTime).slice(0, Math.max(0, limit))
}

/**
 * 일괄 한 장(칸 = 샷)의 소품 참고 — 칸마다 나오는 소품을 모아, 나오는 칸이 많은 것 먼저(같으면 처음 나온 순) 최대 limit 장.
 *   columnProps = 칸마다 실린 소품(그 칸 소품 칸 순서) — 지시문이 칸별로 적는다.
 */
export function planSheetPropRefs(
  staticSpecs: readonly unknown[],
  props: readonly PropForRefs[],
  limit = SHEET_PROP_REF_LIMIT,
  /** 시트 씬의 이야기 속 때(시트 한 장 = 한 씬) — 소품 모습 고르기(m1126 A3). */
  narrativeTime?: string | null,
): { refs: ShotPropRef[]; columnProps: ShotPropRef[][] } {
  const perColumn = staticSpecs.map((spec) => propsInShot(spec, props, narrativeTime))
  const tally = new Map<string, { ref: ShotPropRef; columns: number; first: number }>()
  perColumn.forEach((column, index) => {
    for (const ref of column) {
      const seen = tally.get(ref.propId)
      if (seen) seen.columns++
      else tally.set(ref.propId, { ref, columns: 1, first: index })
    }
  })
  const refs = [...tally.values()]
    .sort((a, b) => b.columns - a.columns || a.first - b.first)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.ref)
  const kept = new Set(refs.map((ref) => ref.propId))
  return { refs, columnProps: perColumn.map((column) => column.filter((ref) => kept.has(ref.propId))) }
}

/**
 * 지시문의 소품 역할 줄 — start = 첫 소품 그림의 참고 번호(1부터). columnProps 를 주면(일괄 한 장) 칸마다 그 칸의 소품을 적는다.
 *   지금 지시문(storyboard-strip)은 인물 시트가 "입거나 들고 있는 물건"까지 정하므로, 소품 그림이 있는 물건은 소품 그림이 앞선다고 적는다.
 */
export function propReferenceLines(start: number, refs: readonly ShotPropRef[], columnProps?: readonly (readonly ShotPropRef[])[]): string[] {
  if (refs.length === 0) return []
  const listed = refs.map((ref, i) => `reference image ${start + i} = ${ref.name}`).join('; ')
  return [
    `- PROP reference sheets (each shows ONE inanimate object from several views — never people, faces or mannequins), in order: ${listed}.`,
    '- Each prop reference decides how that object looks — its shape, material, color and markings: reproduce it exactly, even when a character holds or wears it. This overrides the character-sheet rule above for these objects only. The pencil drawing decides only where the object is and how big it is.',
    '- Draw a prop only where the pencil drawing shows an object. Never add a prop to a panel that has no object there, never draw the same prop twice in one panel, and never turn a prop into a person.',
    ...(columnProps
      ? [
          '- Props per column:',
          ...columnProps.map((column, i) => `    * Column ${i + 1}: ${column.length ? column.map((ref) => ref.name).join(' and ') : 'no prop reference'}`),
        ]
      : []),
  ]
}
