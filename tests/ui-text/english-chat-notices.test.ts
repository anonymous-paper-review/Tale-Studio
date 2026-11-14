// 영어 화면에서 채팅 · Storyboard 가 남기는 고정 안내(고치기 실패 · 빠진 인물 · 승인 실패 · 채울 것 · 끌어 놓기 · @ 고르기 · 공유 미리보기)가 한국어 없이 영어로 나오는지 검사한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error('this path must not call the database') }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: db.createClient, createCatalogClient: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))

import { droppedCharactersNotice, parseFencedJsonReply, parseFencedUpdates, stripLeakedUpdatesBlock } from '@/lib/agentic-reply-guard'
import { castMentions, foundationMentions } from '@/lib/card-mention'
import { getDirectorGaps, ledgerGapLabels, summarizeGaps } from '@/lib/completeness'
import { cannedFor } from '@/lib/demo/canned'
import { createPendingProposal } from '@/lib/pending-proposal'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectStore } from '@/stores/project-store'
import type { DirectorNode } from '@/types/director'

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/
const source = (file: string) => readFileSync(file, 'utf8')

describe('영어 화면의 채팅 고치기 안내', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  // 왜: 채팅으로 고칠 때 모델의 변경 명령이 잘리거나 깨지면 "적용된 변경은 없습니다" 안내가 붙는데, 영어 화면에서도 한국어로 나왔다(오너 2026-11-10).
  //   채팅 서버 셋(Storyboard · Artist · Director)이 같이 쓰는 안내다.
  it('영어 화면이면 채팅으로 고치다 답이 잘리거나 읽히지 않아 바뀐 것이 없을 때의 안내가 영어로 나온다', () => {
    const cut = stripLeakedUpdatesBlock('Updating all 76 shots.\n\n```json\n{"updates":[{"type":"updateShot"', 'en')
    expect(cut).toContain('Updating all 76 shots.')
    expect(cut).toContain('No changes were applied')
    expect(cut).not.toMatch(HANGUL)
    const unreadable = parseFencedJsonReply('Here is the plan.\n\n```json\nthis is prose, not JSON\n```', 'test', 'en')
    expect(unreadable.status).toBe('failed')
    expect(unreadable.reply).toContain('No changes were applied')
    expect(unreadable.reply).not.toMatch(HANGUL)
    // 정상 경로 고정: 한국어 화면은 지금처럼 한국어로 알린다.
    expect(stripLeakedUpdatesBlock('```json\n{"updates":[', 'ko')).toContain('적용된 변경은 없습니다')
  })

  // 왜: 잘린 답에서 온전한 변경만 살리면 몇 건 바꿨고 어디부터 이어서 요청하면 되는지 알리는데, 이 안내도 한국어로만 나왔다.
  it('영어 화면이면 답이 잘려 일부만 바뀌었을 때 몇 건 바뀌었고 어디부터 이어서 요청할지 안내가 영어로 나온다', () => {
    const shot = (id: string) => `{"type":"updateShot","id":"${id}","patch":{"note":"x"}}`
    const truncated = `Updating all 76 shots.\n\n\`\`\`json\n{"updates":[${shot('shot_001')},${shot('shot_002')},{"type":"updateShot","id":"shot_003","patch":{"note":"cut`
    const withHint = parseFencedUpdates(truncated, 'test', (raw) => raw, 'en')
    expect(withHint.status).toBe('recovered')
    expect(withHint.reply).toContain(`only ${withHint.updates.length} of the changes were applied`)
    expect(withHint.reply).toContain('shot_002')
    expect(withHint.reply).not.toMatch(HANGUL)
    const noHint = parseFencedUpdates(truncated, 'test', (raw) => raw.map(() => ({ type: 'updateShot' })), 'en')
    expect(noHint.reply).not.toMatch(HANGUL)
  })

  // 왜: Storyboard 채팅이 등장인물 목록에 없는 인물을 빼고 반영하면 그 사실을 답 끝에 붙이는데, 영어 화면에서도 한국어였다.
  it('영어 화면이면 Storyboard 채팅이 등장인물 목록에 없는 인물을 반영하지 않았다는 안내가 영어로 나온다', () => {
    const notice = droppedCharactersNotice(['char_9', 'char_12'], 'en')
    expect(notice).toContain('`char_9`, `char_12`')
    expect(notice).toContain('Producer')
    expect(notice).not.toMatch(HANGUL)
    expect(droppedCharactersNotice(['char_9'], 'ko')).toContain('반영하지 않았어요')
    expect(source('src/app/api/writer/chat/route.ts')).toContain('droppedCharactersNotice(')
  })
})

describe('영어 화면의 채팅 승인 실패 까닭', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGlobalChatStore.getState().reset()
    useProjectStore.setState({ projectId: 'p-en-approval', currentStage: 'artist', reachedStage: 'artist', projectLocale: 'en', projectLocaleLocked: true })
    useLocaleStore.setState({ locale: 'en' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: 'ok', updates: [] })))
  })
  afterEach(() => { useGlobalChatStore.getState().reset(); vi.unstubAllGlobals() })

  // 왜: 채팅이 낸 변경 승인 카드를 눌렀는데 저장할 수 없으면 까닭을 채팅에 말하는데, 그 까닭(원천 확인 정보 없음 · 대상 바뀜 · 저장 확인 못 함)이 한국어로 고정돼 있었다.
  it('영어 화면이면 채팅에서 승인한 변경을 저장하지 못한 까닭이 영어로 나온다', async () => {
    const proposal = createPendingProposal({
      id: 'artist-legacy-source-en', projectId: 'p-en-approval', stage: 'artist',
      kind: 'artistSourceLocationPatch', target: 'Classroom', action: 'Change the description', impact: [],
      payload: { locationId: 'location-1', visualDescription: 'A bright classroom' },
    })
    useGlobalChatStore.getState().offerPendingProposal(proposal)
    await expect(useGlobalChatStore.getState().approvePendingProposal(proposal.id)).resolves.toBe(false)
    const said = String(useGlobalChatStore.getState().messages.at(-1)?.content ?? '')
    expect(said).toContain('Classroom')
    expect(said).toContain('Read it again')
    expect(said).not.toMatch(HANGUL)
    expect(source('src/stores/global-chat-store.ts')).not.toMatch(/new Error\('[^']*[가-힣]/)
  })
})

describe('영어 화면의 Director 채팅 채울 것 목록', () => {
  // 왜: Director 를 열면 채팅이 "채울 것이 N개 있어요" 목록을 알려 주는데, 줄마다 "스토리보드 미생성" · "캐릭터·배경 참조 없음" 같은 한국어가 섞였다(오너가 본 "스토리보드 미…").
  it('영어 화면이면 Director 채팅이 알려 주는 채울 것 목록이 영어로 나온다', () => {
    const shotNode = (id: string, data: Record<string, unknown>) => ({ id, data: { kind: 'shot', label: id, characterAssetIds: [], worldAssetIds: [], ...data } }) as unknown as DirectorNode
    const nodes = [
      shotNode('Shot 1', {}),
      shotNode('Shot 2', { characterAssetIds: ['char_1'] }),
      shotNode('Shot 3', { worldAssetIds: ['loc_1'] }),
    ]
    const ledger = { sc_01: { transitions: [
      { character_id: 'char_1', beat: 2, kind: 'posture', from: 'lying', to: 'standing', covered: false },
      { character_id: 'char_1', beat: 4, kind: 'move', from: '0,0', to: '1,1', covered: false, distance_m: 1.5 },
    ] } }
    const name = () => 'Mina'
    const gaps = getDirectorGaps(nodes, { hasCharacterImage: () => false, characterName: name, ledgerGaps: ledgerGapLabels(ledger, name, 'en') }, 'en')
    expect(gaps).toHaveLength(5)
    for (const gap of gaps) expect(gap.label).not.toMatch(HANGUL)
    const summary = summarizeGaps(gaps, 3, 'en')
    expect(summary).toContain('2 more')
    expect(summary).not.toMatch(HANGUL)
    expect(source('src/app/studio/director/page.tsx')).toMatch(/summarizeGaps\(gaps, \d+, chatLocale\)/)
  })
})

describe('영어 화면의 채팅 화면 문구', () => {
  // 왜: 채팅 칸에 파일을 끌어 오면 뜨는 안내가 사전을 거치지 않은 한국어였다.
  it('영어 화면이면 채팅에 파일을 끌어 올 때 안내가 영어로 나온다', () => {
    const chat = source('src/components/layout/global-chat.tsx')
    expect(chat).not.toContain('파일을 놓으면 첨부돼요')
    expect(chat).toContain("t('Drop files here to attach them')")
  })

  // 왜: 채팅 입력에 @ 를 치면 뜨는 고르기 목록의 설정 항목(스토리 · 러닝타임 · 장르 …)과 종류 표시(설정 · 인물 · 배경 · 줄 종류)가 영어 화면에서도 한국어였다.
  //   Producer 보드의 스토리 카드를 누르면 같은 이름이 입력에 들어가야 목록과 맞는다.
  it('영어 화면이면 채팅 @ 고르기의 설정 항목 이름과 종류 표시가 영어로 나온다', () => {
    const foundation = foundationMentions('en')
    expect(foundation.map((m) => m.ref)).toEqual(['story', 'setting:playtime', 'setting:genre', 'setting:subGenre', 'setting:format', 'setting:tone', 'setting:dialogueLanguage'])
    for (const m of foundation) expect(`${m.label} ${m.hint}`).not.toMatch(HANGUL)
    expect(castMentions([{ localId: 'c1', name: 'Mina', entityType: 'person' }], 'en')[0].hint).toBe('Person')
    // 정상 경로 고정: 한국어 화면의 이름은 지금 그대로다.
    expect(foundationMentions('ko').map((m) => m.label)).toEqual(['스토리', '러닝타임', '스토리 장르', '세부 장르', '포맷', '톤', '대사 언어'])
    const chat = source('src/components/layout/global-chat.tsx')
    expect(chat).toMatch(/foundationMentions\(locale\)/)
    expect(chat).toMatch(/castMentions\(producerCast, locale\)/)
    expect(chat).toMatch(/backgroundMentions\(producerBackgrounds, locale\)/)
    expect(chat).toMatch(/scriptLineMentions\(buildScriptLines\(writerManifest, writerShots\), locale\)/)
    expect(source('src/features/producer/readiness-board.tsx')).not.toContain('label="스토리"')
  })

  // 왜: 공유 미리보기에서 채팅을 쓰면 "공유 미리보기 모드예요 …" 고정 답이 나오는데, 영어 화면에서도 한국어였다.
  it('영어 화면이면 공유 미리보기 채팅의 고정 안내가 영어로 나온다', () => {
    for (const stage of ['entry', 'producer', 'writer', 'artist', 'director', 'editor'] as const) {
      expect(cannedFor(stage, 'en')).not.toBe('')
      expect(cannedFor(stage, 'en')).not.toMatch(HANGUL)
    }
    expect(cannedFor('writer', 'ko')).toBe('공유 미리보기 모드예요. 실제로는 여기서 씬 구조와 러프 스토리보드를 검토·수정해요.')
    expect(source('src/stores/global-chat-store.ts')).toContain('cannedFor(stage, contentLocale())')
  })
})
