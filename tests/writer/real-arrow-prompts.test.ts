// 실사 가운데 장 화살표 고치기(N4b)의 세 지시문 — 밑층(화살표 지우기) · 끝 장(시작 장 + 읽은 줄) · 읽기(그린 표시만) — 이 실사에 맞는 말을 싣는지 검사한다
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REAL_STRIP_ARROWS_PROMPT, realEndFramePlan } from '@/lib/storyboard/real-arrow-prompts'
import { DIRECTION_READ_PROMPT, DIRECTION_READ_PROMPT_REAL, readDirectionMarks } from '@/lib/writer/direction-read-vlm'
import { PHOTO_TEXTURE_PEOPLE, PHOTO_TEXTURE_PLACE } from '@/lib/style-facets/photo-sheet-line'

// 이 시험을 위해 지은 샷 — 실사 시작 장 주소와 사람이 고친 화살표를 읽은 줄.
const START = 'https://media.test/ws/p1/shots/sh_1_g1_storyboard_start.png?v=1'
const LINE = 'The woman on the bench stands up and walks out of frame to the right.'
const CLAUSE = 'Muted teal-and-amber grade, soft window light, shallow depth of field.'

describe('실사 끝 장 지시문', () => {
  // 왜: 콘티 끝 장 ②(오너 Q1 · Q3)와 같은 길 — 고친 화살표를 읽은 줄이 움직임을 정하고, 샷 설계의 옛 움직임 글은 고친 화살표와 다툰다(리드 N4b).
  it('실사 끝 장은 GPT Image 2 가 실사 시작 장과 읽은 줄로 그리고 샷 설계의 옛 움직임 글은 싣지 않는다', () => {
    const plan = realEndFramePlan({ start: START, line: LINE, seconds: 5, photoLook: null })
    expect(plan.model).toBe('openai/gpt-image-2/edit')
    expect(plan.refs).toEqual([START])
    expect(plan.prompt).toContain(`fully completed over 5 seconds: ${LINE}`)
    // 내용 검사에 보낼 사용자 글은 읽은 줄 하나뿐이다.
    expect(plan.userText).toBe(LINE)
    expect(plan.prompt).not.toMatch(/dolly|camera move|action description|shot description/i)
  })

  // 왜: 실사 그림체(기준 그림 없이 그리는 실사)는 main 의 "모두 적용" 지시문처럼 실제 사진이어야 한다 — 끝 장만 그림처럼 보이면 세 장이 어긋난다(리드 "실사 그림체를 지킨다").
  it('실사 그림체(사진 길) 프로젝트의 끝 장 지시문은 실제 사진 문장과 그 그림체 색감 문장을 싣는다', () => {
    const plan = realEndFramePlan({ start: START, line: LINE, seconds: 5, photoLook: { clause: CLAUSE } })
    expect(plan.prompt).toContain('live-action film still')
    expect(plan.prompt).toContain(PHOTO_TEXTURE_PEOPLE)
    expect(plan.prompt).toContain(CLAUSE)
    expect(plan.prompt).toContain('No text, letters, numbers, arrows or marks anywhere.')
    expect(plan.prompt).not.toMatch(/pencil|mannequin|sketch/i)
  })

  // 왜(혼자 정한 것 e): 참고는 시작 장 한 장뿐이라, 일본 멜로 · 애니 같은 그림체는 그 그림의 그림체를 지키라고 해야 끝 장만 사진처럼 바뀌지 않는다.
  it('사진 길이 아닌 그림체의 끝 장 지시문은 이 그림과 같은 그림체 · 색 · 빛을 지키라고 하고 실제 사진 말은 싣지 않는다', () => {
    const plan = realEndFramePlan({ start: START, line: LINE, seconds: 4, photoLook: null })
    expect(plan.prompt).toContain('exactly the same art style, colors, light and rendering as this picture')
    expect(plan.prompt).not.toContain(PHOTO_TEXTURE_PEOPLE)
    expect(plan.prompt).not.toMatch(/live-action|real camera|photograph/i)
  })

  // 왜(혼자 정한 것): 사람이 없는 샷(shots.characters 가 빈 목록)에 피부 · 배우 말을 실으면 사람을 그려 넣는다 — 실사 샷 지시문의 무인물 규칙과 같은 결.
  it('사람이 없는 샷의 끝 장 지시문은 사람 이야기를 싣지 않고 사람을 더하지 말라고 한다', () => {
    const photo = realEndFramePlan({ start: START, line: 'The camera pushes in on the empty bench.', seconds: 3, photoLook: { clause: null }, noPeople: true })
    expect(photo.prompt).toContain(PHOTO_TEXTURE_PLACE)
    expect(photo.prompt).not.toContain(PHOTO_TEXTURE_PEOPLE)
    expect(photo.prompt).not.toMatch(/actors|faces|outfits/i)
    expect(photo.prompt).toContain('do not add any person or figure')
    const drawn = realEndFramePlan({ start: START, line: 'The camera pushes in on the empty bench.', seconds: 3, photoLook: null, noPeople: true })
    expect(drawn.prompt).not.toMatch(/characters|outfits/i)
    expect(drawn.prompt).toContain('do not add any person or figure')
  })

  // 왜: 샷 길이를 모르면(옛 샷) 길이 말을 빼고 그린다 — 콘티 끝 장과 같은 규칙.
  it('샷 길이를 모르면 끝 장 지시문에 길이 말을 싣지 않는다', () => {
    const plan = realEndFramePlan({ start: START, line: LINE, seconds: null, photoLook: null })
    expect(plan.prompt).toContain(`fully completed: ${LINE}`)
    expect(plan.prompt).not.toMatch(/over \d+ seconds/)
  })
})

describe('실사 밑층 지시문', () => {
  // 왜(혼자 정한 것 d): 실사 가운데 장은 시작 장과 화소가 달라 그 장 자체에서 화살표 · 글씨만 지운 밑층이 있어야 지우개로 긁은 자리가 맞는다.
  //   콘티 밑층 문장은 "연필 · 얼굴 없는 목각 인형"이라 실사에 쓰면 사진을 연필 그림으로 바꾼다.
  it('밑층 지시문은 화살표 · 움직임 선 · 글씨만 지우고 나머지는 그대로 두라고 하며 연필 · 목각 말을 쓰지 않는다', () => {
    expect(REAL_STRIP_ARROWS_PROMPT).toMatch(/Remove every arrow, motion line, dashed path, direction indicator and text label/)
    expect(REAL_STRIP_ARROWS_PROMPT).toContain('Keep everything else exactly identical')
    expect(REAL_STRIP_ARROWS_PROMPT).toContain('the same rendering style, light, colors and detail')
    expect(REAL_STRIP_ARROWS_PROMPT).not.toMatch(/pencil|mannequin|sketch/i)
  })
})

describe('실사 가운데 장 읽기', () => {
  let sentPrompts: string[]
  beforeEach(async () => {
    sentPrompts = []
    vi.stubEnv('TALE_GEMINI_API_KEY', 'test-gemini-key')
    const png = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer()
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
      const url = String(input)
      if (url.includes('generativelanguage.googleapis.com')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { contents: Array<{ parts: Array<{ text?: string }> }> }
        sentPrompts.push(body.contents[0].parts[0].text ?? '')
        const text = JSON.stringify({ marks: [], camera: 'none', end_en: LINE, end_ko: '벤치의 여자가 일어나 오른쪽으로 나간다.', unclear: '' })
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } })
    }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // 왜(혼자 정한 것 f): 실사 가운데 장은 시작 장과 구도가 조금 다르게 그려진다(개발 DB 실측) — "시작 장에 없는 것은 전부 표시"라고 하면 구도 차이까지 움직임으로 읽는다.
  it('실사 가운데 장을 읽을 때는 연필 · 목각 말 대신 완성 그림이라고 하고 그린 표시만 읽으라고 한다', async () => {
    await expect(readDirectionMarks('https://media.test/a.png', 'https://media.test/b.png', 'real')).resolves.toMatchObject({ en: LINE })
    expect(sentPrompts).toEqual([DIRECTION_READ_PROMPT_REAL])
    expect(DIRECTION_READ_PROMPT_REAL).toContain('a finished film still')
    expect(DIRECTION_READ_PROMPT_REAL).toContain('only the drawn arrows, lines and notes are marks')
    expect(DIRECTION_READ_PROMPT_REAL).not.toMatch(/pencil|mannequin/i)
  })

  // 왜: 정상 경로 고정 — 콘티 가운데 장(목각 러프)을 읽는 지시는 오너가 고른 ② 시험 문장 그대로여야 한다.
  it('콘티 가운데 장을 읽는 지시는 지금 그대로다', async () => {
    await readDirectionMarks('https://media.test/a.png', 'https://media.test/b.png')
    expect(sentPrompts).toEqual([DIRECTION_READ_PROMPT])
    expect(DIRECTION_READ_PROMPT).toContain('pencil sketch, faceless wooden mannequins')
  })
})
