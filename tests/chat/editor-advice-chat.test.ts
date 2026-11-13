// Editor 의 Lumi 채팅이 조언만 하고 작업물(타임라인 · 클립 · 소리 · 제목)에는 손대지 않는지, 조언에 지금 타임라인 요약을 읽어 쓰는지 검사한다 (오너 2026-11-14 10번)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createCatalogClient: vi.fn(),
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useEditorStore as editor } from '@/stores/editor-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { CHAT_SUPPORTED_STAGES, STAGE_PLACEHOLDER, STAGE_PROMPT_PRESETS } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'
import { editorChatContext } from '@/lib/editor/chat-context'
import type { Shot, VideoClip, AudioTrackClip } from '@/types/shot'

const shot = (shotId: string, over: Partial<Shot> = {}): Shot => ({
  shotId, sceneId: 'scene-1', shotType: 'CU', actionDescription: `Action of ${shotId}`, characters: [], durationSeconds: 3,
  generationMethod: 'I2V', dialogueLines: [], camera: {} as Shot['camera'], lighting: {} as Shot['lighting'], ...over,
} as Shot)
const clip = (shotId: string, over: Partial<VideoClip> = {}): VideoClip => ({ shotId, url: `https://media.test/${shotId}.mp4`, status: 'completed', thumbnailUrl: null, ...over })
const MUSIC: AudioTrackClip = { id: 'a1', name: 'rain-bgm.mp3', url: 'blob:music', startSec: 0, durationSec: 6, volume: 0.8, muted: false, trackId: 'track-1' } as AudioTrackClip

let fetchMock: ReturnType<typeof vi.fn>
let serverReply: Record<string, unknown>
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))

function seedTimeline() {
  editor.setState({
    shots: [
      shot('sh-1', { actionDescription: 'Harin shivers under the eaves' }),
      shot('sh-2', { shotType: 'MS', actionDescription: 'Grandpa tilts the umbrella' }),
    ],
    videoClips: [clip('sh-1'), clip('sh-2', { transitionIn: { type: 'dissolve', durationSec: 1 } })],
    clipOrder: { 'scene-1': ['sh-1', 'sh-2'] },
    audioClips: [MUSIC],
    audioTracks: [{ id: 'track-1' }],
  })
}
const timeline = () => {
  const s = editor.getState()
  return JSON.parse(JSON.stringify({ shots: s.shots, videoClips: s.videoClips, clipOrder: s.clipOrder, audioClips: s.audioClips, audioTracks: s.audioTracks, past: s.past.length }))
}

beforeEach(() => {
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ projectId: 'proj-e', currentStage: 'editor', reachedStage: 'editor', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  seedTimeline()
  serverReply = { reply: 'Right-click the second cut and pick a transition.' }
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/editor/chat') return Response.json(serverReply)
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Editor 의 Lumi 는 조언만 한다(오너 10번)', () => {
  // 왜: 오너 10번 "Editor에서는 Lumi 기능 안 되게 해줘. 대신 채팅으로 조언을 얻을 수 있게" — 예전엔 Editor 채팅이 아예 막혀 있었다.
  it('Editor 에서도 Lumi 채팅이 열리고, 묻는 말을 조언 길로 보내 그 답을 보인다', async () => {
    expect(CHAT_SUPPORTED_STAGES.has('editor')).toBe(true)
    await chat.getState().sendMessage('How do I connect the two cuts smoothly?')
    expect(calls('/api/editor/chat')).toHaveLength(1)
    expect(calls('/api/editor/chat')[0]).toMatchObject({ message: 'How do I connect the two cuts smoothly?', projectId: 'proj-e' })
    const said = chat.getState().messages
    expect(said.at(-2)).toMatchObject({ stage: 'editor', role: 'user', content: 'How do I connect the two cuts smoothly?' })
    expect(said.at(-1)).toMatchObject({ stage: 'editor', role: 'model', content: 'Right-click the second cut and pick a transition.' })
  })

  // 왜: 오너 10번 "작업물에는 터치 못 하게" — 서버가 잘못해 바꾸는 내용을 실어 보내도 화면은 받지 않는다. 바꾸는 길이 아예 없다.
  it('Editor 채팅의 답에 작업물을 바꾸는 내용이 실려 와도 타임라인 · 클립 · 소리 · 되돌리기 기록은 그대로다', async () => {
    const before = timeline()
    serverReply = {
      reply: 'Done.',
      updates: [{ type: 'deleteClip', shotId: 'sh-1' }, { type: 'setSpeed', shotId: 'sh-2', speed: 2 }],
      proposals: [{ type: 'removeAudio', id: 'a1' }],
      extractedSettings: { playtime: 99 },
    }
    await chat.getState().sendMessage('Delete the first cut')
    expect(timeline()).toEqual(before)
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual(['/api/editor/chat'])
    expect(chat.getState().pendingProposal).toBeNull()
  })

  // 왜: 조언이 지금 편집을 보고 말하게 — 컷 수 · 길이 · 순서 · 전환 · 소리 줄을 읽기만 해서 보낸다. 내부 id 는 싣지 않는다(채팅 답 규칙).
  it('Editor 채팅은 지금 타임라인 요약(컷 수 · 길이 · 순서 · 전환 · 소리 줄)을 읽어 조언에 쓰고 내부 번호는 싣지 않는다', async () => {
    const context = editorChatContext(editor.getState())
    expect(context).toContain('Cuts on the timeline: 2')
    expect(context).toContain('Total length: 6.0s')
    expect(context).toMatch(/1\. 0\.0s–3\.0s \(3\.0s\) CU · "Harin shivers under the eaves"/)
    expect(context).toMatch(/2\. 3\.0s–6\.0s \(3\.0s\) MS · "Grandpa tilts the umbrella" · fades through black from the cut before \(1s\)/)
    expect(context).toMatch(/Audio: 1 clip · "rain-bgm\.mp3" 0\.0s–6\.0s · volume 80%/)
    expect(context).not.toContain('sh-1')
    await chat.getState().sendMessage('Which cut is too long?')
    expect(calls('/api/editor/chat')[0].timelineContext).toBe(context)
  })

  // 왜: 조언을 묻는 자리다 — 입력칸이 막혀 있지 않고, 빠른 요청은 조언 질문만 있다(시안 없음 · 혼자 정한 것).
  it('Editor 입력칸 안내는 "예: 컷 사이를 부드럽게 이으려면?"이고 빠른 요청은 조언 질문만 있다', () => {
    expect(translate('ko', STAGE_PLACEHOLDER.editor)).toBe('예: 컷 사이를 부드럽게 이으려면?')
    expect(translate('en', STAGE_PLACEHOLDER.editor)).toBe('E.g. how do I connect two cuts smoothly?')
    expect(STAGE_PROMPT_PRESETS.editor.map((preset) => translate('ko', preset))).toEqual([
      '컷 사이를 부드럽게 이으려면?',
      '너무 긴 컷이 있어?',
      '배경 음악은 어떻게 넣어?',
    ])
  })
})
