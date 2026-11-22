// Storyboard 에서 앞으로 넘기면 늘 Cinema 가 열리고, Cinema 에서 Director 로는 조건 없이 넘기는지 검사한다 (오너 2026-11-22 D2~D5 · 리드 단계 구조)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const nav = vi.hoisted(() => ({ handoffToStage: vi.fn(async (stage: string) => `/studio/${stage}`) }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: nav.handoffToStage }))
import { resolveDirectorHandoffIntent, storyboardForwardUtterance } from '@/lib/handoff-intent'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

const ready = { ready: true, blockers: [], warnings: [], counts: { scenes: 2, shots: 5 }, path: '/studio/camera' }
let fetchMock: ReturnType<typeof vi.fn>
const text = () => useGlobalChatStore.getState().messages.map((m) => m.content).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  useGlobalChatStore.getState().reset()
  useLocaleStore.setState({ locale: 'ko' })
  fetchMock = vi.fn(async () => Response.json(ready))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Storyboard → Cinema', () => {
  it('넘기기 단추의 말("Cinema로 넘겨주세요" · "Please hand over to Cinema")은 두 말 모두 넘김 요청으로 알아듣는다', () => {
    // 왜: 단추 = 그 말을 친 것(#handoff-to-chat) — 화면 말이 영어여도 한국어여도 같은 길을 탄다. 이름은 단계 표에서 가져온다(오너 E1 Cinema).
    expect(storyboardForwardUtterance('ko')).toBe('Cinema로 넘겨주세요')
    expect(storyboardForwardUtterance('en')).toBe('Please hand over to Cinema')
    expect(resolveDirectorHandoffIntent(storyboardForwardUtterance('ko'), 'writer', [])).toEqual({ mode: 'move' })
    expect(resolveDirectorHandoffIntent(storyboardForwardUtterance('en'), 'writer', [])).toEqual({ mode: 'move' })
  })

  it('"시네마로 넘겨줘" · "Cinema로 넘겨줘", 예전 이름 "카메라로 넘겨줘"도 Cinema 로 넘기는 말로 알아듣고, "카메라를 왼쪽으로"는 넘김이 아니다', () => {
    // 왜: 오너 E1 — 탭 이름이 Cinema 가 됐다. 한국어로 "시네마"라고 부르거나 옛 이름으로 불러도 같은 곳으로 간다. 카메라 움직임 말은 목적지로 읽지 않는다.
    for (const said of ['시네마로 넘겨줘', 'Cinema로 넘겨줘', 'hand over to cinema', '카메라로 넘겨줘']) {
      expect(resolveDirectorHandoffIntent(said, 'writer', []), said).toEqual({ mode: 'move' })
    }
    expect(resolveDirectorHandoffIntent('카메라를 왼쪽으로 이동해줘', 'writer', [])).toBeNull()
  })

  it('Storyboard 에서 Director 로 넘겨 달라고 해도 바로 다음 단계인 Cinema 를 연다', async () => {
    // 왜(혼자 정한 것): 예전 Director 스토리보드 보기의 일(실사 · 영상 만들기)이 Camera 로 옮겼다 — 버릇대로 "Director로"라고 해도 그 일을 하는 Camera 로 간다.
    useProjectStore.setState({ projectId: 'cam-handoff', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
    await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ targetStage: 'camera', action: 'move' })
    expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/camera')
    expect(useProjectStore.getState().canNavigateTo('camera')).toBe(true)
    expect(useProjectStore.getState().canNavigateTo('director')).toBe(false)
  })

  it('Storyboard 채팅에서 "카메라를 왼쪽으로 이동해줘"처럼 카메라를 움직이라는 말은 넘김으로 알아듣지 않는다', () => {
    // 왜: "카메라"는 샷을 고칠 때 늘 쓰는 말이다 — 단계 이름 "Camera"로 넘겨 달라는 말("Camera로", "카메라로", "to Camera")일 때만 넘긴다.
    for (const line of ['카메라를 왼쪽으로 이동해줘', '카메라 이동해서 다시 그려줘', 'Proceed with a slower camera move']) {
      expect(resolveDirectorHandoffIntent(line, 'writer', []), line).toBeNull()
    }
    expect(resolveDirectorHandoffIntent('카메라로 넘겨줘', 'writer', [])).toEqual({ mode: 'move' })
  })

  it('Cinema 화면이 열리면 Storyboard 에서 부탁한 넘김을 마쳤다고 알리는 자리는 Cinema 화면이다', () => {
    // 왜: 넘김 완료는 실제 화면이 열린 뒤에만 알린다(기존 약속) — 그 화면이 이제 Camera 다.
    const page = readFileSync('src/app/studio/camera/page.tsx', 'utf8')
    expect(page).toContain("confirmDirectorHandoff(handoffProjectId, '/studio/camera')")
  })
})

describe('Cinema → Director', () => {
  it('Cinema 화면의 [다음: Director]는 조건 없이 Director 로 넘긴다', async () => {
    // 왜(혼자 정한 것, 리드 11/22 f): Camera 와 Director 는 같은 샷을 보는 두 화면이라 막을 까닭이 없다.
    useProjectStore.setState({ projectId: 'cam-next', currentStage: 'camera', reachedStage: 'camera', projectLocale: 'ko', projectLocaleLocked: true })
    await useGlobalChatStore.getState().requestNextStep()
    expect(nav.handoffToStage).toHaveBeenCalledWith('director')
    expect(text()).toContain('Director로 넘어갈게요.')
    expect(text()).not.toContain('넘어갈 수 없어요')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
