// 확정된 씬 스토리(잠긴 산문)의 문단은 ⌘/Ctrl+클릭으로 멘션하지 않고, 고칠 수 있는 산문 문단만 멘션하는지 검사한다 (리드 2026-11-23 결정 ②)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/writer/use-writer-status', async (original) => ({ ...(await original<typeof import('@/lib/writer/use-writer-status')>()), restartWriterStatus: vi.fn() }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { proseTools } from '@/lib/prose/conditions'
import { ProseDocument } from '@/features/prose/prose-document'
import type { ProseState } from '@/features/prose/use-prose'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const PROJECT = 'locked-prose-project'
const P1 = '지친 여자가 텅 빈 지하철 객차 창가 좌석에 홀로 앉아 있다.'
const P2 = '창문 속 반사상은 고개를 돌리지 않은 채 정면을 응시한다.'

function prose(locked: boolean): ProseState {
  return {
    projectId: PROJECT,
    view: { kind: 'scenes', paragraphs: [P1, P2] },
    paragraphs: [P1, P2],
    diffRows: null,
    phase: 'gate',
    draftLive: !locked,
    startOffered: false,
    locked,
    preserved: false,
    tools: proseTools({ preserved: false, locked, hasProse: true, busy: false }),
  } as unknown as ProseState
}

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(prose-paragraph 시험과 같은 방법). */
function render(locked: boolean) {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(createElement(ProseDocument, { prose: prose(locked) }))
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useWriterRoomStore.setState({ paragraph: null })
  useProjectStore.setState({ projectId: PROJECT, currentStage: 'producer', reachedStage: 'editor', projectLocale: 'ko' })
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('확정된 씬 스토리의 ⌘/Ctrl+클릭', () => {
  it('확정된 씬 스토리 문단은 ⌘/Ctrl+클릭으로 멘션하지 않는다 — 같은 씬은 콘티 씬 머리에서 멘션한다', () => {
    // 왜(리드 2026-11-23 결정 ②): 잠긴 글이라 채팅으로 고칠 수 없다 — 붙여도 보낼 곳이 없다. 같은 씬은 콘티 탭 씬 머리에서 ⌘/Ctrl+클릭으로 붙인다.
    const locked = render(true)
    expect(locked).toContain('지친 여자가 텅 빈 지하철 객차')
    expect(locked).not.toContain('role="button"')
    expect(locked).not.toContain('⌘/Ctrl+클릭 멘션')
    // 고칠 수 있는 산문은 지금처럼 문단마다 누르는 칸과 "⌘/Ctrl+클릭 멘션" 표시가 있다.
    const editable = render(false)
    expect(editable).toContain('role="button"')
    expect(editable).toContain('⌘/Ctrl+클릭 멘션')
  })
})
