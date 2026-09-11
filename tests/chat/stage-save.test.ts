// 단계 저장 실패와 늦은 프로젝트 응답을 화면 이동 성공으로 처리하지 않는다
import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ error: null as unknown, saved: 'artist', onWrite: () => {} }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: async () => { db.onWrite();return { error: db.error } } }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: db.saved }, error: db.error }) }) }) }) }) }))
import { handoffToStage } from '@/lib/stage-nav'
import { useProjectStore as project } from '@/stores/project-store'
beforeEach(() => { project.getState().resetProject();project.setState({ projectId: 'p', currentStage: 'writer', reachedStage: 'writer' });db.error = null;db.saved = 'artist';db.onWrite = () => {} })
it('단계 DB 저장 실패면 화면이 열렸다고 처리하지 않는다', async () => {
  // 왜: 서버가 거절한 단계 변경을 로컬 화면만 성공시킬 수 없다.
  db.error = { message: 'save failed' }
  expect(await handoffToStage('artist', { verify: true })).toBeNull()
  expect(project.getState().currentStage).toBe('writer')
})
it('단계 저장 중 프로젝트가 바뀌면 새 프로젝트를 이동하지 않는다', async () => {
  // 왜: 늦게 도착한 이동 응답이 현재 프로젝트를 바꾸면 안 된다.
  db.onWrite = () => project.setState({ projectId: 'other', currentStage: 'producer' })
  expect(await handoffToStage('artist', { verify: true })).toBeNull()
  expect(project.getState().currentStage).toBe('producer')
})
