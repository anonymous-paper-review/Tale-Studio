// 샷마다 Director 준비 상태를 가리는 규칙과, Artist 에서 콘티로 넘길 때는 옛 Director 준비 창 없이 [완료하기]와 같은 검사만 거치는 흐름을 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyDirectorReadiness,
  type DirectorReadinessReport,
  type ReadinessCharacter,
  type ReadinessLocation,
  type ReadinessScene,
  type ReadinessShot,
} from '@/lib/director-readiness'

const readiness = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/lib/director-readiness-loader', () => ({ loadDirectorReadiness: readiness.load }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const nav = vi.hoisted(() => ({ handoffToStage: vi.fn(async () => '/studio/director') }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: nav.handoffToStage }))

import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'

const person = (id: string, name: string, patch: Partial<ReadinessCharacter> = {}): ReadinessCharacter => ({
  characterId: id, name, entityType: 'person', hasImage: true, generating: false, hasInfo: true, ...patch,
})
const place = (id: string, name: string, patch: Partial<ReadinessLocation> = {}): ReadinessLocation => ({
  locationId: id, name, hasImage: true, generating: false, hasInfo: true, ...patch,
})
const scene = (id: string, order: number, locationId: string | null): ReadinessScene => ({
  sceneId: id, sortOrder: order, locationId, timeOfDay: '낮',
})
const shot = (id: string, sceneId: string, order: number, patch: Partial<ReadinessShot> = {}): ReadinessShot => ({
  shotId: id, sceneId, sortOrder: order, description: `${id} 설명`, characterIds: ['hero'], locationIds: [],
  rough: { start: `https://img.test/${id}-start.png`, end: `https://img.test/${id}-end.png` }, ...patch,
})

function report(input: Partial<Parameters<typeof classifyDirectorReadiness>[0]> = {}): DirectorReadinessReport {
  return classifyDirectorReadiness({
    scenes: [scene('sc_1', 0, 'plaza'), scene('sc_2', 1, 'well')],
    shots: [shot('sh_1', 'sc_1', 0), shot('sh_2', 'sc_1', 1), shot('sh_3', 'sc_2', 0)],
    characters: [person('hero', '프리렌'), person('friend', '페른')],
    locations: [place('plaza', '마을 광장'), place('well', '우물가')],
    ...input,
  })
}
const shotOf = (r: DirectorReadinessReport, id: string) => r.scenes.flatMap((s) => s.shots).find((s) => s.shotId === id)!

describe('샷마다 Director로 넘길 준비가 됐는지 가린다', () => {
  it('샷에 나오는 인물의 기본 이미지가 없으면 그 샷은 준비가 덜 된 샷이다', () => {
    const r = report({ characters: [person('hero', '프리렌', { hasImage: false })] })
    expect(shotOf(r, 'sh_1').ready).toBe(false)
    expect(shotOf(r, 'sh_1').gaps).toEqual([{ kind: 'image', target: 'character', id: 'hero', name: '프리렌' }])
    expect(r.incompleteCount).toBe(3)
    expect(r.readyCount).toBe(0)
  })

  it('샷의 배경 이미지가 없으면 그 샷은 준비가 덜 된 샷이다', () => {
    const r = report({ locations: [place('plaza', '마을 광장', { hasImage: false }), place('well', '우물가')] })
    expect(shotOf(r, 'sh_1').gaps).toEqual([{ kind: 'image', target: 'background', id: 'plaza', name: '마을 광장' }])
    expect(shotOf(r, 'sh_3').ready).toBe(true)
    expect(r.incompleteCount).toBe(2)
    expect(r.readyCount).toBe(1)
  })

  it('이미지가 없고 설명도 비어 있으면 정보 부족으로 알린다', () => {
    const r = report({ characters: [person('hero', '프리렌', { hasImage: false, hasInfo: false })] })
    expect(shotOf(r, 'sh_1').gaps[0]).toMatchObject({ kind: 'info', target: 'character', name: '프리렌' })
  })

  it('이미지를 만드는 중이면 만드는 중이라고 알린다', () => {
    const r = report({ locations: [place('plaza', '마을 광장', { hasImage: false, generating: true }), place('well', '우물가')] })
    expect(shotOf(r, 'sh_2').gaps[0]).toMatchObject({ kind: 'generating', target: 'background', name: '마을 광장' })
  })

  it('샷에 배경이 따로 없으면 씬의 배경으로 판정하고, 샷에 배경이 있으면 그것을 따른다', () => {
    const r = report({
      shots: [shot('sh_1', 'sc_1', 0), shot('sh_2', 'sc_1', 1, { locationIds: ['well'] })],
      locations: [place('plaza', '마을 광장', { hasImage: false }), place('well', '우물가')],
    })
    expect(shotOf(r, 'sh_1').ready).toBe(false)
    expect(shotOf(r, 'sh_2').ready).toBe(true)
  })

  it('러프 스토리보드가 없어도 인물·배경이 준비됐으면 준비된 샷이다', () => {
    const r = report({ shots: [shot('sh_1', 'sc_1', 0, { rough: null })] })
    expect(shotOf(r, 'sh_1').ready).toBe(true)
    expect(shotOf(r, 'sh_1').rough).toBeNull()
  })

  it('샷 번호는 보드와 같은 전체 번호로 붙고 씬마다 장소와 시간대를 단다', () => {
    // 왜: 오너 2026-11-02 전체 번호로 통일 — 넘김 확인 목록이 "2-1"처럼 씬 안 번호를 써서 보드 카드("Scene 2 · Shot 3")와 달랐다. 목록에는 보드 번호 3이 화면 언어 이름("샷 3" · "Shot 3")으로 보인다(오너 2026-11-14 답 7).
    const r = report({ shots: [shot('sh_3', 'sc_2', 0), shot('sh_2', 'sc_1', 1), shot('sh_1', 'sc_1', 0)] })
    expect(r.scenes.map((s) => [s.sceneNumber, s.locationName, s.timeOfDay])).toEqual([[1, '마을 광장', '낮'], [2, '우물가', '낮']])
    expect(r.scenes.flatMap((s) => s.shots.map((x) => x.shotNo))).toEqual([1, 2, 3])
  })

  it('샷이 없는 씬이 있어도 씬 번호는 보드와 같다', () => {
    // 왜: 보드는 샷이 없는 씬도 "Scene 1"로 세는데, 목록은 빈 씬을 건너뛰고 셌다 — 같은 씬이 보드에서는 Scene 2, 목록에서는 S1 이었다.
    const r = report({ scenes: [scene('sc_0', 0, 'plaza'), scene('sc_1', 1, 'plaza'), scene('sc_2', 2, 'well')] })
    expect(r.scenes.map((s) => s.sceneNumber)).toEqual([2, 3])
    expect(r.scenes.flatMap((s) => s.shots.map((x) => x.shotNo))).toEqual([1, 2, 3])
  })
})

const incomplete: DirectorReadinessReport = {
  scenes: [{
    sceneId: 'sc_1', sceneNumber: 1, locationName: '마을 광장', timeOfDay: '낮',
    shots: [{ shotId: 'sh_1', shotNo: 1, description: '광장에 들어선다', rough: null, ready: false, gaps: [{ kind: 'image', target: 'character', id: 'hero', name: '프리렌' }] }],
  }],
  readyCount: 0,
  incompleteCount: 1,
}
const allReady: DirectorReadinessReport = { ...incomplete, scenes: [{ ...incomplete.scenes[0], shots: [{ ...incomplete.scenes[0].shots[0], ready: true, gaps: [] }] }], readyCount: 1, incompleteCount: 0 }
const artistBlocked = { ready: false, blockers: [{ field: 'artist:hero:mainImage', label: '프리렌: 기본 이미지 필요' }], warnings: [] }
const texts = () => useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)
const lastModel = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''

// [완료하기] 단추가 부르는 서버 검사(/api/writer/artist-complete)의 답을 정한다 — 부른 횟수도 센다.
let restoreFetch: (() => void) | null = null
function answerArtistComplete(status: number, body: Record<string, unknown>): { calls: () => number } {
  let calls = 0
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    if (String(url) !== '/api/writer/artist-complete') return Response.json({})
    calls += 1
    return Response.json(body, { status })
  })
  restoreFetch = () => spy.mockRestore()
  return { calls: () => calls }
}

describe('Artist 에서 콘티로 넘길 때는 옛 Director 준비 창을 열지 않고 [완료하기]와 같은 검사만 거친다', () => {
  beforeEach(() => {
    readiness.load.mockReset()
    nav.handoffToStage.mockClear()
    useGlobalChatStore.getState().reset()
    useLocaleStore.setState({ locale: 'ko' })
    useProjectStore.setState({
      projectId: 'proj-1', currentStage: 'artist', reachedStage: 'artist',
      lifecycleStatus: { ...structuredClone(EMPTY_LIFECYCLE_STATUS), writer: { state: 'ready' }, director: artistBlocked },
    })
  })
  afterEach(() => {
    restoreFetch?.()
    restoreFetch = null
    useGlobalChatStore.getState().reset()
  })

  it('Artist 의 다음 단계 단추는 준비가 덜 된 샷이 있어도 옛 Director 준비 창을 열지 않고 [완료하기]와 같은 검사를 거쳐 콘티로 넘긴다', async () => {
    // 왜(리드 2026-11-22 결정, D1): Artist 다음은 Director 가 아니라 Writer 의 콘티다. 샷 준비 확인은 콘티 → Camera 넘김이 맡는다 —
    //   Artist 에서 "Director 준비가 덜 된 샷" 창을 띄우면 아직 가지 않는 화면을 묻게 되고, [완료하기] 단추와 다음 단계 단추가 서로 다른 검사를 거친다.
    readiness.load.mockResolvedValue(incomplete)
    const complete = answerArtistComplete(200, { ok: true })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(complete.calls()).toBe(1)
    expect(nav.handoffToStage).toHaveBeenCalledWith('writer')
  })

  it('[완료하기] 검사가 막으면 다음 단계 단추로도 넘기지 않고 Artist 에 남아 [완료하기]와 같은 까닭을 말한다', async () => {
    // 왜: 옛 창의 "채우러 가기"(넘기지 않고 Artist 에 남기)를 이제 [완료하기] 검사가 맡는다 — 그림이 없는 인물 · 배경이 있으면
    //   다음 단계 단추로 눌러도 콘티가 열리지 않고, 무엇을 먼저 만들지 [완료하기] 단추와 같은 말로 채팅에 알린다.
    readiness.load.mockResolvedValue(incomplete)
    const complete = answerArtistComplete(409, { code: 'artist_images_missing', missing: { characters: ['프리렌'], locations: [] } })
    await useGlobalChatStore.getState().requestNextStep()
    expect(complete.calls()).toBe(1)
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(useProjectStore.getState().currentStage).toBe('artist')
    expect(lastModel()).toContain('먼저 이 그림을 만들어 주세요: 프리렌')
  })

  it('Artist 에서 콘티로 넘길 때는 씬 · 샷을 나누는 중이어도 [완료하기]와 같은 검사만 거친다', async () => {
    // 왜(리드 2026-11-22 결정, D1): Artist 다음은 Writer 의 콘티다. [완료하기] 단추는 씬 · 샷을 나누는 중에도 콘티를 연다(10/20, 나누는 동안 콘티는
    //   잠금 표시) — 다음 단계 넘김 · 채팅 넘김도 같은 서버 검사(artist-complete)만 거친다. 예전에는 옛 Director 준비 검사가 "Writer가 아직 작업 중"으로 막았다.
    readiness.load.mockResolvedValue(incomplete)
    useProjectStore.setState({
      lifecycleStatus: {
        ...structuredClone(EMPTY_LIFECYCLE_STATUS),
        writer: { state: 'active', blockers: [{ field: 'writer:active', label: 'Writer가 아직 작업 중이에요.' }] },
        director: { ready: false, blockers: [{ field: 'writer:active', label: 'Writer가 아직 작업 중이에요.' }, ...artistBlocked.blockers], warnings: [] },
      },
    })
    const complete = answerArtistComplete(200, { ok: true })
    await useGlobalChatStore.getState().requestNextStep()
    expect(complete.calls()).toBe(1)
    expect(nav.handoffToStage).toHaveBeenCalledWith('writer')
    expect(texts().join('\n')).not.toContain('Writer가 아직 작업 중이에요.')
  })
})
