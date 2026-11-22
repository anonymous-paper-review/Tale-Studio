// 원본 그대로(대본 보존) 프로젝트는 서버에 [대사 다시 생성]을 바로 보내도 막고, 그렇지 않은 프로젝트는 지금처럼 다시 만든다 (D15 오너 2026-11-22)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
  updates: 0,
  runDialogue: vi.fn(),
}))

vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId }),
}))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: async () => ({ status: 'completed', state: mocks.state }) }))
vi.mock('@/lib/writer/pipeline/stages/dialogue', () => ({ runDialogue: mocks.runDialogue }))
vi.mock('@/lib/writer/pipeline', () => ({ resolveModels: () => ({ S: 'model' }) }))
vi.mock('@/lib/writer/logger', () => ({ PipelineLogger: class { async init() {} } }))
vi.mock('@/lib/writer/adapters', () => ({ writerShotIdToMain: () => 'sh_01_01' }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'character_appearances') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      if (table === 'shots') {
        return {
          update: () => ({ eq: () => ({ eq: async () => { mocks.updates += 1; return { error: null } } }) }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import { POST } from '@/app/api/writer/dialogue/route'
import { isPreservedScriptRun } from '@/lib/writer/preserved-run'

const request = () =>
  new Request('http://localhost/api/writer/dialogue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  })
const runState = (input: Record<string, unknown>, sceneSource?: string) => ({
  scenes: { scenes: [{ scene_id: 'scene_1', ...(sceneSource ? { provenance: { source: sceneSource } } : {}) }] },
  decoupage: {},
  genre: {},
  characters: { characters: [] },
  input: { story: 'INT. 복도 - 낮\n민호: 아, 또야?', ...input },
})

beforeEach(() => {
  mocks.updates = 0
  mocks.runDialogue.mockReset()
  mocks.runDialogue.mockResolvedValue({ profiles: [], scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: 'shot_1', dialogue: [], narration: null }] }] })
})

describe('원본 그대로 프로젝트의 대사 다시 생성', () => {
  it('원본 그대로 프로젝트에서 대사 다시 생성을 서버로 바로 보내도 막고 대사를 바꾸지 않는다', async () => {
    // 왜: D15 — 원작 대사를 지킨다. 화면 단추를 숨겨도 오래 열어 둔 화면 · 다른 창이 보낼 수 있다(대사를 AI 가 새로 쓰면 되돌릴 수 없다).
    mocks.state = runState({ preserveScript: true })
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'preserved_script' } })
    expect(mocks.runDialogue).not.toHaveBeenCalled()
    expect(mocks.updates).toBe(0)
  })

  it('대본에서 옮긴 씬이 있는 실행도 원본 그대로로 보고 대사 다시 생성을 막는다', async () => {
    // 왜(혼자 정한 것): 산문 고치기 막기(scene-gate)와 같은 규칙 — 실행 입력의 표시가 빠진 옛 실행도 대본에서 옮긴 씬이면 원본 그대로다.
    mocks.state = runState({}, 'script')
    expect(isPreservedScriptRun(mocks.state as never)).toBe(true)
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(mocks.runDialogue).not.toHaveBeenCalled()
  })

  it('원본 그대로가 아닌 프로젝트는 지금처럼 서버가 대사를 다시 만든다', async () => {
    // 왜: 정상 경로 고정 — 막는 것은 원본 그대로 프로젝트뿐이다.
    mocks.state = runState({})
    expect(isPreservedScriptRun(mocks.state as never)).toBe(false)
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(mocks.runDialogue).toHaveBeenCalledTimes(1)
  })
})
