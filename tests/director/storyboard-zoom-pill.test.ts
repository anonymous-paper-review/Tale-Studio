// 스토리보드 축척은 노드형과 같은 "− 100% + ⤢" 알약이고, Director 는 스토리보드 격자를 그리지 않아 이 알약을 쓰지 않는다 (시안 D1 406:3717, 리드 11/14 화면 확인 3 · 오너 D2~D5 2026-11-22)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StoryboardZoomPill, storyboardZoomPercent, storyboardZoomStep } from '@/features/director/storyboard-zoom-pill'

const source = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')
const pill = (zoomLevel: number) => renderToStaticMarkup(createElement(StoryboardZoomPill, { zoomLevel, onZoomLevelChange: () => {} }))

describe('스토리보드 축척 알약', () => {
  it('스토리보드 축척은 "− 100% + ⤢" 알약이고 기본 크기(한 줄 3장)가 100%다', () => {
    // 왜: 노드형 축척 알약(v3 D1 "− 100% + ⤢")과 같은 생김새 · 같은 자리. 밀대(slider)는 시안에 없다.
    expect(storyboardZoomPercent(4)).toBe(100)
    expect(storyboardZoomPercent(5)).toBe(150)
    expect(storyboardZoomPercent(6)).toBe(300)
    expect(storyboardZoomPercent(3)).toBe(75)
    expect(storyboardZoomPercent(1)).toBe(50)
    const html = pill(4)
    expect(html).toContain('100%')
    expect(html).toContain('aria-label="Zoom out (more columns)"')
    expect(html).toContain('aria-label="Zoom in (fewer columns)"')
    expect(html).toContain('aria-label="Back to the default size"')
    expect(html).not.toContain('role="slider"')
  })

  it('가장 작게면 − 단추가, 가장 크게면 + 단추가 꺼진다', () => {
    // 왜: 더 갈 수 없는 쪽 단추를 눌러도 아무 일이 없으면 고장으로 보인다(노드형 알약과 같은 규칙).
    expect(pill(1)).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Zoom out \(more columns\)"/)
    expect(pill(6)).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Zoom in \(fewer columns\)"/)
    expect(pill(4)).not.toContain('disabled=""')
  })

  it('−/+ 는 한 단계씩, ⤢ 는 기본 크기(한 줄 3장)로 돌아간다', () => {
    // 왜: 스토리보드에는 "화면에 맞추기"가 뜻이 없어 ⤢ 를 기본 크기로 쓴다.
    expect(storyboardZoomStep(4, 'out')).toBe(3)
    expect(storyboardZoomStep(4, 'in')).toBe(5)
    expect(storyboardZoomStep(1, 'out')).toBe(1)
    expect(storyboardZoomStep(6, 'in')).toBe(6)
    expect(storyboardZoomStep(6, 'reset')).toBe(4)
  })

  it('한국어 화면에서 ⤢ 는 "기본 크기로"라고 알린다', () => {
    // 왜: 새 글은 두 언어 모두.
    expect(source('src/lib/i18n/messages-ko.ts')).toContain("'Back to the default size': '기본 크기로'")
  })

  it('Director 는 스토리보드 격자를 그리지 않아 이 알약을 쓰지 않고, 노드 캔버스는 왼쪽 아래 확대 · 축소 알약을 쓴다', () => {
    // 왜: 오너 D2~D5 — Director 의 스토리보드 보기를 없앴다(러프 · 실사 격자는 새 Camera 탭). 알약 부품은 Camera 가 다시 쓸 수 있어 남긴다.
    const page = source('src/app/studio/director/page.tsx')
    expect(page).not.toContain('<StoryboardZoomPill')
    expect(page).not.toContain('<StoryboardGridView')
    expect(page).toMatch(/<CanvasZoomPill onPersonMove=/)
  })
})
