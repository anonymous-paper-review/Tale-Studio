// Storyboard 보드 제목 옆 숫자 · 샷 이름 · Director 넘김 창 내용 · 첫 안내 문구를 검사한다
import { describe, expect, it } from 'vitest'
import {
  boardShots,
  boardStats,
  boardStatsLabel,
  directorConfirmView,
  directorHandoffSummary,
  storyboardBriefing,
} from '@/lib/writer/board-summary'
import type { RoughStoryboardImage } from '@/types'

interface TestShot {
  shotId: string
  sceneId: string
  durationSeconds: number
  actionDescription: string
  roughStoryboard: RoughStoryboardImage | null
}

const drawn = (id: string): RoughStoryboardImage => ({ url: `https://example.test/${id}.png`, status: 'completed', errorMessage: null, generatedAt: 1 })
const failedPanel = (): RoughStoryboardImage => ({ url: '', status: 'failed', errorMessage: '거절됨', generatedAt: 1 })
const manifest = { scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }] }

function shot(shotId: string, sceneId: string, durationSeconds: number, rough: RoughStoryboardImage | null, action = '문을 열고 밖을 본다'): TestShot {
  return { shotId, sceneId, durationSeconds, actionDescription: action, roughStoryboard: rough }
}

function board(): TestShot[] {
  return [
    shot('a1', 'sc_a', 2.5, drawn('a1')),
    shot('b1', 'sc_b', 4.4, drawn('b1')),
    shot('a2', 'sc_a', 3, drawn('a2')),
  ]
}

describe('Storyboard 제목 옆 숫자', () => {
  // 왜: 러닝타임은 목표가 아니라 지표다(프로토타입 S1) — 제목 옆에 씬 · 샷 수와 샷 길이를 더한 값만 작게 보여 준다. 정상 경로 고정.
  it('보드를 열면 제목 옆에 씬 수 · 샷 수 · 샷 길이의 합을 정수 초로 보여 준다', () => {
    expect(boardStatsLabel(boardStats(manifest, board()), 'ko')).toBe('씬 2 · 샷 3 · 10초')
    expect(boardStatsLabel(boardStats(manifest, board()), 'en')).toBe('Scenes 2 · Shots 3 · 10s')
  })

  // 왜: 사용자가 샷 길이를 고치거나 샷을 더하면 store 의 샷이 바뀐다 — 숫자는 저장값이 아니라 그때의 샷에서 다시 센다.
  it('샷 길이를 고치거나 샷을 더하면 제목 옆 숫자도 같이 바뀐다', () => {
    const edited = board().map((s) => (s.shotId === 'a2' ? { ...s, durationSeconds: 8 } : s))
    expect(boardStats(manifest, edited)).toEqual({ scenes: 2, shots: 3, seconds: 15 })
    const added = [...edited, shot('b2', 'sc_b', 5, null)]
    expect(boardStats(manifest, added)).toEqual({ scenes: 2, shots: 4, seconds: 20 })
  })

  // 왜: 씬 목록에 없는 샷은 보드에 그려지지 않는다 — 보이지 않는 샷이 숫자에 섞이면 화면과 숫자가 어긋난다.
  it('씬 목록에 없는 샷은 보드에 없으니 숫자에 넣지 않는다', () => {
    const orphan = [...board(), shot('x1', 'sc_gone', 9, null)]
    expect(boardStats(manifest, orphan)).toEqual({ scenes: 2, shots: 3, seconds: 10 })
  })
})

describe('보드의 샷 이름', () => {
  // 왜: 넘김 창이 말하는 샷을 사용자가 보드 카드에서 찾을 수 있어야 한다 — 카드와 같은 "Scene N · Shot M"(샷 번호는 씬마다 다시 세지 않는다, #shot-global-no).
  it('샷 이름은 보드 카드처럼 씬 순서대로 이어 센 번호로 붙는다', () => {
    expect(boardShots(manifest, board()).map((entry) => entry.label)).toEqual([
      'Scene 1 · Shot 1',
      'Scene 1 · Shot 2',
      'Scene 2 · Shot 3',
    ])
  })
})

describe('Director 넘김 확인 창', () => {
  // 왜: 넘기기 전에 무엇이 얼마나 넘어가는지 보여 준다(프로토타입 S7). 러프가 다 있으면 빠지는 샷 안내는 필요 없다. 정상 경로 고정.
  it('러프가 다 있으면 넘김 창은 넘어가는 샷 수 · 러닝타임만 보여 주고 빠지는 샷 안내는 없다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko')
    expect(view.title).toBe('Director로 넘길까요?')
    expect(view.rows).toEqual([
      { label: '넘어가는 것', value: '샷 3 · 러프 · 인물 · 배경 그림' },
      { label: '러닝타임', value: '10초' },
      { label: '다음', value: 'Director가 러프와 Artist 그림을 참조해 컷을 만들어요' },
    ])
    expect(view.warning).toBeNull()
    expect(view.canDrawRemaining).toBe(false)
  })

  // 왜: 러프가 없는 샷은 Director 가 만들지 않고 건너뛴다(missing_rough_storyboard) — 넘기기 전에 어느 샷이 빠지는지 알리고 그 자리에서 그릴 수 있게 한다.
  it('러프가 없는 샷이 있으면 넘김 창이 그 샷들이 이번에 빠진다고 알리고 [남은 컷 그리기]를 같이 둔다', () => {
    const shots = board().map((s) => (s.shotId === 'a2' ? { ...s, roughStoryboard: null } : s.shotId === 'b1' ? { ...s, roughStoryboard: failedPanel() } : s))
    const summary = directorHandoffSummary(manifest, shots)
    expect(summary.missing.map((m) => m.label)).toEqual(['Scene 1 · Shot 2', 'Scene 2 · Shot 3'])
    const view = directorConfirmView(summary, 'ko')
    expect(view.warning).toBe('러프가 없는 Scene 1 · Shot 2, Scene 2 · Shot 3은(는) 이번에 빠져요.')
    expect(view.canDrawRemaining).toBe(true)
  })

  // 왜(혼자 정한 것): 빠지는 샷은 Director 에 가지 않으니 넘어가는 러닝타임에서도 뺀다 — 헤더 숫자(보드 전체)와 다를 수 있다.
  it('러프가 없는 샷이 있으면 넘어가는 샷 수와 러닝타임에서 그 샷을 뺀다', () => {
    const shots = board().map((s) => (s.shotId === 'b1' ? { ...s, roughStoryboard: null } : s))
    const view = directorConfirmView(directorHandoffSummary(manifest, shots), 'ko')
    expect(view.rows[0]).toEqual({ label: '넘어가는 것', value: '샷 2 · 러프 · 인물 · 배경 그림' })
    expect(view.rows[1]).toEqual({ label: '러닝타임', value: '6초' })
  })

  // 왜(혼자 정한 것): 스토리(액션)가 빈 샷은 서버가 그리지 않는다(no_info) — 누를 수 있는데 아무 일도 없는 버튼을 두지 않는다.
  it('러프가 없는 샷이 모두 스토리가 비어 그릴 수 없으면 [남은 컷 그리기]를 두지 않는다', () => {
    const shots = board().map((s) => (s.shotId === 'a2' ? { ...s, roughStoryboard: null, actionDescription: '  ' } : s))
    const view = directorConfirmView(directorHandoffSummary(manifest, shots), 'ko')
    expect(view.warning).toBe('러프가 없는 Scene 1 · Shot 2은(는) 이번에 빠져요.')
    expect(view.canDrawRemaining).toBe(false)
  })

  // 왜: 화면에 막 들어온 그림(보드의 임시 표시)을 넘김 창이 놓치면, 다 그린 샷을 빠진다고 잘못 알린다.
  it('보드가 막 받은 그림이 있으면 그 그림을 러프로 센다', () => {
    const shots = board().map((s) => (s.shotId === 'a2' ? { ...s, roughStoryboard: null } : s))
    const summary = directorHandoffSummary(manifest, shots, (s) => (s.shotId === 'a2' ? drawn('a2') : s.roughStoryboard))
    expect(summary.missing).toEqual([])
    expect(summary.movingShots).toBe(3)
  })
})

describe('보드 첫 안내', () => {
  // 왜: 카드를 Ctrl/Cmd 로 눌러 채팅에 붙이는 여러 샷 선택은 없앴다(프로토타입 S1 "여러 샷 선택" 제거) — 없는 조작을 안내하면 안 된다.
  it('보드 첫 안내는 Ctrl·Cmd+클릭으로 카드를 붙이는 방법을 말하지 않는다', () => {
    const ko = storyboardBriefing('ko', { sceneCount: 3, shotCount: 8 })
    const en = storyboardBriefing('en', { sceneCount: 3, shotCount: 8 })
    expect(ko).toContain('씬 3개, 샷 8개')
    expect(ko).not.toMatch(/Ctrl|Cmd|⌘|클릭/)
    expect(en).toContain('3 scenes, 8 shots')
    expect(en).not.toMatch(/Ctrl|Cmd|⌘|click/i)
  })
})
