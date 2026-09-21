// Producer 설정 도구는 현재 보드를 읽고 실제 저장 확인 뒤에만 변경 완료를 돌려준다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const producer = vi.hoisted(() => ({
  projectSettings: {} as Record<string, unknown>,
  applyExtractedSettings: vi.fn(),
  saveDraftNow: vi.fn(),
  error: null as string | null,
}))
const db = vi.hoisted(() => ({
  savedSettings: {} as Record<string, unknown>,
  read: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@/stores/producer-store', () => ({ useProducerStore: { getState: () => producer } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      db.from(table)
      return {
        select: (columns: string) => {
          db.select(columns)
          return {
            eq: (column: string, value: string) => {
              db.eq(column, value)
              return { maybeSingle: () => db.read() }
            },
          }
        },
      }
    },
  }),
}))

import { createStudioToolResources } from '@/stores/chat-tool-bindings'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'

function resource(options: { signal?: AbortSignal; isCurrent?: () => boolean } = {}) {
  return createStudioToolResources({
    stage: 'producer',
    projectId: 'p',
    traceId: 't',
    signal: options.signal ?? new AbortController().signal,
    isCurrent: options.isCurrent ?? (() => true),
  }).settings!
}

beforeEach(() => {
  vi.clearAllMocks()
  producer.projectSettings = {
    playtime: 120,
    genre: 'drama',
    subGenre: 'family',
    format: 'vertical_9:16',
    tone: ['warm'],
    dialogueLanguage: 'ja',
  }
  producer.error = null
  db.savedSettings = structuredClone(producer.projectSettings)
  db.read.mockImplementation(async () => ({ data: { producer_draft: { settings: db.savedSettings } }, error: null }))
  producer.applyExtractedSettings.mockImplementation((patch: Record<string, unknown>) => {
    producer.projectSettings = { ...producer.projectSettings, ...patch }
    return 'applied'
  })
  producer.saveDraftNow.mockResolvedValue(true)
})

describe('Producer 설정 도구', () => {
  it('설정을 조회하면 현재 보드를 읽고 설정을 바꾸거나 저장하지 않는다', async () => {
    // 왜: 저장 전 UI 편집도 조회에 반영하되 일반 조회가 쓰기를 일으키면 안 된다.
    const settings = resource()
    producer.projectSettings = { ...producer.projectSettings, dialogueLanguage: 'ko' }

    expect(await settings.read()).toEqual([{ id: 'settings', values: producer.projectSettings }])
    expect(producer.applyExtractedSettings).not.toHaveBeenCalled()
    expect(producer.saveDraftNow).not.toHaveBeenCalled()
  })

  it('저장 확인은 현재 보드와 구분해 해당 프로젝트의 저장본을 읽는다', async () => {
    // 왜: 보드에만 적용된 새 값이 실제 저장값으로 둔갑하면 안 된다.
    producer.projectSettings = { ...producer.projectSettings, dialogueLanguage: 'ko' }
    const settings = resource()

    expect(await settings.readSaved!()).toEqual([{ id: 'settings', values: db.savedSettings }])
    expect(db.savedSettings.dialogueLanguage).toBe('ja')
    expect(db.from).toHaveBeenCalledWith('projects')
    expect(db.eq).toHaveBeenCalledWith('id', 'p')
    expect(producer.applyExtractedSettings).not.toHaveBeenCalled()
    expect(producer.saveDraftNow).not.toHaveBeenCalled()
  })

  it('허용된 여섯 설정 필드는 요청한 값 그대로 검증한다', () => {
    // 왜: 도구가 화면에 있는 설정을 바꿀 수 있어야 하고 정상 값을 임의로 누락하면 안 된다.
    const patch = {
      playtime: 45,
      genre: 'thriller',
      subGenre: 'mystery',
      format: 'horizontal_16:9',
      tone: ['quiet', 'tense'],
      dialogueLanguage: 'ko',
    }
    expect(resource().validate(patch)).toEqual(patch)
  })

  it.each(['ko', 'en', 'ja', 'zh'])('대사 언어 %s는 설정 변경에 사용할 수 있다', language => {
    // 왜: 지원하는 네 언어를 정상 입력으로 받아야 한다.
    expect(resource().validate({ dialogueLanguage: language })).toEqual({ dialogueLanguage: language })
  })

  it.each([
    ['지원하지 않는 항목', { targetEmotion: 'joy' }],
    ['알려진 항목과 섞인 미지원 항목', { genre: 'drama', unsupported: true }],
    ['값 없는 입력', null],
    ['배열 입력', []],
    ['숫자인 장르', { genre: 3 }],
    ['배열인 하위 장르', { subGenre: ['mystery'] }],
    ['숫자인 화면 형식', { format: 9 }],
    ['문자열인 분위기 목록', { tone: 'warm' }],
    ['숫자가 섞인 분위기 목록', { tone: ['warm', 3] }],
    ['0초 분량', { playtime: 0 }],
    ['음수 분량', { playtime: -1 }],
    ['문자열 분량', { playtime: '30' }],
    ['무한대 분량', { playtime: Infinity }],
    ['숫자가 아닌 분량', { playtime: NaN }],
    ['미지원 대사 언어', { dialogueLanguage: 'fr' }],
    ['빈 대사 언어', { dialogueLanguage: '' }],
  ])('%s는 적용 전에 잘못된 입력으로 거절한다', (_label, patch) => {
    // 왜: 모델이 만든 잘못된 설정이 보드나 저장본에 들어가면 안 된다.
    expect(() => resource().validate(patch)).toThrow()
    expect(producer.applyExtractedSettings).not.toHaveBeenCalled()
    expect(producer.saveDraftNow).not.toHaveBeenCalled()
  })

  it('설정 변경은 기존 적용 경로에 추적 번호를 넘기고 저장 확인까지 기다린다', async () => {
    // 왜: 로컬 보드만 바뀐 시점에 저장 완료를 모델에 돌려주면 안 된다.
    const settings = resource()
    const before = structuredClone(producer.projectSettings)
    const patch = { dialogueLanguage: 'ko' }
    let finish!: (saved: boolean) => void
    producer.saveDraftNow.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve }))
    let settled = false
    const writing = settings.write('settings', patch, before).then(result => {
      settled = true
      return result
    })

    await vi.waitFor(() => expect(producer.saveDraftNow).toHaveBeenCalledTimes(1))
    expect(producer.applyExtractedSettings).toHaveBeenCalledWith(patch, 't')
    expect(settled).toBe(false)
    finish(true)
    await expect(writing).resolves.toMatchObject({ status: 'ok' })
  })

  it.each([
    ['대사 언어', { dialogueLanguage: 'ko' }],
    ['장르', { genre: 'thriller' }],
    ['하위 장르', { subGenre: 'mystery' }],
    ['분량', { playtime: 60 }],
    ['화면 형식', { format: 'horizontal_16:9' }],
    ['분위기', { tone: ['tense'] }],
  ])('%s 변경도 실제 저장 확인을 거친다', async (_label, patch) => {
    // 왜: 언어만 저장을 기다리고 다른 설정은 예정 답변으로 성공 처리하는 차이를 만들면 안 된다.
    const result = await resource().write('settings', patch, structuredClone(producer.projectSettings))
    expect(producer.applyExtractedSettings).toHaveBeenCalledWith(patch, 't')
    expect(producer.saveDraftNow).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('ok')
  })

  it('승인이 필요한 변경은 승인 대기로 돌려주고 저장하지 않는다', async () => {
    // 왜: 기존 원천 변경 승인 관문을 도구가 우회하면 안 된다.
    producer.applyExtractedSettings.mockReturnValue('pending')
    const before = structuredClone(producer.projectSettings)
    const result = await resource().write('settings', { dialogueLanguage: 'ko' }, before)
    expect(result.status).toBe('approval_required')
    expect(producer.projectSettings).toEqual(before)
    expect(producer.saveDraftNow).not.toHaveBeenCalled()
  })

  it('적용이 거절된 변경은 잘못된 요청으로 돌려주고 저장하지 않는다', async () => {
    // 왜: 다른 제안이 대기 중이라 적용되지 않은 요청을 완료로 알리면 안 된다.
    producer.applyExtractedSettings.mockReturnValue('rejected')
    const result = await resource().write('settings', { dialogueLanguage: 'ko' }, structuredClone(producer.projectSettings))
    expect(result.status).toBe('invalid_input')
    expect(producer.saveDraftNow).not.toHaveBeenCalled()
  })

  it('보드 값이 바뀌었어도 저장 확인이 실패하면 완료로 돌려주지 않는다', async () => {
    // 왜: 현재 보드는 저장 전 작업 사본이므로 값이 같다는 이유만으로 저장 성공을 보증할 수 없다.
    producer.saveDraftNow.mockResolvedValue(false)
    producer.error = '저장을 확인하지 못했어요.'
    const settings = resource()
    const result = await settings.write('settings', { dialogueLanguage: 'ko' }, structuredClone(producer.projectSettings))

    expect(producer.projectSettings.dialogueLanguage).toBe('ko')
    expect(await settings.read()).toEqual([{ id: 'settings', values: producer.projectSettings }])
    expect(result.status).toBe('failed')
  })

  it('저장 실패 뒤 같은 설정을 다시 요청하면 보드 값만 보고 성공으로 처리하지 않는다', async () => {
    // 왜: 공통 실행기의 이미 같은 값이라는 판정이 저장 실패 후 재시도의 실제 저장을 건너뛰면 안 된다.
    producer.saveDraftNow.mockResolvedValue(false)
    const execute = createChatToolExecutor({
      resources: { settings: resource() },
      signal: new AbortController().signal,
      isCurrent: () => true,
    })
    const read = async (id: string) => {
      const result = await execute({ type: 'tool_use', id, name: 'read_project', input: { resource: 'settings' } })
      const records = result.records as Array<{ revision: string }>
      return records[0].revision
    }
    const edit = (id: string, revision: string) => execute({
      type: 'tool_use', id, name: 'edit_project',
      input: { resource: 'settings', id: 'settings', revision, patch: { dialogueLanguage: 'ko' } },
    })

    expect((await edit('edit-first', await read('read-first'))).status).toBe('failed')
    expect((await edit('edit-again', await read('read-again'))).status).toBe('failed')
    expect(producer.saveDraftNow).toHaveBeenCalledTimes(2)
  })

  it.each(['프로젝트 전환', '중단 요청'])('설정 저장을 기다리다 %s가 생기면 이전 요청의 성공을 돌려주지 않는다', async reason => {
    // 왜: 늦게 끝난 저장 결과가 새 프로젝트나 중단된 대화의 완료로 표시되면 안 된다.
    const controller = new AbortController()
    let current = true
    const settings = resource({ signal: controller.signal, isCurrent: () => current })
    let finish!: (saved: boolean) => void
    producer.saveDraftNow.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve }))
    const writing = settings.write('settings', { dialogueLanguage: 'ko' }, structuredClone(producer.projectSettings))
    await vi.waitFor(() => expect(producer.saveDraftNow).toHaveBeenCalledTimes(1))
    if (reason === '프로젝트 전환') current = false
    else controller.abort()
    finish(true)
    await expect(writing).rejects.toMatchObject({ name: 'AbortError' })
    expect(producer.applyExtractedSettings).toHaveBeenCalledTimes(1)
    expect(producer.saveDraftNow).toHaveBeenCalledTimes(1)
  })
})
