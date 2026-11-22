// Camera 화면의 [내보내기 → 이 단계]가 Director 와 같은 실사 그림 · 영상 묶음을 내보내는지 검사한다 (오너 2026-11-22 D2~D5)
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/export', () => ({ errorMessage: (error: unknown) => String(error), exportProject: vi.fn(), exportStage: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve(), loadShotsResult: () => Promise.resolve({ data: [], error: null }) }))
vi.mock('@/stores/asset-storage-store', () => ({ useAssetStorageStore: { getState: () => ({}) } }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: { getState: () => ({ shots: [] }) } }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: { getState: () => ({ nodes: [] }) } }))

import { resolveExportStage } from '@/components/export-menu'

describe('Camera 화면 내보내기', () => {
  it('Camera 화면에서 이 단계 내보내기를 고르면 Director 와 같은 실사 그림 · 영상 묶음을 내보낸다', () => {
    // 왜(혼자 정한 것): Camera 와 Director 는 같은 샷의 실사 그림 · 영상을 본다 — Camera 에서 "이 단계"가 비어 있으면 내보낼 것이 없다고 나온다.
    expect(resolveExportStage('camera')).toBe('director')
    expect(resolveExportStage('director')).toBe('director')
  })
})
