// 다음 단계로 넘길 때 화면에서 이미 열린 단계여도 저장 단계가 뒤처졌으면 그 단계로 올리고, 저장 단계가 더 뒤면 낮추지 않는지 검사한다 (검토 rev-flow 2026-11-26 2번)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 저장된 단계(projects.current_stage) — 쓰기는 거른 조건(id · 단계 목록)에 맞을 때만 바뀐다.
const db = vi.hoisted(() => ({ stage: 'conti', writes: [] as string[] }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: { current_stage: string }) => {
        const filters: Record<string, unknown> = {}
        const query = {
          eq: (key: string, value: unknown) => { filters[key] = value; return query },
          in: (key: string, values: unknown[]) => { filters[key] = values; return query },
          then: (resolve: (value: { error: null }) => unknown) => {
            const allowed = filters.current_stage
            const matches = allowed === undefined || (Array.isArray(allowed) ? allowed.includes(db.stage) : allowed === db.stage)
            if (matches) { db.stage = patch.current_stage; db.writes.push(patch.current_stage) }
            return Promise.resolve({ error: null }).then(resolve)
          },
        }
        return query
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: db.stage }, error: null }) }) }),
    }),
  }),
}))

import { handoffToStage } from '@/lib/stage-nav'
import { useProjectStore as project } from '@/stores/project-store'

beforeEach(() => {
  db.stage = 'conti'
  db.writes = []
  project.getState().resetProject()
  project.setState({ projectId: 'p', currentStage: 'conti' })
})

describe('넘길 때의 저장 단계', () => {
  // 왜: 화면만 앞서 열린 콘티(예: 채팅 도구 새로고침이 Storyboard 까지 연 때)에서 [Artist로 가기]가 "이미 열렸다"며 단계를 저장하지 않았다 —
  //   그 뒤 Artist 의 [이미지 만들기] · [완료하기]가 콘티 단계로 보고 아무것도 하지 않은 채 됐다고 했다(검토 rev-flow 2번).
  it('화면에서 이미 열린 단계로 넘겨도 저장 단계가 뒤처졌으면 저장 단계를 그 단계로 올린다', async () => {
    project.getState().unlockThrough('writer')
    expect(await handoffToStage('artist', { verify: true })).toBe('/studio/artist')
    expect(db.stage).toBe('artist')
    expect(project.getState().currentStage).toBe('artist')
  })

  // 왜: 화면의 열림 값이 아직 덜 읽혔을 때(다른 창에서 더 나아간 프로젝트) 넘기면 저장 단계를 앞 단계로 되돌렸다 — 열린 단계는 닫히지 않는다.
  it('넘길 때 저장 단계가 이미 더 뒤면 낮추지 않고 넘김은 된다', async () => {
    db.stage = 'writer'
    expect(await handoffToStage('artist', { verify: true })).toBe('/studio/artist')
    expect(db.stage).toBe('writer')
    expect(db.writes).toEqual([])
  })
})
