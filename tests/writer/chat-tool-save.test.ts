// 채팅 편집은 기존 저장을 보존하고 실제 저장된 필드가 확인된 뒤 성공한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, error: null as unknown, writes: [] as Record<string, unknown>[], filters: [] as unknown[] }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({ update: (patch: Record<string, unknown>) => {
  db.writes.push(patch)
  const query = { eq: (...args: unknown[]) => { db.filters.push(args); return query }, is: (...args: unknown[]) => { db.filters.push(args); return query }, select: () => query, maybeSingle: async () => ({ data: db.row, error: db.error }) }
  return query
} }) }) }))
import { saveWriterToolPatch } from '@/lib/chat-tools/writer-save'
const base = () => ({ projectId: 'p', resource: 'shots' as const, id: 'sh_1', patch: { actionDescription: '새 설명' }, before: { actionDescription: '옛 설명' }, isCurrent: () => true, hasPendingEdit: () => false, applySaved: vi.fn() })
beforeEach(() => { db.row = { action_description: '새 설명', action_description_native: '새 설명' }; db.error = null; db.writes = []; db.filters = [] })
describe('Writer 도구 저장', () => {
  it('기존 화면 저장이 대기 중이면 그 저장을 지우거나 새 값으로 덮지 않는다', async () => {
    // 왜: 화면 설명 저장 대기 중 채팅 대사 편집이 먼저 들어올 수 있다.
    const result = await saveWriterToolPatch({ ...base(), hasPendingEdit: () => true })
    expect(result.status).toBe('stale_state'); expect(db.writes).toHaveLength(0)
  })
  it('요청한 필드만 원문과 표시문에 저장하고 읽은 값으로 충돌을 검사한다', async () => {
    // 왜: 대사 외 필드를 보존하고 오래된 모델 판단이 후속 편집을 덮지 않게 한다.
    const options = base(); const result = await saveWriterToolPatch(options)
    expect(result.status).toBe('ok')
    expect(db.writes).toEqual([{ action_description: '새 설명', action_description_native: '새 설명' }])
    expect(db.filters).toContainEqual(['action_description_native', '옛 설명'])
    expect(options.applySaved).toHaveBeenCalledOnce()
  })
  it('저장한 행이 없거나 저장 내용이 다르면 완료로 알리지 않는다', async () => {
    // 왜: 동시 편집이나 저장 대상 소실은 성공적인 HTTP 응답으로 올 수도 있다.
    db.row = null
    expect((await saveWriterToolPatch(base())).status).toBe('stale_state')
    db.row = { action_description: '다른 설명', action_description_native: '다른 설명' }
    expect((await saveWriterToolPatch(base())).status).toBe('unverified')
  })
  it('프로젝트를 바꾸면 이전 결과를 새 화면에 반영하지 않는다', async () => {
    // 왜: 저장 요청 중 프로젝트 전환이 가능하다.
    let checks = 0
    const options = { ...base(), isCurrent: () => ++checks === 1 }
    await expect(saveWriterToolPatch(options)).rejects.toMatchObject({ name: 'AbortError' })
    expect(options.applySaved).not.toHaveBeenCalled()
  })
})
