// 샷 상세의 이미지 · 영상 고치기 칸에 글을 적으면 생성을 바로 부르지 않고 그 샷 @멘션과 함께 Director 채팅(Lumi)에 보낸다 — 채팅이 맥락을 보고 프롬프트를 고쳐 다시 만든다 (오너 2026-11-26 D6)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askLumiToFix } from '@/features/director/shot-detail/ask-lumi-fix'
import { serializeDirectorCanvasContext, useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useLocaleStore } from '@/stores/locale-store'
import { resetActionGuard } from '@/lib/action-guard'

const FULL_PROMPT = 'A tired woman in a grey blouse sits alone in a night subway car under cold fluorescent light, her head resting on the window, rain streaks outside'
const api = () => useDirectorCanvasStore.getState()
let shotId = ''
let sent: string[] = []

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
}

beforeEach(() => {
  resetActionGuard()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: 'fix-chat-project', viewMode: 'storyboard' })
  const sceneId = api().addSceneNode({ x: 0, y: 0 }, 'sc_01')
  // 동기화가 만드는 샷처럼 Writer 샷 id 를 이름으로 받는다(보드 이름 "Shot 1").
  shotId = api().addShotNode(sceneId, { x: 0, y: 0 }, 'sh_01_01')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', parentSceneNodeId: sceneId, derivedPrompt: FULL_PROMPT })
  api().openShotDetail(shotId, 'image')
  sent = []
  useGlobalChatStore.setState({ loading: false, sendMessage: vi.fn(async (text: string) => { sent.push(text) }) })
  useChatUiStore.setState({ collapsed: true })
  setLocale('en')
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
})
afterEach(() => vi.unstubAllGlobals())

describe('고치기 칸 → Director 채팅', () => {
  it('바꾸고 싶은 점을 적고 [Lumi 에게 고쳐 달라고 하기]를 누르면 생성을 바로 부르지 않고 그 샷 @멘션과 함께 채팅에 보낸다', () => {
    // 왜: 오너 2026-11-26 D6 "이미지 영상 등 모든 작업은 채팅창에 있는 기능 활용(채팅창에 우리가 요청하고 업데이트하는걸로)" —
    //   예전 칸은 글을 "Change from the previous image:" 로 덧붙여 바로 다시 그려, 앞 그림 · 맥락 없이 새로 칠했다(4a02fe1f "맥락있게 수정이 안 된다").
    expect(askLumiToFix({ shotNodeId: shotId, kind: 'image', change: '  show the umbrella handle ', closeDetail: true })).toBe('sent')
    expect(sent).toEqual(['@Real Shot 1 Fix the image and make it again: show the umbrella handle'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('영상 고치기 칸의 글은 "새 Take 로 다시 만들어 줘"로 보내고, 한국어 화면에서는 한국어로 보낸다', () => {
    // 왜: 영상은 덮어쓰지 않고 새 Take 로 만든다(D7) — 채팅이 그 샷을 다시 만들기(새 Take)로 받게 말로 분명히 한다. 채팅 @목록과 같은 화면 말 이름.
    expect(askLumiToFix({ shotNodeId: shotId, kind: 'video', change: 'slow push in', closeDetail: false })).toBe('sent')
    setLocale('ko')
    askLumiToFix({ shotNodeId: shotId, kind: 'video', change: '천천히 다가간다', closeDetail: false })
    expect(sent).toEqual([
      '@Real Shot 1 Fix the video and make a new Take: slow push in',
      '@실사 샷 1 영상을 고쳐서 새 Take 로 다시 만들어 줘: 천천히 다가간다',
    ])
  })

  it('보낼 때 그 샷을 골라 채팅 맥락에 그 샷의 프롬프트 전체가 실린다', () => {
    // 왜: 채팅 맥락은 샷 프롬프트를 앞 60자만 싣고 고른 노드만 전체를 싣는다 — 스토리보드 보기 팝업은 샷을 고르지 않아, 채팅이 60자만 보고 새 글을 썼다.
    expect(serializeDirectorCanvasContext(api())).not.toContain(FULL_PROMPT)
    askLumiToFix({ shotNodeId: shotId, kind: 'image', change: 'show the umbrella handle', closeDetail: true })
    expect(api().selectedNodeId).toBe(shotId)
    expect(serializeDirectorCanvasContext(api())).toContain(`prompt (full): ${FULL_PROMPT}`)
  })

  it('보낸 뒤 스토리보드 보기의 팝업은 닫혀 채팅의 [적용]이 보이고, 채팅이 열린다', () => {
    // 왜: 팝업은 화면을 막는 창이라 열어 둔 채로는 채팅의 글 카드 [적용]을 누를 수 없다. 닫혀 있던 채팅(Director 기본)은 연다.
    askLumiToFix({ shotNodeId: shotId, kind: 'image', change: 'show the umbrella handle', closeDetail: true })
    expect(api().detailNodeId).toBeNull()
    expect(useChatUiStore.getState().collapsed).toBe(false)
  })

  it('노드 보기 왼쪽 패널에서 보내면 패널은 그대로 둔다', () => {
    // 왜: 왼쪽 패널은 화면을 막지 않는다 — 채팅의 답과 패널을 같이 본다.
    askLumiToFix({ shotNodeId: shotId, kind: 'image', change: 'show the umbrella handle', closeDetail: false })
    expect(api().detailNodeId).toBe(shotId)
  })

  it('Lumi 가 다른 말을 처리하는 중이면 보내지 않고 끝나면 다시 누르라고 알린다', () => {
    // 왜: 채팅은 바쁘면 새 말을 받지 않고 조용히 버린다(sendMessage) — 보낸 줄 알고 기다리지 않게 그 자리에서 알린다.
    useGlobalChatStore.setState({ loading: true })
    expect(askLumiToFix({ shotNodeId: shotId, kind: 'image', change: 'show the umbrella handle', closeDetail: true })).toBe('busy')
    expect(sent).toEqual([])
    expect(api().detailNodeId).toBe(shotId)
  })

  it('고치기 칸이 비어 있으면 지금처럼 그 자리 단추가 바로 다시 만들고 채팅으로 보내지 않는다', () => {
    // 왜: 정상 경로 고정 — 글 없이 다시 만들기(같은 설정)는 고치기가 아니다. 글이 있을 때만 채팅 단추로 바뀐다.
    expect(askLumiToFix({ shotNodeId: shotId, kind: 'image', change: '   ', closeDetail: true })).toBe('empty')
    expect(sent).toEqual([])
    const imageTab = readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')
    const videoTab = readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')
    expect(imageTab).toMatch(/change\.trim\(\)\s*\?\s*<AskLumiButton[^>]*kind="image"/)
    expect(videoTab).toMatch(/change\.trim\(\)\s*\?\s*<AskLumiButton[^>]*kind="image"/)
    expect(videoTab).toMatch(/change\.trim\(\)\s*\?\s*<AskLumiButton[^>]*kind="video"/)
    expect(imageTab).not.toMatch(/changeNote=\{change\}/)
    expect(videoTab).not.toMatch(/changeNote=\{change\}/)
  })
})
