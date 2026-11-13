// 연출 한 장 다시 그리기 · 레이어 분리에 실리는 글(행동 글 · 카메라 움직임 · 분리 지시)이 러프 전체(시트)와 같은 규칙을 따르는지 검사한다(2026-11-14 검토 a)
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateReservedImage: vi.fn(),
  upload: vi.fn(),
  thumb: vi.fn(),
  deriveEnBatch: vi.fn(),
  assertUserTextAllowed: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))
vi.mock('@/lib/storage-thumb', () => ({ uploadThumbnail: mocks.thumb }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({ deriveEnBatch: mocks.deriveEnBatch }))
vi.mock('@/lib/moderation/creem', () => ({ assertUserTextAllowed: mocks.assertUserTextAllowed }))

import { regenerateRoughFrame, separateArrowLayer, withoutQuotedDialogue } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 샷 — 한국어 프로젝트의 행동 글(이름 · 따옴표 대사 · 카메라 문장 · 색 말)과 샷 설계의 카메라 무브.
const ROUGH = {
  status: 'completed',
  generatedAt: 100,
  frames: { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction.png', end: 'https://media.test/r/end.png' },
}
let row: Record<string, unknown> = {}

beforeEach(async () => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  row = {
    rough_storyboard: structuredClone(ROUGH),
    action_description: "도윤이 가로등 아래에서 거친 숨을 내쉬며 '마지막... 하나 남았어.'라고 중얼거리고 붉은 스마트폰을 확인한다. 카메라가 천천히 다가간다.",
    dynamic_spec: { camera_motion: { type: 'static', direction: 'none', speed: 'slow' } },
  }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.update = () => q
  q.maybeSingle = async () => ({ data: structuredClone(row), error: null })
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'row' }], error: null }).then(resolve)
  mocks.from.mockReturnValue(q)
  mocks.generateReservedImage.mockResolvedValue({ url: 'https://fal.test/out.png' })
  mocks.upload.mockResolvedValue({ error: null })
  mocks.assertUserTextAllowed.mockResolvedValue({ receipt: 'ok' })
  // 번역은 시트와 같은 종류(shot action description)로 한 번 — 영어 번역에도 따옴표 대사 · 카메라 문장 · 색 말이 남아 있다고 둔다.
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string }>) =>
    new Map(items.map((item) => [item.id, 'Doyun breathes hard under the streetlight, mutters "One last one left." and checks his red smartphone. The camera slowly moves in.'])),
  )
  // 압축이 잘 안 되는 잡음 — 받은 그림이 10KB 보다 작으면 다시 그리기가 멈춘다.
  const raw = Buffer.alloc(255 * 447 * 3)
  let seed = 1
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 255
  }
  const png = await sharp(raw, { raw: { width: 255, height: 447, channels: 3 } }).png().toBuffer()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } })))
})

const promptOf = () => String(mocks.generateReservedImage.mock.calls[0][0].prompt)

describe('연출 한 장 다시 그리기에 실리는 글', () => {
  // 왜(검토 a 1): 행동 글이 원문 그대로 붙어, 한국어 프로젝트면 "도윤이 … '마지막... 하나 남았어.'라고 중얼거리고…"처럼 이름 · 따옴표 대사가
  //   실렸다 — "말풍선 금지"와 "짧은 메모 허용" 사이에서 메모로 옮겨 적힐 재료다. 러프 전체(시트)는 영어 파생본에서 카메라 문장 · 색 말을 빼고 쓴다.
  it('연출 한 장을 다시 그릴 때 행동 글은 러프 전체 그릴 때와 같은 영어 문장으로 넣고 따옴표 대사는 넣지 않는다', async () => {
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    const [[items, kind]] = mocks.deriveEnBatch.mock.calls
    expect(kind).toBe('shot action description')
    expect(items[0].native).not.toContain('마지막')
    const prompt = promptOf()
    const sent = 'Doyun breathes hard under the streetlight, mutters and checks his smartphone'
    expect(prompt).toContain(`The movement to mark: ${sent}.`)
    expect(prompt).not.toMatch(/[가-힣]/)
    expect(prompt).not.toContain('One last one left')
    expect(prompt).not.toContain('..')
    // 내용 검사도 실제로 보내는 그 글로 한다(끝 마침표는 프롬프트 틀의 것).
    expect(mocks.assertUserTextAllowed.mock.calls[0][0]).toEqual([sent])
  })

  // 왜(혼자 정한 것): 카메라 문장을 빼면 카메라가 움직이는 샷의 화살표 재료가 없어진다 — 시트도 연출 칸의 카메라 화살표는 샷 설계의 카메라 무브에서 가져온다.
  it('연출 한 장을 다시 그릴 때 카메라 움직임은 샷 설계의 카메라 무브를 시트와 같은 말로 넣는다', async () => {
    row.dynamic_spec = { camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow' } }
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    expect(promptOf()).toContain('mutters and checks his smartphone; camera dolly in forward, slow.')
    mocks.generateReservedImage.mockClear()
    row.dynamic_spec = { camera_motion: { type: 'static', direction: 'none', speed: 'slow' } }
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    expect(promptOf()).not.toMatch(/camera static/)
  })

  // 왜(검토 a 7b10877d 낮음 1): 번역이 실패하면 한국어 원문(이름 · 조사 포함)이 그대로 실렸다 — 연출 한 장 다시 그리기에서는 행동 글을 빼고
  //   샷 설계의 카메라 말만 둔다(리드 판단, 러프 전체 그리기는 그대로).
  it('연출 한 장을 다시 그릴 때 행동 글을 영어로 옮기지 못하면 행동 글은 빼고 카메라 움직임만 넣는다', async () => {
    mocks.deriveEnBatch.mockImplementation(async () => new Map())
    row.dynamic_spec = { camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow' } }
    await regenerateRoughFrame('p1', 'sh_1', 'direction')
    const prompt = promptOf()
    expect(prompt).toContain('The movement to mark: camera dolly in forward, slow.')
    expect(prompt).not.toMatch(/[\uAC00-\uD7A3]/)
    expect(mocks.assertUserTextAllowed.mock.calls[0][0]).toEqual([null])
  })

  // 왜(검토 a 7b10877d 낮음 2): 글자에 바로 붙은 작은따옴표 대사("도윤이'마지막이야'라고")는 번역 전에 빠지지 않았다.
  //   한글 바로 뒤에서 열리고 '라고 · 이라고 · 하고 · 하며 · 며' 앞에서 닫히는 작은따옴표는 대사다. man's · don't 같은 아포스트로피는 그대로.
  it('글자에 바로 붙은 작은따옴표 대사도 번역 전에 빼고, 아포스트로피는 그대로 둔다', () => {
    expect(withoutQuotedDialogue("도윤이'마지막이야'라고 중얼거리고 휴대폰을 본다.")).toBe('도윤이 중얼거리고 휴대폰을 본다.')
    expect(withoutQuotedDialogue("민호가'가자'하며 일어선다.")).toBe('민호가 일어선다.')
    expect(withoutQuotedDialogue("The man's notebook stays shut; don't open it.")).toBe("The man's notebook stays shut; don't open it.")
  })

  // 왜(검토 a 3): 분리한 밑층은 지우개로 드러나 저장되는 그림이다 — 한 장 다시 그리기와 같이 얼굴 없는 목각 인형 · 글자 없음을 지킨다.
  it('레이어를 분리할 때도 인물은 얼굴 없는 목각 인형 그대로 두고 글자를 더하지 않는다', async () => {
    mocks.generateReservedImage.mockRejectedValueOnce(new Error('stop after the prompt'))
    await expect(separateArrowLayer('p1', 'sh_1', 'en')).rejects.toThrow('stop after the prompt')
    const prompt = promptOf()
    expect(prompt).toMatch(/faceless wooden mannequin/)
    expect(prompt).toMatch(/never add a face/)
    expect(prompt).toMatch(/do not add any text/)
  })
})
