// 채팅을 접어 둔 Camera 에서 이미지 · 영상 일괄이 끝나면 Director 와 같은 Lumi 알림 카드가 뜨고, 다음 할 일 단추가 Camera 의 다음 단계(Director)를 가리키는지 검사한다 (리드 2026-11-22 찾은 것 2 · 11/13 시안 D8)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorShotState } from '@/lib/director/shot-state'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { useLumiNoticeStore as notices } from '@/stores/lumi-notice-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore as project } from '@/stores/project-store'
import { lumiBatchNoticeView } from '@/lib/director/lumi-batch-notice'

const VIDEO = { projectId: 'p-cam', kind: 'video' as const, done: 5, failed: 1 }
const IMAGE = { projectId: 'p-cam', kind: 'image' as const, done: 3, failed: 0 }
const states = (...list: Array<[string, DirectorShotState]>) => new Map(list)
const labelOf = (id: string) => Number(id.slice(1))

beforeEach(() => {
  project.getState().resetProject()
  project.setState({ currentStage: 'camera', reachedStage: 'camera', projectId: 'p-cam', projectLocale: 'en', projectLocaleLocked: true })
  useChatUiStore.setState({ collapsed: true })
  notices.setState({ notice: null, stage: null })
})

describe('Camera 의 Lumi 알림 카드가 뜨는 때', () => {
  it('채팅을 접어 둔 Camera 에서 일괄이 끝나면 Director 와 같은 Lumi 알림 카드가 뜨고, 채팅이 열려 있으면 카드 없이 채팅 줄로만 알린다', () => {
    // 왜: 리드 11/22 — 실사 · 영상 알림의 집이 Camera 로 왔다. 채팅을 접어 두면 끝난 것과 다음 할 일을 카드로 알린다(시안 D8 과 같은 카드).
    notices.getState().batchEnded(VIDEO)
    expect(notices.getState()).toMatchObject({ notice: VIDEO, stage: 'camera' })
    notices.setState({ notice: null, stage: null })
    useChatUiStore.setState({ collapsed: false })
    notices.getState().batchEnded(VIDEO)
    expect(notices.getState().notice).toBeNull()
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/collapsed && isDirectorChatStage\(currentStage\) && <LumiBatchNotice \/>/)
  })

  it('Camera 에서 띄운 카드는 Camera 를 떠나면(Director 로 가도) 사라진다', () => {
    // 왜: 카드의 단추는 띄운 화면의 다음 할 일이다 — Director 에서 Camera 카드의 [다음: Director]가 보이면 안 된다.
    notices.getState().batchEnded(VIDEO)
    project.setState({ currentStage: 'director' })
    expect(notices.getState().notice).toBeNull()
  })
})

describe('Camera 카드의 글과 단추', () => {
  it('영상이 다 되면 Camera 카드는 [다음: Director]를 보이고 Editor 로 합치라는 말은 하지 않는다', () => {
    // 왜: Camera 의 다음 단계는 Director 다(조건 없이 넘김, 리드 답 f) — Editor 로 넘기는 말은 Director 화면의 것이다.
    const view = lumiBatchNoticeView({ notice: { ...VIDEO, failed: 0 }, states: states(['s1', 'video_done'], ['s2', 'video_done']), labelOf, takesReturned: false, locale: 'en', screen: 'camera' })
    expect(view).toMatchObject({ title: '5 videos are done', body: null, actions: [{ kind: 'handoff', label: 'Next: Director' }] })
  })

  it('실패한 영상이 있으면 Camera 카드는 [샷 N 다시 만들기]가 먼저, [다음: Director]가 다음이고, 실패 글에 Editor 말이 없다', () => {
    // 왜: 촬영 화면에서는 실패한 것을 다시 만드는 일이 먼저다. Director 로는 실패와 상관없이 넘어갈 수 있다.
    const view = lumiBatchNoticeView({ notice: VIDEO, states: states(['s1', 'video_done'], ['s4', 'video_failed']), labelOf, takesReturned: true, locale: 'en', screen: 'camera' })
    expect(view.actions).toEqual([
      { kind: 'videos', label: 'Make Shot 4 again', shotIds: ['s4'], remake: true },
      { kind: 'handoff', label: 'Next: Director' },
    ])
    expect(view.body).toBe('The video for Shot 4 failed, and your Takes were returned. You can make it again.')
    const noTakes = lumiBatchNoticeView({ notice: VIDEO, states: states(['s4', 'video_failed'], ['s5', 'video_failed']), labelOf, takesReturned: false, locale: 'en', screen: 'camera' })
    expect(noTakes.body).toBe('The videos for Shots 4 · 5 failed. You can make them again.')
  })

  it('Camera 의 이미지 다 됨 카드는 Director 와 같다 — [영상 만들기 · N]', () => {
    // 왜: 이미지가 끝나면 다음 할 일은 두 화면 모두 그 샷의 영상이다.
    const camera = lumiBatchNoticeView({ notice: IMAGE, states: states(['s1', 'image_done'], ['s2', 'image_done']), labelOf, takesReturned: false, locale: 'en', screen: 'camera' })
    const director = lumiBatchNoticeView({ notice: IMAGE, states: states(['s1', 'image_done'], ['s2', 'image_done']), labelOf, takesReturned: false, locale: 'en' })
    expect(camera).toEqual(director)
    expect(readFileSync('src/features/director/lumi-batch-notice.tsx', 'utf8')).toMatch(/<LumiAvatar persona=\{STAGE_PERSONA\[stage\]\}/)
  })
})
