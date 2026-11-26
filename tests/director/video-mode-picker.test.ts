// 샷 상세 영상 탭에서 영상 만드는 방식 넷을 고르고, 고를 수 없는 방식은 까닭과 함께 꺼지며, 고른 방식이 새 Take 요청 · Lumi 고치기까지 간다 (오너 2026-11-27 N4a)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { askLumiToFix } from '@/features/director/shot-detail/ask-lumi-fix'
import { shotVideoModeFacts } from '@/features/director/shot-detail/video-mode'
import { mediaPublicUrl } from '@/lib/storage/media-url'
import { newTakeRequest } from '@/lib/director/shot-detail'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import type { VideoNodeData } from '@/types/director'

const IMAGE = { url: 'https://media.test/start.png', status: 'completed' as const, errorMessage: null, generatedAt: 1, frames: { start: 'https://media.test/start.png', direction: 'https://media.test/dir.png', end: 'https://media.test/end.png' } }
const ROUGH = { url: 'https://media.test/rough.png', status: 'completed', errorMessage: null, generatedAt: 500 }
let firstShot = ''
let secondShot = ''

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
function syncStores() {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(writer.getInitialState(), writer.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
}
/** 화면 글 그대로 견주려고 따옴표 · & 이스케이프를 푼다(렌더는 ' 를 &#x27; 로 쓴다). */
const decoded = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const render = (shotNodeId: string) => {
  syncStores()
  return decoded(renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId, initialTab: 'video', layout: 'panel', onClose: () => {} })))
}
function addTake(shotNodeId: string, over: Partial<VideoNodeData>): string {
  const id = director.getState().addVideoTake(shotNodeId)!
  director.getState().updateNodeData<'video'>(id, over)
  return id
}
const doneTake = (shotNodeId: string, n: number, over: Partial<VideoNodeData> = {}) =>
  addTake(shotNodeId, { takeNumber: n, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/${shotNodeId}-${n}.mp4`, videoClipId: `clip-${shotNodeId}-${n}`, generationJobId: `job-${shotNodeId}-${n}`, ...over })
/** 방식 칩 — 글자로 찾아 그 단추의 여는 태그(aria-checked · disabled)를 본다. */
function chip(out: string, label: string): string {
  const group = out.slice(out.indexOf('data-testid="shot-detail-video-modes"'))
  const at = group.indexOf(`>${label}<`)
  expect(at, label).toBeGreaterThan(-1)
  const start = group.lastIndexOf('<button', at)
  return group.slice(start, group.indexOf('>', start) + 1)
}
function buttonTag(out: string, label: string): string {
  const at = out.indexOf(label)
  expect(at, label).toBeGreaterThan(-1)
  const start = out.lastIndexOf('<button', at)
  return out.slice(start, out.indexOf('>', start) + 1)
}

beforeEach(() => {
  director.setState({ projectId: 'mode-project', nodes: [], edges: [], realBatchBusy: false, videoBatchBusy: false, generatingNodeIds: {} })
  const sceneId = director.getState().addSceneNode({ x: 0, y: 0 }, 'sc_01')
  firstShot = director.getState().addShotNode(sceneId, { x: 0, y: 0 })
  secondShot = director.getState().addShotNode(sceneId, { x: 0, y: 400 })
  director.getState().updateNodeData<'shot'>(firstShot, { writerShotId: 'sh_01_01', storyboardImage: IMAGE })
  director.getState().updateNodeData<'shot'>(secondShot, { writerShotId: 'sh_01_02', storyboardImage: IMAGE })
  writer.setState({ shots: [
    { shotId: 'sh_01_01', sceneId: 'sc_01', sortOrder: 1, roughStoryboard: ROUGH },
    { shotId: 'sh_01_02', sceneId: 'sc_01', sortOrder: 2, roughStoryboard: ROUGH },
  ] as never })
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  useGlobalChatStore.setState({ directorVideoFixIntent: null })
  setLocale('en')
})

describe('같이 정한 것', () => {
  // 왜: 오너 N4a "4개의 영상 생성 방식" — main 에는 Cinema 가 없어 Director 샷 상세 영상 탭 [영상 고치기]에서 고른다. 처음 영상이면 기본(시작+프롬프트, 오너 M1).
  it('샷 상세 영상 탭에서 방식 넷(이어서 · 레퍼런스 · 시작+미들 · 시작+프롬프트)을 고르고, 처음 영상이면 시작+프롬프트가 골라져 있다', () => {
    const out = render(secondShot)
    expect(out).toContain('data-testid="shot-detail-video-modes"')
    for (const label of ['Continuation', 'Reference', 'Start + middle', 'Start + prompt']) expect(chip(out, label)).toContain('role="radio"')
    expect(out).not.toContain('>Start + end<')
    expect(chip(out, 'Start + prompt')).toContain('aria-checked="true"')
    expect(out).toContain('Starts from the start image and follows the words.')
    setLocale('ko')
    const ko = render(secondShot)
    for (const label of ['이어서', '레퍼런스', '시작+미들', '시작+프롬프트']) expect(chip(ko, label)).toContain('role="radio"')
  })

  // 왜: 리드 지시 — 거절될 요청을 보내기 전에 화면이 막고 왜 못 고르는지 한 줄로 알린다(Take 를 쓰지 않는다).
  it('씬의 첫 샷 · 앞 샷 영상이 없거나 만드는 중 · 실사 가운데 장이 없으면 그 방식은 꺼지고 까닭이 보인다', () => {
    const first = render(firstShot)
    expect(chip(first, 'Continuation')).toContain('disabled=""')
    expect(first).toContain('Continuation · This is the first shot of its scene, so there is no video to continue from.')

    const none = render(secondShot)
    expect(chip(none, 'Continuation')).toContain('disabled=""')
    expect(none).toContain('Continuation · The previous shot has no finished video yet.')

    addTake(firstShot, { takeNumber: 1, status: 'generating', lastAttemptStatus: 'generating' })
    expect(render(secondShot)).toContain("Continuation · The previous shot's video is still being made.")

    director.setState({ nodes: director.getState().nodes.filter((node) => node.data.kind !== 'video') })
    doneTake(firstShot, 1)
    const ready = render(secondShot)
    expect(chip(ready, 'Continuation')).not.toContain('disabled=""')

    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: { ...IMAGE, frames: undefined } })
    const noMiddle = render(secondShot)
    expect(chip(noMiddle, 'Start + middle')).toContain('disabled=""')
    expect(noMiddle).toContain("Start + middle · This shot's images have no middle frame yet. Remake images first.")
    setLocale('ko')
    expect(render(secondShot)).toContain('시작+미들 · 이 샷의 이미지에 가운데 장이 아직 없어요. 이미지를 다시 만들어 주세요.')
  })
})

describe('같이 정한 것 — 검토 rev-video 고침', () => {
  // 왜(검토 rev-video 4): 앞 샷 ★ Take 를 노드에서 같은 Take 로 다시 만드는 중이면 그 Take 의 마지막 작업은 아직 끝나지 않았다 — 이어서를 켜 두면
  //   장면 올리기가 "끝난 작업이 아니다"로 막혔고, 끝나면 앞 영상이 바뀐다. 다 만들 때까지 끄고 까닭을 말한다.
  it('앞 샷 ★ Take 를 같은 Take 로 다시 만드는 중이면 이어서는 꺼지고 까닭은 "앞 샷 영상을 아직 만드는 중"이다', () => {
    doneTake(firstShot, 1, { final: true, lastAttemptStatus: 'generating', generationJobId: 'job-remake' })
    const out = render(secondShot)
    expect(chip(out, 'Continuation')).toContain('disabled=""')
    expect(out).toContain("Continuation · The previous shot's video is still being made.")
    setLocale('ko')
    expect(render(secondShot)).toContain('이어서 · 앞 샷 영상을 아직 만드는 중이에요.')
  })

  // 왜(검토 rev-video 4): 같은 Take 다시 만들기가 실패 · 멈춤이면 Take 의 마지막 작업은 그 실패한 작업이고 영상은 예전 작업 것이다 —
  //   마지막 작업으로 장면을 올리면 막혔다(403). 지금 영상 파일을 낸 작업(서버가 이어서 출처를 견주는 것과 같은 뜻)으로 잡는다.
  it('앞 샷 ★ Take 의 다시 만들기가 실패 · 멈춤이어도 지금 영상을 낸 작업으로 이어서 장면을 잡는다', () => {
    const oldVideo = mediaPublicUrl('workspace-1/mode-project/videos/clip-a/job-old.mp4')
    const takeId = doneTake(firstShot, 1, { final: true, videoUrl: oldVideo, videoClipId: 'clip-a', generationJobId: 'job-failed', lastAttemptStatus: 'failed' })
    const facts = () => shotVideoModeFacts({ shotNodeId: secondShot, nodes: director.getState().nodes, writerShots: writer.getState().shots })
    expect(facts().facts.previousVideo).toBe('ready')
    expect(facts().previous).toMatchObject({ videoClipId: 'clip-a', generationJobId: 'job-old', videoUrl: oldVideo })

    director.getState().updateNodeData<'video'>(takeId, { generationJobId: 'job-stopped', lastAttemptStatus: 'generating', cancelledAt: '2026-11-27T01:00:00.000Z' })
    expect(facts().facts.previousVideo).toBe('ready')
    expect(facts().previous).toMatchObject({ generationJobId: 'job-old' })
    expect(chip(render(secondShot), 'Continuation')).not.toContain('disabled=""')
  })

  // 왜(검토 rev-video 8 ①): 영상에는 시작 이미지만 쓴다(N4a — 끝 그림은 보내지 않는다). 실사 화살표를 고치면 시작 그림이 같은 새 판이 생긴다(N4b) —
  //   판 번호로 견주면 영상에 들어갈 그림은 그대로인데 "바뀌었어요"가 떴다. 판을 모르는 옛 Take 는 지금 시작 그림이 처음 생긴 때와 견준다.
  it('실사 화살표만 고쳐 새 판이 생겨도 시작 이미지가 같으면 "시작 이미지가 바뀌었어요"를 보이지 않고, 시작 이미지가 바뀌면 보인다', () => {
    const at = (iso: string) => Date.parse(iso)
    const version = (id: string, start: string, direction: string, generatedAt: number) => ({ id, url: `https://media.test/${start}-s.png`, frames: { start: `https://media.test/${start}-s.png`, direction: `https://media.test/${direction}-d.png`, end: `https://media.test/${start}-e.png` }, generatedAt, source: 'generated' as const })
    const first = withStoryboardVersion(null, version('job-1', 'a', 'a', at('2026-11-27T00:00:00Z')), { select: true })
    const arrows = withStoryboardVersion(first, version('job-2', 'a', 'b', at('2026-11-27T02:00:00Z')), { select: true })
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: arrows })
    const takeId = doneTake(secondShot, 1, { createdAt: '2026-11-27T01:00:00Z', lastAttemptAt: '2026-11-27T01:00:00Z', madeFrames: { start: 'https://media.test/a-s.png?v=1', end: null } })
    expect(render(secondShot)).not.toContain('The start image changed · A new Take will use it')
    director.getState().updateNodeData<'video'>(takeId, { madeFrames: null })
    expect(render(secondShot)).not.toContain('The start image changed · A new Take will use it')

    const redrawn = withStoryboardVersion(arrows, version('job-3', 'c', 'c', at('2026-11-27T03:00:00Z')), { select: true })
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: redrawn })
    expect(render(secondShot)).toContain('The start image changed · A new Take will use it')
    director.getState().updateNodeData<'video'>(takeId, { madeFrames: { start: 'https://media.test/a-s.png', end: null } })
    expect(render(secondShot)).toContain('The start image changed · A new Take will use it')
    setLocale('ko')
    expect(render(secondShot)).toContain('시작 이미지가 바뀌었어요 · 새 Take 에 반영돼요')
  })
})

describe('같이 정한 것 — 통합 확인 n-qa', () => {
  // 왜(n-qa 고장 1): 이어서 Take 의 시작은 앞 영상의 마지막 장면이라 샷의 실사 시작 장과 늘 다르다 — 만든 직후에도 "시작 이미지가 바뀌었어요"와
  //   [바뀐 이미지로 새 Take 만들기]가 떴다. 레퍼런스도 실사 시작을 장면으로 쓰지 않는다(참고로만). 실사 시작을 장면으로 쓴 Take 만 실사 시작과 견준다.
  it('이어서 · 레퍼런스처럼 실사 시작을 장면으로 쓰지 않은 Take 는 실사 시작과 견주지 않아 "시작 이미지가 바뀌었어요"를 보이지 않는다', () => {
    const version = (id: string, tag: string, generatedAt: number) => ({ id, url: `https://media.test/${tag}-s.png`, frames: { start: `https://media.test/${tag}-s.png`, direction: `https://media.test/${tag}-d.png`, end: `https://media.test/${tag}-e.png` }, generatedAt, source: 'generated' as const })
    const first = withStoryboardVersion(null, version('job-1', 'a', Date.parse('2026-11-27T00:00:00Z')), { select: true })
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: first })
    const chainFrame = mediaPublicUrl('workspace-1/mode-project/videos/clip-a/job-a_chain-frame-8850.jpg')
    const takeId = doneTake(secondShot, 1, { override: { videoMode: 'continue' }, createdAt: '2026-11-27T01:00:00Z', lastAttemptAt: '2026-11-27T01:00:00Z', madeFrames: { start: chainFrame, end: null } })
    const out = () => render(secondShot)
    expect(out()).not.toContain('The start image changed · A new Take will use it')
    expect(out()).not.toContain('Make a new Take with the changed image')
    // 방식 기록이 없어도 쓴 시작이 실사 시트의 어느 판 시작도 아니면(앞 영상 장면) 견주지 않는다.
    director.getState().updateNodeData<'video'>(takeId, { override: {} })
    expect(out()).not.toContain('The start image changed · A new Take will use it')

    // 실사 시작이 바뀌어도 이어서 · 레퍼런스 Take 는 견주지 않는다.
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: withStoryboardVersion(first, version('job-2', 'c', Date.parse('2026-11-27T02:00:00Z')), { select: true }) })
    director.getState().updateNodeData<'video'>(takeId, { override: { videoMode: 'continue' } })
    expect(out()).not.toContain('The start image changed · A new Take will use it')
    director.getState().updateNodeData<'video'>(takeId, { override: { videoMode: 'reference' }, madeFrames: { start: 'https://media.test/a-s.png', end: null } })
    expect(out()).not.toContain('The start image changed · A new Take will use it')
    setLocale('ko')
    expect(out()).not.toContain('시작 이미지가 바뀌었어요')

    // 실사 시작을 장면으로 쓴 Take(시작+프롬프트)는 지금처럼 견준다.
    setLocale('en')
    director.getState().updateNodeData<'video'>(takeId, { override: { videoMode: 'start_prompt' } })
    expect(out()).toContain('The start image changed · A new Take will use it')
  })
})

describe('같이 정한 것 — 검토 rev-video C', () => {
  // 왜(검토 rev-video C): 실사 화살표를 저장하면 시작 · 끝이 같은 새 판(v2)이 생긴다 — 그 뒤 만든 Take 까지 Take 줄에 "그림 v1"로 적히고
  //   "바뀌었어요"와 [바뀐 이미지로 새 Take 만들기]가 늘 떴다. 그 Take 가 쓴 판은 v2 이고 시작 그림은 그대로다(판 id 가 없는 옛 Take 는 만든 때의 판).
  it('실사 화살표를 저장한 뒤 만든 Take 는 Take 줄에 지금 판("그림 v2")으로 적히고 "시작 이미지가 바뀌었어요"도 [바뀐 이미지로 새 Take 만들기]도 보이지 않는다', () => {
    const at = (iso: string) => Date.parse(iso)
    const version = (id: string, start: string, direction: string, generatedAt: number) => ({ id, url: `https://media.test/${start}-s.png`, frames: { start: `https://media.test/${start}-s.png`, direction: `https://media.test/${direction}-d.png`, end: `https://media.test/${start}-e.png` }, generatedAt, source: 'generated' as const })
    const arrows = withStoryboardVersion(withStoryboardVersion(null, version('job-1', 'a', 'a', at('2026-11-27T00:00:00Z')), { select: true }), version('arrows-1', 'a', 'b', at('2026-11-27T02:00:00Z')), { select: true })
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: arrows })
    const takeId = doneTake(secondShot, 1, { createdAt: '2026-11-27T03:00:00Z', lastAttemptAt: '2026-11-27T03:00:00Z', madeFrames: { start: 'https://media.test/a-s.png?v=1', end: null, versionId: 'arrows-1' } })
    const out = render(secondShot)
    expect(out).toContain('Image v2 · Seedance 2.0 · 720p')
    expect(out).not.toContain('The start image changed · A new Take will use it')
    expect(out).not.toContain('Make a new Take with the changed image')
    expect(out).toContain('Make a new Take · 5 Takes')

    director.getState().updateNodeData<'video'>(takeId, { madeFrames: { start: 'https://media.test/a-s.png', end: null } })
    expect(render(secondShot)).toContain('Image v2 · Seedance 2.0 · 720p')
    setLocale('ko')
    expect(render(secondShot)).toContain('그림 v2 · Seedance 2.0 · 720p')
  })
})

describe('혼자 정한 것', () => {
  // 왜: 샷 상세는 보고 있던 Take 의 설정을 이어받는다(11/14 약속) — 방식도 같다. 모르는 값 · 방식 없는 옛 Take 면 기본.
  it('처음 골라 둔 방식은 보고 있는 Take 의 방식이고, 없으면 기본이다', () => {
    doneTake(secondShot, 1, { override: { videoMode: 'reference' } })
    expect(chip(render(secondShot), 'Reference')).toContain('aria-checked="true"')

    director.setState({ nodes: director.getState().nodes.filter((node) => node.data.kind !== 'video') })
    doneTake(secondShot, 1, { override: { videoMode: 'start_end' as never } })
    expect(chip(render(secondShot), 'Start + prompt')).toContain('aria-checked="true"')
  })

  // 왜: 복사한 프로젝트 · 작업 기록이 생기기 전의 옛 Take 는 영상은 있는데 마지막 장면을 잡을 기록이 없다 — "완성된 영상이 없어요"와 할 일이 다르다.
  it('앞 샷 ★ Take 에 만든 기록이 없으면 이어서 까닭은 "만든 기록이 없어 … 다시 만들면 쓸 수 있어요"다', () => {
    doneTake(firstShot, 1, { generationJobId: null })
    const out = render(secondShot)
    expect(chip(out, 'Continuation')).toContain('disabled=""')
    expect(out).toContain("Continuation · The previous shot's video has no generation record, so its last frame can't be carried over. Remake that video to use Continuation.")
    expect(out).not.toContain('The previous shot has no finished video yet.')
  })

  // 왜: 콘티 화살표를 고친 뒤 실사를 다시 그리지 않으면 실사 가운데 장은 옛 움직임이다 — 실사 카드의 "러프 바뀜"과 같은 판정으로 끈다(dev 리드 D1).
  it('러프를 고친 뒤 실사를 다시 그리지 않았으면 시작+미들이 꺼지고 까닭이 보인다', () => {
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: { ...IMAGE, roughGeneratedAt: ROUGH.generatedAt - 1 } })
    const out = render(secondShot)
    expect(chip(out, 'Start + middle')).toContain('disabled=""')
    expect(out).toContain('Start + middle · Remake the images after editing the rough to use Start + middle.')
  })

  // 왜: 이어받은 방식이 지금은 못 쓰는 방식이면(예: 앞 샷 영상을 지움) 누르면 서버가 거절한다 — Take 를 쓰기 전에 단추를 끄고 까닭을 단추 아래에 보인다.
  it('고른 방식이 꺼져 있으면 새 Take 단추도 꺼지고 까닭이 단추 아래에 보인다', () => {
    doneTake(firstShot, 1, { override: { videoMode: 'continue' } })
    const out = render(firstShot)
    expect(chip(out, 'Continuation')).toContain('aria-checked="true"')
    expect(buttonTag(out, 'Make a new Take · 5 Takes')).toContain('disabled=""')
    expect(out).toContain('This is the first shot of its scene, so there is no video to continue from.')
  })

  // 왜: 새 Take 는 고른 방식을 기록에 남겨야 [다시 만들기] · 노드 · Lumi 가 같은 방식으로 만든다. 이어서가 아니면 이어받은 이어서 출처를 지운다.
  it('샷 상세에서 고른 방식은 새 Take 기록에 실리고, 이어서면 잡은 장면이 출처로 실린다', () => {
    const continueFrom = { videoClipId: 'clip-1', generationJobId: 'job-1', frameUrl: 'https://media.test/clip-1/job-1_chain-frame-2850.jpg' }
    expect(newTakeRequest({ takeId: null, take: null, shotPrompt: 'p', change: '', mode: 'reference' })).toEqual({ videoOverride: { videoMode: 'reference' } })
    expect(newTakeRequest({ takeId: 't1', take: { override: { videoMode: 'continue', continueFrom } }, shotPrompt: 'p', change: '', mode: 'continue', continueFrom }))
      .toEqual({ inheritFromVideoNodeId: 't1', videoOverride: { videoMode: 'continue', continueFrom } })
    expect(newTakeRequest({ takeId: 't1', take: { override: { videoMode: 'continue', continueFrom } }, shotPrompt: 'p', change: '', mode: 'start_prompt' }))
      .toEqual({ inheritFromVideoNodeId: 't1', videoOverride: { videoMode: 'start_prompt' } })
  })

  // 왜: 바꿀 점을 적으면 [Lumi 에게 고쳐 달라고 하기]로 채팅에 간다(오너 O5) — 고른 모델 · 해상도처럼(검토 rev-director 2번) 고른 방식도 그 부탁의 새 Take 까지 가야 한다.
  it('샷 상세에서 고른 방식은 Lumi 에게 고쳐 달라고 해도 새 Take 까지 간다', async () => {
    const sent: string[] = []
    useGlobalChatStore.setState({ loading: false, sendMessage: vi.fn(async (text: string) => { sent.push(text) }) })
    const continueFrom = { videoClipId: 'clip-1', generationJobId: 'job-1', frameUrl: 'https://media.test/clip-1/job-1_chain-frame-2850.jpg' }
    expect(askLumiToFix({ shotNodeId: secondShot, kind: 'video', change: 'slower', closeDetail: false, take: { fromTakeId: 'take-1', provider: 'seedance', resolution: '720p', videoMode: 'continue', continueFrom } })).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(useGlobalChatStore.getState().directorVideoFixIntent).toEqual({ projectId: 'mode-project', shotNodeId: secondShot, fromTakeId: 'take-1', provider: 'seedance', resolution: '720p', videoMode: 'continue', continueFrom })
    // 맡긴 방식은 다시 만들기의 새 Take 설정에 실린다 — 맡긴 것이 없으면 지금처럼 아무것도 얹지 않는다.
    const { fixVideoOverride } = await import('@/stores/global-chat-store')
    expect(fixVideoOverride({ provider: 'h3-max', resolution: '1080p', videoMode: 'continue', continueFrom })).toEqual({ provider: 'h3-max', resolution: '1080p', videoMode: 'continue', continueFrom })
    expect(fixVideoOverride({ provider: 'h3-max', resolution: '1080p' })).toEqual({ provider: 'h3-max', resolution: '1080p' })
    expect(fixVideoOverride({ change: 'slower' })).toBeUndefined()
  })

  // 왜: 어느 Take 를 어떤 방식으로 만들었는지 Take 줄에서 읽혀야 방식끼리 견준다(오너가 고른다) — 기본(시작+프롬프트)과 방식이 적히지 않은 옛 Take 는
  //   이름을 붙이지 않는다(dev Cinema 이력 판과 같은 규칙, 모든 줄에 붙이면 시끄럽다).
  it('Take 줄에는 기본이 아닌 방식으로 만든 Take 에만 그 방식 이름이 붙는다', () => {
    doneTake(secondShot, 1)
    doneTake(secondShot, 2, { override: { videoMode: 'start_prompt' } })
    doneTake(secondShot, 3, { override: { videoMode: 'continue' } })
    const out = render(secondShot)
    const list = out.slice(out.indexOf('data-testid="shot-detail-takes"'))
    const row = (n: number) => list.slice(list.indexOf(`Take ${n}<`), list.indexOf('</li>', list.indexOf(`Take ${n}<`)))
    expect(row(3)).toContain('Continuation · Seedance 2.0')
    expect(row(2)).not.toContain('Start + prompt')
    expect(row(1)).not.toMatch(/Continuation|Reference|Start \+/)
    setLocale('ko')
    expect(render(secondShot)).toContain('이어서 · Seedance 2.0')
  })

  // 왜: 끝 그림을 쓰지 않는 새 Take 에 "시작 v1 + 끝 v1"이 보이면 틀린 말이다(dev QA B) — 옛 시작+끝 Take 는 그대로 읽힌다.
  it('끝을 쓰지 않은 새 Take 는 샷 상세 Take 줄에 "그림 v{n}"으로 보이고, 끝을 쓴 옛 Take 는 "시작 v1 + 끝 v1" 그대로다', () => {
    const version = { id: 'job-1', url: 'https://media.test/a-s.png', frames: { start: 'https://media.test/a-s.png', direction: 'https://media.test/a-d.png', end: 'https://media.test/a-e.png' }, generatedAt: 1, source: 'generated' as const }
    director.getState().updateNodeData<'shot'>(secondShot, { storyboardImage: withStoryboardVersion(null, version, { select: true }) })
    doneTake(secondShot, 1, { madeFrames: { start: 'https://media.test/a-s.png', end: 'https://media.test/a-e.png' } })
    doneTake(secondShot, 2, { madeFrames: { start: 'https://media.test/a-s.png', end: null } })
    const out = render(secondShot)
    expect(out).toContain('Start v1 + End v1 · Seedance 2.0')
    expect(out).toContain('Image v1 · Seedance 2.0')
    setLocale('ko')
    expect(render(secondShot)).toContain('그림 v1 · Seedance 2.0')
  })
})
