// Artist 첫 안내는 인물 · 배경 카드가 생긴 뒤 그 수로 한 번만 말하고, 인물 · 배경을 새로 추가하라고 하지 않는다 (2026-10-27 디자이너 QA 1차)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { ARTIST_BRIEF_TEXT, artistBriefCounts, offerArtistBrief } from '@/lib/artist/brief'
import { translate } from '@/lib/i18n/translate'
import { KO } from '@/lib/i18n/messages-ko'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

const person = { entityType: 'person' as const }
const object = { entityType: 'object' as const }
const ko = (counts: { count: number; worldCount: number }) => translate('ko', ARTIST_BRIEF_TEXT, counts)
const briefs = () => useGlobalChatStore.getState().messages.filter((m) => m.stage === 'artist')

beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useGlobalChatStore.setState({ messagesLoadedProjectId: 'project-qa' })
  useProjectStore.setState({ projectId: 'project-qa', currentStage: 'artist', reachedStage: 'artist' })
})
afterEach(() => useGlobalChatStore.getState().reset())

describe('Artist 첫 안내(디자이너 QA 1차 관찰 49)', () => {
  it('Artist 첫 안내는 인물 · 배경 카드가 생긴 뒤에 그 수로 한 번만 말한다', () => {
    // 왜: 카드가 아직 없을 때 안내가 나가 '캐릭터 0명 · 배경 0곳'으로 남았다(디자이너 QA 1차 관찰 49).
    // 산문 목록 단계 · 디자인 중 · 카드가 없을 때는 말하지 않는다(대기 시간이 지나 화면이 열려도).
    expect(artistBriefCounts({ ready: true, phase: 'list', characters: [], worlds: [] })).toBeNull()
    expect(artistBriefCounts({ ready: true, phase: 'making', characters: [person], worlds: [] })).toBeNull()
    expect(artistBriefCounts({ ready: true, phase: 'cards', characters: [], worlds: [] })).toBeNull()
    expect(artistBriefCounts({ ready: false, phase: 'cards', characters: [person], worlds: [{}] })).toBeNull()
    expect(offerArtistBrief('project-qa', null)).toBe(false)
    expect(briefs()).toHaveLength(0)

    // 카드가 생기면 그 수(사람 인물 · 배경)로 말한다.
    const counts = artistBriefCounts({ ready: true, phase: 'cards', characters: [person, person, object], worlds: [{}] })
    expect(counts).toEqual({ count: 2, worldCount: 1 })
    offerArtistBrief('project-qa', ko(counts!))
    // 그 뒤 수가 바뀌어도 다시 말하지 않는다.
    offerArtistBrief('project-qa', ko({ count: 3, worldCount: 2 }))
    expect(briefs()).toHaveLength(1)
    expect(briefs()[0].content).toContain('캐릭터 2명 · 배경 1곳')
    expect(briefs()[0].content).not.toContain('0명')

    // Artist 화면이 이 규칙으로 안내한다.
    const page = readFileSync('src/app/studio/artist/page.tsx', 'utf8')
    expect(page).toMatch(/artistBriefCounts\(\{ ready, phase,/)
    expect(page).toMatch(/offerArtistBrief\(projectId, artistBriefContent\)/)
  })

  it('채팅 기록을 다 읽기 전에는 Artist 첫 안내를 말하지 않는다', () => {
    // 왜: 기록을 읽기 전에 말하면 이미 안내한 프로젝트를 처음으로 보고 안내가 한 번 더 남았다(디자이너 QA 1차 관찰 49 · 개발 서버 확인).
    useGlobalChatStore.setState({ messagesLoadedProjectId: null })

    expect(offerArtistBrief('project-qa', ko({ count: 2, worldCount: 1 }))).toBe(false)
    expect(briefs()).toHaveLength(0)
    expect(readFileSync('src/app/studio/artist/page.tsx', 'utf8')).toMatch(/messagesLoadedProjectId === projectId/)
  })

  it('Artist 첫 안내는 인물 · 배경을 새로 추가하라고 하지 않는다', () => {
    // 왜: 채팅으로 인물 · 배경을 더할 수 없게 됐는데(디자이너 QA 1차 #04) 첫 안내가 "수정하거나 추가하고 싶은"이라고 했다(관찰 49).
    expect(ARTIST_BRIEF_TEXT in KO).toBe(true)
    expect(ko({ count: 2, worldCount: 1 })).toBe(
      '인물과 배경의 컨셉을 준비했어요: 캐릭터 2명 · 배경 1곳.\n고치고 싶은 인물이나 배경을 알려주세요.\n"@"를 누르면 인물·배경을 골라 붙일 수 있어요 (Ctrl+카드 클릭도 같은 동작이에요).',
    )
    expect(ko({ count: 2, worldCount: 1 })).not.toMatch(/추가/)
    expect(translate('en', ARTIST_BRIEF_TEXT, { count: 2, worldCount: 1 })).not.toMatch(/\badd\b/i)
    expect(readFileSync('src/app/studio/artist/page.tsx', 'utf8')).not.toMatch(/revise or add/)
  })
})
