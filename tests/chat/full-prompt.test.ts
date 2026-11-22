// 채팅(Lumi)이 샷 프롬프트를 고칠 때 그 샷의 프롬프트를 처음부터 끝까지 보고 고치는지, 일부만 본 프롬프트는 [적용]이 통째로 바꾸지 않는지, [적용] 카드의 전 · 후가 끊기지 않는지 검사한다 (리드 2026-11-23 D③ — 오너 D2~D5 "채팅 · 단추로 고침")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DirectorNode } from '@/types/director'

vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => ({ balance: 40, mode: 'enforce', failed: false })), refetchTakeBalance: vi.fn() }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director, serializeDirectorCanvasContext } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { CHAT_PROMPT_SHOT_CAP, CHAT_PROMPT_TOTAL_CAP, fullPromptShotIds } from '@/lib/director/chat-prompt-budget'
import { directorTextEditLines } from '@/lib/director/lumi-chat-runs'
import { ProposalImpactLine } from '@/components/layout/proposal-impact-line'

// 351자 — QA 복사본 샷 4 의 프롬프트 길이(글은 만든 것).
const LONG = (tag: string) => `${tag} A wide angle shot of a dimly lit empty subway car traveling through a tunnel at night. ` + 'Cold stainless steel bench seats line the car under flickering white lights, the floor reflects the glow. '.repeat(3).slice(0, 351 - tag.length - 92)
const scene = { id: 'scn1', type: 'scene', position: { x: 0, y: 0 }, data: { kind: 'scene', label: 'sc1', writerSceneId: 'sc1', location: '', timeOfDay: '', mood: '', description: '' } } as unknown as DirectorNode
function shot(id: string, prompt: string): DirectorNode {
  return {
    id, type: 'shot', position: { x: 0, y: 0 },
    data: {
      kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, parentSceneNodeId: 'scn1', derivedPrompt: prompt, promptOverride: null,
      camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
      cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3,
      storyboardImage: null, referenceImages: [], imageInputs: [],
    },
  } as unknown as DirectorNode
}
const reply = (updates: unknown[]) => {
  const fetchMock = vi.fn(async () => Response.json({ reply: 'Okay.', updates }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const contextSent = (fetchMock: ReturnType<typeof vi.fn>) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/director/chat')) as [string, RequestInit] | undefined
  return (JSON.parse(String(call?.[1].body)) as { canvasContext: string }).canvasContext
}
/** 이 턴에 부른 주소들(그림 · 영상 만들기 요청이 나갔는지 본다). */
const urlsCalled = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url]) => String(url))
const promptOf = (id: string) => (director.getState().nodes.find((n) => n.id === id)!.data as { promptOverride: string | null }).promptOverride
const saidAll = () => chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content).join('\n')
/** 보드: 씬 하나에 샷 n 개, 샷마다 같은 길이의 프롬프트. */
function board(count: number, length: number) {
  const ids = Array.from({ length: count }, (_, i) => `s${i + 1}`)
  const prompts = new Map(ids.map((id) => [id, `${id}:` + 'x'.repeat(length - id.length - 1)]))
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ids.map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-full', nodes: [scene, ...ids.map((id) => shot(id, prompts.get(id)!))], edges: [], selectedNodeId: null })
  return prompts
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'camera', reachedStage: 'camera', projectId: 'p-full', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  director.setState({ videoBatchBusy: false, realBatchBusy: false })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('같이 정한 것(리드 11/23 D③)', () => {
  it('채팅이 샷 프롬프트를 고칠 때는 그 샷의 프롬프트를 처음부터 끝까지 보고 고친다 — 보드 요약은 고칠 수 있는 샷의 프롬프트를 자르지 않고 싣는다', async () => {
    // 왜: 보드 요약이 샷 프롬프트를 앞 60자만 실어, Lumi 가 "일부만 보여서 전체를 다시 썼어요"라고 한 뒤 [적용]하면 원래 글 뒷부분이 빠졌다
    //   (QA 복사본 샷 4: 351자 중 60자). Cinema 는 노드를 고르지 않아 늘 60자만 보였다.
    writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: [{ shotId: 'w-s1', sceneId: 'sc1' }, { shotId: 'w-s2', sceneId: 'sc1' }] as never })
    director.setState({ projectId: 'p-full', nodes: [scene, shot('s1', LONG('one')), shot('s2', LONG('two'))], edges: [], selectedNodeId: null })
    const fetchMock = reply([])
    await chat.getState().sendMessage('How do the shots look?')
    const context = contextSent(fetchMock)
    expect(context).toContain(LONG('one'))
    expect(context).toContain(LONG('two'))
    expect(context).not.toContain('(prompt cut')
    // 고쳐 달라고 하면 카드의 "전"이 원래 글 전체이고, [적용]은 Lumi 가 다 보고 쓴 글로 바꾼다.
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: `${LONG('one')} The tunnel lights outside are brighter.` } }])
    await chat.getState().sendMessage('Make the tunnel lights in shot 1 brighter')
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(promptOf('s1')).toBe(`${LONG('one')} The tunnel lights outside are brighter.`)
  })

  it('채팅이 일부만 본 프롬프트는 [적용]이 통째로 바꾸지 않는다 — 그 고침은 카드에 넣지 않고, 그 샷을 @멘션해 다시 부탁해 달라고 한다', async () => {
    // 왜: 한 턴에 싣는 프롬프트 글자에 상한이 있어, 큰 프로젝트에서는 앞부분만 실린 샷이 남는다 — 그 샷을 다시 쓴 글로 바꾸면 원래 글이 몰래 빠진다.
    //   부른 샷은 먼저 다 실리므로 @멘션하고 다시 부탁하면 다 보고 고친다.
    const prompts = board(12, 2000)
    const fetchMock = reply([{ type: 'updateShot', id: 's12', patch: { prompt: 'A rewritten prompt from the first 60 characters' } }])
    await chat.getState().sendMessage('Make it warmer')
    expect(contextSent(fetchMock)).toContain(`${prompts.get('s12')!.slice(0, 60)}… (prompt cut: first 60 of 2000 characters)`)
    expect(chat.getState().pendingProposal).toBeNull()
    expect(promptOf('s12')).toBeNull()
    expect(saidAll()).toContain("I only saw the start of Shot 12's prompt, so I left that change out. Mention the shot (@) and ask again.")
    // 그 샷을 불러 다시 부탁하면 그 샷 프롬프트는 다 실리고 카드에 들어간다.
    const again = reply([{ type: 'updateShot', id: 's12', patch: { prompt: `${prompts.get('s12')} warmer` } }])
    await chat.getState().sendMessage('@Real Shot 12 make it warmer')
    expect(contextSent(again)).toContain(prompts.get('s12'))
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
  })

  it('[적용] 카드의 전 · 후는 160자에서 끊기지 않고, 길면 접혀 있다가 [더 보기]로 펼치면 전체가 보인다', () => {
    // 왜: 카드가 160자에서 끊겨 [적용]하면 무엇이 빠지는지 사람이 볼 수 없었다.
    const before = LONG('one')
    const lines = directorTextEditLines('en', [{ kind: 'shot', nodeId: 's1', field: 'prompt', before, after: `${before} Brighter.` }], [shot('s1', before)], null)
    expect(lines[0]).toContain(before)
    expect(lines[1]).toContain(`${before} Brighter.`)
    expect(lines.join('\n')).not.toContain('...')
    const folded = renderToStaticMarkup(createElement(ProposalImpactLine, { text: lines[0] }))
    expect(folded).toContain('line-clamp-3')
    expect(folded).toMatch(/<button[^>]*aria-expanded="false"[^>]*>See more<\/button>/)
    const open = renderToStaticMarkup(createElement(ProposalImpactLine, { text: lines[0], defaultOpen: true }))
    expect(open).not.toContain('line-clamp-3')
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>Collapse<\/button>/)
    // 짧은 줄은 접지 않는다.
    expect(renderToStaticMarkup(createElement(ProposalImpactLine, { text: 'Shot 1 name · before: rain' }))).not.toContain('<button')
    expect(readFileSync('src/components/layout/global-chat.tsx', 'utf8')).toMatch(/<ProposalImpactLine key=\{item\} text=\{scrubProse\(item\)\} \/>/)
  })
})

describe('혼자 정한 것(되돌리기 쉬움)', () => {
  it('샷 프롬프트를 다 싣는 한도는 한 샷 2,000자 · 한 턴 16,000자이고, 넘으면 이번 말에서 부른 샷 → 고른 샷 → 지금 보는 씬의 샷 → 나머지 보드 차례로 먼저 싣는다', () => {
    // 왜: 개발 DB 에서 가장 긴 샷 프롬프트는 894자, 가장 큰 프로젝트는 164샷 42,288자(다 실으면 한 턴에 약 8천 토큰 더) — 보통 프로젝트는 다 싣고,
    //   큰 프로젝트는 지금 말하는 샷 · 보는 씬을 먼저 싣는다.
    expect(CHAT_PROMPT_SHOT_CAP).toBe(2000)
    expect(CHAT_PROMPT_TOTAL_CAP).toBe(16000)
    const shots = Array.from({ length: 10 }, (_, i) => ({ id: `s${i + 1}`, prompt: 'p'.repeat(4000 / 2), sceneNodeId: i < 5 ? 'scA' : 'scB' }))
    const full = fullPromptShotIds({ shots, named: new Set(['s10']), selected: 's9', currentScene: 'scB' })
    // 2,000자 × 8 = 16,000 — 부른 s10 · 고른 s9 · 지금 씬 B 의 s6 s7 s8 · 나머지 차례대로 s1 s2 s3.
    expect([...full].sort()).toEqual(['s1', 's10', 's2', 's3', 's6', 's7', 's8', 's9'])
    // 한 샷 한도를 넘는 프롬프트는 부른 샷이어도 다 싣지 않는다.
    expect(fullPromptShotIds({ shots: [{ id: 'big', prompt: 'p'.repeat(2001), sceneNodeId: null }], named: new Set(['big']), selected: null, currentScene: null }).has('big')).toBe(false)
    // 60자 이하는 자를 것이 없어 늘 다 싣는다.
    expect(fullPromptShotIds({ shots: [{ id: 'short', prompt: 'short prompt', sceneNodeId: null }], named: new Set(), selected: null, currentScene: null }).has('short')).toBe(true)
  })

  it('앞부분만 실은 프롬프트에는 몇 자 중 앞 60자만 실었다고 표시해 AI 에게 알리고, AI 는 그 프롬프트를 다시 쓰지 않고 멘션을 부탁한다', () => {
    // 왜: 표시가 없으면 AI 는 앞 60자를 프롬프트 전체로 알고 다시 쓴다.
    const nodes = [scene, shot('s1', LONG('one')), shot('s2', LONG('two'))]
    const context = serializeDirectorCanvasContext({ projectId: 'p-full', nodes, edges: [], selectedNodeId: null }, null, null, new Set(['s1']))
    expect(context).toContain(LONG('one'))
    expect(context).toContain(`${LONG('two').slice(0, 60)}… (prompt cut: first 60 of ${LONG('two').length} characters)`)
    const route = readFileSync('src/app/api/director/chat/route.ts', 'utf8')
    expect(route).toContain('A shot prompt that ends with "(prompt cut: …)" is only partly shown.')
  })

  it('한 샷 한도(2,000자)를 넘는 프롬프트를 채팅이 고치려 하면 카드에 넣지 않고 샷 상세에서 고쳐 달라고 한다', async () => {
    // 왜: 멘션해도 그 샷은 다 실리지 않는다 — 다시 부탁하라고 하면 같은 일이 되풀이된다.
    writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: [{ shotId: 'w-s1', sceneId: 'sc1' }] as never })
    director.setState({ projectId: 'p-full', nodes: [scene, shot('s1', 'y'.repeat(2500))], edges: [], selectedNodeId: null })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'shorter' } }])
    await chat.getState().sendMessage('@Real Shot 1 make it warmer')
    expect(chat.getState().pendingProposal).toBeNull()
    expect(promptOf('s1')).toBeNull()
    expect(saidAll()).toContain("Shot 1's prompt is too long to change in chat. Change it in the shot details.")
  })

  it('일부만 본 프롬프트의 고침을 뺄 때, 같은 답에서 그 고침을 바라고 부탁한 그 샷의 그림 · 영상도 만들지 않는다', async () => {
    // 왜: 고침이 빠졌는데 그 샷의 그림 · 영상을 만들면 옛 글로 만들어 Take 만 쓴다 — 그 샷을 @멘션해 다시 부탁하면 고침과 함께 다시 온다.
    board(12, 2000)
    const image = { status: 'completed', url: 'https://example.test/s12.png', version: 1 }
    director.setState({ nodes: director.getState().nodes.map((n) => (n.id === 's12' ? ({ ...n, data: { ...n.data, storyboardImage: image } } as DirectorNode) : n)) })
    const fetchMock = reply([
      { type: 'updateShot', id: 's12', patch: { prompt: 'A rewritten prompt from the first 60 characters' } },
      { type: 'generateImage', id: 's12' },
      { type: 'generateVideos', shotIds: ['s12'] },
    ])
    await chat.getState().sendMessage('Make it warmer, then redraw it and make its video')
    expect(chat.getState().pendingProposal).toBeNull()
    expect(urlsCalled(fetchMock).filter((url) => !url.includes('/api/director/chat'))).toEqual([])
    expect((director.getState().nodes.find((n) => n.id === 's12')!.data as { storyboardImage: unknown }).storyboardImage).toEqual(image)
    const said = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(said.filter((line) => line !== 'Okay.')).toEqual(["I only saw the start of Shot 12's prompt, so I left that change out. Mention the shot (@) and ask again."])
  })
})
