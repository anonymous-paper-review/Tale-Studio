// AI가 일하는 동안 사이드바의 아래 단추들과 잠금 화면 없이 도는 AI 작업에서도 사이드바가 눌리지 않는지 검사한다 (2026-10-27 오너 재확인)
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { aiBusyNow, holdAiBusy, railNavBlocked, useAiBusyStore } from '@/stores/ai-busy-store'

const read = (file: string) => readFileSync(file, 'utf8')
const sidebar = read('src/components/layout/sidebar.tsx')

afterEach(() => {
  useAiBusyStore.setState({ tokens: [] })
})

describe('AI가 일하는 동안 사이드바 전체 잠금', () => {
  it('AI가 일하는 동안에는 왼쪽 아래 Take · 공유 · 내보내기 · 도움말 · 프로필 단추도 눌리지 않는다', () => {
    // 왜: 2026-10-27 오너 재확인 "AI 작업 중에도 사이드바가 눌림" — 단계 단추만 막아 아래 단추로 계정 화면으로 나가거나
    //   프로필 메뉴에서 지금 프로젝트를 지우거나 다른 프로젝트로 옮길 수 있었다.
    const release = holdAiBusy('long-job')
    expect(railNavBlocked({ to: 'footer', aiBusy: aiBusyNow() })).toBe(true)
    release()
    expect(railNavBlocked({ to: 'footer', aiBusy: aiBusyNow() })).toBe(false)
    // 아래 단추 묶음은 AI 가 일하는 동안 통째로 inert(누르기 · 키보드 포커스 모두 막힘).
    expect(sidebar).toMatch(/data-testid="sidebar-footer"[\s\S]{0,200}inert=\{footerBlocked/)
  })

  it('AI가 일하는 동안에는 Artist 단계 단추의 다시 시도도 눌리지 않는다', () => {
    // 왜: 그림 그리는 잠금 화면이 떠 있는데 지금 단계(Artist) 단추의 "다시 시도"는 눌려 그림 요청을 또 보낼 수 있었다.
    expect(sidebar).toMatch(/if \(isArtistRetryable && !aiBusy\) void retryArtistDrafts\(\)/)
  })

  it('잠금 화면 없이 도는 AI 작업도 일하는 동안 단계 이동을 막는다', () => {
    // 왜: 스타일 창 [만들기] · 순한 문장으로 다시 그리기 · 산문 쓰기 시작 · 산문 진행 상태를 읽는 순간 · 예전 흐름의 진행 화면은
    //   잠금 화면(AiBusyOverlay)을 띄우지 않아 Alt 단축키로 다른 단계로 옮겨 갈 수 있었다.
    expect(read('src/features/artist-room/style-make-dialog.tsx')).toMatch(/useAiBusyHold\(making\)/)
    expect(read('src/features/artist/character-view-dialog.tsx')).toMatch(/useAiBusyHold\(open && safeRetry\.locked\)/)
    expect(read('src/features/artist/world-view-dialog.tsx')).toMatch(/useAiBusyHold\(open && safeRetry\.locked\)/)
    expect(read('src/features/prose/prose-document.tsx')).toMatch(/useAiBusyHold\(starting\)/)
    expect(read('src/features/prose/prose-workspace.tsx')).toMatch(/useAiBusyHold\(!!prose\.busy\)/)
    expect(read('src/app/studio/artist/page.tsx')).toMatch(/useAiBusyHold\(legacyProgressBusy\)/)
  })

  it('AI가 일하는 동안에도 홈 단추로 프로젝트 목록에는 갈 수 있다', () => {
    // 왜: 정상 경로 고정 — 오래 걸리는 작업 중에도 빠져나갈 길은 남긴다(디자이너 QA 1차 #07).
    holdAiBusy('long-job')
    expect(railNavBlocked({ to: 'projects', aiBusy: aiBusyNow() })).toBe(false)
  })
})
