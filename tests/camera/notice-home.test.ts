// 실사 그림 · 영상의 알림 · 진행 표시 · 레일 배지가 Cinema(또는 지금 보고 있는 Director)에 붙는지 검사한다 (오너 2026-11-22 D2~D5 — 실사 · 영상은 Cinema 로)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { LANE_STAGE, deriveStageBadges, shotMediaStage, stagesSeenTogether, type GenerationCompletion } from '@/lib/generation-batches'
import { queueWorks } from '@/lib/pipeline-progress'
import { notifyGenerationComplete } from '@/lib/generation-notify'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { KO } from '@/lib/i18n/messages-ko'

const done = (lane: GenerationCompletion['lane'], at: number): GenerationCompletion => ({ stage: LANE_STAGE[lane], lane, at, units: 1 })

describe('실사 그림 · 영상 알림의 자리', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGlobalChatStore.getState().reset()
    useProjectStore.setState({ projectId: 'cam-notice', projectLocale: 'ko', projectLocaleLocked: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    useGlobalChatStore.getState().reset()
  })

  it('Cinema 나 Director 를 보고 있으면 실사 그림 · 영상 알림은 그 화면 단계에 붙고, 다른 화면이면 Cinema 에 붙는다', () => {
    // 왜: 실사 · 영상은 Camera 에서 만들고 Director 노드 보기도 같은 샷을 본다 — 보고 있는 화면의 채팅 구간에 남아야 따라 읽는다.
    expect(shotMediaStage('camera')).toBe('camera')
    expect(shotMediaStage('director')).toBe('director')
    expect(shotMediaStage('artist')).toBe('camera')
    expect(shotMediaStage('editor')).toBe('camera')
    expect(shotMediaStage(null)).toBe('camera')
  })

  it('Cinema 나 Director 를 보는 중에 실사 그림이 다 그려지면 "다른 단계에서 끝났어요" 알림을 띄우지 않고, 다른 화면이면 Cinema 탭을 보라고 알린다', () => {
    // 왜: 지금은 단계가 'director' 로 박혀 있어 Camera 를 보고 있어도 "Director 탭을 확인하세요" 알림이 뜬다.
    for (const watching of ['camera', 'director'] as const) {
      useProjectStore.setState({ currentStage: watching })
      notifyGenerationComplete('camera', 'Real image')
      vi.runAllTimers()
      expect(useGlobalChatStore.getState().messages, watching).toEqual([])
    }
    useProjectStore.setState({ currentStage: 'artist' })
    notifyGenerationComplete('camera', 'Real image')
    vi.runAllTimers()
    const [line] = useGlobalChatStore.getState().messages
    expect(line).toMatchObject({ stage: 'camera' })
    expect(line.content).toContain('Cinema')
  })

  it('Director 를 보는 중에 남는 실사 그림 · 영상 알림 줄은 채팅의 Director 구간에, 그 밖에는 Cinema 구간에 남는다', () => {
    // 왜: 채팅방은 하나이고 단계마다 구간이 나뉜다 — 지금 보는 화면 구간에 남아야 이어 읽는다.
    useProjectStore.setState({ currentStage: 'director' })
    useGlobalChatStore.getState().notifyIssue('camera', '✓ 영상 2개 완료')
    useProjectStore.setState({ currentStage: 'camera' })
    useGlobalChatStore.getState().notifyIssue('camera', '✓ 이미지 3장 완료')
    expect(useGlobalChatStore.getState().messages.map((m) => m.stage)).toEqual(['director', 'camera'])
  })

  it('실사 그림 · 영상 알림을 내는 곳은 단계를 Director 로 박아 두지 않고 Cinema 로 낸다', () => {
    // 왜: 박아 두면 Camera 를 보는 중에도 다른 단계 알림이 뜨고, 채팅 구간이 Director 로 끊긴다. 보고 있는 화면에 맞추는 일은 채팅이 받는 곳 한 군데가 한다.
    for (const file of ['src/stores/director-store.ts', 'src/lib/director/real-batch-client.ts', 'src/lib/director/video-batch-client.ts', 'src/lib/generation-prerequisite-toast.ts']) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/notify\w*\(\s*'director'/)
      expect(source, file).toMatch(/notify\w*\(\s*'camera'/)
    }
  })

  it('실사 그림 완료 · 실패 알림은 "스토리보드"가 아니라 "실사 이미지"라고 쓴다', () => {
    // 왜: Storyboard 는 콘티(러프)를 뜻하는 이름이 된다(리드 11/22) — 실사 그림 알림에 그 말을 쓰면 콘티가 끝난 것으로 읽힌다.
    const store = readFileSync('src/stores/director-store.ts', 'utf8')
    expect(store).not.toMatch(/notifyGeneration(?:Complete|Failure)\([^)]*'Storyboard(?: image)?'/)
    expect(store).toContain("translate(useLocaleStore.getState().locale, 'Real image')")
    expect(KO['Real image']).toBe('실사 이미지')
  })
})

describe('진행 표시와 레일 배지', () => {
  it('진행 알림의 실사 그림 · 영상 일은 Cinema 의 일이고 Cinematographer 가 한다고 적는다', () => {
    // 왜: 진행 줄의 색 · 이름이 그 일을 하는 탭을 가리켜야 한다 — 실사 · 영상을 만드는 탭은 Camera 다.
    const works = queueWorks({ shot_storyboard: 1, storyboard_real_grid: 1, shot_video: 2 }, 'en')
    expect(works.map((w) => w.stage)).toEqual(['camera', 'camera', 'camera'])
    for (const work of works) expect(work.label).toContain('Cinematographer')
  })

  it('실사 그림 · 영상이 끝난 배지는 Cinema 칸에 붙고, Cinema 나 Director 를 보는 동안 끝난 것은 쌓이지 않는다', () => {
    // 왜: 두 화면은 같은 샷을 본다 — Director 를 보는 동안 끝난 그림을 Camera 칸이 "안 본 것"으로 세면 거짓 배지다.
    expect(LANE_STAGE['director-storyboard']).toBe('camera')
    expect(LANE_STAGE['director-video']).toBe('camera')
    const completions = [done('director-storyboard', 10), done('director-video', 20)]
    expect(deriveStageBadges(completions, { camera: 0 }, 'artist')).toEqual({ camera: 2 })
    expect(deriveStageBadges(completions, { camera: 0 }, 'camera')).toEqual({})
    expect(deriveStageBadges(completions, { camera: 0 }, 'director')).toEqual({})
    expect(stagesSeenTogether('director')).toEqual(['camera', 'director'])
    expect(stagesSeenTogether('camera')).toEqual(['camera', 'director'])
    expect(stagesSeenTogether('artist')).toEqual(['artist'])
  })
})
