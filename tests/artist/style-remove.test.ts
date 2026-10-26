// 올린 내 그림체는 지울 수 있고, 지우면 고정이 풀려 다른 스타일을 고를 수 있다 (2026-10-27 디자이너 QA #03 · 오너 "지우기(X) 추가")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LOCKED = { url: 'https://img.test/look.png', label: '내 그림체', medium: '2d_anime', locked: true }
const db = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>>, fail: false, row: {} as Record<string, unknown> }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          if (db.fail) return { error: { message: 'db down' }, data: null }
          db.writes.push(patch)
          Object.assign(db.row, patch)
          return { error: null, data: null }
        },
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...db.row }, error: null }) }) }),
    }),
  }),
  createCatalogClient: vi.fn(),
}))

import { useProducerStore as producer } from '@/stores/producer-store'
import { useProjectStore as project } from '@/stores/project-store'

beforeEach(() => {
  db.writes.length = 0
  db.fail = false
  db.row = { style_anchor_key: 'custom_look', custom_style_anchor: LOCKED }
  project.getState().resetProject()
  producer.getState().reset()
  project.setState({ projectId: 'proj-1', currentStage: 'artist', reachedStage: 'artist' })
  producer.setState({ styleAnchorKey: 'custom_look', customStyleAnchor: LOCKED } as never)
})
afterEach(() => vi.unstubAllGlobals())

describe('내 그림체 지우기', () => {
  it('내 그림체를 지우면 고정이 풀리고 다른 스타일을 고를 수 있다', async () => {
    // 왜: 올린 그림체로 고정되면 다른 스타일 13개가 모두 꺼지고 빠져나갈 방법이 없었다(QA #03).
    expect(await producer.getState().removeCustomStyleAnchor()).toBe(true)
    expect(producer.getState().customStyleAnchor).toBeNull()
    expect(producer.getState().styleAnchorKey).toBeNull()
    expect(db.writes[0]).toEqual({ custom_style_anchor: null, style_anchor_key: '' })

    expect(await producer.getState().setStyleAnchor('real')).toBe(true)
    expect(producer.getState().styleAnchorKey).toBe('real')
  })

  it('내 그림체를 지우지 못하면 그대로 두고 알린다', async () => {
    // 왜: 화면에서만 지워지면 다음에 열 때 다시 고정돼 있어 헷갈린다.
    db.fail = true
    expect(await producer.getState().removeCustomStyleAnchor()).toBe(false)
    expect(producer.getState().customStyleAnchor).toEqual(LOCKED)
    expect(producer.getState().error).toBeTruthy()
  })

  it('Artist 스타일 팝업의 내 그림체 카드에 지우기 단추가 있고, 그림체를 읽는 동안에는 누를 수 없다', () => {
    // 왜: 읽는 도중에 지우면 다 읽은 결과가 들어갈 자리가 없다 — 읽기가 끝난 뒤에 지운다.
    const ui = readFileSync(path.join(process.cwd(), 'src/features/artist-room/style-make-dialog.tsx'), 'utf8')
    expect(ui).toMatch(/data-testid="artist-style-remove"/)
    expect(ui).toMatch(/removeCustomStyleAnchor\(\)/)
    expect(ui).toMatch(/disabled=\{[^}]*styleSetting[^}]*\}[^>]*data-testid="artist-style-remove"|data-testid="artist-style-remove"[^>]*disabled=\{[^}]*styleSetting/)
  })
})
