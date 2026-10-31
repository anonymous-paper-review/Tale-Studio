// 대사(Dialogue) 탭에서 샷을 누르면 그 샷 고치기 팝업이 열려 대사를 고칠 수 있는지 검사한다
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  writer: {
    sceneManifest: {
      characters: [{ characterId: 'min_ho', name: '민호' }],
      locations: [],
      scenes: [{ sceneId: 'sc_01', location: '복도', mood: '' }],
    },
    shots: [
      { shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', delivery: '' }] },
      { shotId: 'sh_01_02', sceneId: 'sc_01', shotType: 'CU', actionDescription: '동전이 떨어진다.', dialogueLines: [] },
    ],
    loadProject: vi.fn(),
  },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'p' }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/hooks/use-guarded-action', () => ({ useGuardedAction: () => ({ run: vi.fn(), locked: false }) }))
vi.mock('@/features/writer/writer-header', () => ({ WriterHeader: ({ description }: { description: string }) => description }))

import { DialogueView } from '@/features/writer/dialogue-view'
import { useBoardUiStore } from '@/features/writer/board-ui-store'

describe('대사 탭에서 고치기', () => {
  // 왜: 2026-10-31 오너 전달 피드백 "다이얼로그(Dialogue) 수정 기능이 죽어 있다" — 대사 탭은 보기 전용이라 줄을 눌러도 아무 일이 없었다.
  //   대사를 고치는 곳은 샷 고치기 팝업(대사 칸)이라, 탭에서 샷을 누르면 그 팝업을 연다(새 편집 화면을 따로 두지 않는다).
  it('대사 탭에서 샷(스토리 · 대사 줄)을 누르면 그 샷 고치기 팝업이 열려 대사를 고칠 수 있다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html.match(/role="button"[^>]*data-shot-id="sh_01_0[12]"|data-shot-id="sh_01_0[12]"[^>]*role="button"/g)?.length).toBe(2)

    const view = readFileSync('src/features/writer/dialogue-view.tsx', 'utf8')
    expect(view).toMatch(/onClick=\{\(\) => openShotEdit\(shot\.shotId\)\}/)
    expect(view).toMatch(/useBoardUiStore\.getState\(\)\.setShotEditId\(shotId\)/)
    const board = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
    expect(board).toContain('const detailShotId = useBoardUiStore((s) => s.shotEditId)')

    useBoardUiStore.getState().setShotEditId('sh_01_01')
    expect(useBoardUiStore.getState().shotEditId).toBe('sh_01_01')
    useBoardUiStore.getState().setShotEditId(null)
  })

  // 왜: 누를 수 있다는 것을 탭의 안내 줄이 알려 준다 — 화면 문구가 오너의 검수 표면이다.
  it('대사 탭 안내 줄은 "샷을 누르면 대사를 고칠 수 있어요"를 함께 알려 준다', () => {
    const html = renderToStaticMarkup(createElement(DialogueView))
    expect(html).toContain('샷을 누르면 대사를 고칠 수 있어요')
  })
})
