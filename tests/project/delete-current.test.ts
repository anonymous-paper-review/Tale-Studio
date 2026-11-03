// 지금 프로젝트를 지우면 남은 프로젝트로 바꾸기를 마친 뒤 그 프로젝트의 단계 화면으로 가고, 남은 것이 없으면 새로 만든 프로젝트의 시작 화면으로 가는지 검사한다 (2026-11-04 리드 2차 검토)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 화면마다의 store 는 비우기만 흉내 낸다 — 바꾸기가 그것들을 다 비운 뒤에 프로젝트를 정하는 순서는 실제 project-store 그대로다.
function childStore() {
  return { getState: () => ({ reset: () => {}, setProjectId: () => {} }) }
}
vi.mock('@/stores/producer-store', () => ({ useProducerStore: childStore() }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: childStore() }))
vi.mock('@/stores/artist-store', () => ({ useArtistStore: childStore() }))
vi.mock('@/stores/editor-store', () => ({ useEditorStore: childStore() }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: childStore() }))
vi.mock('@/stores/asset-storage-store', () => ({ useAssetStorageStore: childStore() }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: childStore() }))
vi.mock('@/lib/supabase/client', () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) }
  return { createClient: () => ({ from: () => chain }) }
})

import { useProjectStore } from '@/stores/project-store'
import { openAfterDeletingCurrent } from '@/lib/project/open-after-delete'

beforeEach(() => {
  // 지운 프로젝트는 Producer 시작 화면(entry)에 있었다.
  useProjectStore.setState({ projectId: 'p-deleted', projectTitle: 'Deleted', currentStage: 'entry', reachedStage: 'entry', initLoading: false })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ workspaceId: 'w', projectId: 'p-new', project: { title: 'Untitled', locale: 'ko' } })))
})

describe('지금 프로젝트를 지운 뒤 열 곳', () => {
  it('프로젝트를 지우면 남은 프로젝트로 바꾸기를 마친 뒤 그 프로젝트의 단계로 간다', async () => {
    // 왜: 바꾸기는 화면 자료를 다 비운 뒤에야 프로젝트를 정한다. 기다리지 않고 읽으면 프로젝트가 비어 ?projectId 없는 주소로 튀고,
    //   지운 프로젝트가 시작 화면에 있었으면 남은 프로젝트를 시작 화면으로 열었다. 고장: 유저 메뉴에서 지금 프로젝트를 지울 때.
    const result = await openAfterDeletingCurrent([{ id: 'p-left', title: 'Left', current_stage: 'editor' }])
    expect(result).toEqual({ ok: true, path: '/studio/editor?projectId=p-left' })
    expect(useProjectStore.getState()).toMatchObject({ projectId: 'p-left', currentStage: 'editor' })
  })

  it('남은 프로젝트가 없으면 새 프로젝트를 만든 뒤 그 프로젝트의 시작 화면으로 간다', async () => {
    // 왜: 정상 경로 고정 — 마지막 프로젝트를 지우면 빈 새 프로젝트의 Producer 시작 화면에서 다시 시작한다.
    const result = await openAfterDeletingCurrent([])
    expect(result).toEqual({ ok: true, path: '/studio/start?projectId=p-new' })
  })

  it('새 프로젝트를 만들지 못하면 어디로도 가지 않고 실패를 돌려준다', async () => {
    // 왜: 정상 경로 고정 — 만들기 실패는 그 자리에서 알린다(유저 메뉴가 토스트로 보인다).
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'No project slots left' }, { status: 403 })))
    const result = await openAfterDeletingCurrent([])
    expect(result).toEqual({ ok: false, error: 'No project slots left' })
  })
})
