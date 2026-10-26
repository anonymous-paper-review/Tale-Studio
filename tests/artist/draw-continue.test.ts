// 내 그림 한도에 막힌 그림은 앞의 그림이 끝나면 이어서 그리고, 안 나온 그림 다시 그리기는 그리는 중인 그림을 빼고 같은 동시 장수로 보낸다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeBlockedNote, drawContinueDecision, drawTargetCount, makingOverlayCopy, missingDrawTargets, STYLE_WAIT_RECHECK_MS, USER_LIMIT_RECHECK_MS } from '@/lib/artist/draw-continue'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import type { GenerationJobReceipt } from '@/lib/generation-jobs-client'
import type { CharacterAsset, WorldAsset } from '@/types/asset'

const appearance = (sheetUrl: string | null) => ({
  appearanceKey: 'current', label: '현재', isDefault: true, narrativeTime: 'present' as const, sheetUrl, portraitUrl: null, appearance: null, appearanceNative: null, viewCandidates: {},
})
const person = (id: string, sheetUrl: string | null): CharacterAsset => ({
  characterId: id, name: id, entityType: 'person', views: { main: sheetUrl, back: null, sideLeft: null, sideRight: null } as never, appearances: [appearance(sheetUrl)], viewCandidates: {}, origin: 'producer',
})
const world = (id: string, wideShot: string | null): WorldAsset => ({ locationId: id, name: id, sceneId: 's1', wideShot })
const failure = { error: 'boom', moderation: false, failCount: 1, safeFailCount: 0 }

describe('안 나온 그림 고르기', () => {
  it('안 나온 그림 단추의 장수는 그리는 중인 그림을 뺀 수다', () => {
    // 왜: 0/7 에서 '남은 그림 다시 그리기'가 떠서 그리는 중인 그림까지 다시 요청할 수 있었다(디자이너 QA 1차 #05).
    const targets = missingDrawTargets({
      characters: [person('soonja', null), person('young', null), person('minho', 'https://img/m.png'), { ...person('cup', null), entityType: 'object' }],
      worlds: [world('shop', null), world('alley', 'https://img/a.png'), world('roof', null)],
      drawingViews: [{ characterId: 'soonja', appearanceKey: 'current', view: 'main' }],
      drawingLocations: ['roof'],
    })

    expect(targets.characters).toEqual([{ characterId: 'young', appearanceKey: 'current' }])
    expect(targets.worlds).toEqual(['shop'])
  })

  it('그리다 실패한 그림은 이어 그리기 대상에 넣지 않고, 사람이 누른 다시 그리기에는 넣는다', () => {
    // 왜: 실패한 그림을 자동으로 다시 그리면 같은 실패로 과금만 되풀이된다 — 실패는 사람이 단추로 다시 그린다(2026-09-11 오너).
    const input = {
      characters: [person('young', null)],
      worlds: [world('shop', null)],
      drawingViews: [],
      drawingLocations: [],
      failedViews: { young: { current: { main: failure } } },
      failedLocations: { shop: failure },
    }

    expect(missingDrawTargets(input, { skipFailed: true })).toEqual({ characters: [], worlds: [] })
    expect(missingDrawTargets(input)).toEqual({ characters: [{ characterId: 'young', appearanceKey: 'current' }], worlds: ['shop'] })
  })
})

describe('이어 그리기 판단', () => {
  const base = { step: 2 as const, done: false, drawing: 0, checkedSinceDrawingBegan: true, autoTargets: 1, stopped: false, running: false, paused: false }

  it('내 그림 한도에 막혀 못 그린 그림은 앞의 그림이 다 끝나면 이어서 그린다', () => {
    // 왜: 한 번에 6장까지인데 7장을 요청해 7번째가 대기 없이 빠지고 6/7 에서 멈췄다(디자이너 QA 1차 #06 · 2026-09-11 오너 "내 한도에 막힌 건 내 것이 끝나면 이어 간다").
    expect(drawContinueDecision(base)).toBe('continue')
  })

  it('그리는 중인 그림이 하나라도 있으면(서버에서 그리는 것 포함) 이어 그리기도 다시 그리기 단추도 기다린다', () => {
    // 왜: 그리는 중(0/7, 6/7)에 '남은 그림 다시 그리기'가 떴다 사라져 무엇을 하는지 알 수 없었다(디자이너 QA 1차 #05).
    expect(drawContinueDecision({ ...base, drawing: 1 })).toBe('wait')
  })

  it('그리기 시작한 뒤로 그림 상태를 아직 읽지 못했으면 기다린다', () => {
    // 왜: 서버가 막 보낸 그림을 모른 채 다시 요청하면 자리 부족으로 거절되고 거짓 안내가 뜬다.
    expect(drawContinueDecision({ ...base, checkedSinceDrawingBegan: false })).toBe('wait')
  })

  it('자리가 없다고 거절됐거나 남은 그림이 실패한 것뿐이면 멈추고 다시 그리기 단추를 보인다', () => {
    // 왜: 자리 부족은 자동으로 다시 두드리지 않는다(2026-09-11 오너) — 사람이 단추로 다시 그린다.
    expect(drawContinueDecision({ ...base, stopped: true })).toBe('stop')
    expect(drawContinueDecision({ ...base, autoTargets: 0 })).toBe('stop')
  })

  it('다 그렸거나 아직 디자인 중이면 이어 그리지도 단추를 보이지도 않는다', () => {
    // 왜: 정상 경로 고정 — 그릴 것이 없거나 그리기 전에는 아무것도 하지 않는다.
    expect(drawContinueDecision({ ...base, done: true })).toBe('idle')
    expect(drawContinueDecision({ ...base, step: 1 })).toBe('idle')
  })
})

describe('이어 그리기 · 다시 그리기 요청', () => {
  let view: ReturnType<typeof vi.fn>
  let shot: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useProjectStore.setState({ projectId: 'art-1' })
    view = vi.fn(async () => ({ jobId: 'j', status: 'queued' }))
    shot = vi.fn(async () => undefined)
    useArtistStore.setState({
      characterAssets: [person('soonja', null), person('young', null)],
      worldAssets: [world('shop', null)],
      generatingViews: [],
      generatingLocations: [],
      viewFailures: {},
      worldFailures: {},
      drawContinue: { projectId: null, rounds: 0, stopped: false, running: false, paused: false },
      generateCharacterView: view as never,
      generateWorldShot: shot as never,
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('안 나온 그림 다시 그리기는 그리는 중인 인물 그림을 다시 요청하지 않는다', async () => {
    // 왜: 서버가 그리는 중인 그림을 또 요청하면 같은 그림이 두 번 나갈 수 있었다(디자이너 QA 1차 #05 중복 과금 확인).
    useArtistStore.setState({ generatingViews: [{ characterId: 'soonja', appearanceKey: 'current', view: 'main' }] })

    await useArtistStore.getState().drawMissingImages()

    expect(view.mock.calls.map((call) => call[0])).toEqual(['young'])
  })

  it('안 나온 그림 다시 그리기도 자동 생성과 같은 동시 장수 규칙으로 보낸다', async () => {
    // 왜: 한꺼번에 7장을 보내면 한도(6장)에 막혀 거절이 뜬다 — 자동 생성처럼 러프가 돌면 1장 · 아니면 3장씩 보낸다(2026-10-09 오너 규칙).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ limit: 1 })))
    let active = 0
    let peak = 0
    const slow = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return { jobId: 'j', status: 'queued' }
    }
    view.mockImplementation(slow)
    shot.mockImplementation(slow)

    await useArtistStore.getState().drawMissingImages()

    expect(view).toHaveBeenCalledTimes(2)
    expect(shot).toHaveBeenCalledTimes(1)
    expect(peak).toBe(1)
  })

  it('이어 그리기는 자리가 없다고 거절되면 멈추고 다시 두드리지 않는다', async () => {
    // 왜: 2026-09-11 오너 — 자리 부족 거절 뒤 자동으로 다시 요청하지 않는다. 화면에는 다시 그리기 단추가 남는다.
    const refuse = async (...args: unknown[]) => {
      const options = args[7] as { onJob?: (receipt: GenerationJobReceipt) => void } | undefined
      options?.onJob?.({ jobId: null, status: 'failed', httpStatus: 429, error: 'quota exceeded' })
      return { jobId: null, status: 'failed', httpStatus: 429 }
    }
    view.mockImplementation(refuse)

    await useArtistStore.getState().continueMissingImages()
    await useArtistStore.getState().continueMissingImages()

    expect(useArtistStore.getState().drawContinue).toMatchObject({ projectId: 'art-1', stopped: true })
    expect(view).toHaveBeenCalledTimes(2)
  })

  it('이어 그려도 새로 보낸 그림이 없으면 같은 요청을 되풀이하지 않는다', async () => {
    // 왜: 서버가 겹친 요청이라며 건너뛰기만 하면 그리는 중인 그림이 없어 같은 요청이 끝없이 반복될 수 있다.
    view.mockImplementation(async (...args: unknown[]) => {
      ;(args[7] as { onJob?: (receipt: GenerationJobReceipt) => void } | undefined)?.onJob?.({ jobId: null, status: 'deduped' })
      return { jobId: null, status: 'deduped' }
    })
    useArtistStore.setState({ worldAssets: [] })

    await useArtistStore.getState().continueMissingImages()
    await useArtistStore.getState().continueMissingImages()

    expect(view).toHaveBeenCalledTimes(2)
    expect(useArtistStore.getState().drawContinue.stopped).toBe(true)
  })

  it('이어 그리기는 실패한 그림을 다시 요청하지 않는다', async () => {
    // 왜: 실패한 그림은 카드의 다시 그리기로 사람이 고른다(자동 재시도 없음).
    useArtistStore.setState({ viewFailures: { soonja: { current: { main: failure } } }, worldAssets: [] })

    await useArtistStore.getState().continueMissingImages()

    expect(view.mock.calls.map((call) => call[0])).toEqual(['young'])
  })

  it('다시 그리기 단추를 누르면 멈춘 이어 그리기도 다시 켠다', async () => {
    // 왜: 사람이 다시 그린 뒤 또 한도에 막히면 그때도 이어서 그려야 한다.
    useArtistStore.setState({ drawContinue: { projectId: 'art-1', rounds: 3, stopped: true, running: false, paused: false } })

    await useArtistStore.getState().redrawMissingImages()

    expect(useArtistStore.getState().drawContinue).toMatchObject({ projectId: 'art-1', rounds: 0, stopped: false })
    expect(view).toHaveBeenCalledTimes(2)
  })
})

describe('[완료하기] 안내', () => {
  it('[완료하기]가 꺼져 있으면 그 까닭을 단추 옆에 글로 보인다', () => {
    // 왜: 젊은 순자 그림이 없어 완료하기가 꺼졌는데 마우스를 올려야만 보이는 안내뿐이라 이유를 알 수 없었다(디자이너 QA 1차 #06).
    expect(completeBlockedNote({ gaps: { characters: ['젊은 순자'], locations: ['시장 골목'] }, drawing: 0 })).toEqual({ kind: 'missing', names: ['젊은 순자', '시장 골목'] })
    expect(completeBlockedNote({ gaps: { characters: ['젊은 순자'], locations: [] }, drawing: 2 })).toEqual({ kind: 'drawing' })
    expect(completeBlockedNote({ gaps: { characters: [], locations: [] }, drawing: 0 })).toBeNull()

    const page = readFileSync(path.join(process.cwd(), 'src/app/studio/artist/page.tsx'), 'utf8')
    expect(page).toMatch(/completeBlockedNote\(/)
    expect(page).toMatch(/data-testid="artist-complete-note"/)
  })

  it('그림 만드는 중 화면의 다시 그리기 단추는 안 나온 장수를 보이고, 그리는 중에는 뜨지 않는다', () => {
    // 왜: '남은 그림 다시 그리기'만으로는 마음에 안 드는 그림을 다시 그리는지 안 나온 그림을 다시 요청하는지 알 수 없었다(디자이너 QA 1차 #05).
    const page = readFileSync(path.join(process.cwd(), 'src/app/studio/artist/page.tsx'), 'utf8')
    expect(page).toMatch(/'Draw the \{count\} missing images'/)
    expect(page).toMatch(/drawContinueDecision\(/)
    expect(page).not.toMatch(/'Draw the remaining images'/)
  })

  it('그리기가 멈추면 그림 만드는 중 창의 제목도 멈췄다고 말한다', () => {
    // 왜: 다시 그리기 단추가 떠 있는데 제목은 "그림을 만들고 있어요"라 아직 그리는 것처럼 읽혔다(개발 서버 확인).
    const page = readFileSync(path.join(process.cwd(), 'src/app/studio/artist/page.tsx'), 'utf8')
    expect(page).toMatch(/title=\{overlayCopy\.title \? t\(overlayCopy\.title\) : t\(makingTitle \?\? 'Making the images'\)\}/)
    expect(makingOverlayCopy({ decision: 'stop', gapCount: 1, missingCount: 1 }).title).toBe('Some images were not drawn')
  })
})

describe('검토 뒤 고친 것(디자이너 QA 1차)', () => {
  const base = { step: 2 as const, done: false, drawing: 0, checkedSinceDrawingBegan: true, autoTargets: 1, stopped: false, running: false, paused: false }
  let view: ReturnType<typeof vi.fn>
  let shot: ReturnType<typeof vi.fn>
  const answer = (receipt: Partial<GenerationJobReceipt>) => async (...args: unknown[]) => {
    const options = (args.length > 7 ? args[7] : args[5]) as { onJob?: (receipt: GenerationJobReceipt) => void } | undefined
    options?.onJob?.({ jobId: null, status: 'deduped', ...receipt } as GenerationJobReceipt)
    return { jobId: null, status: receipt.status ?? 'deduped' }
  }

  beforeEach(() => {
    vi.useRealTimers()
    useProjectStore.setState({ projectId: 'art-1' })
    view = vi.fn(async () => ({ jobId: 'j', status: 'queued' }))
    shot = vi.fn(async () => undefined)
    useArtistStore.setState({
      characterAssets: [person('soonja', null), person('young', null)],
      worldAssets: [],
      generatingViews: [],
      generatingLocations: [],
      viewFailures: {},
      worldFailures: {},
      capacitySkips: {},
      drawContinue: { projectId: null, rounds: 0, stopped: false, running: false, paused: false },
      generateCharacterView: view as never,
      generateWorldShot: shot as never,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('이어 그리는 동안에는 기다리고, 한 바퀴가 끝나면 남은 빈칸을 다시 본다', () => {
    // 왜: 한 바퀴가 끝나도 판단이 그대로 "이어 그리기"면 다시 불리지 않아 잠금 화면이 멈춰 돌았다(검토 지적 2).
    expect(drawContinueDecision({ ...base, running: true })).toBe('wait')
    expect(drawContinueDecision({ ...base, paused: true })).toBe('wait')
    expect(drawContinueDecision(base)).toBe('continue')
  })

  it('그림체를 읽는 동안 돌아온 이어 그리기는 멈추지 않고 잠시 뒤 다시 본다', async () => {
    // 왜: 내 그림체를 읽는 동안 [만들기]를 누르면 첫 이어 그리기가 모두 "기다림"으로 돌아와 영영 멈췄다(검토 지적 4).
    vi.useFakeTimers()
    view.mockImplementation(answer({ status: 'deduped', error: 'waiting_for_style' }))

    await useArtistStore.getState().continueMissingImages()
    expect(useArtistStore.getState().drawContinue).toMatchObject({ projectId: 'art-1', rounds: 0, stopped: false, paused: true })

    await vi.advanceTimersByTimeAsync(STYLE_WAIT_RECHECK_MS)
    expect(useArtistStore.getState().drawContinue.paused).toBe(false)
  })

  it('모두의 자리가 차서 서버가 건너뛴 그림은 이어 그리지 않고 단추로 남긴다', () => {
    // 왜: 2026-09-11 오너 — 모두의 자리(전역 축)가 차서 막힌 건 멈추고 알린다. 내 한도(개인 축)에 막힌 건 이어 간다.
    const input = {
      characters: [person('soonja', null), person('young', null)],
      worlds: [world('shop', null)],
      drawingViews: [],
      drawingLocations: [],
      capacitySkips: { 'char:soonja': 'global' as const, 'char:young': 'user' as const, 'world:shop': 'global' as const },
    }
    expect(missingDrawTargets(input, { skipFailed: true })).toEqual({ characters: [{ characterId: 'young', appearanceKey: 'current' }], worlds: [] })
    expect(drawTargetCount(missingDrawTargets(input))).toBe(3)
  })

  it('내 한도 때문에 거절되면 멈추지 않고 잠시 뒤 다시 보고, 모두의 자리 때문에 거절되면 멈춘다', async () => {
    // 왜: 2026-09-11 오너 (가) — 내 한도에 막힌 건 내 것이 끝나면 이어 가고, 모두의 자리가 찬 건 멈추고 알린다(자동 재시도 없음).
    vi.useFakeTimers()
    view.mockImplementation(answer({ status: 'failed', httpStatus: 429, quotaScope: 'user' }))
    await useArtistStore.getState().continueMissingImages()
    expect(useArtistStore.getState().drawContinue).toMatchObject({ rounds: 1, stopped: false, paused: true })
    await vi.advanceTimersByTimeAsync(USER_LIMIT_RECHECK_MS)
    expect(useArtistStore.getState().drawContinue.paused).toBe(false)

    view.mockImplementation(answer({ status: 'failed', httpStatus: 429, quotaScope: 'global' }))
    await useArtistStore.getState().continueMissingImages()
    expect(useArtistStore.getState().drawContinue).toMatchObject({ rounds: 2, stopped: true, paused: false })
  })

  it('사람이 누른 다시 그리기와 이어 그리기는 동시에 돌지 않는다', async () => {
    // 왜: 두 일이 함께 돌면 자리가 1장인데 2장이 나갔다 — 같은 그림을 두 번 요청할 수도 있다(검토 지적 9).
    useArtistStore.setState({ characterAssets: [person('soonja', null)] })
    let release: () => void = () => {}
    view.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ jobId: 'j', status: 'queued' }) }))
    const manual = useArtistStore.getState().redrawMissingImages()
    await vi.waitFor(() => expect(view).toHaveBeenCalledTimes(1))
    expect(useArtistStore.getState().drawContinue.running).toBe(true)

    await useArtistStore.getState().continueMissingImages()
    await useArtistStore.getState().redrawMissingImages()

    expect(view).toHaveBeenCalledTimes(1)
    release()
    await manual
    expect(useArtistStore.getState().drawContinue.running).toBe(false)
  })

  it('이어 그리는 도중 다른 프로젝트로 옮기면 남은 그림을 그 프로젝트에 보내지 않는다', async () => {
    // 왜: 늦게 시작하는 그림이 그때의 프로젝트를 읽어, 옮겨 간 프로젝트의 같은 이름 칸에 그림을 보내고 과금할 수 있었다(검토 지적 10).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ limit: 1 })))
    view.mockImplementation(async () => {
      useProjectStore.setState({ projectId: 'art-2' })
      return { jobId: 'j', status: 'queued' }
    })

    await useArtistStore.getState().drawMissingImages()

    expect(view).toHaveBeenCalledTimes(1)
  })

  it('두 번 실패해 자동으로 멈춘 그림은 다시 그리기 장수에서 빼고 카드의 다시 만들기로 남긴다', () => {
    // 왜: 다시 그리기 단추는 자동 경로라 두 번 실패한 칸을 서버가 거절해, 단추가 계속 떠도 눌러 봐야 소용없었다(검토 지적 11).
    const input = {
      characters: [person('soonja', null), person('young', null)],
      worlds: [],
      drawingViews: [],
      drawingLocations: [],
      failedViews: { soonja: { current: { main: { ...failure, failCount: 2 } } }, young: { current: { main: failure } } },
    }
    expect(missingDrawTargets(input)).toEqual({ characters: [{ characterId: 'young', appearanceKey: 'current' }], worlds: [] })
  })

  it('그림 만드는 중 창은 카드가 생긴 뒤에는 그리는 중에도 닫을 수 있다', () => {
    // 왜: 오래된 대기 작업 · 상태 조회 실패 · 공유 보기에서 닫기 없이 도는 잠금 화면에 갇혔다(검토 지적 1 · 3 · 14).
    const page = readFileSync(path.join(process.cwd(), 'src/app/studio/artist/page.tsx'), 'utf8')
    expect(page).toMatch(/footer=\{hasAssets \? \(/)
  })
})

describe('검증 뒤 고친 것(디자이너 QA 1차)', () => {
  let view: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useRealTimers()
    useProjectStore.setState({ projectId: 'art-1' })
    view = vi.fn(async () => ({ jobId: 'j', status: 'queued' }))
    useArtistStore.setState({
      characterAssets: [person('soonja', null)],
      worldAssets: [],
      generatingViews: [],
      generatingLocations: [],
      viewFailures: {},
      worldFailures: {},
      capacitySkips: {},
      drawContinue: { projectId: null, rounds: 0, stopped: false, running: false, paused: false },
      generateCharacterView: view as never,
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('이어 그리기로 보낸 그림이 실패로 끝나면 보낸 것으로 세지 않고 멈춘다', async () => {
    // 왜: 실패로 끝난 그림을 "보낸 장수"로 세어 다음 바퀴가 같은 칸을 다시 요청(과금)할 수 있었다(검증 지적 1).
    view.mockImplementation(async (...args: unknown[]) => {
      const options = args[7] as { onJob?: (receipt: GenerationJobReceipt) => void }
      options.onJob?.({ jobId: 'j1', status: 'queued' })
      options.onJob?.({ jobId: 'j1', status: 'failed', error: 'boom' })
      return { jobId: 'j1', status: 'failed' }
    })

    await useArtistStore.getState().continueMissingImages()

    expect(useArtistStore.getState().drawContinue).toMatchObject({ rounds: 1, stopped: true })
  })

  it('서버가 그리던 인물 그림이 실패하면 그리는 중에서 빠지는 그 순간 실패로 적어 다시 요청하지 않는다', async () => {
    // 왜: 그리는 중에서 빠진 뒤 실패 기록을 다시 읽기 전 잠깐 사이에 이어 그리기가 같은 칸을 다시 요청했다(검증 지적 1, 2026-09-11 오너 — 실패는 자동으로 다시 그리지 않는다).
    useArtistStore.setState({ characterAssets: [{ ...person('soonja', null), appearances: [{ ...person('soonja', null).appearances[0], appearanceKey: 'young' }] }] })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/artist/generation-status')) return Response.json({ failures: [], worldFailures: [], queuedWorld: [], queuedMain: [{ characterId: 'soonja', appearanceKey: 'young', jobId: 'job-8' }] })
      if (url.startsWith('/api/generation-jobs/job-8')) return Response.json({ data: { status: 'failed', resultUrl: null, error: 'provider error' } })
      return new Promise<Response>(() => {})
    }))
    let failedWhenFreed: boolean | null = null
    const stop = useArtistStore.subscribe((state, before) => {
      if (before.generatingViews.length > 0 && state.generatingViews.length === 0) failedWhenFreed = !!state.viewFailures.soonja?.young?.main
    })

    await useArtistStore.getState().syncGenerationStatus('art-1')
    await vi.waitFor(() => expect(failedWhenFreed).not.toBeNull())
    stop()

    expect(failedWhenFreed).toBe(true)
  })

  it('남은 빈칸이 모두 두 번 실패한 칸이면 그림 만드는 중 창이 멈춤으로 바뀌고 카드에서 다시 만들라고 안내한다', () => {
    // 왜: 다시 그릴 장수가 0이라 단추가 없는데 "그림을 만들고 있어요"로 계속 돌고 왼쪽 레일도 잠겼다(검증 지적 3).
    expect(makingOverlayCopy({ decision: 'stop', gapCount: 1, missingCount: 0 })).toEqual({ stopped: true, title: 'Some images were not drawn', description: 'Remake the images that failed from each card.' })
    expect(makingOverlayCopy({ decision: 'stop', gapCount: 2, missingCount: 1 })).toEqual({ stopped: true, title: 'Some images were not drawn', description: 'Draw the missing ones again, or close this and check the cards.' })
    expect(makingOverlayCopy({ decision: 'wait', gapCount: 2, missingCount: 2 })).toEqual({ stopped: false, title: null, description: null })
    const page = readFileSync(path.join(process.cwd(), 'src/app/studio/artist/page.tsx'), 'utf8')
    expect(page).toMatch(/makingOverlayCopy\(/)
  })
})
