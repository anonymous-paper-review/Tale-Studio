// 과거 씬 본문에 남은 내부 장소명도 같은 실행에 보존된 실제 이름으로 표시한다.
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ run: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async () => ({ ok: true })) }))
import { GET } from '@/app/api/writer/preview/[projectId]/route'

const state = () => ({
  characters: { characters: [{ id: 'char', name: '쿄타로' }, { id: 'char_2', name: '코마츠' }] },
  world: { locations: [{ id: 'location_2', name: '학교 옥상' }] },
  dramaturgy: { world_inventory: [{ id: 'vending_machine_corner', name: '교내 자판기 코너' }] },
  scenes: { scenes: [{ scene_id: 'scene_2', scene_actions: ['쿄타로가 체육관 옆 vending_machine_corner에서 음료수를 뽑고 있다.'] }] },
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === 'projects' ? { locale: 'ko', locale_locked: true } : [], error: null }
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => result), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q)
    return q
  })
})
async function preview(saved: ReturnType<typeof state>) {
  mocks.run.mockResolvedValue({ status: 'completed', state: saved })
  const response = await GET(new NextRequest('http://localhost/api/writer/preview/project?locale=ko'), { params: Promise.resolve({ projectId: 'project' }) })
  expect(response.status).toBe(200)
  return response.json()
}
it('과거 씬에 남은 장소 식별자는 같은 실행에 보존된 장소 이름으로 보여준다.', async () => {
  const saved = state()
  const original = structuredClone(saved)
  const result = await preview(saved)
  expect(result.scenes[0].beats).toEqual(['쿄타로가 체육관 옆 교내 자판기 코너에서 음료수를 뽑고 있다.'])
  expect(result.roster).toContainEqual({ slug: 'vending_machine_corner', name: '교내 자판기 코너' })
  expect(saved).toEqual(original)
})
it('확정한 장소 이름이 있으면 예전 후보 이름으로 덮어쓰지 않는다.', async () => {
  const saved = state()
  saved.world.locations.push({ id: 'vending_machine_corner', name: '체육관 자판기 앞' })
  expect((await preview(saved)).scenes[0].beats[0]).toContain('체육관 자판기 앞')
})
it('이름이 기록되지 않은 장소는 새 이름을 지어내지 않는다.', async () => {
  const saved = state()
  saved.dramaturgy.world_inventory = []
  expect((await preview(saved)).scenes[0].beats[0]).toContain('vending_machine_corner')
})
