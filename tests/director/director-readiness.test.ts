// Artist에서 Director로 넘길 때 샷마다 준비 상태를 가리고, 덜 된 샷이 있으면 팝업으로 보여준 뒤 "그래도 진행"을 허용한다
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

  it('샷 번호는 씬 순서-샷 순서로 붙고 씬마다 장소와 시간대를 단다', () => {
    const r = report({ shots: [shot('sh_3', 'sc_2', 0), shot('sh_2', 'sc_1', 1), shot('sh_1', 'sc_1', 0)] })
    expect(r.scenes.map((s) => [s.sceneNumber, s.locationName, s.timeOfDay])).toEqual([[1, '마을 광장', '낮'], [2, '우물가', '낮']])
    expect(r.scenes.flatMap((s) => s.shots.map((x) => x.code))).toEqual(['1-1', '1-2', '2-1'])
  })
})

const incomplete: DirectorReadinessReport = {
  scenes: [{
    sceneId: 'sc_1', sceneNumber: 1, locationName: '마을 광장', timeOfDay: '낮',
    shots: [{ shotId: 'sh_1', code: '1-1', description: '광장에 들어선다', rough: null, ready: false, gaps: [{ kind: 'image', target: 'character', id: 'hero', name: '프리렌' }] }],
  }],
  readyCount: 0,
  incompleteCount: 1,
}
const allReady: DirectorReadinessReport = { ...incomplete, scenes: [{ ...incomplete.scenes[0], shots: [{ ...incomplete.scenes[0].shots[0], ready: true, gaps: [] }] }], readyCount: 1, incompleteCount: 0 }
const artistBlocked = { ready: false, blockers: [{ field: 'artist:hero:mainImage', label: '프리렌: 기본 이미지 필요' }], warnings: [] }
const texts = () => useGlobalChatStore.getState().messages.map((m) => `${m.role}:${m.content}`)

describe('Artist에서 Director로 넘길 때 준비가 덜 된 샷을 팝업으로 보여준다', () => {
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
  afterEach(() => { useGlobalChatStore.getState().reset() })

  it('Artist에서 Director로 넘기는 버튼은 준비가 덜 된 샷이 있으면 넘기지 않고 목록 팝업을 연다', async () => {
    readiness.load.mockResolvedValue(incomplete)
    await useGlobalChatStore.getState().requestNextStep()
    const confirm = useGlobalChatStore.getState().handoffConfirm
    expect(confirm?.kind).toBe('directorReadiness')
    expect(confirm?.kind === 'directorReadiness' && confirm.report.incompleteCount).toBe(1)
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(useProjectStore.getState().currentStage).toBe('artist')
  })

  it('준비가 모두 된 경우에는 팝업 없이 바로 Director로 넘긴다', async () => {
    readiness.load.mockResolvedValue(allReady)
    useProjectStore.setState({ lifecycleStatus: { ...structuredClone(EMPTY_LIFECYCLE_STATUS), writer: { state: 'ready' }, director: { ready: true, blockers: [], warnings: [] } } })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).toHaveBeenCalledWith('director')
    expect(texts()).toContain('user:Director로 넘겨주세요')
  })

  it('팝업에서 그래도 진행을 누르면 준비가 덜 된 채로 Director로 넘기고 넘김 문장을 채팅에 남긴다', async () => {
    readiness.load.mockResolvedValue(incomplete)
    await useGlobalChatStore.getState().requestNextStep()
    await useGlobalChatStore.getState().proceedToDirectorAnyway()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).toHaveBeenCalledWith('director')
    expect(texts()).toContain('user:Director로 넘겨주세요')
    expect(texts().some((t) => t.includes("Can't move") || t.includes('아직 넘어갈 수 없어요'))).toBe(false)
  })

  it('팝업에서 채우러 가기를 누르면 넘기지 않고 Artist에 남는다', async () => {
    readiness.load.mockResolvedValue(incomplete)
    await useGlobalChatStore.getState().requestNextStep()
    useGlobalChatStore.getState().closeHandoffConfirm()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(useProjectStore.getState().currentStage).toBe('artist')
    expect(texts()).toEqual([])
  })

  it('채팅으로 Director로 넘겨 달라고 해도 준비가 덜 된 샷이 있으면 같은 팝업을 열고, 그래도 진행하면 말을 두 번 남기지 않는다', async () => {
    readiness.load.mockResolvedValue(incomplete)
    await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
    expect(useGlobalChatStore.getState().handoffConfirm?.kind).toBe('directorReadiness')
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    await useGlobalChatStore.getState().proceedToDirectorAnyway()
    expect(nav.handoffToStage).toHaveBeenCalledWith('director')
    expect(texts().filter((t) => t.startsWith('user:'))).toEqual(['user:Director로 넘겨줘'])
  })

  it('Writer가 아직 끝나지 않았으면 그래도 진행으로도 Director로 넘기지 않는다', async () => {
    readiness.load.mockResolvedValue(incomplete)
    useProjectStore.setState({
      lifecycleStatus: {
        ...structuredClone(EMPTY_LIFECYCLE_STATUS),
        writer: { state: 'active', blockers: [{ field: 'writer:active', label: 'Writer가 아직 작업 중이에요.' }] },
        director: { ready: false, blockers: [{ field: 'writer:active', label: 'Writer가 아직 작업 중이에요.' }, ...artistBlocked.blockers], warnings: [] },
      },
    })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).not.toHaveBeenCalled()
    expect(texts().join('\n')).toContain('Writer가 아직 작업 중이에요.')
  })
})
