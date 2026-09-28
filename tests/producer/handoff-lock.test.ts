// Writer 로 넘긴 뒤 Producer 보드의 직접 편집은 잠기고 러닝타임·채팅 언어만 열려 있다 (그룹1 P1·P7·P9)
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectSettings } from '@/types'
import type { CastMember } from '@/lib/producer-gate'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { producerLock } from '@/lib/producer/lock'

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  subGenre: 'psychological',
  format: 'horizontal_16:9',
  tone: ['dark'],
  targetEmotion: ['fear'],
  dialogueLanguage: 'ko',
}

const girl: CastMember = {
  localId: 'c1',
  name: '소녀',
  entityType: 'person',
  appearance: '흰 원피스',
  origin: 'producer',
  userEdited: true,
}

const LOCK_NOTICE = 'Locked after handoff. Start a new project to change it.'

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useProducerStore.getState().reset()
  useProjectStore.getState().resetProject()
})

describe('넘긴 뒤 Producer 의 점유와 잠금', () => {
  // 왜: 넘긴 뒤 장르를 바꾸면 Writer·Artist 가 이미 그 장르로 만든 결과와 조용히 어긋난다.
  it('Writer로 넘긴 뒤에는 장르를 바꾸려 해도 그대로다', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'writer' })
    useProducerStore.setState({ projectSettings: { ...settings } })

    useProducerStore.getState().updateSettings({ genre: 'drama' })

    expect(useProducerStore.getState().projectSettings.genre).toBe('thriller')
  })

  // 왜: 정상 경로 고정 — 러닝타임은 목표값이고 채팅 언어는 만들어진 결과에 영향이 없다(P7).
  it('넘긴 뒤에도 러닝타임과 채팅 언어는 계속 고칠 수 있다', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'artist' })
    useProducerStore.setState({ projectSettings: { ...settings } })

    useProducerStore.getState().updateSettings({ playtime: 180 })

    expect(useProducerStore.getState().projectSettings.playtime).toBe(180)
    expect(useProducerStore.getState().lockNotice).toBeNull()

    const lock = producerLock('artist')
    expect(lock.locked).toBe(true)
    expect(lock.editable.has('playtime')).toBe(true)
    expect(lock.editable.has('chatLanguage')).toBe(true)
    expect(lock.editable.has('genre')).toBe(false)
    expect(lock.editable.has('format')).toBe(false)
  })

  // 왜: 조용히 무시하면 "왜 안 바뀌지"로 읽힌다 — 넘긴 뒤 보드를 다시 고쳐 보는 사람이 겪는다(P9).
  it('잠긴 항목을 고치려 하면 넘긴 뒤에는 고칠 수 없다는 안내가 남는다', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'writer' })
    useProducerStore.setState({ projectSettings: { ...settings }, cast: [{ ...girl }] })

    useProducerStore.getState().updateSettings({ tone: ['bright'] })

    expect(useProducerStore.getState().projectSettings.tone).toEqual(['dark'])
    expect(useProducerStore.getState().lockNotice).toBe(LOCK_NOTICE)
    // 안내는 오류가 아니다 — 빨간 오류 배너를 쓰면 "무언가 고장났다"로 읽힌다.
    expect(useProducerStore.getState().error).toBeNull()

    useProducerStore.getState().clearLockNotice()
    useProducerStore.getState().updateCastMember('c1', { name: '다른 이름' })

    expect(useProducerStore.getState().cast[0].name).toBe('소녀')
    expect(useProducerStore.getState().lockNotice).toBe(LOCK_NOTICE)

    useProducerStore.getState().clearLockNotice()
    useProducerStore.getState().removeCastMember('c1')

    expect(useProducerStore.getState().cast).toHaveLength(1)
    expect(useProducerStore.getState().lockNotice).toBe(LOCK_NOTICE)
  })

  // 왜: 정상 경로 고정 — 넘기기 전 보드는 종전대로 전부 열려 있어야 한다.
  it('넘기기 전에는 모든 항목을 고칠 수 있다', () => {
    useProjectStore.setState({ currentStage: 'producer', reachedStage: 'producer' })
    useProducerStore.setState({ projectSettings: { ...settings }, cast: [{ ...girl }] })

    useProducerStore.getState().updateSettings({ genre: 'drama', tone: ['bright'] })
    useProducerStore.getState().updateCastMember('c1', { name: '다른 이름' })

    expect(useProducerStore.getState().projectSettings.genre).toBe('drama')
    expect(useProducerStore.getState().projectSettings.tone).toEqual(['bright'])
    expect(useProducerStore.getState().cast[0].name).toBe('다른 이름')
    expect(useProducerStore.getState().lockNotice).toBeNull()

    const lock = producerLock('producer')
    expect(lock.locked).toBe(false)
    expect(lock.editable.has('genre')).toBe(true)
    expect(lock.editable.has('format')).toBe(true)
    expect(lock.editable.has('playtime')).toBe(true)
    expect(lock.editable.has('chatLanguage')).toBe(true)
  })
})
