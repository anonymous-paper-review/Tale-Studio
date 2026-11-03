// 로그아웃하거나 다른 사람으로 로그인하면 그 탭에 받아 둔 Writer 산문 · Producer 시작 화면을 버린다 — 새로고침 없이 화면을 옮겨도 다음 계정에게 남지 않는다 (2026-11-03 검토 C)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { forgetSignedInUser, signedInUserChanged } from '@/lib/signed-in-reset'
import { forgetPreviews, readyPreview, rememberPreview } from '@/lib/writer/preview-cache'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { useEntryStore } from '@/features/entry/entry-store'
import { emptyEntryDraft } from '@/lib/entry/draft'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const IDEA = '등대지기가 보내지 못한 편지를 바다에 띄우는 이야기.'
const settled = (): WriterPreview => ({
  engine: 'v1', started: true, running: false, completed: true, failed: false, draft: false, proseLocked: true,
  roster: [], characters: [], scenes: [{ sceneId: 'scene_1', index: 0, beats: ['등대지기가 마지막 편지를 접는다.'], shotStories: [] }],
})
const startedBody = { draft: { ...emptyEntryDraft(), idea: IDEA, startedAt: '2026-11-01T00:00:00.000Z' }, title: 'Letters', startedAt: '2026-11-01T00:00:00.000Z', locale: 'en', stage: 'editor', format: null, series: null, writer: { started: true, status: 'completed', draft: false }, writerStart: null }

/** 앞 사용자가 Writer 산문과 시작한 프로젝트의 시작 화면을 받아 둔 탭. */
async function cachedByFirstUser() {
  rememberPreview('p-letters', 'en', settled())
  await useEntryStore.getState().load('p-letters')
  useEntryStore.getState().reset()
}
/** 시작 화면을 다시 열 때 받아 둔 것을 바로 보이는가 — 답이 오기 전 모습을 본다. */
function reopensFromCache(): boolean {
  void useEntryStore.getState().load('p-letters')
  return useEntryStore.getState().status === 'ready'
}

beforeEach(() => {
  forgetPreviews()
  forgetSignedInUser()
  useEntryStore.getState().reset()
  let first = true
  vi.stubGlobal('fetch', vi.fn(async () => {
    // 첫 GET 은 시작 화면을 주고, 그다음은 오지 않는다(다시 열 때 받아 둔 것을 쓰는지만 본다).
    if (first) {
      first = false
      return new Response(JSON.stringify(startedBody), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Promise<Response>(() => {})
  }))
})
afterEach(() => {
  useEntryStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('로그인한 사람이 바뀔 때', () => {
  // 왜: 로그아웃은 새로고침 없이 /login 으로 가서, 같은 탭에서 다음 사람이 로그인하면 앞 사람의 산문 · 시작 화면이 남아 있었다.
  it('로그아웃하면 받아 둔 산문과 시작 화면이 사라진다', async () => {
    signedInUserChanged('user-a')
    await cachedByFirstUser()

    signedInUserChanged(null)

    expect(readyPreview('p-letters', 'en')).toBeNull()
    expect(reopensFromCache()).toBe(false)
  })

  // 왜: 로그인도 새로고침 없이 /projects 로 간다 — 다른 계정이 같은 프로젝트 주소를 열면 앞 계정이 받아 둔 것이 먼저 보일 수 있었다.
  it('다른 사용자로 로그인하면 앞 사용자가 받아 둔 산문 · 시작 화면을 보이지 않는다', async () => {
    signedInUserChanged('user-a')
    await cachedByFirstUser()

    signedInUserChanged('user-b')

    expect(readyPreview('p-letters', 'en')).toBeNull()
    expect(reopensFromCache()).toBe(false)
  })

  // 왜: 정상 경로 고정 — 같은 사람의 로그인 정보가 새로 바뀌거나(토큰 갱신) 페이지를 처음 열 때는 받아 둔 것을 그대로 쓴다.
  it('같은 사람이면 받아 둔 산문 · 시작 화면을 그대로 쓴다', async () => {
    signedInUserChanged('user-a')
    await cachedByFirstUser()

    signedInUserChanged('user-a')

    expect(readyPreview('p-letters', 'en')).not.toBeNull()
    expect(reopensFromCache()).toBe(true)
  })
})
