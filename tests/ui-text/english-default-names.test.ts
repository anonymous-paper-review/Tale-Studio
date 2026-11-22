// 영어 화면에서 사용자가 올린 그림체의 기본 이름과 Editor 영상 묶음(zip)의 실패 안내가 한국어 없이 영어로 나오는지 검사한다
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: vi.fn(async () => true) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorMediums: async () => ['2d_anime'] }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { custom_style_anchor: null }, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { mocks.updates.push(patch); return { error: null } } }),
    }),
  },
}))

import { POST } from '@/app/api/produce/style-anchor/route'
import { customStyleLabel } from '@/lib/custom-style-label'
import { failedDownloadsNote } from '@/lib/editor-zip-export'
import { mediaPublicUrl } from '@/lib/storage/media-url'

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/
const source = (file: string) => readFileSync(file, 'utf8')

describe('사용자가 올린 그림체의 기본 이름', () => {
  beforeEach(() => { mocks.updates.length = 0 })

  // 왜: 예전에는 그림체를 이름 없이 저장하면 화면 언어의 기본 이름으로 저장했다(오너 2026-11-10). 그림체 등록 창구는 D6(2026-11-22)로 닫혔다 —
  //   어느 화면 언어에서도 새 그림체 · 새 기본 이름이 저장되지 않는다. 이미 저장된 이름이 보이는 법은 아래 시험이 지킨다.
  it('그림체 등록 창구가 닫혀 영어 · 한국어 화면 어느 쪽에서도 올린 그림체를 새로 저장하지 않는다', async () => {
    const save = (uiLocale: string) => POST(new Request('http://test/api/produce/style-anchor', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-1', imageUrl: mediaPublicUrl('ws-1/proj-1/uploads/look/original.png'), medium: '2d_anime', uiLocale }),
    }))
    expect((await save('en')).status).toBe(410)
    expect((await save('ko')).status).toBe(410)
    expect(mocks.updates).toHaveLength(0)
  })

  // 왜: 이미 "내 레퍼런스"로 저장된 프로젝트가 많다 — 저장값은 두고 보일 때 그 기본 이름만 화면 언어로 바꿔 보인다(리드 2026-11-10 B1).
  it('영어 화면이면 예전에 한국어 기본 이름으로 저장된 그림체도 영어 기본 이름으로 보인다', () => {
    expect(customStyleLabel('내 레퍼런스', 'en')).toBe('My reference')
    expect(customStyleLabel('', 'en')).toBe('My reference')
    expect(customStyleLabel(null, 'en')).toBe('My reference')
    // 한국어 화면에서는 영어 기본 이름도 한국어로, 사용자가 붙인 이름은 어느 화면에서나 그대로다.
    expect(customStyleLabel('My reference', 'ko')).toBe('내 레퍼런스')
    expect(customStyleLabel('수채 느낌', 'en')).toBe('수채 느낌')
    expect(source('src/stores/producer-store.ts')).toContain('customStyleLabel(record.label')
    expect(source('src/features/projects/series-list.ts')).toContain('customStyleLabel(style.label')
  })
})

describe('Editor 영상 묶음의 실패 안내', () => {
  // 왜: 영상 묶음(zip)을 받을 때 자동으로 못 받은 영상 목록 파일(_failed.txt)의 안내가 영어 화면에서도 한국어였다.
  it('영어 화면이면 Editor 영상 묶음 안의 자동 다운로드 실패 안내가 영어로 나온다', () => {
    const note = failedDownloadsNote(['01_shot_1.mp4\thttps://cdn.example/1.mp4\t(HTTP 403)'], 'en')
    expect(note).toContain('01_shot_1.mp4\thttps://cdn.example/1.mp4\t(HTTP 403)')
    expect(note).not.toMatch(HANGUL)
    expect(failedDownloadsNote(['x'], 'ko')).toContain('자동 다운로드에 실패했습니다')
    // 화면 파일(editor/page.tsx)은 건드리지 않고, 묶음을 만드는 쪽이 화면 언어를 읽는다.
    const zip = source('src/lib/editor-zip-export.ts')
    expect(zip).toContain('failedDownloadsNote(failed, ')
    expect(zip).toContain('useLocaleStore.getState().locale')
  })
})
