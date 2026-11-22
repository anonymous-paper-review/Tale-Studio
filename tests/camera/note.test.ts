// 그림 판에 사람이 쓴 말(바꿀 점 · 채팅으로 부탁한 말)이 남아 Cinema 이력 판의 요약에 보이는지 검사한다 (오너 2026-11-22 결정 4 "요약에 사람이 쓴 말 남기기" · 리드 답 e)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { resetActionGuard } from '@/lib/action-guard'
import { IMAGE_NOTE_MAX, imageNoteFor, readImageNote, versionNoteFields } from '@/lib/director/image-note'
import { shotHistory, type HistoryEntry } from '@/features/camera/shot-history'
import { translate } from '@/lib/i18n/translate'
import type { StoryboardImage, StoryboardImageVersion } from '@/types/director'

const shots = vi.hoisted(() => ({ invalidate: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: shots.invalidate, loadShotsResult: shots.load }))

const api = () => useDirectorCanvasStore.getState()
let shotId: string
let fetchMock: ReturnType<typeof vi.fn>
const sentBody = () => {
  const call = fetchMock.mock.calls.find(([url]) => String(url) === '/api/director/generate-storyboard')
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : null
}

beforeEach(() => {
  shots.invalidate.mockReset().mockResolvedValue(undefined)
  resetActionGuard()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '검증용 샷')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A landscape' })
  useDirectorCanvasStore.setState({ projectId: crypto.randomUUID(), viewMode: 'node' })
  fetchMock = vi.fn(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('사람 말을 그림 만들기 요청에 싣기', () => {
  it('[이미지 고치기]에 바꿀 점을 적고 다시 그리면 그 말이 "단추로 한 말"로 그림 만들기 요청에 실린다', async () => {
    // 왜: 결정 4 — 바꿀 점은 지금 프롬프트 끝에만 붙어 작업 기록 안에 묻혔다. 판에 남겨야 이력에서 "무엇을 바꿨나"를 읽는다.
    void api().generateStoryboardImage(shotId, { changeNote: '  하늘을 더 어둡게  ' })
    await vi.waitFor(() => expect(sentBody()).not.toBeNull())
    expect(sentBody()).toMatchObject({ note: '하늘을 더 어둡게', via: 'button' })
  })

  it('채팅(Lumi)이 그 샷의 그림을 다시 그리면 부탁한 말이 "채팅으로 한 말"로 실리고, 바꿀 점 없이 다시 그리면 아무 말도 싣지 않는다', async () => {
    // 왜: 결정 4 — 채팅 부탁 문장은 채팅방에만 있고 판과 잇는 칸이 없었다. 말 없이 다시 그린 판에 빈 말을 남기지 않는다.
    api().applyUpdates([{ type: 'generateImage', id: shotId, askedInChat: '샷 1 비 오는 느낌으로 다시 그려줘' }])
    await vi.waitFor(() => expect(sentBody()).not.toBeNull())
    expect(sentBody()).toMatchObject({ note: '샷 1 비 오는 느낌으로 다시 그려줘', via: 'chat' })
    expect(imageNoteFor({ changeNote: '   ' })).toBeNull()
    expect(imageNoteFor(undefined)).toBeNull()
    const chat = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    expect(chat).toMatch(/\.map\(\(update\) => \(update\.type === 'generateImage' && update\.id \? \{ \.\.\.update, askedInChat: trimmed \} : update\)\)/)
  })
})

describe('서버 · 완료', () => {
  it('서버는 사람 말이 글이 아니거나 비었거나 어디서 왔는지 모르면 남기지 않고, 500자를 넘으면 500자까지만 남긴다', () => {
    // 왜: 그림 만들기는 사람 말과 상관없이 그대로 되어야 한다 — 잘못 온 말은 버리고 그림은 만든다. 긴 말은 판 요약 · 저장 칸을 넘치게 한다.
    expect(readImageNote(' 더 밝게 ', 'button')).toEqual({ note: '더 밝게', via: 'button' })
    expect(readImageNote('더 밝게', 'chat')).toEqual({ note: '더 밝게', via: 'chat' })
    expect(readImageNote(42, 'button')).toBeNull()
    expect(readImageNote('   ', 'button')).toBeNull()
    expect(readImageNote('더 밝게', 'batch')).toBeNull()
    expect(readImageNote(undefined, undefined)).toBeNull()
    const long = '가'.repeat(IMAGE_NOTE_MAX + 20)
    expect(readImageNote(long, 'chat')?.note).toHaveLength(IMAGE_NOTE_MAX)
    expect(IMAGE_NOTE_MAX).toBe(500)
  })

  it('다 그린 그림 판(멈춘 뒤 끝난 판 포함)에 사람 말이 note · via 로 남고, 말이 없던 작업의 판에는 두 칸이 없다', () => {
    // 왜: 결정 4 — 새 표 없이 이미 있는 판 목록(versions[])에 키 둘을 더한다. 멈춘 판도 무엇을 바꾸려 했는지 읽혀야 한다.
    expect(versionNoteFields({ note: '더 밝게', via: 'button' })).toEqual({ note: '더 밝게', via: 'button' })
    expect(versionNoteFields(undefined)).toEqual({})
    const finalize = readFileSync('src/lib/fal/finalize.ts', 'utf8')
    expect(finalize.match(/\.\.\.versionNoteFields\(job\.target\.imageNote\)/g)).toHaveLength(2)
    const route = readFileSync('src/app/api/director/generate-storyboard/route.ts', 'utf8')
    expect(route).toMatch(/\.\.\.\(imageNote \? \{ imageNote \} : \{\}\)/)
  })
})

const version = (n: number, extra: Partial<StoryboardImageVersion> = {}): StoryboardImageVersion => ({
  id: `job-${n}`, n, url: `https://x/v${n}.png`, generatedAt: n * 1000, source: 'generated', roughGeneratedAt: 1, ...extra,
})
const image = (versions: StoryboardImageVersion[]): StoryboardImage => {
  const last = versions[versions.length - 1]!
  return { url: last.url, status: 'completed', errorMessage: null, generatedAt: last.generatedAt, versions, versionId: last.id }
}
const summaries = (entries: HistoryEntry[]) => entries.map((entry) => entry.summary.map((p) => translate('ko', p.key, p.params)).join(' · '))

describe('이력 판의 요약', () => {
  it('Cinema 이력 판의 요약은 아는 사실 뒤에 "바꿀 점: …" · "채팅으로 부탁: …"을 붙이고, 사람 말이 없는 판(일괄 · 바꿀 점 없이 다시)은 지금처럼 아는 사실만 보인다', () => {
    // 왜: 참고 페이지 결 "무엇이 문제였고 무엇을 바꿨나" — 사람 말이 있으면 그 말이 핵심이다. LLM 요약은 부르지 않는다(결정 4).
    const entries = shotHistory({
      image: image([
        version(1),
        version(2, { note: '하늘을 더 어둡게', via: 'button' }),
        version(3, { note: '비 오는 느낌으로', via: 'chat' }),
        version(4),
        version(5, { note: '멈췄던 부탁', via: 'button', cancelled: true }),
      ]),
      takes: [],
      final: null,
      shot: { provider: 'kling-o3' },
    })
    expect(summaries(entries)).toEqual([
      '처음 그림',
      `${translate('ko', 'Drawn again')} · 바꿀 점: 하늘을 더 어둡게`,
      `${translate('ko', 'Drawn again')} · 채팅으로 부탁: 비 오는 느낌으로`,
      translate('ko', 'Drawn again'),
      `${translate('ko', 'Finished after it was stopped')} · 바꿀 점: 멈췄던 부탁`,
    ])
  })
})
