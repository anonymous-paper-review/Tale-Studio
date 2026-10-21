// 시작 화면 머리에서 프로젝트 제목을 눌러 바로 정한다 · 비우거나 그대로면 바꾸지 않는다 (2026-10-21 오너 "프로젝트 제목을 처음에 설정 불가능")
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { ProjectTitleField } from '@/features/entry/project-title-field'
import { nextProjectTitle, titleDraftOf } from '@/lib/project/title'

describe('시작 화면의 프로젝트 제목', () => {
  it('시작 화면 머리의 제목은 눌러서 고칠 수 있다', () => {
    // 왜: [새 프로젝트]는 제목 없이 만들어져 시작 화면에서 제목을 정할 곳이 없었다(사이드바 홈 버튼 위 숨은 연필뿐).
    const html = renderToStaticMarkup(createElement(ProjectTitleField, { title: '자판기의 밤', onRename: () => {} }))
    expect(html).toContain('자판기의 밤')
    expect(html).toContain('aria-label="프로젝트 이름 변경"')
    const workspace = readFileSync(path.join(process.cwd(), 'src/features/entry/entry-workspace.tsx'), 'utf8')
    expect(workspace).toMatch(/<ProjectTitleField[^>]*onRename=\{[^}]*renameProject/)
  })

  it('제목 없는 프로젝트는 "제목 없음"을 보이고, 고칠 때 빈 칸에서 시작한다', () => {
    // 왜: "Untitled"를 지우고 써야 하면 번거롭다 — 빈 칸에 바로 쓴다.
    expect(renderToStaticMarkup(createElement(ProjectTitleField, { title: 'Untitled', onRename: () => {} }))).toContain('제목 없음')
    expect(titleDraftOf('Untitled')).toBe('')
    expect(titleDraftOf('자판기의 밤')).toBe('자판기의 밤')
  })

  it('제목을 고치면 앞뒤 빈칸을 뺀 제목으로 바꾸고, 비우거나 그대로면 바꾸지 않는다', () => {
    // 왜: 실수로 지운 채 빠져나가도 제목이 사라지지 않는다.
    expect(nextProjectTitle('  자판기의 밤  ', 'Untitled')).toBe('자판기의 밤')
    expect(nextProjectTitle('   ', '자판기의 밤')).toBeNull()
    expect(nextProjectTitle('자판기의 밤', '자판기의 밤')).toBeNull()
  })
})
