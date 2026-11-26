// Writer 씬 스토리의 넘김 단추는 산문을 확정하기 전이든 뒤든 "Artist로 가기"이고, 채팅 안내 글도 단추를 그 이름으로 부른다 (오너 2026-11-26 "다음으로 가기 버튼 : Artist로 가기")
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactNode } from 'react'
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
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; 'data-testid'?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className, 'data-testid': testId }: Props) => h(tag, { className, 'data-testid': testId }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { ProseWorkspace } from '@/features/prose/prose-workspace'
import { KO } from '@/lib/i18n/messages-ko'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

const read = (path: string) => readFileSync(path, 'utf8')
const P1 = '회사 복도, 오후 세 시. 민호가 자판기 버튼을 누르지만 아무것도 나오지 않는다.'

function preview(over: Record<string, unknown> = {}) {
  return {
    started: true, running: false, completed: false, failed: false, engine: 'v1', draft: true,
    roster: [], characters: [],
    scenes: [{ sceneId: 'scene_1', index: 0, beats: [P1], shotStories: [] }],
    proseConditions: { runtimeSeconds: 15, genre: '코미디', seed: 'keep' },
    proseLocked: false,
    ...over,
  }
}
/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(prose-one-screen 과 같은 방법). */
function html() {
  for (const store of [useLocaleStore, useProjectStore, useWriterRoomStore, useProducerStore, useGlobalChatStore] as Array<{ getState: () => object; getInitialState: () => object }>) Object.assign(store.getInitialState(), store.getState())
  return renderToStaticMarkup(createElement(ProseWorkspace))
}
/** data-testid 로 고른 단추 하나의 글(태그 뺀 것). */
function buttonText(out: string, testId: string): string | null {
  const match = out.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</button>`))
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null
}

/** 코드 파일 전부(src 아래 .ts · .tsx, 한국어 사전은 뺀다). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !path.endsWith('messages-ko.ts') ? [path] : []
  })
}

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'prose-project', projectTitle: '자판기의 반란', currentStage: 'producer', reachedStage: 'producer', producerLocked: false, treatmentDraft: true, projectLocale: 'ko' })
  useWriterRoomStore.setState({ paragraph: null, confirmOpen: false, rewriteOpen: false, manualRequest: 0 })
  writer.status = { started: true, current_status: 'awaiting_confirmation', current_stage: 'storyCheck', draft: true }
  writer.preview = preview()
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('씬 스토리의 넘김 단추', () => {
  // 왜: 오너 2026-11-26 — 다음 단계로 가는 단추 이름을 "Artist로 가기"로. 누르면 산문을 잠그는 일이라 지금처럼 확인 창을 거친다.
  it('확정 전 씬 스토리 머리의 넘김 단추 이름은 "Artist로 가기"이고 누르면 지금처럼 산문을 확정할지 묻는 창이 열린다', () => {
    const out = html()

    expect(buttonText(out, 'prose-breakdown')).toBe('Artist로 가기')
    expect(out).not.toContain('브레이크다운하기')
    expect(read('src/features/prose/prose-workspace.tsx')).toMatch(/onClick=\{\(\) => useWriterRoomStore\.getState\(\)\.openConfirm\(\)\}[^>]*data-testid="prose-breakdown"/)

    useLocaleStore.setState({ locale: 'en' })
    expect(buttonText(html(), 'prose-breakdown')).toBe('Go to Artist')
  })

  // 왜: 정상 경로 고정 — 산문을 확정한 뒤에는 확인 없이 Artist 로 가는 단추가 이미 같은 이름이다. 두 단추가 다른 이름이면 다른 곳으로 가는 것처럼 읽힌다.
  it('산문을 확정한 뒤의 넘김 단추도 "Artist로 가기"이고 누르면 Artist 로 간다', () => {
    useProjectStore.setState({ producerLocked: true, treatmentDraft: false, reachedStage: 'artist' })
    writer.preview = preview({ proseLocked: true })

    const out = html()

    expect(buttonText(out, 'prose-go-artist')).toBe('Artist로 가기')
    expect(out).not.toContain('data-testid="prose-breakdown"')
    expect(read('src/features/prose/prose-workspace.tsx')).toMatch(/onClick=\{\(\) => router\.push\(withDemoShare\('\/studio\/artist'\)\)\}[^>]*data-testid="prose-go-artist"/)
  })
})

describe('단추를 부르는 안내 글', () => {
  // 왜: 단추 이름만 바꾸면 채팅 · 띠 안내가 없어진 [브레이크다운하기]를 누르라고 한다(원작 그대로 막힘 · 적용 뒤 · 다음 할 일 · 대본 옮김 · 원작 그대로 띠).
  it('한국어 안내 글은 넘김 단추를 [브레이크다운하기]가 아니라 [Artist로 가기]로 부른다', () => {
    const korean = Object.values(KO).filter((value): value is string => typeof value === 'string')
    expect(korean.filter((value) => /브레이크다운하기|브레이크다운해 주세요|브레이크다운만 할 수/.test(value))).toEqual([])
    expect(korean.some((value) => value.includes('[Artist로 가기]'))).toBe(true)
  })

  // 왜: 영어 화면 · AI 안내도 같은 단추 이름으로 부른다 — 코드에 남은 옛 이름(Run breakdown · press Breakdown · run the breakdown)이 없어야 한다.
  it('영어 안내 글과 AI 안내도 넘김 단추를 Run breakdown 이 아니라 Go to Artist 로 부른다', () => {
    const stale = sourceFiles('src').filter((path) => /Run breakdown|press Breakdown|run the breakdown/.test(read(path)))
    expect(stale).toEqual([])
  })
})
