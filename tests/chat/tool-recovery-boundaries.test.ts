// 도구 실패를 완료 발화로 숨기지 않고 응답 유실 뒤에도 필요한 후속 저장까지 확인한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatToolExecutor, type ToolResource } from '@/lib/chat-tools/executor'
import { chatToolReceipt, guardChatToolReply } from '@/lib/chat-tools/receipt'
import { saveWriterToolPatch } from '@/lib/chat-tools/writer-save'
import type { ToolOutcome } from '@/lib/chat-tools/protocol'

const db = vi.hoisted(() => ({
  shot: { shot_id: 'shot-1', project_id: 'p', duration_seconds: 5 },
  sceneSeconds: 5,
  loseResponse: true,
  writes: vi.fn(),
  syncDuration: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => {
    let patch: Record<string, unknown> = {}
    const filters: Record<string, unknown> = {}
    const query = {
      update: (value: Record<string, unknown>) => { patch = value; return query },
      eq: (key: string, value: unknown) => { filters[key] = value; return query },
      select: () => query,
      maybeSingle: async () => {
        if (!Object.entries(filters).every(([key, value]) => db.shot[key as keyof typeof db.shot] === value)) return { data: null, error: null }
        db.writes(patch)
        Object.assign(db.shot, patch)
        if (db.loseResponse) {
          db.loseResponse = false
          throw new Error('DB에는 저장됐지만 응답이 끊겼습니다')
        }
        return { data: { ...db.shot }, error: null }
      },
    }
    return query
  } }),
}))

function outcome(status: string, id = 'edit-1'): ToolOutcome {
  return {
    call: { type: 'tool_use', id, name: 'edit_project', input: { resource: 'settings', id: 'settings', revision: 'r1', patch: { dialogueLanguage: 'ko' } } },
    result: { status, message: status === 'ok' ? undefined : '아직 완료되지 않았습니다' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.shot = { shot_id: 'shot-1', project_id: 'p', duration_seconds: 5 }
  db.sceneSeconds = 5
  db.loseResponse = true
  db.syncDuration.mockImplementation(async () => { db.sceneSeconds = db.shot.duration_seconds })
})

describe('도구 실행 결과의 마지막 확인', () => {
  it('저장 실패나 승인 대기가 남아 있으면 모델의 완료 발화를 그대로 보여주지 않는다', () => {
    // 왜: 실패를 모델에 돌려줬어도 마지막 답변이 모두 저장했다고 주장할 수 있다.
    for (const status of ['failed', 'approval_required', 'unverified', 'unknown_result', 'partial', 'stale_state']) {
      const outcomes = [outcome(status)]
      const reply = guardChatToolReply('모두 저장했어요.', outcomes, true)
      expect(reply, status).not.toContain('모두 저장했어요.')
      expect(reply, status).toBe(chatToolReceipt(outcomes, true))
    }
  })

  it('모든 변경이 저장 확인되면 모델의 설명과 실제 결과를 함께 보여준다', () => {
    // 왜: 앞선 실패를 복구했다면 최종 성공 설명을 보존하면서 실제 저장 근거도 보여줘야 한다.
    const outcomes = [outcome('failed', 'first-attempt'), outcome('ok', 'recovered-attempt')]
    const reply = '다시 시도해 한국어로 저장했어요.'
    expect(guardChatToolReply(reply, outcomes, true)).toBe(`${reply}\n\n${chatToolReceipt(outcomes, true)}`)
  })

  it('샷 저장 응답이 끊겼으면 씬 길이까지 확인하기 전에는 전체 완료로 알리지 않는다', async () => {
    // 왜: 샷 길이만 DB에 반영된 응답 유실을 성공으로 승격하면 씬 합계 저장이 영영 빠질 수 있다.
    let stored: Record<string, unknown> = { ...db.shot }
    const resource: ToolResource = {
      reconcileUnchanged: true,
      read: async () => {
        stored = { ...db.shot }
        return [{ id: db.shot.shot_id, values: { durationSeconds: db.shot.duration_seconds } }]
      },
      validate: value => value as Record<string, unknown>,
      write: (id, patch, before) => saveWriterToolPatch({
        projectId: 'p', resource: 'shots', id, patch, before, stored,
        isCurrent: () => true, hasPendingEdit: () => false, applySaved: () => {}, syncDuration: db.syncDuration,
      }),
    }
    const execute = createChatToolExecutor({ resources: { shots: resource }, signal: new AbortController().signal, isCurrent: () => true })
    const read = async (id: string) => {
      const result = await execute({ type: 'tool_use', id, name: 'read_project', input: { resource: 'shots', id: 'shot-1' } })
      expect(result).toMatchObject({ status: 'ok' })
      return (result.records as Array<{ revision: string }>)[0].revision
    }
    const edit = (id: string, revision: string) => execute({ type: 'tool_use', id, name: 'edit_project', input: {
      resource: 'shots', id: 'shot-1', revision, patch: { durationSeconds: 9 },
    } })

    expect(await edit('first-edit', await read('first-read'))).toMatchObject({ status: 'unverified' })
    expect(db.shot.duration_seconds).toBe(9)
    expect(db.sceneSeconds).toBe(5)
    expect(db.syncDuration).not.toHaveBeenCalled()

    expect(await edit('repair-edit', await read('repair-read'))).toMatchObject({ status: 'ok' })
    expect(db.sceneSeconds).toBe(9)
    expect(db.syncDuration).toHaveBeenCalledOnce()
    expect(db.writes).toHaveBeenCalledTimes(2)
  })
})
