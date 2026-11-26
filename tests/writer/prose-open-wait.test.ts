// Writer 산문 화면이 산문을 읽는 동안(프로젝트를 여는 중 포함) 빈 산문 안내 · 확정 전 단추 대신 Writer 기다리는 카드를 보이는지 검사한다 (오너 2026-11-26 m1126 G1)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writer = vi.hoisted(() => ({ status: null as unknown, preview: null as unknown }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/producer' }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({
  ...(await original<typeof import('@/lib/writer/use-writer-status')>()),
  useWriterStatus: () => ({ status: writer.status, error: null, restart: vi.fn() }),
  restartWriterStatus: vi.fn(),
}))
vi.mock('@/lib/writer/use-writer-preview', async (original) => ({
  ...(await original<typeof import('@/lib/writer/use-writer-preview')>()),
  useWriterPreview: () => ({ preview: writer.preview, loading: false, failed: false }),
}))

import { ProseWorkspace } from '@/features/prose/prose-workspace'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

// 이 시험을 위해 새로 지은 글 — 실제 작품이 아니다.
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'
const lockedPreview = {
  started: true, running: false, completed: true, failed: false, engine: 'v1', draft: false, proseLocked: true,
  roster: [], characters: [], scenes: [{ sceneId: 'scene_1', index: 0, beats: [P1], shotStories: [] }],
}
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(prose-one-screen 과 같은 방법). */
function screen() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(createElement(ProseWorkspace))
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useWriterRoomStore.setState({ paragraph: null, confirmOpen: false, rewriteOpen: false, manualRequest: 0 })
  writer.status = { started: true, pipeline_completed: true, current_status: 'completed', current_stage: 'done', draft: false }
  writer.preview = lockedPreview
})
afterEach(() => {
  useProjectStore.setState({ initLoading: false })
  useLocaleStore.setState({ locale: 'en' })
})

describe('산문을 읽는 동안', () => {
  // 왜: 프로젝트를 여는 동안(새로 고친 직후 · 프로젝트를 바꾸는 중)은 확정한 산문인지 몰라 "아직 산문이 없어요 · Writer가 아직 씬을 쓰고 있어요"와
  //   확정 전 단추(직접 작성 · AI 다시 쓰기 · 브레이크다운하기)가 먼저 보였고, 그 뒤 산문 판 안에 작은 "불러오는 중…"이 0.25~0.65초 보였다(2026-11-26 실측).
  it('Writer 는 산문을 읽는 동안 "아직 산문이 없어요" · 확정 전 단추 대신 Writer 기다리는 카드를 보인다', () => {
    // 프로젝트를 여는 중
    useProjectStore.setState({ projectId: null, initLoading: true, producerLocked: false, treatmentDraft: false })
    const opening = screen()
    expect(opening).toContain('data-stage-wait="producer"')
    expect(opening).toContain('산문을 불러오는 중…')
    expect(opening).not.toContain('data-testid="prose-empty"')
    expect(opening).not.toContain('아직 산문이 없어요')
    expect(opening).not.toContain('브레이크다운하기')
    expect(opening).not.toContain('직접 작성')

    // 확정한 산문의 실행 기록을 아직 못 읽음
    useProjectStore.setState({ projectId: 'prose-project', initLoading: false, producerLocked: true, treatmentDraft: false })
    writer.preview = null
    const loading = screen()
    expect(loading).toContain('data-stage-wait="producer"')
    expect(loading).not.toContain('data-testid="prose-loading"')

    // 다 읽으면 산문이 보인다(정상 경로 고정).
    writer.preview = lockedPreview
    const ready = screen()
    expect(ready).not.toContain('data-testid="stage-wait"')
    expect(ready).toContain(P1)
  })
})
