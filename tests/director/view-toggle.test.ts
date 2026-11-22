// Director 에는 보기 토글이 없고 그 자리에 씬 단추가 있으며, 씬을 바꾸면 그 씬 첫 샷이 첫 화면 자리로 짧게 옮겨 온다 (오너 D2~D5 · D8 2026-11-22 — 예전: 시안 D1 406:3717 "스토리보드 | 노드" 토글, 리드 11/14 화면 확인 1)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'src/app/studio/director/page.tsx'), 'utf8')

describe('보기 토글 자리', () => {
  it('Director 에는 보기 토글이 없고 그 자리(툴바 맨 왼쪽)에 씬 단추가 있다', () => {
    // 왜: 오너 D2~D5 "director의 storyboard 뷰를 없애고" · D8 "앞에서 없앤 Storyboard / Node 버튼 위치에 넣어줘". 러프 · 실사 격자는 새 Camera 탭이 맡는다.
    expect(page).not.toContain('<TabsTrigger value="storyboard"')
    expect(page).not.toContain('<TabsTrigger value="node"')
    expect(page).not.toContain('<StoryboardGridView')
    const scenes = page.indexOf('<SceneButtons')
    expect(scenes).toBeGreaterThan(-1)
    expect(scenes).toBeLessThan(page.indexOf("{t('The Set')}"))
  })

  it('씬을 바꾸면 그 씬 첫 샷이 첫 화면 자리로 짧게 옮겨 온다', () => {
    // 왜: 씬마다 카드가 캔버스의 다른 자리에 있다 — 화면을 그대로 두면 새 씬 카드가 화면 밖이다(혼자 정한 것 h5). 옛 보기 전환 미끄러짐은 보기와 함께 없앴다.
    expect(page).not.toContain('setViewSlide(')
    expect(page).toMatch(/const target = focus \? cardViewport\(focus, paneSize\) : firstEntryViewport\(st\.nodes, paneSize, sceneNodeId\)/)
    expect(page).toMatch(/if \(target\) void applyViewport\(target, \{ duration: 300 \}\)/)
  })
})
