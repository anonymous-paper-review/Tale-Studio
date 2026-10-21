// Producer 시작 화면에 보이는 것: 두 탭 · 이야기 재료 · 설정(추천과 이유 · 잠금 묶음) · 확인 창 · 채팅 카드 · 완료 화면 (리뉴얼 1차 2026-10-19)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/start',
}))

import { EntryWorkspace } from '@/features/entry/entry-workspace'
import { EntryForm } from '@/features/entry/entry-form'
import { EntryChat } from '@/features/entry/entry-chat'
import { EntrySummary } from '@/features/entry/entry-summary'
import { summaryRows } from '@/features/entry/summary'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft, materialBasis, type EntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { translate } from '@/lib/i18n/translate'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹는다.'
const SCRIPT = '민호: 또 안 나와?\n팀장: 고마워.'

function withRec(draft: EntryDraft, over: Partial<NonNullable<EntryDraft['rec']>> = {}): EntryDraft {
  const rec = { kind: '1-3' as const, mood: 'comedy' as const, moodWhy: '엉뚱한 사건이라 코미디로 읽었어요', runtime: 'r60' as const, runtimeWhy: '짧은 아이디어라 짧게 잡았어요', level: 'grow' as const, title: '자판기의 반란', source: 'llm' as const, ...over, basis: materialBasis(draft) }
  return { ...draft, rec, picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: '9:16' } }
}
const recDraft = () => withRec({ ...emptyEntryDraft(), idea: IDEA })
const scriptFile: EntryFileMeta = { name: '자판기_촬영대본.docx', ext: 'docx', kind: 'text', size: 2048, chars: 20, text: SCRIPT, uploadedAt: '2026-10-19T00:00:00.000Z' }

// 서버 그리기(renderToStaticMarkup)는 zustand 의 처음 상태(getInitialState)를 읽는다 — 시험은 지금 상태를 처음 상태에 덮어 그린다.
function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
function setEntry(state: Partial<ReturnType<typeof useEntryStore.getState>>) {
  useEntryStore.setState({ projectId: 'project-1', status: 'ready', locale: 'ko', ...state })
  serveCurrent(useEntryStore)
}
// 글자 비교를 위해 따옴표 · & 이스케이프만 되돌린다(속성 비교는 그대로 된다).
const html = (component: () => unknown) =>
  renderToStaticMarkup(createElement(component as never)).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

beforeEach(() => {
  useEntryStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'project-1', reachedStage: 'entry', currentStage: 'entry', projectTitle: 'Untitled' })
  serveCurrent(useEntryStore)
  serveCurrent(useLocaleStore)
  serveCurrent(useProjectStore)
})

describe('두 탭', () => {
  it('Producer 시작 화면은 화면에서 고르기 · 채팅으로 만들기 두 탭을 보여준다', () => {
    // 왜: 오너 결정 "1안 · 2안을 탭으로 둘 다". 같은 초안을 두 방식으로 채운다.
    setEntry({ draft: emptyEntryDraft() })
    const out = html(EntryWorkspace)
    expect(out).toContain('화면에서 고르기')
    expect(out).toContain('채팅으로 만들기')
    expect(out).toContain('role="tab"')
  })
})

describe('화면에서 고르기', () => {
  it('이야기 재료 화면은 글 입력칸 · 글자 수 · 파일 첨부 · 다음을 보여주고 형식 고르기 · 이미지 권리 동의 · 언어 고르기는 없다', () => {
    // 왜: 프로토타입 E1 은 형식 고르기(단편 · 광고 · MV …) · 이미지 권리 동의 · 채팅 · 대사 언어 고르기를 없앴다. 채팅 · 대사 언어는 사이트 언어다.
    setEntry({ draft: { ...emptyEntryDraft(), idea: '자판기' }, formStep: 1 })
    const out = html(EntryForm)
    expect(out).toContain('무엇을 만들어 볼까요?')
    expect(out).toContain('이야기 재료')
    expect(out).toContain('<textarea')
    expect(out).toContain('3자')
    expect(out).toContain('파일 첨부')
    expect(out).toContain('다음')
    for (const removed of ['단편 영화', '뮤직비디오', '광고 · 브랜드', '권리', '동의', '대사 언어', '채팅 언어']) expect(out, removed).not.toContain(removed)
  })

  it('글이 짧은데 다음을 눌렀으면 입력칸 아래에 지금 글자 수와 함께 더 적어 달라고 알린다', () => {
    // 왜: 왜 안 넘어가는지 그 자리에서 보여준다(프로토타입 E1e).
    setEntry({ draft: { ...emptyEntryDraft(), idea: '자판기 고장' }, formStep: 1, showLengthError: true })
    const out = html(EntryForm)
    expect(out).toContain('role="alert"')
    expect(out).toContain('조금 더 적어 주세요. 20자 이상이면 AI가 이야기를 잡을 수 있어요. (지금 6자)')
  })

  it('설정 화면은 장르·분위기 10개 · 길이 4개 · 바꿈 정도 3단계를 고르게 하고 추천에 추천 표시와 이유 한 줄을 붙인다', () => {
    // 왜: AI가 골라 둔 값이 맞으면 그대로 진행한다. 장르·분위기와 길이는 왜 그렇게 골랐는지 한 줄로 알려준다.
    setEntry({ draft: recDraft(), formStep: 2 })
    const out = html(EntryForm)
    expect(out).toContain('이렇게 만들어 볼까요?')
    for (const label of ['코미디', '일상·잔잔', '15초 이하', '5~20분', '그대로', '다듬기', '새롭게 키우기', '지켜요', '바꿔요']) expect(out, label).toContain(label)
    expect(out).toContain('엉뚱한 사건이라 코미디로 읽었어요')
    expect(out).toContain('짧은 아이디어라 짧게 잡았어요')
    expect(out).toContain('추천')
    expect(out).toContain('role="radiogroup"')
    expect(out).toContain('aria-checked="true"')
    expect(out).toContain('AI로 진행')
  })

  it('화면 비율은 잠금 묶음에 따로 있고 "시작하면 끝까지 바꿀 수 없어요"를 보여준다', () => {
    // 왜: 화면 비율은 시작하는 순간 잠겨 어느 단계에서도 바꿀 수 없다. 다른 설정과 섞이면 그 무게가 안 보인다.
    setEntry({ draft: recDraft(), formStep: 2 })
    const out = html(EntryForm)
    const lockStart = out.indexOf('data-entry-lock')
    expect(lockStart).toBeGreaterThan(0)
    const lock = out.slice(lockStart)
    expect(lock).toContain('화면 비율')
    expect(lock).toContain('시작하면 끝까지 바꿀 수 없어요')
    for (const ratio of ['16:9', '9:16', '1:1', '2.39:1']) expect(lock).toContain(ratio)
    // 장르·분위기는 잠금 묶음 앞에 있다.
    expect(out.indexOf('코미디')).toBeLessThan(lockStart)
  })

  it('대본 파일이면 바꿈 정도 묶음은 "대본을 어떻게 쓸까요?"로 묻고 어떤 대본으로 읽었는지 알려준다', () => {
    // 왜: 대본은 유저 플로우 정리본의 말(바로 영상화 · 조금 다듬어서 · 완전 새롭게)로 묻는다.
    setEntry({ draft: withRec({ ...emptyEntryDraft(), file: scriptFile }, { kind: '1-1', level: 'keep' }), formStep: 2 })
    const out = html(EntryForm)
    expect(out).toContain('대본을 어떻게 쓸까요?')
    expect(out).toContain('자판기_촬영대본.docx을(를) 영상까지 고려된 대본(으)로 읽었어요')
    expect(out).toContain('바로 영상화')
    expect(out).toContain('조금 다듬어서')
    expect(out).toContain('완전 새롭게')
  })

  it('지킬 원문이 없으면 그대로는 고를 수 없게 꺼 두고 이유를 보여준다', () => {
    // 왜: 꺼진 버튼은 이유가 함께 보여야 한다.
    setEntry({ draft: withRec({ ...emptyEntryDraft(), idea: '회사 복도 자판기가 고장 나서 캔이 쏟아진다' }), formStep: 2 })
    const out = html(EntryForm)
    expect(out).toContain('aria-disabled="true"')
    expect(out).toContain('"그대로"는 지킬 원문이 있어야 해요. 대본 파일을 올리거나 줄거리를 60자 넘게 적으면 열려요.')
  })

  it('확인 창은 정한 값 · 잠기는 화면 비율 · 자료를 보여준다', () => {
    // 왜: [예, 시작]을 누르면 화면 비율이 잠긴다. 누르기 전에 무엇으로 시작하는지 한 번 더 본다(프로토타입 E4).
    const rows = summaryRows(recDraft(), { t: ko, locale: 'ko' })
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['화면 비율', '9:16 · 시작하면 끝까지 바꿀 수 없어요'],
      ['장르·분위기', '코미디'],
      ['길이', '15~60초'],
      ['바꿈 정도', '3 새롭게 키우기 · 재료에서 출발해 아이디어를 더해요'],
      ['자료', '아이디어 글만'],
    ])
    // 2026-10-21 오너 "Chat Language 삭제" — 채팅 언어 줄은 보이지 않는다(채팅은 지금처럼 사이트 언어를 따른다).
    expect(rows[0].locked).toBe(true)
    // 그대로로 시작하면 길이는 원작 길이를 따른다.
    const keep = withRec({ ...emptyEntryDraft(), file: scriptFile }, { kind: '1-1', level: 'keep' })
    const keepRows = summaryRows(keep, { t: ko, locale: 'ko' })
    expect(keepRows.find((r) => r.key === 'runtime')?.value).toBe('원작 길이대로')
    expect(keepRows.find((r) => r.key === 'level')?.value).toBe('1 바로 영상화 · 대본을 그대로 샷으로 나눠요')
    expect(keepRows.find((r) => r.key === 'material')?.value).toBe('자판기_촬영대본.docx')
  })
})

describe('채팅으로 만들기', () => {
  it('에이전트가 먼저 "무엇을 만들까요?…"를 묻고 예시 보여줘 버튼을 둔다', () => {
    // 왜: 빈 화면 대신 에이전트가 먼저 말을 건다. 아이디어가 없으면 예시를 들려준다(프로토타입 EB1).
    setEntry({ draft: emptyEntryDraft() })
    const out = html(EntryChat)
    expect(out).toContain('무엇을 만들까요? 자료가 있으면 올리거나 직접 적어 주세요. 아이디어가 아직 없으면 예시를 들려드릴게요.')
    expect(out).toContain('예시 보여줘')
  })

  it('입력칸은 화면 아래에 붙어 Enter 보내기 · Shift+Enter 줄바꿈 안내와 파일 첨부 · 글자 수를 보여준다', () => {
    // 왜: 채팅방처럼 쓴다. 20자 규칙은 화면에서 고르기와 같다.
    setEntry({ draft: { ...emptyEntryDraft(), idea: '자판기 고장' } })
    const out = html(EntryChat)
    expect(out).toContain('Enter 보내기 · Shift+Enter 줄바꿈')
    expect(out).toContain('aria-label="파일 첨부"')
    expect(out).toContain('6자')
    expect(out).toContain('누가, 어디서, 무슨 일이, 어떻게 끝나는지 적어 주세요')
  })

  it('예시를 보여 달라고 하면 예시 세 개와 다른 예시 버튼을 보여준다', () => {
    // 왜: 예시를 누르면 입력칸에 들어가고, 고쳐서 보내도 된다(프로토타입 EBX).
    setEntry({ draft: emptyEntryDraft(), chat: { showExamples: true, examplePage: 0, lengthError: false, hint: null } })
    const out = html(EntryChat)
    expect(out).toContain('이런 건 어때요? 마음에 드는 걸 누르면 입력칸에 넣어 드려요. 고쳐서 보내도 돼요.')
    for (const title of ['직장 코미디', '가족 드라마', '짧은 호러']) expect(out).toContain(title)
    expect(out).toContain('다른 예시')
  })

  it('질문 카드마다 추천을 표시하고 추천대로 버튼을 둔다', () => {
    // 왜: 추천이 맞으면 한 번만 누르고 넘어간다(프로토타입 EB3).
    setEntry({ draft: recDraft() })
    const out = html(EntryChat)
    expect(out).toContain('어떤 장르·분위기로 할까요?')
    expect(out).toContain('추천대로')
    expect(out).toContain('엉뚱한 사건이라 코미디로 읽었어요')
    expect(out).toContain('지금까지 정한 것')
  })

  it('파일을 올린 사람에게는 자료 종류를 알려 주며 어떻게 쓸까요를 먼저 묻는다', () => {
    // 왜: 파일을 올렸으면 그 자료를 어떻게 쓸지가 먼저다(프로토타입 EB2).
    setEntry({ draft: withRec({ ...emptyEntryDraft(), file: scriptFile }, { kind: '1-1', level: 'keep' }) })
    const out = html(EntryChat)
    expect(out).toContain('자판기_촬영대본.docx을(를) 영상까지 고려된 대본(으)로 읽었어요.')
    expect(out).toContain('대본을 어떻게 쓸까요?')
    expect(out).toContain('바로 영상화')
  })

  it('화면 비율 카드는 고르면 끝까지 바꿀 수 없다고 먼저 말한다', () => {
    // 왜: 실제 잠금은 정리 카드에서 시작할 때지만, 고르는 순간 그 무게를 알아야 한다(프로토타입 EB6).
    const draft = recDraft()
    setEntry({ draft: { ...draft, chat: { answered: { mood: true, runtime: true, level: true }, pre: {} } } })
    const out = html(EntryChat)
    expect(out).toContain('화면 비율을 골라 주세요.')
    expect(out).toContain('고르면 끝까지 바꿀 수 없어요.')
  })

  it('정리 카드는 정한 값을 한 장으로 보여주고 확인 창 없이 Writer에게 써 달라고 하기 버튼을 둔다', () => {
    // 왜: 채팅에서는 정리 카드가 곧 확인이다(프로토타입 EB7). 누르면 화면 비율이 잠긴다고 알린다.
    const draft = recDraft()
    setEntry({ draft: { ...draft, chat: { answered: { mood: true, runtime: true, level: true, ratio: true }, pre: {} } } })
    const out = html(EntryChat)
    expect(out).toContain('이렇게 시작할게요.')
    expect(out).toContain('Writer에게 써 달라고 하기')
    expect(out).toContain('누르면 화면 비율이 잠겨요.')
    expect(out).toContain('data-entry-start')
  })
})

describe('완료 화면', () => {
  it('이미 시작한 프로젝트는 고른 값과 잠긴 화면 비율과 Writer로 가기를 보여주고 고치는 칸이 없다', () => {
    // 왜: 넘어간 Producer 는 잠금이 아니라 할 일을 끝낸 "완료"다. 뒤 단계 변화를 앞으로 다시 맞추지 않는다.
    setEntry({ draft: { ...recDraft(), startedAt: '2026-10-19T00:00:00.000Z' }, writer: { started: true, status: 'awaiting_confirmation', draft: true } })
    const out = html(EntrySummary)
    for (const text of ['코미디', '15~60초', '9:16', '잠김', 'Writer로 가기', IDEA]) expect(out, text).toContain(text)
    expect(out).not.toContain('<textarea')
    expect(out).not.toContain('role="radio"')
  })

  it('산문을 확정한 뒤의 Writer 작업이 실패했으면 다시 시도 대신 Writer로 가기를 둔다', () => {
    // 왜: 확정 뒤 실패는 Writer 화면에서 다시 돌린다. 시작 화면의 다시 시도는 산문 초안을 처음부터 다시 써 버린다.
    setEntry({ draft: { ...recDraft(), startedAt: '2026-10-19T00:00:00.000Z' }, writer: { started: true, status: 'failed', draft: false }, writerStart: { projectId: 'project-1' } as never })
    const out = html(EntrySummary)
    expect(out).toContain('Writer로 가기')
    expect(out).not.toContain('다시 시도')
  })

  it('시작했는데 산문 초안을 아직 못 썼으면 Writer로 가기 대신 다시 시도를 둔다', () => {
    // 왜: Writer 시작이 실패하면 Writer 단계가 열리지 않는다. 그 자리에서 다시 쓰게 한다.
    setEntry({ draft: { ...recDraft(), startedAt: '2026-10-19T00:00:00.000Z' }, writer: { started: true, status: 'failed', draft: true }, writerStart: { projectId: 'project-1' } as never })
    const out = html(EntrySummary)
    expect(out).toContain('산문 초안을 아직 쓰지 못했어요.')
    expect(out).toContain('다시 시도')
    expect(out).not.toContain('Writer로 가기')
  })
})
