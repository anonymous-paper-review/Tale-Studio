// 워밍(스튜디오 1.5초 미리 받기) 때 산문을 확정한 프로젝트만 Writer 미리 보기를 받아 두어, Writer 를 처음 열 때도 받아 둔 것을 바로 보인다 (2026-11-03 오너 QA 2번)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { forgetPreviews, readyPreview, warmWriterPreview } from '@/lib/writer/preview-cache'
import type { WriterPreview } from '@/lib/writer/use-writer-preview'
import { ProseWorkspace } from '@/features/prose/prose-workspace'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROSE = 'The keeper folds the last letter and sets it on the sill.'
const settled = (): WriterPreview => ({
  engine: 'v1', started: true, running: false, completed: true, failed: false, draft: false, proseLocked: true,
  roster: [], characters: [], scenes: [{ sceneId: 'scene_1', index: 0, beats: [PROSE], shotStories: [] }],
})

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
}

let request: ReturnType<typeof vi.fn>
beforeEach(() => {
  forgetPreviews()
  useLocaleStore.setState({ locale: 'ko' })
  // 영어 프로젝트를 한국어 화면에서 연다 — 미리 보기 언어는 잠긴 프로젝트 언어(en)를 따른다.
  useProjectStore.setState({ projectId: 'p1', projectTitle: "The Keeper's Letters", currentStage: 'editor', reachedStage: 'editor', producerLocked: true, treatmentDraft: false, projectLocale: 'en', projectLocaleLocked: true })
  useWriterRoomStore.setState({ paragraph: null, confirmOpen: false, rewriteOpen: false, manualRequest: 0 })
  request = vi.fn(async () => Response.json(settled()))
  vi.stubGlobal('fetch', request)
})
afterEach(() => {
  vi.unstubAllGlobals()
  useLocaleStore.setState({ locale: 'en' })
})

describe('Writer 미리 보기 워밍', () => {
  // 왜: 완성된 프로젝트는 다른 단계(Editor 등)로 열린다 — 그 화면에 있는 동안 받아 두면 Writer 를 처음 눌러도 "불러오는 중" 없이 바로 보인다.
  it('산문을 확정한 프로젝트는 워밍 때 Writer 미리 보기를 받아 두어, 처음 열 때도 받아 둔 것을 바로 보인다', async () => {
    expect(await warmWriterPreview('p1')).toBe(true)

    expect(request).toHaveBeenCalledWith('/api/writer/preview/p1?locale=en')
    useProjectStore.setState({ currentStage: 'producer' })
    serveCurrent()
    const out = renderToStaticMarkup(createElement(ProseWorkspace))
    expect(out).toContain('data-testid="prose-article"')
    expect(out).toContain(PROSE)
    expect(out).not.toContain('data-testid="prose-loading"')
  })

  // 왜: 초안은 받아 둬도 화면이 쓰지 않는다(늘 새로 읽는다) — 쓰지 않을 큰 읽기를 미리 보내지 않는다.
  it('아직 고칠 수 있는 초안 프로젝트는 워밍 때 미리 보기를 받아 두지 않는다', async () => {
    useProjectStore.setState({ producerLocked: false, treatmentDraft: true, currentStage: 'artist' })

    expect(await warmWriterPreview('p1')).toBe(false)

    expect(request).not.toHaveBeenCalled()
    expect(readyPreview('p1', 'en')).toBeNull()
  })

  // 왜: 확정 여부는 지금 열린 프로젝트의 값이다 — 그사이 다른 프로젝트로 옮겼으면 그 값으로 앞 프로젝트를 받지 않는다.
  it('워밍은 지금 열린 프로젝트의 미리 보기만 받는다', async () => {
    expect(await warmWriterPreview('other-project')).toBe(false)

    expect(request).not.toHaveBeenCalled()
  })

  // 왜: 워밍은 덤이다 — 읽기가 끊겨도 오류를 내지 않고, Writer 를 열면 지금처럼 새로 읽는다.
  it('워밍 읽기가 끊겨도 오류 없이 넘어가고 받아 둔 것은 없다', async () => {
    request.mockRejectedValue(new Error('network down'))

    expect(await warmWriterPreview('p1')).toBe(false)

    expect(readyPreview('p1', 'en')).toBeNull()
  })

  it('스튜디오는 지금 단계가 Writer 가 아니면 다른 단계 자료와 함께 조금 뒤 Writer 미리 보기를 받아 둔다', () => {
    // 왜: 미리 받기는 스튜디오 레이아웃의 워밍(진입 1.5초 뒤 한 번) 한 곳에서 한다 — Writer(id producer)에 있으면 그 화면이 직접 받는다.
    const layout = readFileSync(path.join(process.cwd(), 'src/app/studio/layout.tsx'), 'utf8')
    const warm = layout.slice(layout.indexOf('const warmedProjectRef'), layout.indexOf('}, [projectId, initLoading])'))
    expect(warm).toMatch(/if \(stage !== 'producer'\) void warmWriterPreview\(projectId\)/)
  })
})
