// AI가 일하는 잠금 화면이 떠 있는 동안 왼쪽 레일로 다른 단계로 옮겨 가지 않고, 끝나면 다시 옮겨 갈 수 있는지 검사한다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { aiBusyHolds, aiBusyNow, holdAiBusy, railNavBlocked, useAiBusyStore } from '@/stores/ai-busy-store'

const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
const overlay = readFileSync('src/components/ai-busy-overlay.tsx', 'utf8')
const entryWorkspace = readFileSync('src/features/entry/entry-workspace.tsx', 'utf8')

afterEach(() => {
  useAiBusyStore.setState({ tokens: [] })
})

describe('AI가 일하는 동안 단계 이동 잠금', () => {
  it('AI가 일하는 잠금 화면이 떠 있는 동안에는 왼쪽 단계 단추와 단축키로 다른 단계로 옮겨 가지 않는다', () => {
    // 왜: 산문 초안을 쓰는 중에 사이드바 Writer를 누르면 넘어가서 잠금 없이 '산문 쓰기'가 열려 같은 산문을 두 번 쓰게 할 수 있었다(디자이너 QA 1차 #07).
    expect(aiBusyHolds({ open: true })).toBe(true)
    const release = holdAiBusy('prose-draft')
    expect(aiBusyNow()).toBe(true)
    expect(railNavBlocked({ to: 'stage', locked: false, aiBusy: aiBusyNow() })).toBe(true)
    // 잠금 화면은 떠 있는 동안 표를 올리고, 단추 · Alt 단축키가 함께 타는 이동 함수(goToStage)가 그 표를 본다.
    expect(overlay).toMatch(/holdAiBusy\(/)
    expect(sidebar).toMatch(/const goToStage = useCallback\([\s\S]*?railNavBlocked\(\{ to: 'stage'/)
    release()
  })

  it('AI 작업이 끝나거나 실패 안내로 바뀌면 다시 단계를 옮겨 갈 수 있다', () => {
    // 왜: 실패한 채 잠금이 남으면 화면에 갇힌다(디자이너 QA 1차 #07).
    expect(aiBusyHolds({ open: false })).toBe(false)
    expect(aiBusyHolds({ open: true, busy: false })).toBe(false)
    const first = holdAiBusy('prose-draft')
    const second = holdAiBusy('rough-board')
    first()
    // 다른 잠금 화면이 아직 일하는 동안은 그대로 막는다.
    expect(railNavBlocked({ to: 'stage', locked: false, aiBusy: aiBusyNow() })).toBe(true)
    second()
    expect(aiBusyNow()).toBe(false)
    expect(railNavBlocked({ to: 'stage', locked: false, aiBusy: aiBusyNow() })).toBe(false)
    // 시작 화면의 산문 초안 잠금도 실패하면 실패 안내(busy=false)로 바뀐다.
    expect(entryWorkspace).toMatch(/busy=\{!failed\}/)
  })

  it('AI가 일하는 동안에도 홈 단추로 프로젝트 목록에는 갈 수 있다', () => {
    // 왜: 오래 걸리는 작업 중에도 빠져나갈 길은 남긴다(생성은 서버에서 이어진다, 디자이너 QA 1차 #07).
    holdAiBusy('long-job')
    expect(railNavBlocked({ to: 'projects', aiBusy: aiBusyNow() })).toBe(false)
    expect(sidebar).toMatch(/railNavBlocked\(\{ to: 'projects'/)
  })
})
