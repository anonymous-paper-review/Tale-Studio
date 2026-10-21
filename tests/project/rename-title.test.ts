// 프로젝트 제목을 저장하지 못하면 화면 제목을 원래대로 되돌리고 실패를 알린다 (2026-10-21 검토)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/stores/project-store'

const PID = 'project-rename'

beforeEach(() => {
  useProjectStore.setState({ projectId: PID, projectTitle: 'Untitled' })
})
afterEach(() => vi.unstubAllGlobals())

describe('프로젝트 제목 저장', () => {
  it('제목을 저장하면 화면 제목이 바뀐 채로 남고 성공을 알린다', async () => {
    // 왜: 정상 경로 고정.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    expect(await useProjectStore.getState().renameProject('자판기의 밤')).toBe(true)
    expect(useProjectStore.getState().projectTitle).toBe('자판기의 밤')
  })

  it('제목 저장이 실패하면 화면 제목을 원래대로 되돌리고 실패를 알린다', async () => {
    // 왜: 화면에는 새 제목, 저장된 제목은 "제목 없음"으로 갈리면 시작할 때 AI 제목이 붙는다(10/21 검토).
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'db down' }), { status: 500 })))
    expect(await useProjectStore.getState().renameProject('자판기의 밤')).toBe(false)
    expect(useProjectStore.getState().projectTitle).toBe('Untitled')
  })
})
