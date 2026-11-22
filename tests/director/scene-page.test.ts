// Director 화면이 씬별 보기에서 상세 열기 · 빈 씬 · 옛 보기 값 · 첫 안내를 어떻게 다루는지 검사한다 (오너 D2~D5 · D8 2026-11-22, 혼자 정한 것 h16 · h18 · h22 · h23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { KO } from '@/lib/i18n/messages-ko'

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')

describe('씬별 보기의 화면 배선', () => {
  it('[바꾸기] · ⤢ 로 다른 씬 샷의 상세를 열면 그 씬으로 가서 그 카드를 가운데에 둔다', () => {
    // 왜: 상세는 왼쪽 패널에 열리는데 캔버스가 다른 씬이면 그 카드가 안 보인다(혼자 정한 것 h16). 상세를 여는 길은 모두 사람의 누름이라 보던 씬을 빼앗지 않는다(#c4).
    const effect = page.slice(page.indexOf('const detailNodeId = useDirectorCanvasStore((s) => s.detailNodeId)'), page.indexOf('[detailNodeId, goToScene]'))
    expect(effect).toMatch(/const owner = cardSceneOf\(byId\.get\(detailNodeId\), byId\)/)
    expect(effect).toMatch(/if \(owner && owner !== sceneNodeIdRef\.current\) goToScene\(owner, detailNodeId\)/)
  })

  it('고른 씬에 샷이 없으면 캔버스 가운데에 "이 씬에는 아직 샷이 없어요" 한 줄을 보인다', () => {
    // 왜: 빈 판만 보이면 고장으로 보인다(혼자 정한 것 h18). 영어 화면은 영어로.
    expect(page).toMatch(/\{nodes\.length > 0 && !sceneHasShots && <SceneEmptyNote \/>\}/)
    expect(page).toMatch(/const sceneHasShots = !sceneNodeId \|\| view\.nodes\.some\(\(n\) => isShotData\(n\.data\) && n\.data\.parentSceneNodeId === sceneNodeId\)/)
    expect(KO['This scene has no shots yet.']).toBe('이 씬에는 아직 샷이 없어요')
  })

  it('이 브라우저에 옛 스토리보드 보기가 기억돼 있어도 Director 는 노드 보기로 연다', () => {
    // 왜: 옛 값('storyboard')이 남아 있으면 왼쪽 상세 패널이 열리지 않는다(DirectorDetailPanel 은 노드 보기에서만, 혼자 정한 것 h22).
    expect(page).toMatch(/useEffect\(\(\) => \{\s*if \(viewMode !== 'node'\) setViewMode\('node'\)\s*\}, \[viewMode, setViewMode\]\)/)
  })

  it('첫 사용법 안내는 위 씬 단추로 씬을 고르는 법을 알려 주고, 옛 보기 값을 노드로 맞춘 뒤에 띄운다', () => {
    // 왜: 새 단추를 알린다(혼자 정한 것 h23). 스토리보드 보기 안내는 보기와 함께 없앴다(오너 D2~D5).
    expect(page).toContain("'· Pick a scene with the scene buttons at the top to see only its cards\\n'")
    expect(page).not.toContain('This is the storyboard. See every shot image per scene at a glance.')
    expect(page).toMatch(/if \(viewMode !== 'node'\) return\s*const key = 'nodeGuide'/)
    const guide = Object.keys(KO).find((key) => key.startsWith('This is The Set, where scenes'))!
    expect(guide).toContain('Pick a scene with the scene buttons at the top to see only its cards')
    expect(KO[guide]).toContain('위 씬 단추로 씬을 고르면 그 씬 카드만 보여요')
  })
})
