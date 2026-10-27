// 카드 그림 넘김(#image-to-artist 2026-09-17) — Producer 카드에 붙은 그림(sourceImageUrl)이 Writer 시작 요청에 실려 오면
//   서버는 (1) 우리 보관함 주소만 받고, (2) 배경은 그 배경의 wide_shot 으로, 인물은 기본 모습의 portrait_url(대표 사진)과
//   derived_from_url(시트의 출처)로 적는다. (3) 파이프라인 캐스트 시드에는 주소를 싣지 않는다 — 글 프롬프트에 URL 이 섞이면 안 된다.
// Artist 브레이크다운 레퍼런스(2026-10-27 오너 "입력한 이미지는 그대로 artist에 사용하면 되") — source_image_as_is 가 붙은 그림은
//   출처가 아니라 그 카드의 그림 자체다: 인물은 기본 모습의 sheet_url · portrait_url, 배경은 wide_shot. 따로 모아(asIs) 빈칸에만 적는다.
import { isOwnMediaUrl } from '@/lib/storage/media-url'

export interface SourceImagePlan {
  characters: Array<{ character_id: string; url: string }>
  locations: Array<{ location_id: string; url: string }>
  /** 그대로 쓰는 레퍼런스 그림 — 인물은 사람만(사물은 Artist 카드가 없다). */
  asIs: {
    characters: Array<{ character_id: string; url: string }>
    locations: Array<{ location_id: string; url: string }>
  }
}

interface CastLike {
  character_id: string
  entity_type?: unknown
  source_image_url?: unknown
  source_image_as_is?: unknown
}
interface LocationLike {
  location_id: string
  source_image_url?: unknown
  source_image_as_is?: unknown
}

/** 어느 행에 어떤 그림을 적을지 — 보관함 밖 주소·빈 값은 조용히 뺀다(화이트리스트가 유일한 방어). */
export function planSourceImageWrites(input: {
  cast?: ReadonlyArray<CastLike> | null
  backgrounds?: ReadonlyArray<LocationLike> | null
}): SourceImagePlan {
  const plan: SourceImagePlan = { characters: [], locations: [], asIs: { characters: [], locations: [] } }
  for (const c of input.cast ?? []) {
    const url = c?.source_image_url
    if (!c || typeof c.character_id !== 'string' || !isOwnMediaUrl(url)) continue
    if (c.source_image_as_is !== true) plan.characters.push({ character_id: c.character_id, url })
    else if (c.entity_type !== 'object') plan.asIs.characters.push({ character_id: c.character_id, url })
  }
  for (const l of input.backgrounds ?? []) {
    const url = l?.source_image_url
    if (!l || typeof l.location_id !== 'string' || !isOwnMediaUrl(url)) continue
    ;(l.source_image_as_is === true ? plan.asIs.locations : plan.locations).push({ location_id: l.location_id, url })
  }
  return plan
}

/** 캐스트 계약에서 그림 주소 · 그림 표시를 뗀다 — 파이프라인(LLM 프롬프트)에는 글만 간다. */
export function stripSourceImages<T extends { characters: Array<object> }>(cast: T): T {
  return {
    ...cast,
    characters: cast.characters.map((c) => {
      const copy = { ...(c as Record<string, unknown>) }
      delete copy.source_image_url
      delete copy.source_image_as_is
      return copy as unknown as T['characters'][number]
    }),
  }
}
