// AI가 일하는 동안 사이드바의 아래 단추들과 잠금 화면 없이 도는 AI 작업에서도 사이드바가 눌리지 않는지 검사한다 (2026-10-27 오너 재확인)
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { aiBusyNow, holdAiBusy, railNavBlocked, useAiBusyStore } from '@/stores/ai-busy-store'
import { legacyProgressHolds } from '@/lib/artist/breakdown'

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

  it('예전 흐름의 진행 화면은 Writer 실행이 정말 도는 동안만 사이드바를 막는다', () => {
    // 왜: 진행 상태를 읽기 전(새로고침 직후)에도 막아 사이드바가 깜빡였고, 씬 확인을 기다리는 동안에도 막아 Producer 로 가서
    //   확인할 길이 없었다(2026-10-27 검토 지적). 멈췄거나 다 만든 뒤에도 막지 않는다.
    const running = { started: true, pipeline_completed: false, pipeline_failed: false, current_stage: 'shots', current_status: 'running' }
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: running })).toBe(true)
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: null })).toBe(false)
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: { ...running, current_status: 'awaiting_confirmation' } })).toBe(false)
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: { ...running, current_status: 'awaiting_artist' } })).toBe(false)
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: { ...running, pipeline_failed: true } })).toBe(false)
    expect(legacyProgressHolds({ gateOpen: false, phase: 'done', status: { ...running, pipeline_completed: true } })).toBe(false)
    expect(legacyProgressHolds({ gateOpen: true, phase: 'done', status: running })).toBe(false)
    expect(read('src/app/studio/artist/page.tsx')).toMatch(/const legacyProgressBusy = legacyProgressHolds\(\{ gateOpen, phase, status: writerStatus \}\)/)
  })

  it('AI가 일하는 동안 막힌 아래 단추 묶음에 마우스를 올리면 왜 막혔는지 안내와 금지 커서가 보인다', () => {
    // 왜: 눌리지 않는 묶음(inert) 안쪽에는 마우스가 닿지 않아 그 묶음에 단 안내 · 커서가 한 번도 보이지 않았다(2026-10-27 검토 지적) —
    //   안내와 커서는 막지 않는 바깥 묶음에 둔다.
    expect(sidebar).toMatch(/footerBlocked && 'cursor-not-allowed'\)\}\s+title=\{footerBlocked \? t\('AI is working\. You can move once it finishes\.'\) : undefined\}\s*>\s*<div[\s\S]{0,160}data-testid="sidebar-footer"\s+inert=\{footerBlocked/)
  })
})
