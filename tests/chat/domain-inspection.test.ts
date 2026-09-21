// 채팅 근거 조회는 대상의 저장 사실·원설계·모습을 구분하고 저장하지 않는다
import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, fail: '', design: new Map(), designFails: false, queried: [] as string[] }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => {
  mock.queried.push(table)
  const filters: Array<[string, unknown]> = []
  const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]);return q }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: (mock.tables[table] ?? []).filter(row => filters.every(([k, v]) => row[k] === v)), error: mock.fail === table ? { message: 'read failed' } : null }).then(resolve) }
  return q
} } }))
vi.mock('@/lib/writer/shot-design-state', async original => ({ ...await original<object>(), loadShotDesignByMainId: async (_id: string, options: { strict?: boolean }) => { expect(options.strict).toBe(true);if (mock.designFails) throw Error('run unavailable');return mock.design } }))
import { loadProjectInspection } from '@/lib/chat-tools/inspect-server'
beforeEach(() => {
  mock.tables = {
    shots: [{ project_id: 'p', shot_id: 'sh_01_01', scene_id: 'sc_01', design_ref: 'shot_1', duration_seconds: 9, static_spec: { framing: 'WS' }, dynamic_spec: { camera_motion: { motivation: 'follow the parcel' } }, check_notes: [] }],
    scenes: [{ project_id: 'p', scene_id: 'sc_01', stage: { axis: 'door-window' } }],
    characters: [{ project_id: 'p', character_id: 'c', name: '도윤' }],
    character_appearances: [
      { project_id: 'p', character_id: 'c', appearance_key: 'current', label: '현재', is_default: true, appearance_native: '파란 우비', sheet_url: 'https://test.supabase.co/storage/v1/object/public/media/current.png' },
      { project_id: 'p', character_id: 'c', appearance_key: 'young', label: '젊은 시절', is_default: false, appearance_native: '노란 우비', sheet_url: 'https://test.supabase.co/storage/v1/object/public/media/young.png' },
    ],
    locations: [{ project_id: 'p', location_id: 'l', name: '골목', visual_description_native: '현재 골목', wide_shot: 'https://test.supabase.co/storage/v1/object/public/media/default.png' }],
    location_appearances: [{ project_id: 'p', location_id: 'l', appearance_key: 'past', label: '과거', visual_description_native: '과거 골목', wide_shot: 'https://test.supabase.co/storage/v1/object/public/media/past.png' }],
  }
  mock.design = new Map([['shot_1', { intent: { dramatic_purpose: 'hide the sender', duration_seconds: 8 } }]])
  mock.fail = '';mock.designFails = false;mock.queried = []
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
})
it('저장된 연출 근거를 조회하면 해당 샷의 현재 값과 생성 당시 근거를 구분한다', async () => {
  // 왜: 생성 뒤 길이를 수정했을 때 과거 이유를 현재 수정의 이유로 꾸미지 않는다.
  const { result } = await loadProjectInspection('p', { target: 'shot', id: 'sh_01_01' })
  expect(result.current).toMatchObject({ durationSeconds: 9, staticSpec: { framing: 'WS' } })
  expect(result.generation).toMatchObject({ status: 'recorded', source: 'writer_runs.state.shotDesign', intent: { duration_seconds: 8 } })
  expect(result.scene).toMatchObject({ stage: { axis: 'door-window' } })
})
it('연결 정보가 없는 분할 샷에는 옆 샷의 연출 근거를 붙이지 않는다', async () => {
  // 왜: 원설계 연결이 있는 프로젝트에서 숫자가 같은 이웃 설계를 가져오는 것을 막는다.
  mock.tables.shots.push({ project_id: 'p', shot_id: 'sh_01_02', scene_id: 'sc_01', design_ref: null })
  mock.design.set('sh_01_02', { intent: { dramatic_purpose: 'wrong neighbour' } })
  const { result } = await loadProjectInspection('p', { target: 'shot', id: 'sh_01_02' })
  expect(result.generation).toMatchObject({ status: 'not_linked' })
  expect(JSON.stringify(result)).not.toContain('wrong neighbour')
})
it('수동으로 새로 만든 샷에는 같은 번호의 과거 생성 의도를 붙이지 않는다', async () => {
  // 왜: 삭제 후 같은 번호로 새로 만든 수동 샷은 이전 샷과 다른 대상이다.
  mock.tables.shots[0].source = 'manual';mock.tables.shots[0].design_ref = null
  mock.design.set('sh_01_01', { intent: { dramatic_purpose: 'old unrelated shot' } })
  const { result } = await loadProjectInspection('p', { target: 'shot', id: 'sh_01_01' })
  expect(result.generation).toMatchObject({ status: 'not_linked' })
  expect(JSON.stringify(result)).not.toContain('old unrelated shot')
})
it('이전 형식의 저장된 연출 의도도 조회하며 조회 실패와 미기록을 구분한다', async () => {
  // 왜: 구조가 다른 기존 프로젝트와 서버 조회 장애를 근거 없음으로 오해하지 않는다.
  mock.tables.shots[0].static_spec = { intent: '문 앞에서 긴장을 드러낸다' }
  mock.designFails = true
  const { result } = await loadProjectInspection('p', { target: 'shot', id: 'sh_01_01' })
  expect(result.current).toMatchObject({ staticSpec: { intent: '문 앞에서 긴장을 드러낸다' } })
  expect(result.generation).toMatchObject({ status: 'read_failed' })
  mock.designFails = false;mock.design.clear()
  expect((await loadProjectInspection('p', { target: 'shot', id: 'sh_01_01' })).result.generation).toMatchObject({ status: 'not_found' })
})
it('기본 모습 대신 지정한 젊은 모습의 설명과 이미지 주소를 반환한다', async () => {
  // 왜: 한 인물의 다른 시점 모습들을 섞어 판독하지 않는다.
  const result = await loadProjectInspection('p', { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true })
  expect(result.result.selectedAppearance).toMatchObject({ appearanceKey: 'young', description: '노란 우비' })
  expect(result.imageUrl).toContain('/young.png')
})
it('시트가 없으면 다른 모습이나 포트레이트를 현재 이미지로 대신 쓰지 않는다', async () => {
  // 왜: 사용자가 보고 있는 이미지가 없는데 다른 이미지를 보고 답하지 않는다.
  mock.tables.character_appearances[1].sheet_url = null
  mock.tables.character_appearances[1].portrait_url = 'https://test.supabase.co/storage/v1/object/public/media/portrait.png'
  const result = await loadProjectInspection('p', { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true })
  expect(result.imageUrl).toBeUndefined();expect(result.result.status).toBe('image_unavailable')
})
it('배경 기본 모습과 과거 모습의 설명과 이미지를 섞지 않는다', async () => {
  // 왜: 기본 배경이 선택됐어도 과거 모습을 요청하면 그 행을 읽는다.
  const result = await loadProjectInspection('p', { target: 'background', id: 'l', appearanceKey: 'past', includeImage: true })
  expect(result.result.selectedAppearance).toMatchObject({ description: '과거 골목' })
  expect(result.imageUrl).toContain('/past.png')
  expect(mock.queried).toContain('location_image_candidates')
})
it('다른 프로젝트의 같은 식별자를 조회하지 않고 외부 이미지 주소를 전달하지 않는다', async () => {
  // 왜: 프로젝트별로 같은 인물 키를 써도 다른 프로젝트 자료를 노출하면 안 된다.
  expect((await loadProjectInspection('other', { target: 'character', id: 'c' })).result.status).toBe('not_found')
  mock.tables.character_appearances[1].sheet_url = 'http://127.0.0.1/private'
  expect((await loadProjectInspection('p', { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true })).imageUrl).toBeUndefined()
})

it('화면에서 고른 이미지가 이미 교체됐으면 새 그림 대신 상태 변경을 알린다', async () => {
  // 왜: 클릭과 도구 조회 사이에 생성이나 후보 선택이 완료될 수 있다.
  const result = await loadProjectInspection('p', { target: 'character', id: 'c', appearanceKey: 'young', includeImage: true, expectedImageRevision: 'old' } as never)
  expect(result.result.status).toBe('stale_state');expect(result.imageUrl).toBeUndefined()
})
it('과거 설계의 조회 범위와 실행 연결 미확정을 함께 알린다', async () => {
  // 왜: 같은 shot_1 키가 여러 실행에 존재하므로 현재 샷의 생성 실행을 단정하지 않는다.
  const { result } = await loadProjectInspection('p', { target: 'shot', id: 'sh_01_01' })
  expect(result.generation).toMatchObject({ searchScope: 'latest_5_runs_completed_preferred', currentShotRunLink: 'unverified' })
})
