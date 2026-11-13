// Editor 프로젝트 판의 샷 상태 낱말(생성 중 · 실패 · 대기 중)은 Director 샷 상태와 같은 규칙으로 멈춘 Take 를 본다 — 가장 새 시도가 멈춘 Take 면 대기 중 (오너 2026-11-14 7번 · 검토 a)
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // 편집 저장 구독은 브라우저에서만 붙는다 — load-ends 시험과 같이 window 를 먼저 둔다.
  ;(globalThis as { window?: unknown }).window = globalThis
  return {
    createClient: vi.fn(),
    loadShotsResult: vi.fn(),
    cancelShotsLoad: vi.fn(),
    saveEditorState: vi.fn(),
    loadEditorState: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: mocks.loadShotsResult,
  cancelShotsLoad: mocks.cancelShotsLoad,
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: { getState: () => ({ projectId: 'project-1' }) } }))
vi.mock('@/lib/editor-persistence', () => ({
  deleteAudioBlob: vi.fn(),
  loadEditorState: mocks.loadEditorState,
  saveEditorState: mocks.saveEditorState,
}))

import { useEditorStore } from '@/stores/editor-store'

/** 표마다 답하는 supabase 체인 — select · eq · in · abortSignal 을 받고, 기다리면 그 표의 행을 낸다. */
function table(rows: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    abortSignal: () => chain,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  }
  return chain
}

type Take = { status: string; last: string; at: string; url?: string; stoppedAt?: string; final?: boolean }
const running = (at: string): Take => ({ status: 'generating', last: 'generating', at })
const failed = (at: string): Take => ({ status: 'failed', last: 'failed', at })
const done = (at: string): Take => ({ status: 'completed', last: 'completed', at, url: `https://video.test/${at}.mp4` })

/** 샷 하나(shot-1)의 Take 들을 DB 행으로 두고 Editor 를 열어, 그 샷 클립의 상태를 돌려준다. */
async function statusOf(takes: Take[]): Promise<string | undefined> {
  const clips = takes.map((take, i) => ({
    id: `clip-${i + 1}`, shot_id: 'shot-1', url: take.url ?? null, status: take.status, is_final: take.final ?? false, take_number: i + 1,
    created_at: `2026-11-14T0${i}:00:00Z`, deleted_at: null, thumbnail_url: null,
    last_attempt_status: take.last, last_attempt_at: take.at, last_attempt_job_id: `job-${i + 1}`,
  }))
  const stops = takes.flatMap((take, i) => (take.stoppedAt ? [{ job_id: `job-${i + 1}`, cancelled_at: take.stoppedAt }] : []))
  mocks.loadShotsResult.mockReturnValue(Promise.resolve({ data: [{ shot_id: 'shot-1', scene_id: 'scene-1', shot_type: 'MS', duration_seconds: 5 }], error: null }))
  mocks.createClient.mockReturnValue({ from: (name: string) => table(name === 'director_job_cancellations' ? stops : clips) })
  await useEditorStore.getState().loadData()
  return useEditorStore.getState().videoClips.find((clip) => clip.shotId === 'shot-1')?.status
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  useEditorStore.getState().reset()
})
afterEach(() => { vi.unstubAllGlobals() })

it('가장 새 시도가 멈춘 Take 면 Editor 프로젝트 판의 그 샷은 생성 중도 실패도 아닌 대기 중이다', async () => {
  // 왜: 검토 a(set ef85ae3d 를 보다) — Editor 는 옛 "가장 새 시도"로 골라 멈춘 Take 를 몰랐다. Director 샷 상태는 이 경우 이미지 완료(영상 없음)다.
  //   멈춘 채 도는 Take · 실패 뒤 멈춘 채 도는 Take 는 "생성 중", 멈춘 뒤 실패만 · 실패 뒤 멈추고 늦게 실패는 "실패"로 보였다.
  expect(await statusOf([{ ...running('2026-11-14T00:30:00Z'), stoppedAt: '2026-11-14T00:40:00Z' }])).toBe('pending')
  expect(await statusOf([failed('2026-11-14T00:30:00Z'), { ...running('2026-11-14T01:30:00Z'), stoppedAt: '2026-11-14T01:40:00Z' }])).toBe('pending')
  expect(await statusOf([{ ...failed('2026-11-14T00:50:00Z'), stoppedAt: '2026-11-14T00:40:00Z' }])).toBe('pending')
  expect(await statusOf([failed('2026-11-14T00:30:00Z'), { ...failed('2026-11-14T01:50:00Z'), stoppedAt: '2026-11-14T01:40:00Z' }])).toBe('pending')
})

it('멈춘 Take 는 멈춘 때로 세어, 멈춘 뒤 늦게 끝나도 그 뒤에 시작해 실패한 Take 가 가장 새 시도라 실패다', async () => {
  // 왜: 검토 a S8 — 멈춘 Take 가 05:00 에 늦게 끝나고 04:00 에 시작한 Take 가 실패했으면, Director 는 실패(빨강)인데 Editor 는 대기 중이었다.
  expect(await statusOf([{ ...done('2026-11-14T05:00:00Z'), stoppedAt: '2026-11-14T03:00:00Z' }, failed('2026-11-14T04:00:00Z')])).toBe('failed')
})

it('멈춘 Take 가 없으면 Editor 프로젝트 판의 샷 상태는 지금처럼 완성 · 실패 · 생성 중 · 대기 중이다', async () => {
  // 왜: 정상 경로 고정 — 이번 고침은 멈춘 Take 가 있는 샷만 바꾼다.
  expect(await statusOf([done('2026-11-14T00:30:00Z')])).toBe('completed')
  expect(await statusOf([failed('2026-11-14T00:30:00Z')])).toBe('failed')
  expect(await statusOf([running('2026-11-14T00:30:00Z')])).toBe('generating')
  expect(await statusOf([])).toBe('pending')
})
