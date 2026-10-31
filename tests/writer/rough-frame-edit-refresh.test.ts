// 러프 한 장을 다시 그리거나 연출 그림을 저장한 뒤 팝업 · 보드 카드가 새로고침 없이 새 그림을 다시 읽는지 검사한다
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vitest 는 node(isServer=true)라 진짜 getQueryClient 는 호출마다 새 인스턴스 — 화면처럼 하나를 같이 쓰게 한다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))

const db = vi.hoisted(() => ({ rows: [] as Array<{ shot_id: string; rough_storyboard: { generatedAt: number } }>, fetchCount: 0 }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => {
            db.fetchCount += 1
            return { data: db.rows.map((row) => structuredClone(row)), error: null }
          },
        }),
      }),
    }),
  }),
}))

import { loadShots } from '@/lib/shots-cache'
import { reloadAfterRoughFrameEdit } from '@/lib/writer/rough-frame-refresh'

beforeEach(() => {
  shared.client = new QueryClient()
  db.rows = [{ shot_id: 'sh_01_03', rough_storyboard: { generatedAt: 100 } }]
  db.fetchCount = 0
})

describe('러프 한 장 고치기 뒤 다시 읽기', () => {
  // 왜: 샷 목록은 30초 동안 같은 것을 돌려준다. 한 장 다시 그리기 · 연출 그림 저장 뒤에 그대로 다시 읽으면 "다시 그렸어요" 알림이 떠도
  //   팝업 세 장과 카드에 옛 그림이 남았다(2026-10-31 개발 서버 실측: [저장 후 END 재생성] · [이 장만 다시 만들기] 뒤 팝업 그대로).
  it('러프 한 장을 다시 그린 뒤에는 방금 읽은 샷 목록이 있어도 새로 읽어 새 그림을 받는다', async () => {
    await loadShots('p1')
    db.rows = [{ shot_id: 'sh_01_03', rough_storyboard: { generatedAt: 200 } }]

    let seen: Awaited<ReturnType<typeof loadShots>> = []
    await reloadAfterRoughFrameEdit('p1', async () => {
      seen = await loadShots('p1')
    })

    expect(db.fetchCount).toBe(2)
    expect((seen[0].rough_storyboard as { generatedAt: number }).generatedAt).toBe(200)
  })

  // 왜: 팝업의 세 단추(한 장 다시 · 연출 [저장] · [저장 후 END 재생성])가 모두 같은 길로 다시 읽어야 한다 — Storyboard 팝업과 Director 팝업이 같은 부품을 쓴다.
  it('[이 장만 다시 만들기] · 연출 [저장] · [저장 후 END 재생성]은 끝나면 샷 목록을 새로 읽게 한다', () => {
    const still = readFileSync('src/features/writer/rough-frames-still.tsx', 'utf8')
    const editor = readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')
    expect(still).toMatch(/reloadAfterRoughFrameEdit\(projectId, onRegenerated\)/)
    expect(editor.match(/reloadAfterRoughFrameEdit\(projectId, onSaved\)/g)?.length).toBe(2)
  })
})
