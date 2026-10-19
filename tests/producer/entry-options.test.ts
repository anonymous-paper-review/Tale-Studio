// Producer 시작 화면의 선택지와 규칙: 글 길이 · 파일 · 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율 · 채팅 질문 순서 · 말로 답하기 (리뉴얼 1차 2026-10-19)
import { describe, expect, it } from 'vitest'
import { KO } from '@/lib/i18n/messages-ko'
import { translate } from '@/lib/i18n/translate'
import {
  ENTRY_FILE_MAX_BYTES,
  EXAMPLES,
  LEVELS,
  MATERIAL_KINDS,
  MOODS,
  RATIOS,
  RUNTIMES,
  SCRIPT_LEVELS,
  WRITING_STEPS,
  chatQuestionOrder,
  checkEntryFile,
  examplesPage,
  fileProblemMessage,
  formatFromRatio,
  isExampleRequest,
  keepUnavailableNote,
  levelAvailable,
  levelOptionsFor,
  levelQuestion,
  materialProblem,
  nextChatQuestion,
  parseChatAnswer,
  readStoredTab,
  readingSteps,
  runtimeKeyFromSeconds,
  runtimeSeconds,
  tooShortMessage,
  writeStoredTab,
  writerProgress,
} from '@/features/entry/options'

const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
const textFile = { kind: 'text' as const, chars: 400, text: '민호: 또 안 나와?' }
const DASH = /[—–―]/

describe('이야기 재료: 글과 파일', () => {
  it('글이 20자 미만이고 파일도 없으면 다음으로 가지 않고 "조금 더 적어 주세요. 20자 이상이면 AI가 이야기를 잡을 수 있어요. (지금 N자)"를 보여준다', () => {
    // 왜: 한두 낱말로는 AI가 장르 · 길이를 고를 수 없다. 프로토타입 E1e 문구 그대로 지금 글자 수를 알려준다.
    const problem = materialProblem('자판기가 고장 났다', null)
    expect(problem).toEqual({ code: 'too_short', length: 10 })
    expect(tooShortMessage('ko', 10)).toBe('조금 더 적어 주세요. 20자 이상이면 AI가 이야기를 잡을 수 있어요. (지금 10자)')
    // 앞뒤 공백은 세지 않는다.
    expect(materialProblem('   ', null)).toEqual({ code: 'too_short', length: 0 })
    expect(materialProblem('회사 복도 자판기가 고장 나서 캔이 우르르 쏟아진다', null)).toBeNull()
  })

  it('파일이 있으면 글이 비어 있어도 다음으로 간다', () => {
    // 왜: 대본 파일만 올린 사람에게 아이디어 글까지 쓰라고 하지 않는다(프로토타입 E1 "파일이 있으면 글은 비워도 된다").
    expect(materialProblem('', textFile)).toBeNull()
    expect(materialProblem('', { kind: 'image' as const, chars: 0 })).toBeNull()
  })

  it('txt · md · docx · pdf · hwp 와 png · jpg 파일만 받고 다른 확장자는 올릴 수 없다고 알려준다', () => {
    // 왜: 지금은 글 파일과 글이 담긴 이미지만 읽는다(웹툰 · 캐릭터 시트 · 참조 사진은 다음 버전).
    for (const name of ['대본.txt', 'memo.md', 'a.docx', 'b.pdf', '연극.hwp', 'photo.png', 'photo.jpg']) {
      expect(checkEntryFile(name, 1000), name).toBeNull()
    }
    for (const name of ['예고편.mp4', '자료모음.zip', 'sheet.xlsx', 'noext', 'vector.svg']) {
      expect(checkEntryFile(name, 1000), name).toEqual({ code: 'bad_ext' })
    }
    expect(fileProblemMessage({ code: 'bad_ext' }, '예고편.mp4', 'ko')).toBe(
      '이 파일은 올릴 수 없어요. txt · md · docx · pdf · hwp 또는 글이 담긴 png · jpg만 올릴 수 있어요.',
    )
  })

  it('hwpx · markdown · jpeg 확장자도 같은 종류로 받는다', () => {
    // 왜: 한글 새 형식(hwpx)과 긴 확장자 표기도 사용자에게는 같은 파일이다.
    expect(checkEntryFile('연극.hwpx', 10)).toBeNull()
    expect(checkEntryFile('note.markdown', 10)).toBeNull()
    expect(checkEntryFile('PHOTO.JPEG', 10)).toBeNull()
  })

  it('파일이 10MB를 넘으면 크기 안내를 보여주고 빈 파일은 비었다고 알려준다', () => {
    // 왜: 10MB가 넘는 파일은 서버가 받지 않는다. 고르는 순간 알려야 기다리지 않는다.
    expect(ENTRY_FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(checkEntryFile('big.pdf', ENTRY_FILE_MAX_BYTES)).toBeNull()
    expect(checkEntryFile('big.pdf', ENTRY_FILE_MAX_BYTES + 1)).toEqual({ code: 'too_large' })
    expect(fileProblemMessage({ code: 'too_large' }, 'big.pdf', 'ko')).toBe('"big.pdf"은(는) 10MB가 넘어요. 10MB 이하로 올려 주세요.')
    expect(checkEntryFile('empty.txt', 0)).toEqual({ code: 'empty' })
  })
})

describe('설정: 장르·분위기 · 길이 · 바꿈 정도 · 화면 비율', () => {
  it('장르·분위기는 코미디 · 드라마 · 로맨스 · 스릴러 · 호러 · 액션 · SF·판타지 · 미스터리 · 휴먼·가족 · 일상·잔잔 10개 중에서 고른다', () => {
    // 왜: 프로토타입 E3 목록 그대로. 화면에는 한국어로 보인다.
    expect(MOODS.map((m) => ko(m.label))).toEqual([
      '코미디', '드라마', '로맨스', '스릴러', '호러', '액션', 'SF·판타지', '미스터리', '휴먼·가족', '일상·잔잔',
    ])
  })

  it('길이는 15초 이하 · 15~60초 · 1~5분 · 5~20분 중에서 고르고 각각 15 · 60 · 300 · 1200초다', () => {
    // 왜: 길이 칸은 범위로 고르지만 Writer 에는 초로 넘긴다. 범위마다 쓰임새(숏폼 · 광고·티저 · MV·웹드라마 · 단편)를 함께 보여준다.
    expect(RUNTIMES.map((r) => ko(r.label))).toEqual(['15초 이하', '15~60초', '1~5분', '5~20분'])
    expect(RUNTIMES.map((r) => ko(r.sub))).toEqual(['숏폼', '광고·티저', 'MV·웹드라마', '단편'])
    expect(RUNTIMES.map((r) => runtimeSeconds(r.key))).toEqual([15, 60, 300, 1200])
    expect([10, 15, 30, 60, 90, 300, 301, 5000].map(runtimeKeyFromSeconds)).toEqual(['r15', 'r15', 'r60', 'r60', 'r300', 'r300', 'r1200', 'r1200'])
  })

  it('바꿈 정도는 1 그대로 · 2 다듬기 · 3 새롭게 키우기이고 단계마다 지켜요 · 바꿔요 한 줄이 있다', () => {
    // 왜: AI가 내 글을 얼마나 바꾸는지 단계마다 지키는 것과 바꾸는 것을 못박는다(프로토타입 LEVELS).
    expect(LEVELS.map((l) => l.key)).toEqual(['keep', 'polish', 'grow'])
    expect(LEVELS.map((l) => ko(l.label))).toEqual(['그대로', '다듬기', '새롭게 키우기'])
    expect(LEVELS.map((l) => [ko(l.keeps), ko(l.changes)])).toEqual([
      ['문장 · 대사 · 줄거리 · 결말', '장면 나누기와 빠진 연출만'],
      ['소재 · 인물 · 줄거리 · 결말', '문장 · 대사 · 장면 순서'],
      ['소재 · 장르·분위기 · 길이', '줄거리 · 인물 · 결말에 새 아이디어'],
    ])
    expect(ko(levelQuestion(false))).toBe('AI가 내 글을 얼마나 바꿀까요?')
  })

  it('대본 파일로 읽은 자료면 "대본을 어떻게 쓸까요?"로 바로 영상화 · 조금 다듬어서 · 완전 새롭게를 묻는다', () => {
    // 왜: 대본(1-1 영상까지 고려된 대본 · 1-2 일반 대본)은 유저 플로우 정리본의 말로 묻는다.
    expect(ko(levelQuestion(true))).toBe('대본을 어떻게 쓸까요?')
    const video = levelOptionsFor('1-1', true)
    expect(video.map((l) => ko(l.label))).toEqual(['바로 영상화', '조금 다듬어서', '완전 새롭게'])
    expect(ko(video[0].sub)).toBe('대본을 그대로 샷으로 나눠요')
    expect(ko(SCRIPT_LEVELS['1-2'][0].sub)).toBe('원본은 그대로, 영상에 빠진 것만 채워요')
    expect(ko(SCRIPT_LEVELS['1-2'][0].changes)).toBe('빠진 연출 · 인물 · 배경만')
    // 같은 자리 = 같은 값(바로 영상화 = 그대로).
    expect(video.map((l) => l.key)).toEqual(['keep', 'polish', 'grow'])
    // 아이디어 노트 · 글이 담긴 이미지 · 글 없는 파일은 보통 단계로 묻는다.
    expect(levelOptionsFor('1-3', true)).toBe(LEVELS)
    expect(levelOptionsFor('img', true)).toBe(LEVELS)
    expect(levelOptionsFor('1-1', false)).toBe(LEVELS)
    expect(ko(MATERIAL_KINDS['1-1'].label)).toBe('영상까지 고려된 대본')
    expect(ko(MATERIAL_KINDS['1-2'].label)).toBe('일반 대본 (연극·고전 대본)')
  })

  it('지킬 원문(글이 담긴 파일 또는 60자 넘는 글)이 없으면 "그대로"를 고를 수 없고 이유를 알려준다', () => {
    // 왜: 지킬 원문이 없으면 "그대로"는 지킬 것이 없다. 다른 단계는 언제나 고를 수 있다.
    const short = '회사 복도 자판기가 고장 나서 캔이 쏟아진다'
    const long = '회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는 코미디. 주인공 민호는 하나도 못 먹고, 지나가던 팀장은 하나를 집어 들고 간다.'
    expect(levelAvailable('keep', short, null)).toBe(false)
    expect(levelAvailable('polish', short, null)).toBe(true)
    expect(levelAvailable('grow', short, null)).toBe(true)
    expect(levelAvailable('keep', long, null)).toBe(true)
    expect(levelAvailable('keep', '', textFile)).toBe(true)
    expect(levelAvailable('keep', '', { kind: 'text', chars: 0, noText: true })).toBe(false)
    expect(levelAvailable('keep', '', { kind: 'image', chars: 0 })).toBe(false)
    expect(ko(keepUnavailableNote('form'))).toBe('"그대로"는 지킬 원문이 있어야 해요. 대본 파일을 올리거나 줄거리를 60자 넘게 적으면 열려요.')
    expect(ko(keepUnavailableNote('chat'))).toBe('"그대로"는 지킬 원문이 있어야 해요. 지금은 다듬기나 새롭게 키우기를 골라 주세요.')
  })

  it('화면 비율은 16:9 가로 · 9:16 세로·숏폼 · 1:1 정방형 · 2.39:1 시네마이고 고른 비율이 프로젝트 화면 형식이 된다', () => {
    // 왜: 화면 비율은 시작하면 끝까지 잠긴다. 고른 값이 Director 이미지 · 영상 틀이 된다.
    expect(RATIOS.map((r) => `${r.key} ${ko(r.sub)}`)).toEqual(['16:9 가로', '9:16 세로 · 숏폼', '1:1 정방형', '2.39:1 시네마'])
    expect(RATIOS.map((r) => formatFromRatio(r.key))).toEqual(['horizontal_16:9', 'vertical_9:16', 'square_1:1', 'cinema_2.39:1'])
  })

  it('선택지와 안내 문구는 모두 한국어 번역이 있고 대시가 없다', () => {
    // 왜: 번역이 빠지면 한국어 화면에 영어가 그대로 나온다. 긴 대시는 화면 문구 규칙 위반이다(약속 A).
    const keys = [
      ...MOODS.map((m) => m.label),
      ...RUNTIMES.flatMap((r) => [r.label, r.sub]),
      ...LEVELS.flatMap((l) => [l.label, l.sub, l.keeps, l.changes]),
      ...Object.values(SCRIPT_LEVELS).flat().flatMap((l) => [l.label, l.sub, l.keeps, l.changes]),
      ...RATIOS.map((r) => r.sub),
      ...Object.values(MATERIAL_KINDS).map((k) => k.label),
      ...EXAMPLES.flatMap((e) => [e.title, e.text]),
      ...readingSteps(false),
      ...readingSteps(true),
      ...WRITING_STEPS,
    ]
    const missing = keys.filter((k) => !(k in KO))
    expect(missing).toEqual([])
    expect(keys.filter((k) => DASH.test(k) || DASH.test(KO[k]))).toEqual([])
  })
})

describe('채팅으로 만들기: 질문 순서와 말로 답하기', () => {
  it('파일을 올린 사람에게는 어떻게 쓸까요를 먼저, 글만 쓴 사람에게는 장르·분위기 → 길이 → 바꿈 정도 순서로 묻고 마지막에 화면 비율을 묻는다', () => {
    // 왜: 파일이 있으면 자료 종류에 맞춘 "어떻게 쓸까요"가 곧 바꿈 정도라 뒤에서 다시 묻지 않는다(프로토타입 bOrder).
    expect(chatQuestionOrder(true)).toEqual(['file', 'mood', 'runtime', 'ratio'])
    expect(chatQuestionOrder(false)).toEqual(['mood', 'runtime', 'level', 'ratio'])
  })

  it('정한 질문은 건너뛰고 아직 안 정한 첫 질문을 묻고, 다 정했으면 정리 카드로 간다', () => {
    // 왜: 말이나 다른 탭에서 이미 정한 값을 또 묻지 않는다.
    const order = chatQuestionOrder(false)
    expect(nextChatQuestion(order, {})).toBe('mood')
    expect(nextChatQuestion(order, { mood: true })).toBe('runtime')
    expect(nextChatQuestion(order, { mood: true, runtime: true, ratio: true })).toBe('level')
    expect(nextChatQuestion(order, { mood: true, runtime: true, level: true, ratio: true })).toBe('confirm')
  })

  it('"30초 코미디"처럼 말로 답하면 길이와 장르·분위기를 정한다', () => {
    // 왜: 버튼을 누르지 않고 말로 답해도 된다(프로토타입 parseInto).
    expect(parseChatAnswer('30초 코미디', { keepAllowed: false })).toEqual({ runtime: 'r60', mood: 'comedy' })
    expect(parseChatAnswer('길이는 1분으로', { keepAllowed: false })).toEqual({ runtime: 'r60' })
    expect(parseChatAnswer('3분짜리 호러', { keepAllowed: false })).toEqual({ runtime: 'r300', mood: 'horror' })
    expect(parseChatAnswer('쇼츠로 만들어 줘', { keepAllowed: false })).toEqual({ runtime: 'r15' })
    expect(parseChatAnswer('단편으로', { keepAllowed: false })).toEqual({ runtime: 'r1200' })
    expect(parseChatAnswer('A 2 minute thriller', { keepAllowed: false })).toEqual({ runtime: 'r300', mood: 'thriller' })
  })

  it('말에서 아무 값도 읽지 못하면 아무것도 정하지 않고 다시 묻는다', () => {
    // 왜: 모르는 말을 아무 값으로나 정하면 사용자가 모르는 설정으로 시작한다.
    expect(parseChatAnswer('음 잘 모르겠어요', { keepAllowed: true })).toEqual({})
  })

  it('세로 · 가로 · 정방형 · 시네마 · 16:9 같은 말에서 화면 비율을 읽는다', () => {
    // 왜: 화면 비율도 말로 정할 수 있다. 숫자 비율이 있으면 그것이 먼저다.
    expect(parseChatAnswer('세로로 해 줘', { keepAllowed: false })).toEqual({ ratio: '9:16' })
    expect(parseChatAnswer('가로', { keepAllowed: false })).toEqual({ ratio: '16:9' })
    expect(parseChatAnswer('정방형', { keepAllowed: false })).toEqual({ ratio: '1:1' })
    expect(parseChatAnswer('시네마 비율', { keepAllowed: false })).toEqual({ ratio: '2.39:1' })
    expect(parseChatAnswer('세로 말고 16:9', { keepAllowed: false })).toEqual({ ratio: '16:9' })
  })

  it('그대로 · 다듬 · 새롭게 · 바로 영상화 같은 말에서 바꿈 정도를 읽고 원문이 없으면 그대로는 읽지 않는다', () => {
    // 왜: "그대로"는 지킬 원문이 있을 때만 고를 수 있다. 말로도 같은 규칙이다.
    expect(parseChatAnswer('그대로 써 줘', { keepAllowed: true })).toEqual({ level: 'keep' })
    expect(parseChatAnswer('그대로 써 줘', { keepAllowed: false })).toEqual({})
    expect(parseChatAnswer('바로 영상화', { keepAllowed: true })).toEqual({ level: 'keep' })
    expect(parseChatAnswer('조금 다듬어서', { keepAllowed: true })).toEqual({ level: 'polish' })
    expect(parseChatAnswer('완전 새롭게', { keepAllowed: true })).toEqual({ level: 'grow' })
  })

  it('처음 아이디어 글에서는 이야기 속 낱말(가로등 · 새로운 · 그대로)을 화면 비율이나 바꿈 정도로 읽지 않는다', () => {
    // 왜: 아이디어 글은 대답이 아니라 이야기다. "가로등 아래" 를 16:9 로 잠그면 사용자가 모르는 비율로 시작한다.
    const idea = '가로등 아래 새로운 동네로 이사 온 아이가 그대로 얼어붙는 30초 호러'
    expect(parseChatAnswer(idea, { keepAllowed: true, strict: true })).toEqual({ runtime: 'r60', mood: 'horror' })
    expect(parseChatAnswer('세로 영상으로 만드는 코미디', { keepAllowed: true, strict: true })).toEqual({ mood: 'comedy', ratio: '9:16' })
  })

  it('예시는 세 개씩 보여주고 다른 예시를 누르면 다음 세 개로 바꾸며 끝나면 처음으로 돌아간다', () => {
    // 왜: 아이디어가 없는 사람이 고를 거리를 준다(프로토타입 EBX).
    expect(EXAMPLES).toHaveLength(6)
    expect(examplesPage(0).items.map((e) => ko(e.title))).toEqual(['직장 코미디', '가족 드라마', '짧은 호러'])
    expect(examplesPage(1).items.map((e) => ko(e.title))).toEqual(['로맨스', 'SF', '미스터리'])
    expect(examplesPage(2).page).toBe(0)
    expect(ko(EXAMPLES[0].text)).toBe('회사 복도 자판기가 고장 나서 캔이 우르르 쏟아지는데, 주인공 민호만 하나도 못 먹는 이야기')
  })

  it('"예시 보여줘"라고 적어 보내면 예시를 보여 달라는 말로 읽는다', () => {
    // 왜: 버튼 대신 말로 해도 된다. 예시를 바라는 짧은 말만 그렇게 읽고 긴 이야기 글은 그대로 보낸다.
    expect(isExampleRequest('예시 보여줘')).toBe(true)
    expect(isExampleRequest('예시 좀')).toBe(true)
    expect(isExampleRequest('Show me examples')).toBe(true)
    expect(isExampleRequest('예시로 든 회사 복도 자판기 이야기를 길게 써서 영상으로 만들고 싶어요 정말로')).toBe(false)
  })
})

describe('AI 작업 중 잠금 화면의 단계', () => {
  it('글을 읽을 때는 글 읽기 · 이야기 종류 판단 · 추천 설정 만들기, 이미지를 읽을 때는 파일 열기 · 이미지에서 글자 읽기 · 추천 설정 만들기를 보여준다', () => {
    // 왜: 이미지는 글자를 읽어 내는 단계가 따로 있어 기다리는 이유가 다르다(프로토타입 E2).
    expect(readingSteps(false).map((s) => ko(s))).toEqual(['글 읽기', '이야기 종류 판단', '추천 설정 만들기'])
    expect(readingSteps(true).map((s) => ko(s))).toEqual(['파일 열기', '이미지에서 글자 읽기', '추천 설정 만들기'])
    expect(WRITING_STEPS.map((s) => ko(s))).toEqual(['자료 정리', '이야기 뼈대', '씬 스토리 쓰기'])
  })

  it('산문 초안을 쓰는 동안 Writer 진행 단계를 따라 자료 정리 → 이야기 뼈대 → 씬 스토리 쓰기로 나아가고, 확정을 기다리거나 끝나면 다 됐다고 본다', () => {
    // 왜: 잠금 화면이 실제 Writer 단계를 보여줘야 멈춘 것인지 일하는 중인지 안다.
    const running = (stage: string | null) => ({ started: true, draft: true, pipeline_completed: false, pipeline_failed: false, current_stage: stage, current_status: 'running' })
    expect(writerProgress(running(null))).toEqual({ phase: 'writing', step: 0 })
    expect(writerProgress(running('dramaturgy'))).toEqual({ phase: 'writing', step: 0 })
    expect(writerProgress(running('narrativeStructure'))).toEqual({ phase: 'writing', step: 1 })
    expect(writerProgress(running('scenes'))).toEqual({ phase: 'writing', step: 2 })
    expect(writerProgress(running('storyCheck'))).toEqual({ phase: 'writing', step: 2 })
    expect(writerProgress({ ...running('storyCheck'), current_status: 'awaiting_confirmation' })).toEqual({ phase: 'ready', step: 3 })
    expect(writerProgress({ ...running('renderPrompts'), pipeline_completed: true, current_status: 'completed' })).toEqual({ phase: 'ready', step: 3 })
    expect(writerProgress({ ...running('scenes'), pipeline_failed: true, current_status: 'failed' }).phase).toBe('failed')
  })
})

describe('탭 기억', () => {
  it('마지막으로 고른 탭은 이 브라우저에 기억하고, 저장소를 쓸 수 없으면 기본 탭을 쓴다', () => {
    // 왜: 채팅으로 만들기를 고른 사람이 다시 와도 같은 탭에서 시작한다. 사생활 보호 창에서는 저장소가 예외를 던진다.
    const memory = new Map<string, string>()
    const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) }
    expect(readStoredTab(storage)).toBeNull()
    writeStoredTab('chat', storage)
    expect(readStoredTab(storage)).toBe('chat')
    memory.set([...memory.keys()][0], 'nonsense')
    expect(readStoredTab(storage)).toBeNull()
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readStoredTab(broken)).toBeNull()
    expect(() => writeStoredTab('form', broken)).not.toThrow()
  })
})
