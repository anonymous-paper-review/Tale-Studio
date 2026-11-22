// 러프 세 장(시작 · 연출 · 끝) 칸이 그림을 다시 읽는 동안에도 자리를 지키는지 검사한다(2026-11-22 fb-end · 리드: 저장 직후 연출 장 칸이 접혀 비어 보였다)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RoughFramesStill, rememberStillFrameAspect, stillFrameAspect } from '@/features/writer/rough-frames-still'

const panel = (generatedAt: number) => ({
  url: 'https://media.test/r/start.png',
  status: 'completed' as const,
  errorMessage: null,
  generatedAt,
  frames: { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction.png', end: 'https://media.test/r/end.png' },
})
const render = (shotId: string, generatedAt: number) =>
  renderToStaticMarkup(createElement(RoughFramesStill, { projectId: 'p1', shotId, panel: panel(generatedAt), onRegenerated: () => {} }))

describe('러프 세 장 칸', () => {
  // 왜: 저장 · 다시 그리기 뒤 세 장 줄은 새 주소로 다시 놓인다. 그림 칸에 비율이 없어 그림이 오기 전 높이가 0 이 되었고,
  //   저장 직후 끝 장 물음 창 뒤에서 연출 장 칸이 접혀 비어 보였다(2026-11-22 스크린샷). 혼자 정한 것 · 쉬움.
  it('그림을 다시 읽는 동안에도 세 장 칸은 자리를 지킨다', () => {
    // 처음(잰 적 없음)에는 16:9 로 자리를 잡는다 — 그림이 오기 전에도 칸 높이가 있다.
    expect(stillFrameAspect('p1:sh_new')).toBeCloseTo(16 / 9)
    const first = render('sh_new', 100)
    expect(first.match(/aspect-ratio:1\.77/g)?.length).toBe(3)
    // 한 번 잰 비율(세로 칸 255×447)은 그 샷에 남는다 — 저장 뒤 다시 놓인 줄도 그림이 오기 전부터 같은 자리를 지킨다.
    rememberStillFrameAspect('p1:sh_tall', 255, 447)
    const again = render('sh_tall', 200)
    expect(again.match(/aspect-ratio:0\.570/g)?.length).toBe(3)
    // 다른 샷의 비율에는 번지지 않는다. 0 이나 잘못된 크기는 기억하지 않는다.
    expect(stillFrameAspect('p1:sh_other')).toBeCloseTo(16 / 9)
    rememberStillFrameAspect('p1:sh_zero', 0, 0)
    expect(stillFrameAspect('p1:sh_zero')).toBeCloseTo(16 / 9)
  })
})
