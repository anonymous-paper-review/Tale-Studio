// 완성된 산문은 Writer 탭을 다시 열면 받아 둔 미리 보기로 바로 보이고 뒤에서 다시 읽는다 — 고칠 수 있는 초안은 늘 새로 읽고, 같은 때 여러 곳이 읽어도 요청은 한 번이다 (2026-11-03 오너 QA 2번)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { forgetPreviews, loadPreviewOnce, readyPreview, refreshPreview, rememberPreview } from '@/lib/writer/preview-cache'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { ProseWorkspace } from '@/features/prose/prose-workspace'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누른다.'
function preview(over: Partial<WriterPreview> = {}): WriterPreview {
  return {
    engine: 'v1', started: true, running: false, completed: true, failed: false, draft: false, proseLocked: true,
    roster: [], characters: [], scenes: [{ sceneId: 'scene_1', index: 0, beats: [P1], shotStories: [] }],
    ...over,
  }
}

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
}
const screen = () => {
  serveCurrent()
  return renderToStaticMarkup(createElement(ProseWorkspace))
}

beforeEach(() => {
  forgetPreviews()
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'p1', projectTitle: 'The Keeper', currentStage: 'producer', reachedStage: 'editor', producerLocked: true, treatmentDraft: false, projectLocale: 'en', projectLocaleLocked: true })
  useWriterRoomStore.setState({ paragraph: null, confirmOpen: false, rewriteOpen: false, manualRequest: 0 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('받아 둔 미리 보기 다시 쓰기', () => {
  // 왜: 오너 QA — 이미 완성된 산문인데 Writer 탭을 열 때마다 미리 보기를 다시 받느라 "불러오는 중"이 길었다. 끝난 실행 · 확정한 산문은 그사이 바뀌지 않는다.
  it('완성된 산문(실행이 끝났거나 산문을 확정한 미리 보기)은 Writer 탭을 다시 열면 받아 둔 것으로 바로 보인다', () => {
    rememberPreview('p1', 'en', preview())

    const out = screen()

    expect(out).toContain('data-testid="prose-article"')
    expect(out).toContain(P1)
    expect(out).not.toContain('data-testid="prose-loading"')
    expect(readyPreview('p1', 'en')?.completed).toBe(true)
    // 실행이 아직 도는 중이어도 산문을 확정했으면 산문은 바뀌지 않는다(Artist · Storyboard 를 만드는 중).
    rememberPreview('p2', 'en', preview({ completed: false, running: true, proseLocked: true }))
    expect(readyPreview('p2', 'en')).not.toBeNull()
  })

  // 왜: 고칠 수 있는 초안은 수정안 · 다시 쓰기로 바뀔 수 있다 — 받아 둔 옛 초안이 잠깐이라도 보이면 지금 산문과 어긋난다(디자이너 QA 1차 #09 와 같은 깜빡임).
  it('아직 고칠 수 있는 산문 초안은 받아 둔 것을 쓰지 않고 새로 읽는다', () => {
    useProjectStore.setState({ producerLocked: false, treatmentDraft: true })
    rememberPreview('p1', 'en', preview({ completed: false, running: false, draft: true, proseLocked: false }))

    const out = screen()

    expect(readyPreview('p1', 'en')).toBeNull()
    expect(out).toContain('data-testid="prose-loading"')
    expect(out).not.toContain(P1)
  })

  // 왜: 미리 보기 글은 언어마다 다르게 나온다(인물 설명 등) — 다른 언어로 받은 것을 보이면 다시 읽을 때 글이 바뀐다.
  it('다른 언어로 받은 미리 보기는 쓰지 않는다', () => {
    rememberPreview('p1', 'ko', preview())

    expect(readyPreview('p1', 'en')).toBeNull()
    expect(readyPreview('other', 'ko')).toBeNull()
  })

  // 왜: 받아 둔 것을 보인 뒤에도 서버에서 한 번 다시 읽어 그사이 바뀐 것(새 실행 등)을 반영한다.
  it('받아 둔 것을 보인 뒤에도 미리 보기를 다시 읽어 받아 둔 것을 새것으로 바꾼다', async () => {
    rememberPreview('p1', 'en', preview())
    const fetched = preview({ scenes: [{ sceneId: 'scene_1', index: 0, beats: ['새 산문'], shotStories: [] }] })
    const request = vi.fn(async () => Response.json(fetched))
    vi.stubGlobal('fetch', request)

    const result = await refreshPreview('p1', 'en', 0)

    expect(request).toHaveBeenCalledWith('/api/writer/preview/p1?locale=en')
    expect(result).toEqual({ ok: true, preview: fetched })
    expect(readyPreview('p1', 'en')?.scenes[0].beats).toEqual(['새 산문'])
  })
})

describe('거절 답', () => {
  // 왜: 로그인이 풀렸거나 주인이 아니거나 프로젝트가 없어졌다는 답인데 받아 둔 산문을 계속 보이면 볼 수 없는 산문이 남는다(시작 화면과 같은 규칙).
  it('권한이 없다는 답이 오면 받아 둔 산문을 버린다', async () => {
    for (const status of [401, 403, 404]) {
      rememberPreview('p1', 'en', preview())
      rememberPreview('p1', 'ko', preview())
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Forbidden' }, { status })))

      expect(await refreshPreview('p1', 'en', 0)).toEqual({ ok: false, refused: true })

      expect(readyPreview('p1', 'en')).toBeNull()
      expect(readyPreview('p1', 'ko')).toBeNull()
    }
  })

  // 왜: 정상 경로 고정 — 서버가 잠깐 실패하거나 연결이 끊긴 것이면 받아 둔 산문을 그대로 두고 다음에 다시 읽는다.
  it('서버가 잠깐 실패하거나 연결이 끊기면 받아 둔 산문을 그대로 둔다', async () => {
    rememberPreview('p1', 'en', preview())
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'boom' }, { status: 500 })))
    expect(await refreshPreview('p1', 'en', 0)).toEqual({ ok: false, refused: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(refreshPreview('p1', 'en', 1)).rejects.toThrow('offline')

    expect(readyPreview('p1', 'en')).not.toBeNull()
  })
})

describe('같은 때 읽기 합치기', () => {
  // 왜: Writer 화면은 산문 칸과 오른쪽 채팅이 같은 미리 보기를 따로 읽어 요청이 두세 번 갔다 — 큰 실행 기록이면 그만큼 서버가 오래 걸렸다.
  it('같은 프로젝트의 미리 보기를 여러 곳이 같은 때 읽으면 요청은 한 번만 간다', async () => {
    let release: (value: string) => void = () => {}
    const load = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))

    const first = loadPreviewOnce('p1|en|0', load)
    const second = loadPreviewOnce('p1|en|0', load)
    release('done')

    expect(await first).toBe('done')
    expect(await second).toBe('done')
    expect(load).toHaveBeenCalledTimes(1)
  })

  // 왜: 정상 경로 고정 — 합치는 것은 같은 때 읽기뿐이다. 끝난 뒤의 읽기(다음 폴링 · 수정안 적용 뒤 다시 읽기)는 새로 간다.
  it('읽기가 끝나면 다음 읽기는 새로 간다', async () => {
    const load = vi.fn(async () => 'fresh')

    await loadPreviewOnce('p1|en|0', load)
    await loadPreviewOnce('p1|en|0', load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
