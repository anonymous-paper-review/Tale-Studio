// 실사 보기 카드가 만드는 중이면 그림 자리에 Lumi 와 "이미지를 그리고 있어요" · "영상을 만들고 있어요"가 보인다 — 남은 시간은 쓰지 않는다 (시안 D3 406:4931 · R, 오너 8/26)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const ko = (text: string) => translate('ko', text)
const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')

describe('카드 안 만드는 중', () => {
  it('실사 보기 카드가 만드는 중이면 그림 자리에 Lumi 와 "이미지를 그리고 있어요"나 "영상을 만들고 있어요"를 보인다', () => {
    // 왜: 시안 R "카드 안 Lumi 로딩" — 도는 원(스피너) 대신. Lumi 는 그림(still)이라 카드가 여럿이어도 WebGL 을 열지 않는다(design.md §13.5).
    expect(ko('Drawing the image')).toBe('이미지를 그리고 있어요')
    expect(ko('Making the video')).toBe('영상을 만들고 있어요')
    expect(grid()).toContain('<Lumi persona={STAGE_PERSONA.director} state="loading" size="s" still />')
    expect(grid()).toContain("t('Drawing the image')")
  })

  it('카드 안 만드는 중 글에는 남은 시간이나 % 를 쓰지 않는다', () => {
    // 왜: 오너 8/26 "경과 초를 보이지 않는다" · 결정 페이지 추천(만드는 중에는 끝난 수/전체만).
    const block = grid().match(/gap-2\.5 bg-side p-3 text-center">[\s\S]*?<\/div>/)?.[0] ?? ''
    expect(block).toContain('Drawing the image')
    expect(block).not.toMatch(/seconds|minutes|%/)
  })
})
