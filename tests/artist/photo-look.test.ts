// 실사 그림체의 인물 시트 · 배경이 "실제로 찍은 사진"으로 그려지고, 다른 그림체는 바뀌지 않는지 검사한다 (오너 2026-11-23 "2 모두 적용을 실사 스타일로")
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rows: new Map<string, { data: unknown; error: unknown }>(), selects: [] as string[] }))
// style_anchors 조회 — 고른 칸(select 문자열)마다 돌려줄 답을 정한다.
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: (columns: string) => {
        mocks.selects.push(columns)
        return { eq: () => ({ maybeSingle: async () => mocks.rows.get(columns) ?? { data: null, error: null } }) }
      },
    }),
  },
}))

import { _clearReferenceImageCacheForTest } from '@/lib/style-facets/reference-image'
import { _clearPhotoLookCacheForTest, PHOTO_WORLD_LEAD, resolvePhotoLook, withPhotoWorld } from '@/lib/style-facets/photo-look'
import { buildCharacterTurnaroundPrompt, type CharacterPromptInput } from '@/lib/artist/turnaround'

const FLAG = 'use_reference_image'
const LOOK = 'medium, style_clause'
const MELO = 'Grade the whole image in this look: soft diffuse light. A real photograph, not an illustration, painting or anime.'
const read = (rel: string) => readFileSync(rel, 'utf8')

const preset = (flag: boolean, medium: string | null, clause: string | null) => {
  mocks.rows.set(FLAG, { data: { use_reference_image: flag }, error: null })
  mocks.rows.set(LOOK, { data: { medium, style_clause: clause }, error: null })
}

beforeEach(() => {
  _clearReferenceImageCacheForTest()
  _clearPhotoLookCacheForTest()
  mocks.rows.clear()
  mocks.selects.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('실사 계열 그림체의 사진 글', () => {
  it('기준 그림 없이 그리는 실사 계열 그림체는 그 그림체의 색감 문장을 글로 싣는다', async () => {
    // 왜: 기준 그림을 빼면 그 그림체의 색 · 빛이 사라진다 — 색감 문장은 글로 남겨야 일본 멜로와 하이테크 SF 가 구별된다.
    preset(false, 'live_action', MELO)
    expect(await resolvePhotoLook({ style_anchor_key: 'real_jp_melo' })).toEqual({ key: 'real_jp_melo', clause: MELO })
  })

  it('기준 그림을 가리키는 그림체 문장은 글로 싣지 않는다', async () => {
    // 왜: 기준 그림이 붙지 않는데 "그림체 기준 그림을 따라라"고 하면 모델이 다른 참고 그림을 그림체로 읽는다(실사 · 심리 공포의 문장).
    preset(false, 'live_action', "Carry the style reference's scene language as well: its color energy.")
    expect(await resolvePhotoLook({ style_anchor_key: 'real' })).toEqual({ key: 'real', clause: null })
    _clearPhotoLookCacheForTest()
    preset(false, 'live_action', 'Carry HOW the style references render a scene and its figures.')
    expect((await resolvePhotoLook({ style_anchor_key: 'real_psy_horror' }))?.clause).toBeNull()
  })

  it('실사가 아닌 그림체 · 기준 그림을 쓰는 그림체 · 올린 그림체 · 그림체 없음이면 사진 글을 싣지 않는다', async () => {
    // 왜: 애니 · 수채 · 사용자가 올린 그림체에 "실제 사진"을 넣으면 그림체가 깨진다(정상 경로 고정).
    preset(false, '2d_anime', 'clause')
    expect(await resolvePhotoLook({ style_anchor_key: 'jp_anime' })).toBeNull()
    _clearReferenceImageCacheForTest()
    _clearPhotoLookCacheForTest()
    preset(true, 'live_action', MELO)
    expect(await resolvePhotoLook({ style_anchor_key: 'real_jp_melo' })).toBeNull()
    expect(await resolvePhotoLook({ style_anchor_key: 'custom_1', custom_style_anchor: { url: 'https://user/style.png' } })).toBeNull()
    expect(await resolvePhotoLook({ style_anchor_key: null })).toBeNull()
    expect(await resolvePhotoLook(null)).toBeNull()
  })

  it('그림체 정보를 읽지 못하면 사진 글 없이 지금처럼 그린다', async () => {
    // 왜: 조회가 잠깐 실패했다고 그림을 못 그리면 안 된다 — 모르면 덧붙이지 않는다.
    mocks.rows.set(FLAG, { data: { use_reference_image: false }, error: null })
    mocks.rows.set(LOOK, { data: null, error: { code: '57014', message: 'timeout' } })
    expect(await resolvePhotoLook({ style_anchor_key: 'real' })).toBeNull()
  })
})

describe('실사 계열 인물 시트', () => {
  const input: CharacterPromptInput = {
    name: 'Ian',
    appearance: 'A young man in his twenties with short black hair. He has a calm face.',
    role: 'lead',
    costumes: ['white shirt'],
    artStyle: 'japanese_melodrama_live_action',
    texturePhilosophy: 'photorealistic',
  }
  const photo = { key: 'real_jp_melo', clause: MELO }

  it('실사 계열 인물 시트 지시문은 모든 칸이 실제 배우를 찍은 스튜디오 사진이라고 하고, 색감 문장을 싣는다', () => {
    // 왜: 원인 ④ — 시트 지시문에 "사진"이 한 번도 없어 컨셉아트 · 게임 일러스트로 읽혔다.
    const prompt = buildCharacterTurnaroundPrompt(input, { photoLook: photo })
    expect(prompt).toMatch(/every tile is a real studio photograph of a real actor/)
    expect(prompt).toMatch(/never a drawing, painting, illustration, 3D render, game character or concept art/)
    expect(prompt).toContain(MELO)
    // 원인 ③: Writer 가 정한 실사 값은 지우지 않는다.
    expect(prompt).toContain('art style: japanese_melodrama_live_action')
    expect(prompt).toContain('texture: photorealistic')
    // 그림 말("art style" 을 따라라 · 애니로 돌아가지 마라)은 사진 시트에 싣지 않는다.
    expect(prompt).not.toMatch(/consistent art style|follow the declared art style/)
    expect(prompt).toMatch(/same actor, outfit, colors and proportions in every tile/)
  })

  it('지금 시트나 올린 그림을 참고로 다시 그릴 때는 누구인지와 옷만 가져오고 그림 느낌은 베끼지 말라고 적는다', () => {
    // 왜: 지금 프로젝트의 시트는 그림이다 — [다시 만들기]는 그 시트를 얼굴 참고로 넣어 "그대로 유지해라"고 해서 다시 그림으로 나온다.
    const LINE = /the reference pictures of this character may be drawings or renders: keep only who they are and what they wear/
    for (const ref of [{ hasPriorRender: true }, { hasBaseFace: true }, { hasSourceImage: true }, { hasSeriesSheet: true }]) {
      expect(buildCharacterTurnaroundPrompt(input, { ...ref, photoLook: photo })).toMatch(LINE)
      expect(buildCharacterTurnaroundPrompt(input, ref)).not.toMatch(LINE)
    }
    expect(buildCharacterTurnaroundPrompt(input, { photoLook: photo })).not.toMatch(LINE)
  })

  it('내용 정책에 걸려 순화해 다시 그릴 때, 사진 시트 · 사진 배경에는 "일러스트"라는 말을 넣지 않는다', () => {
    // 왜: 순화 말이 "non-graphic illustration"이라 "일러스트가 아니다"와 정면으로 다퉜다(11/23 검토).
    const safe = buildCharacterTurnaroundPrompt({ ...input, safeMode: true }, { photoLook: photo })
    expect(safe).toContain('depicted as an adult, age-ambiguous')
    expect(safe).not.toMatch(/non-graphic illustration/)
    expect(safe).toMatch(/non-graphic photograph/)
    expect(buildCharacterTurnaroundPrompt({ ...input, safeMode: true })).toMatch(/non-graphic illustration/)
    expect(withPhotoWorld('Porch, stylized non-graphic illustration, tasteful, safe-for-work, no violence', photo)).not.toMatch(/illustration, tasteful/)
    expect(withPhotoWorld('Porch, stylized non-graphic illustration, tasteful, safe-for-work, no violence', null)).toMatch(/illustration, tasteful/)
  })

  it('사진 글이 들어가도 인물 설명이 잘리지 않는다', () => {
    // 왜: 시트 글 상한은 그대로인데 사진 글 · 색감 문장을 더하면 외형 설명이 뒤 문장부터 빠진다 — 더한 만큼 상한을 늘린다.
    const long = Array.from({ length: 14 }, (_, i) => `Sentence ${i + 1} describes the coat, the scar and the way this person stands still.`).join(' ')
    const before = buildCharacterTurnaroundPrompt({ ...input, appearance: long })
    const after = buildCharacterTurnaroundPrompt({ ...input, appearance: long }, { photoLook: photo })
    const count = (p: string) => (p.match(/Sentence \d+ describes/g) ?? []).length
    expect(count(after)).toBeGreaterThanOrEqual(count(before))
  })

  it('사진 글이 없는 시트 지시문은 지금과 글자까지 같다', () => {
    // 왜: 애니 · 수채 · 그림체 없음 시트는 바뀌지 않는다(정상 경로 고정).
    expect(buildCharacterTurnaroundPrompt(input, { photoLook: null })).toBe(buildCharacterTurnaroundPrompt(input))
    expect(buildCharacterTurnaroundPrompt(input)).toMatch(/follow the declared art style exactly/)
  })
})

describe('일본 멜로에 있던 "실제 사진" 문장', () => {
  const input: CharacterPromptInput = { name: 'Ian', appearance: 'A young man with short black hair', role: 'lead', costumes: ['white shirt'], artStyle: 'live_action', texturePhilosophy: 'photorealistic' }
  const TEXT = /shot on a digital cinema camera: true-to-life (?:skin texture with visible pores|surface texture), real fabric weave and true material response\. A real photograph, not an illustration, painting or anime/
  const OTHERS = /35mm|pastel|bloom|halation|wistful|film grain/

  it('실사 그림체의 인물 시트와 배경 지시문에 "실제 사진" 문장을 싣고, 일본 멜로의 렌즈와 색은 싣지 않는다', () => {
    // 왜: 오너 11/23 "일본 멜로를 선택한 경우가 실사에 제일 가깝게 나와" — 그 프로젝트의 2번에는 시트 · 배경 · 샷 모두에 이 문장이 있었고 실사에는 없었다.
    const sheet = buildCharacterTurnaroundPrompt(input, { photoLook: { clause: null } })
    const world = withPhotoWorld('Old tavern porch, no people or characters, empty environment', { key: 'real', clause: null })
    for (const prompt of [sheet, world]) {
      expect(prompt).toMatch(TEXT)
      expect(prompt).not.toMatch(OTHERS)
      expect(prompt).not.toMatch(/\.\.(?!\.)/)
    }
    // 사람이 없는 배경에는 피부 이야기를 넣지 않는다.
    expect(world).not.toMatch(/skin|pores/)
  })

  it('그림체 색감 문장에 이미 "실제 사진" 문장이 있으면 두 번 싣지 않는다', () => {
    // 왜: 기준 그림 없이 그리는 그림체가 늘어나도 같은 말이 겹치지 않게.
    const melo = { key: 'real_jp_melo', clause: MELO }
    for (const prompt of [buildCharacterTurnaroundPrompt(input, { photoLook: melo }), withPhotoWorld('Porch', melo)]) {
      expect(prompt.match(/A real photograph, not an illustration, painting or anime/g)?.length).toBe(1)
    }
  })
})

describe('실사 계열 배경', () => {
  it('실사 계열 배경 지시문은 맨 앞에 현장에서 실제 카메라로 찍은 영화 스틸이라고 적고 색감 문장을 싣는다', () => {
    // 왜: 원인 ⑤ — 배경 지시문에도 "사진"이 없어 3D 건축 렌더로 나왔다.
    const prompt = withPhotoWorld('Old tavern porch, no people or characters, empty environment', { key: 'real_hitech_sf', clause: 'Render it in this look: cool light.' })
    expect(prompt.startsWith(PHOTO_WORLD_LEAD)).toBe(true)
    expect(PHOTO_WORLD_LEAD).toMatch(/live-action film still/i)
    expect(PHOTO_WORLD_LEAD).toMatch(/photographed on location with a real camera/i)
    expect(prompt).toContain('Old tavern porch, no people or characters, empty environment')
    expect(prompt).toContain('Render it in this look: cool light.')
  })

  it('사진 글이 없는 배경 지시문은 지금과 글자까지 같다', () => {
    // 왜: 다른 그림체의 배경은 바뀌지 않는다(정상 경로 고정).
    expect(withPhotoWorld('Old tavern porch', null)).toBe('Old tavern porch')
  })
})

describe('사진 글이 그림을 그리는 길마다 이어지는지', () => {
  it('인물 시트 · 서버 첫 그림 · 배경 길이 모두 같은 사진 글을 싣는다', () => {
    // 왜: 한 길이라도 빠지면 같은 작품 안에서 그림과 사진이 섞인다(단추 · [만들기] 첫 그림 · 채팅 다시 그리기).
    const sheet = read('src/app/api/artist/generate-sheet/route.ts')
    expect(sheet).toMatch(/const photoLook = anchor \? null : await resolvePhotoLook\(project\)/)
    expect(sheet.match(/photoLook,/g)?.length).toBeGreaterThanOrEqual(2)
    const drafts = read('src/lib/artist/draft-trigger.ts')
    expect(drafts.match(/const photoLook = anchor \? null : await resolvePhotoLook\(project\)/g)?.length).toBe(2)
    const world = read('src/app/api/artist/generate-world/route.ts')
    expect(world).toMatch(/const photoLook = anchor \? null : await resolvePhotoLook\(project\)/)
    expect(world).toMatch(/photoLook,/)
    expect(read('src/lib/artist/world-submit.ts')).toMatch(/withPhotoWorld\(input\.prompt, input\.photoLook \?\? null\)/)
  })
})
