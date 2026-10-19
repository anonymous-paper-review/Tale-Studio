// Producer 시작: 정한 값으로 이야기 · 설정 · Producer 카드 초안 · Writer 시작 요청을 만든다 (리뉴얼 1차 2026-10-19)
import { describe, expect, it } from 'vitest'
import { planEntryStart } from '@/lib/entry/start-plan'
import { emptyEntryDraft, type EntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { parseProducerDraft } from '@/stores/producer-store'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'
const SCRIPT = '민호: 또 안 나와?\n팀장: 고마워.'

const scriptFile: EntryFileMeta = {
  name: '자판기_촬영대본.docx', ext: 'docx', kind: 'text', size: 2048, chars: SCRIPT.length, text: SCRIPT, uploadedAt: '2026-10-19T00:00:00.000Z',
}

function draftWith(over: Partial<EntryDraft> = {}): EntryDraft {
  return {
    ...emptyEntryDraft(),
    idea: IDEA,
    picks: { mood: 'comedy', runtime: 'r60', level: 'polish', ratio: '9:16' },
    rec: { kind: '1-3', mood: 'comedy', moodWhy: '', runtime: 'r60', runtimeWhy: '', level: 'polish', title: '자판기의 반란', basis: 'basis', source: 'llm' },
    ...over,
  }
}

const plan = (draft: EntryDraft, locale: 'ko' | 'en' = 'ko', currentTitle = 'Untitled') =>
  planEntryStart({ projectId: 'project-1', draft, locale, currentTitle })

describe('시작할 때 만드는 이야기와 설정', () => {
  it('아이디어와 파일 글이 다 있으면 이야기는 아이디어 · 빈 줄 · 파일 글 순서이고 하나만 있으면 그것만 쓴다', () => {
    // 왜: Writer 는 이야기 글 하나를 받는다. 두 재료를 빠짐없이 같은 순서로 넘긴다.
    const both = plan(draftWith({ file: scriptFile }))
    expect(both.ok && both.story).toBe(`${IDEA}\n\n${SCRIPT}`)
    const fileOnly = plan(draftWith({ idea: '   ', file: scriptFile }))
    expect(fileOnly.ok && fileOnly.story).toBe(SCRIPT)
    const ideaOnly = plan(draftWith())
    expect(ideaOnly.ok && ideaOnly.story).toBe(IDEA)
  })

  it('그대로로 시작하면서 대본 파일이 있으면 파일 글만 원문으로 지키고 아이디어 글은 원문에 넣지 않는다', () => {
    // 왜: 그대로(바로 영상화)는 대본을 그대로 쓴다 — 아이디어 칸의 설명 글이 대본 첫 장면으로 섞이면 안 된다(2026-10-19 혼자 정함).
    const keep = plan(draftWith({ file: scriptFile, picks: { mood: 'comedy', runtime: 'r60', level: 'keep', ratio: '9:16' } }))
    expect(keep.ok && keep.story).toBe(SCRIPT)
    expect(keep.ok && keep.writerStart.story).toBe(SCRIPT)
    expect(keep.ok && keep.producerDraft.storyText).toBe(SCRIPT)
  })

  it('정한 값으로 설정을 만든다: 길이는 초, 장르는 프로젝트 언어의 장르·분위기 이름, 화면 비율은 화면 형식, 대사 언어는 프로젝트 언어다', () => {
    // 왜: 채팅 · 대사 언어를 고르는 칸이 없다. 사이트 언어로 잠근 프로젝트 언어가 곧 대사 언어다.
    const ko = plan(draftWith())
    expect(ko.ok && ko.settings).toEqual({ playtime: 60, genre: '코미디', format: 'vertical_9:16', tone: [], dialogueLanguage: 'ko' })
    const en = plan(draftWith({ picks: { mood: 'scifi_fantasy', runtime: 'r1200', level: 'grow', ratio: '2.39:1' } }), 'en')
    expect(en.ok && en.settings).toEqual({ playtime: 1200, genre: 'Sci-fi and fantasy', format: 'cinema_2.39:1', tone: [], dialogueLanguage: 'en' })
  })

  it('Writer 시작 요청은 산문 초안(트리트먼트) · V1 · 길이 · 장르 · 빈 인물과 배경 · 바꿈 정도를 싣는다', () => {
    // 왜: 클라이언트는 이 요청을 그대로 /api/writer/start 에 보낸다. 산문 초안만 쓰고 확정을 기다린다.
    const result = plan(draftWith())
    if (!result.ok) throw new Error(result.code)
    expect(result.writerStart).toEqual({
      projectId: 'project-1',
      story: IDEA,
      treatmentDraft: true,
      writerEngine: 'v1',
      runtimeSeconds: 60,
      genre: { genre: '코미디', subGenre: undefined, tone: [], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2', format: 'vertical_9:16' },
      cast: { characters: [] },
      backgrounds: { locations: [] },
      changeLevel: 'polish',
    })
    expect(result.changeLevel).toBe('polish')
  })

  it('그대로로 시작하면 길이는 원작대로(0초)이고 대본 보존 표시를 달며 Writer 에 길이를 보내지 않는다', () => {
    // 왜: 그대로 영상화는 원작 길이가 영상 길이다(2026-10-09 오너 "영상 길이 제한을 없애줘").
    const result = plan(draftWith({ file: scriptFile, picks: { mood: 'comedy', runtime: 'r300', level: 'keep', ratio: '16:9' } }))
    if (!result.ok) throw new Error(result.code)
    expect(result.settings.playtime).toBe(0)
    expect(result.writerStart.preserveScript).toBe(true)
    expect(result.writerStart.runtimeSeconds).toBeUndefined()
    expect(result.writerStart.genre.runtime_seconds).toBe(0)
    expect(result.writerStart.changeLevel).toBe('keep')
    expect(result.producerDraft.preserveScript).toBe(true)
  })

  it('Producer 카드 초안(producer_draft)도 같은 이야기와 설정으로 만들어 Writer 화면이 그대로 읽는다', () => {
    // 왜: Writer(산문 작업공간)는 예전 Producer 카드 초안에서 이야기와 설정을 읽는다. 모양이 다르면 빈 화면이 된다.
    const result = plan(draftWith())
    if (!result.ok) throw new Error(result.code)
    const parsed = parseProducerDraft(JSON.parse(JSON.stringify(result.producerDraft)))
    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject({ version: 1, storyText: IDEA, storyReady: true, settings: result.settings, cast: [], backgrounds: [], preserveScript: null, treatmentSyncedVersion: null })
  })

  it('프로젝트 제목이 제목 없음이면 AI가 붙인 제목을 쓰고 이미 제목이 있으면 그대로 둔다', () => {
    // 왜: 새 프로젝트는 제목 없이 만들어진다. 사용자가 붙인 제목은 덮어쓰지 않는다.
    const untitled = plan(draftWith())
    expect(untitled.ok && untitled.title).toBe('자판기의 반란')
    const named = plan(draftWith(), 'ko', '내 작품')
    expect(named.ok && named.title).toBeNull()
  })
})

describe('시작하지 않는 경우', () => {
  it('고르지 않은 값이 하나라도 있으면 시작하지 않는다', () => {
    // 왜: 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율이 다 있어야 산문 초안을 쓸 수 있다.
    for (const key of ['mood', 'runtime', 'level', 'ratio'] as const) {
      const draft = draftWith()
      draft.picks = { ...draft.picks, [key]: null }
      expect(plan(draft), key).toEqual({ ok: false, code: 'missing_picks' })
    }
  })

  it('글이 20자 미만이고 글이 담긴 파일도 없으면 시작하지 않는다', () => {
    // 왜: 화면 검사를 건너뛴 요청도 서버가 같은 규칙으로 막는다. 글을 못 찾은 파일은 재료로 치지 않는다.
    expect(plan(draftWith({ idea: '짧은 글' }))).toEqual({ ok: false, code: 'too_short' })
    const noText: EntryFileMeta = { ...scriptFile, text: undefined, chars: 0, noText: true }
    expect(plan(draftWith({ idea: '', file: noText }))).toEqual({ ok: false, code: 'too_short' })
  })

  it('지킬 원문이 없는데 그대로를 골랐으면 시작하지 않는다', () => {
    // 왜: 그대로는 지킬 원문(글이 담긴 파일 또는 60자 넘는 글)이 있을 때만 고를 수 있다.
    const short = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아진다'
    expect(plan(draftWith({ idea: short, picks: { mood: 'comedy', runtime: 'r60', level: 'keep', ratio: '9:16' } }))).toEqual({ ok: false, code: 'keep_needs_original' })
  })
})
