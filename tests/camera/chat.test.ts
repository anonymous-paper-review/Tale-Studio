// Cinema 채팅(Lumi)과 ⌘/Ctrl+클릭 멘션 — Cinema 에서 말로 고치면 Director 채팅과 같은 엔진 · 같은 막이로 바로 하고 채팅방 Cinema 구간에 남으며, 샷 줄 · 판 · 씬을 ⌘/Ctrl+클릭하면 @이름이 날아 들어가는지 검사한다 (오너 2026-11-22 D2~D5 "채팅 및 버튼으로 수정" · D9)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { CHAT_SUPPORTED_STAGES } from '@/lib/constants'
import { cameraCardMentionLabels, cameraMentionLabel } from '@/features/camera/mention'
import { toggleMentionToken } from '@/lib/card-mention'
import type { DirectorNode } from '@/types/director'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  useGlobalChatStore.getState().reset()
  useLocaleStore.setState({ locale: 'en' })
  useProjectStore.setState({ projectId: 'cam-chat', currentStage: 'camera', reachedStage: 'camera', projectLocale: 'en', projectLocaleLocked: true })
  fetchMock = vi.fn(async () => Response.json({ reply: 'Sure, here is what I would change.', updates: [] }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('Cinema 채팅', () => {
  it('Cinema 에서도 채팅이 켜져 있고, 보낸 말과 Lumi 의 답은 채팅방의 Cinema 구간에 쌓이며 AI 에게 Cinema 화면이라고 알린다', async () => {
    // 왜: 오너 D2~D5 "채팅 및 버튼으로 수정" — Director 채팅과 같은 엔진(바로 실행 · Take 막이, 11/14 9번)을 쓰되 화면은 Camera 다.
    expect(CHAT_SUPPORTED_STAGES.has('camera')).toBe(true)
    await useGlobalChatStore.getState().sendMessage('Make shot 2 a little darker')
    const [url, init] = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/director/chat'))!
    expect(url).toBe('/api/director/chat')
    expect(JSON.parse(init.body)).toMatchObject({ screen: 'camera' })
    expect(useGlobalChatStore.getState().messages.map((m) => m.stage)).toEqual(['camera', 'camera'])
  })

  it('Cinema 의 빠른 칩은 Director 와 같은 말이고 AI 를 거치지 않고 바로 해서 답도 Cinema 구간에 남는다', async () => {
    // 왜: 11/14 시안 D5 — 칩 말은 지금 보드 상태로 바로 한다(잘못 읽을 일 · 채팅 비용 없음).
    await useGlobalChatStore.getState().sendMessage('How far along is it?')
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/director/chat'))).toBe(false)
    const messages = useGlobalChatStore.getState().messages
    expect(messages.length).toBeGreaterThanOrEqual(2)
    expect(new Set(messages.map((m) => m.stage))).toEqual(new Set(['camera']))
  })

  it('Cinema 채팅이 낸 글 고침 [적용] 카드 · 되묻기 · 칩 줄 · 지금 하는 일 줄은 Cinema 화면에서 답하고 보인다', () => {
    // 왜: 카드 단계가 Director 면 Camera 에서 "Director 화면에서 답해 주세요"가 뜨고 "응"이 먹지 않는다.
    const store = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    expect(store).toMatch(/stage: directorChatStage\(stage\),\s*kind: 'directorTextEdit'/)
    expect(store).toMatch(/if \(isDirectorChatStage\(stage\) && projectId && videoAsk\.projectId === projectId\)/)
    expect(store).toMatch(/const quickChip = isDirectorChatStage\(stage\) && !opts\?\.silentUser/)
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/isDirectorChatStage\(currentStage\) && <LumiNowLine \/>/)
    expect(chat).toMatch(/isDirectorChatStage\(currentStage\) && \(/)
  })

  it('Cinema 화면이라는 것을 AI 에게 알릴 때는 노드 · 캔버스 말 대신 샷 줄과 그림 · 영상 판으로 말하게 하고, 기록 단계도 Cinema 로 남긴다', () => {
    // 왜: Director 채팅 안내문은 노드 그래프를 전제로 한다 — Camera 사용자에게 "캔버스의 노드"라고 말하면 화면과 어긋난다.
    const route = readFileSync('src/app/api/director/chat/route.ts', 'utf8')
    expect(route).toMatch(/screen === 'camera' \? CAMERA_SCREEN_NOTE : ''/)
    expect(route).toMatch(/stage: screen === 'camera' \? 'camera' : 'director'/)
  })
})

describe('⌘/Ctrl+클릭 멘션 (D9)', () => {
  it('샷 줄은 "@실사 샷 N", 판은 "@실사 샷 N · 그림 vK" · "@실사 샷 N · Take K", 씬 이름은 "@실사 씬 N"이 된다', () => {
    // 왜: 오너 D9 "모든 탭에서" — Camera 의 카드도 채팅 고르기 목록과 같은 화면 언어 이름을 쓴다(오너 11/14 답 7).
    expect(cameraMentionLabel({ kind: 'shot', label: '샷 3' }, 'ko')).toBe('실사 샷 3')
    expect(cameraMentionLabel({ kind: 'scene', label: '씬 1' }, 'ko')).toBe('실사 씬 1')
    expect(cameraMentionLabel({ kind: 'image', label: '샷 3', n: 2 }, 'ko')).toBe('실사 샷 3 · 그림 v2')
    expect(cameraMentionLabel({ kind: 'take', label: 'Shot 3', n: 4 }, 'en')).toBe('Real Shot 3 · Take 4')
  })

  it('⌘/Ctrl+클릭은 고르기 · 열기 대신 멘션만 하고, 넣을 때는 배지가 입력칸으로 날아가며 뺄 때는 돌아온다 — 채팅이 접혀 있으면 펴진다', () => {
    // 왜: 오너 D9 "애니메이션도 동일하게" — Producer · Artist 카드와 같은 부품(requestMentionToggle · launchMentionFlight).
    const mention = readFileSync('src/features/camera/mention.ts', 'utf8')
    expect(mention).toMatch(/const removing = chatInputHasMention\(label\)/)
    expect(mention).toMatch(/useChatUiStore\.getState\(\)\.requestMentionToggle\(label\)/)
    expect(mention).toMatch(/launchMentionFlight\(\{ label, clickX: event\.clientX, clickY: event\.clientY, toChat: !removing \}\)/)
    for (const file of ['src/features/camera/shot-row.tsx', 'src/features/camera/history-card.tsx', 'src/features/camera/camera-board.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/onClickCapture=\{\(event\) => mentionOnModifierClick\(event, /)
    }
  })

  it('샷 멘션을 다시 ⌘/Ctrl+클릭해 빼도 같은 샷의 판 멘션(· 그림 vN · Take N)은 그대로 남는다', () => {
    // 왜: 판 이름은 샷 이름으로 시작한다 — 넣고 빼기가 판 이름을 모르면 "@실사 샷 1"을 뺄 때 "@실사 샷 1 · 그림 v1"의 앞부분까지 지운다(조각 5 화면 확인에서 찾음).
    const nodes = [
      { id: 'shot-1', data: { kind: 'shot', storyboardImage: { url: 'u2', status: 'completed', versions: [{ id: 'a', n: 1, url: 'u1' }, { id: 'b', n: 2, url: 'u2' }], versionId: 'b' } } },
      { id: 'take-1', data: { kind: 'video', parentShotNodeId: 'shot-1', takeNumber: 1 } },
      { id: 'take-9', data: { kind: 'video', parentShotNodeId: 'shot-2', takeNumber: 9 } },
    ] as unknown as DirectorNode[]
    const cards = cameraCardMentionLabels(nodes, () => '샷 1', 'ko')
    expect(cards).toEqual(['실사 샷 1 · 그림 v1', '실사 샷 1 · 그림 v2', '실사 샷 1 · Take 1'])
    const text = '@실사 샷 1 @실사 샷 1 · 그림 v2 @실사 샷 1 · Take 1 '
    expect(toggleMentionToken(text, '실사 샷 1', ['실사 샷 1', ...cards])).toBe('@실사 샷 1 · 그림 v2 @실사 샷 1 · Take 1')
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/\[\.\.\.mentionItems\.map\(\(m\) => m\.label\), \.\.\.cameraCardLabels\]/)
  })

  it('채팅의 @ 고르기 목록에는 Cinema 에서 실사 씬 · 샷이 나온다', () => {
    // 왜: 카드로 넣은 @이름과 고르기 목록의 이름이 같아야 입력칸에서 멘션으로 알아본다.
    const chat = readFileSync('src/components/layout/global-chat.tsx', 'utf8')
    expect(chat).toMatch(/if \(currentStage === 'camera'\) \{[\s\S]{0,300}sceneShotMentions\(targets, 'real', locale\)/)
  })
})
