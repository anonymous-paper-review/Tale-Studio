// 확정된 산문을 채팅이 바꾸면 바로 덮어쓰지 않고 바뀐 문단을 보인 채 적용·되돌리기를 묻는다 (그룹1 P4·P5·P6·P8·P10)
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectSettings } from '@/types'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { diffStoryParagraphs, readStoryReview } from '@/lib/producer/story-diff'

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  subGenre: 'psychological',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: ['fear'],
  dialogueLanguage: 'ko',
}

const PREV = '비가 오는 도시에 형사가 선다.\n\n그는 기억을 잃었다.\n\n마지막 밤이 시작된다.'
const NEXT = '비가 오는 도시에 형사가 선다.\n\n그는 이름마저 잊었다.\n\n마지막 밤이 시작된다.'

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
})

describe('확정된 산문의 변경 검토', () => {
  // 왜: 산문이 확정된 뒤 채팅 한마디에 원문이 사라지면 되돌릴 방법이 없다 — 대화로 다듬는 사람이 매번 겪는다.
  it('산문이 확정된 뒤 채팅이 산문을 바꾸면 바로 덮어쓰지 않고 적용·되돌리기를 묻는다', () => {
    useProducerStore.setState({
      storyText: PREV,
      storyReady: true,
      projectSettings: { ...settings },
    })

    const outcome = useProducerStore
      .getState()
      .applyExtractedSettings({ storyText: NEXT }, 'trace-story')

    expect(outcome).toBe('pending')
    expect(useProducerStore.getState().storyText).toBe(PREV)

    const proposal = useGlobalChatStore.getState().pendingProposal
    expect(proposal?.kind).toBe('producerSourcePatch')
    expect(readStoryReview(proposal?.payload)).toEqual({ prev: PREV, next: NEXT })
  })

  // 왜: 정상 경로 고정 — 승인한 변경은 실제로 들어가야 한다.
  it('적용을 누르면 새 산문이 들어간다', async () => {
    useProducerStore.setState({
      storyText: PREV,
      storyReady: true,
      projectSettings: { ...settings },
    })
    useProducerStore.getState().applyExtractedSettings({ storyText: NEXT }, 'trace-story')

    await expect(useGlobalChatStore.getState().approvePendingProposal()).resolves.toBe(true)

    expect(useProducerStore.getState().storyText).toBe(NEXT)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  // 왜: 되돌리기가 원문을 지키지 못하면 검토 카드 자체가 무의미하다.
  it('되돌리기를 누르면 원문이 그대로 남는다', () => {
    useProducerStore.setState({
      storyText: PREV,
      storyReady: true,
      projectSettings: { ...settings },
    })
    useProducerStore.getState().applyExtractedSettings({ storyText: NEXT }, 'trace-story')
    const proposalId = useGlobalChatStore.getState().pendingProposal!.id

    useGlobalChatStore.getState().dismissPendingProposal(proposalId)

    expect(useProducerStore.getState().storyText).toBe(PREV)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  // 왜: 정상 경로 고정 — 첫 대화에서 초안은 매 턴 자란다. 매번 물으면 대화가 멈춘다(P8).
  it('산문이 아직 확정되지 않은 동안에는 채팅이 산문을 그대로 갱신한다', () => {
    useProducerStore.setState({
      storyText: '아직 자라는 초안',
      storyReady: false,
      projectSettings: { ...settings },
    })

    const outcome = useProducerStore
      .getState()
      .applyExtractedSettings({ storyText: NEXT, storyReady: true })

    expect(outcome).toBe('applied')
    expect(useProducerStore.getState().storyText).toBe(NEXT)
    expect(useGlobalChatStore.getState().pendingProposal).toBeNull()
  })

  // 왜: 검토 중 포맷이 함께 바뀌면 어느 산문에 맞춘 포맷인지 알 수 없어진다(P6).
  it('산문 변경을 검토하는 동안 포맷 변경은 무시된다', () => {
    useProducerStore.setState({
      storyText: PREV,
      storyReady: true,
      projectSettings: { ...settings },
    })
    useProducerStore.getState().applyExtractedSettings({ storyText: NEXT }, 'trace-story')

    useProducerStore.getState().updateSettings({ format: 'vertical_9:16' })

    expect(useProducerStore.getState().projectSettings.format).toBe('horizontal_16:9')
    expect(useProducerStore.getState().lockNotice).toBe(
      'Format is locked while a story change is under review.',
    )
  })

  // 왜: 정상 경로 고정 — 보드가 문단 전체를 노랗게 칠하면 무엇이 바뀌었는지 못 읽는다.
  it('바뀐 문단만 추가·삭제로 구분하고 같은 문단은 그대로 둔다', () => {
    expect(diffStoryParagraphs(PREV, NEXT)).toEqual([
      { kind: 'same', text: '비가 오는 도시에 형사가 선다.' },
      { kind: 'added', text: '그는 이름마저 잊었다.' },
      { kind: 'removed', text: '그는 기억을 잃었다.' },
      { kind: 'same', text: '마지막 밤이 시작된다.' },
    ])
    // 문단을 덧붙이기만 하면 지워진 문단은 없다.
    expect(diffStoryParagraphs('가\n\n나', '가\n\n나\n\n다')).toEqual([
      { kind: 'same', text: '가' },
      { kind: 'same', text: '나' },
      { kind: 'added', text: '다' },
    ])
    expect(diffStoryParagraphs(PREV, PREV).every((part) => part.kind === 'same')).toBe(true)
  })
})
