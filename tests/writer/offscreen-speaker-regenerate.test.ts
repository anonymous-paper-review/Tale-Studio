// [대사 다시 만들기]도 등장인물 목록에 없는 화자의 대사는 화면 밖 목소리로 저장한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  updates: [] as Array<{ payload: Record<string, unknown>; shotId: unknown }>,
  castRows: [] as Array<{ character_id: string }>,
  castError: null as null | { message: string },
  runDialogue: vi.fn(),
  calls: [] as string[],
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId }),
}))
vi.mock('@/lib/writer/run-store', () => ({
  getActiveRun: async () => ({
    status: 'completed',
    state: { scenes: {}, decoupage: {}, genre: {}, characters: { characters: [] }, input: { story: 'story' } },
  }),
}))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({ runDialogue: mocks.runDialogue }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: 'model' }) }))
vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class { async init() {} } }))
vi.mock('@/lib/writer/adapters', () => ({ writerShotIdToMain: () => 'sh_01_01' }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'character_appearances') {
        return {
          select: (cols: string) => ({
            eq: async (col: string, value: unknown) => {
              mocks.calls.push(`cast:${cols}:${col}=${String(value)}`)
              return { data: mocks.castRows, error: mocks.castError }
            },
          }),
        }
      }
      if (table === 'shots') {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: async (_col: string, shotId: unknown) => {
                mocks.updates.push({ payload, shotId })
                return { error: null }
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import { POST } from '@/app/api/writer/dialogue/route'

const VOICEMAIL = '(O.S., recorded voicemail playing on phone speaker)'
const request = () =>
  new Request('http://localhost/api/writer/dialogue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  })

beforeEach(() => {
  mocks.updates = []
  mocks.calls = []
  mocks.castRows = [{ character_id: 'mara' }, { character_id: 'tom' }]
  mocks.castError = null
  mocks.runDialogue.mockReset()
  mocks.runDialogue.mockImplementation(async () => {
    mocks.calls.push('dialogue')
    return {
      profiles: [],
      scenes: [{
        scene_id: 'scene_1',
        shots: [{
          shot_id: 'shot_1',
          dialogue: [
            { character_id: 'hospital_administrator', line: 'Please call us back.', delivery: VOICEMAIL },
            { character_id: 'mara', line: 'Fine.' },
          ],
          narration: null,
        }],
      }],
    }
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('[대사 다시 만들기]의 목록에 없는 화자', () => {
  it('대사만 다시 만들 때도 목록에 없는 화자의 대사는 화면 밖 목소리로 저장한다', async () => {
    // 왜: 대사 탭의 [대사 다시 만들기]도 목록에 없는 화자를 지어낼 수 있다 — 그 id 를 그대로 저장하면
    //   그 샷의 영상 만들기가 "화자 모습 없음"으로 멈춘다.
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mocks.calls).toEqual([`cast:character_id:project_id=${PROJECT_ID}`, 'dialogue'])
    expect(mocks.updates).toHaveLength(1)
    const lines = mocks.updates[0].payload.dialogue_lines as Array<{ characterId: string | null; text: string; delivery: string }>
    expect(lines.map((l) => [l.characterId, l.text])).toEqual([
      [null, 'Please call us back.'],
      ['mara', 'Fine.'],
    ])
    expect(lines[0].delivery).toBe(VOICEMAIL)
  })

  it('등장인물 목록을 읽지 못하면 대사를 새로 만들기 전에 멈춘다', async () => {
    // 왜: 1~2분 걸리는 유료 대사 생성을 다 하고 나서 목록 조회 실패로 결과를 버리지 않게 — 조회를 먼저 한다.
    mocks.castError = { message: 'db down' }

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(mocks.calls).toEqual([`cast:character_id:project_id=${PROJECT_ID}`])
    expect(mocks.runDialogue).not.toHaveBeenCalled()
    expect(mocks.updates).toHaveLength(0)
  })
})
