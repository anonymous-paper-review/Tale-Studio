// 카드 그림 넘김(#image-to-artist 2026-09-17) — Producer 카드에 붙은 그림(sourceImageUrl)이 Writer 시작 요청에 실려 오면
//   서버는 (1) 우리 보관함 주소만 받고, (2) 배경은 그 배경의 wide_shot 으로, 인물은 기본 모습의 portrait_url(대표 사진)과
//   derived_from_url(시트의 출처)로 적는다. (3) 파이프라인 캐스트 시드에는 주소를 싣지 않는다 — 글 프롬프트에 URL 이 섞이면 안 된다.
import { isOwnMediaUrl } from '@/lib/storage/media-url'

export interface SourceImagePlan {
  characters: Array<{ character_id: string; url: string }>
  locations: Array<{ location_id: string; url: string }>
}

interface CastLike {
  character_id: string
  source_image_url?: unknown
}
interface LocationLike {
  location_id: string
  source_image_url?: unknown
}

/** 어느 행에 어떤 그림을 적을지 — 보관함 밖 주소·빈 값은 조용히 뺀다(화이트리스트가 유일한 방어). */
export function planSourceImageWrites(input: {
  cast?: ReadonlyArray<CastLike> | null
  backgrounds?: ReadonlyArray<LocationLike> | null
}): SourceImagePlan {
  const characters: SourceImagePlan['characters'] = []
  for (const c of input.cast ?? []) {
    const url = c?.source_image_url
    if (c && typeof c.character_id === 'string' && isOwnMediaUrl(url)) characters.push({ character_id: c.character_id, url })
  }
  const locations: SourceImagePlan['locations'] = []
  for (const l of input.backgrounds ?? []) {
    const url = l?.source_image_url
    if (l && typeof l.location_id === 'string' && isOwnMediaUrl(url)) locations.push({ location_id: l.location_id, url })
  }
  return { characters, locations }
}

/** 캐스트 계약에서 그림 주소를 뗀다 — 파이프라인(LLM 프롬프트)에는 글만 간다. */
export function stripSourceImages<T extends { characters: Array<object> }>(cast: T): T {
  return {
    ...cast,
    characters: cast.characters.map((c) => {
      const copy = { ...(c as Record<string, unknown>) }
      delete copy.source_image_url
      return copy as unknown as T['characters'][number]
    }),
  }
}
