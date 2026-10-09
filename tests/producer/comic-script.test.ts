// 만화 원고를 쪽 · 칸 순서대로 읽어 대사를 글자 그대로 옮긴 대본으로 만들고, 대본 그대로 쓰기가 읽는 형식인지 확인한다 (2026-10-09 오너)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  transcribeComic: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/producer/comic-script-llm', () => ({ transcribeComic: mocks.transcribeComic }))

import { buildComicScriptPrompt, checkComicScript, extractComicScript } from '@/lib/producer/comic-script'
import { mediaPublicUrl } from '@/lib/storage/media-url'
import { POST } from '@/app/api/produce/comic-script/route'

// 이 시험을 위해 새로 지은 짧은 대본 — 실제 만화의 글이 아니다.
const SAMPLE = [
  '제목: 마감 전날',
  '',
  'S#1. 원룸 - 낮',
  '남자가 노트북 앞에서 주먹을 쥔다. 옆의 소녀는 턱을 괸 채 본다.',
  '남자: 오늘은 진짜 끝낸다.',
  '',
  '소녀가 공책을 손가락으로 짚으며 웃는다.',
  '소녀: 어제도 그 말 했잖아.',
  '효과음: 똑똑',
  '',
  'S#2. 편의점 앞 - 밤',
  '남자가 봉지를 들고 걸어 나온다.',
  '화면 문자: 영업 중',
  '자막: 그날 밤은 길었다.',
].join('\n')

// 우리 저장소 주소 — 시험 환경의 저장소 주소 접두사로 만든다(화이트리스트를 그대로 통과해야 한다).
const MEDIA = mediaPublicUrl('ws-1/proj-1/uploads')
const pages = [
  { name: 'comic_1.webp', urls: [`${MEDIA}/p1/s000.jpg`] },
  { name: 'comic_2.webp', urls: [`${MEDIA}/p2/s000.jpg`, `${MEDIA}/p2/s001.jpg`] },
]
const post = (body: unknown) => new Request('http://test/api/produce/comic-script', { method: 'POST', body: JSON.stringify(body) })

describe('만화를 대본으로 옮기는 지시', () => {
  it('말풍선 · 효과음 · 그림 속 글자는 한 글자도 바꾸지 않고 옮기라고 지시한다', () => {
    // 왜: 오너 결정 — 대사는 글자 그대로(그대로 영상화).
    const prompt = buildComicScriptPrompt({ pageCount: 8 })
    expect(prompt).toContain('8장')
    expect(prompt).toMatch(/한 글자도 바꾸지 않고/)
    expect(prompt).toMatch(/각색하지 않는다/)
  })

  it('칸을 빠뜨리거나 합치지 말고 쪽 · 칸 순서대로 칸마다 지문과 대사를 쓰라고 지시한다', () => {
    // 왜: 칸 하나가 컷 하나가 되려면 대본에서 칸의 경계가 살아 있어야 한다.
    const prompt = buildComicScriptPrompt({ pageCount: 3 })
    expect(prompt).toMatch(/첨부 순서가 곧 쪽 순서/)
    expect(prompt).toMatch(/칸을 빠뜨리거나 합치지 않는다/)
    expect(prompt).toMatch(/S#번호\. 장소 - 때/)
    expect(prompt).toMatch(/이름: 대사/)
  })

  it('옮긴 대본이 대본 그대로 쓰기가 읽는 형식이면 장면 · 대사 수를 알려 준다', () => {
    const script = extractComicScript('```script\n' + SAMPLE + '\n```')
    expect(script).toBe(SAMPLE)
    const check = checkComicScript(script)
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.stats.scenes).toBe(2)
      expect(check.stats.dialogue_lines).toBe(2)
    }
  })

  it('장면을 읽어 낼 수 없는 답은 대본으로 받지 않는다', () => {
    expect(checkComicScript('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkComicScript('그림이 흐려서 잘 모르겠어요.').ok).toBe(false)
  })
})

describe('만화 대본 옮기기 창구', () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockReset().mockResolvedValue(true)
    mocks.transcribeComic.mockReset()
  })

  it('쪽 순서대로 그림을 읽혀 옮긴 대본과 장면 · 대사 수를 돌려준다', async () => {
    mocks.transcribeComic.mockResolvedValueOnce({ text: '```script\n' + SAMPLE + '\n```' })
    const res = await POST(post({ projectId: 'proj-1', pages }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.script).toBe(SAMPLE)
    expect(body.stats).toMatchObject({ scenes: 2, dialogue_lines: 2 })
    const [urls, prompt] = mocks.transcribeComic.mock.calls[0]
    expect(urls).toEqual([...pages[0].urls, ...pages[1].urls])
    expect(prompt).toContain('2장')
  })

  it('대본으로 읽히지 않으면 한 번 다시 시도하고, 그래도 안 되면 실패를 알린다', async () => {
    // 왜: 모델 답이 가끔 형식을 어긴다 — 한 번은 다시 쓰게 하되 끝없이 돌지 않는다.
    mocks.transcribeComic.mockResolvedValueOnce({ text: '잘 모르겠어요' }).mockResolvedValueOnce({ text: '```script\n' + SAMPLE + '\n```' })
    expect((await POST(post({ projectId: 'proj-1', pages }))).status).toBe(200)
    expect(mocks.transcribeComic).toHaveBeenCalledTimes(2)
    mocks.transcribeComic.mockReset().mockResolvedValue({ text: '잘 모르겠어요' })
    const res = await POST(post({ projectId: 'proj-1', pages }))
    expect(res.status).toBe(502)
    expect(mocks.transcribeComic).toHaveBeenCalledTimes(2)
  })

  it('우리 저장소에 올린 그림이 아니면 읽히지 않는다', async () => {
    // 왜: 그림 주소는 분석 모델이 직접 가져간다 — 임의 주소를 대신 가져오게 하는 통로가 되면 안 된다.
    const res = await POST(post({ projectId: 'proj-1', pages: [{ name: 'x.png', urls: ['https://evil.example/x.png'] }] }))
    expect(res.status).toBe(400)
    expect(mocks.transcribeComic).not.toHaveBeenCalled()
  })

  it('한 번에 20쪽까지만 읽는다', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `p${i}.png`, urls: [`${MEDIA}/p${i}/s000.jpg`] }))
    expect((await POST(post({ projectId: 'proj-1', pages: many }))).status).toBe(400)
    expect(mocks.transcribeComic).not.toHaveBeenCalled()
  })

  it('로그인하지 않았거나 내 프로젝트가 아니면 읽히지 않는다', async () => {
    mocks.getUser.mockResolvedValueOnce(null)
    expect((await POST(post({ projectId: 'proj-1', pages }))).status).toBe(401)
    mocks.userOwnsProject.mockResolvedValueOnce(false)
    expect((await POST(post({ projectId: 'proj-1', pages }))).status).toBe(403)
    expect(mocks.transcribeComic).not.toHaveBeenCalled()
  })
})
