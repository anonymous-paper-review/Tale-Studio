// Storyboard → Director 넘기기 창(D0): "넘어가면서 이미지 만들기(추천)"가 미리 골라져 있고, 고른 채 넘어가면 Director 가 열린 뒤 일괄 이미지를 한 번 시작한다
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { directorConfirmView, directorHandoffSummary } from '@/lib/writer/board-summary'
import { realImageBatchMinutes } from '@/lib/director/generation-estimate'
import { requestImagesOnDirectorEntry, takeImagesOnDirectorEntry } from '@/lib/director/entry-images-intent'
import { handOverToDirector } from '@/features/writer/storyboard-director'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import type { RoughStoryboardImage, Shot } from '@/types'

// 이 시험을 위해 지은 보드 — 씬 둘, 샷 셋(4초 · 2초 · 4초), 모두 러프가 있다.
const manifest = { scenes: [{ sceneId: 's1' }, { sceneId: 's2' }] }
const drawn = (shotId: string): RoughStoryboardImage => ({ status: 'completed', url: `https://x/${shotId}.png`, generatedAt: 1, frames: { start: 'a', direction: 'b', end: 'c' } }) as RoughStoryboardImage
const board = () => [
  { shotId: 'a1', sceneId: 's1', durationSeconds: 4, actionDescription: 'run', roughStoryboard: drawn('a1') },
  { shotId: 'a2', sceneId: 's1', durationSeconds: 2, actionDescription: 'stop', roughStoryboard: drawn('a2') },
  { shotId: 'b1', sceneId: 's2', durationSeconds: 4, actionDescription: 'look', roughStoryboard: drawn('b1') },
] as unknown as Shot[]
const extra = { characters: 2, backgrounds: 1, imagesToMake: 3, takesPerShot: 5 }

afterEach(() => {
  vi.unstubAllGlobals()
  takeImagesOnDirectorEntry('__clear__')
})

describe('Director 넘기기 창 — 넘어가면서 이미지 만들기', () => {
  // 왜: 시안 D0 — 넘어가자마자 할 일(러프를 실사로)을 추천으로 미리 골라 둔다. 사람이 [넘어가기] 를 눌러야 시작하므로 8/27 "들어가기만 해도 만들지 않는다"와 안 부딪힌다(페이지 추천).
  it('넘기기 창을 열면 "넘어가면서 이미지 N장 만들기(추천)"가 미리 골라져 있다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', extra)
    expect(view.defaultChoice).toBe('makeImages')
    expect(view.makeImages).toMatchObject({ label: '넘어가면서 이미지 3장 만들기', disabled: false })
    expect(view.pickYourself.label).toBe('넘어가서 직접 고르기')
  })

  // 왜: 시안 D0 · 오너 답 11번(Take 값은 지금 계산 그대로) — 무엇이 넘어가고, 다음에 무엇을 얼마나 걸려 만들고, 그다음에 Take 가 얼마 드는지 넘기기 전에 본다.
  it('넘기기 창은 넘어가는 것 · 다음 · 그다음 세 줄에 샷 · 초 · 인물 · 배경 · 러프 수, 실사 이미지 수 · 예상 분 · Takes 안 씀, 샷마다 Takes 를 보인다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', extra)
    expect(view.title).toBe('Director로 넘어갈까요?')
    expect(view.description).toBe('러프 3장을 실사 이미지로 바꾸는 것부터 시작해요.')
    expect(view.rows).toEqual([
      { label: '넘어가는 것', value: '샷 3 · 10초 · 인물 2 · 배경 1 · 러프 3장' },
      { label: '다음', value: '러프 → 실사 이미지 3장 · 약 2분 · Takes 안 써요' },
      { label: '그다음', value: '이미지를 확인하고 영상을 만들어요 · 샷마다 Takes 5' },
    ])
  })

  // 왜(혼자 정한 것): 실사가 이미 다 있으면 넘어가며 만들 것이 없다 — 0장 만들기를 추천하지 않는다.
  it('만들 실사 이미지가 없으면 넘어가면서 만들기를 끄고 직접 고르기를 골라 둔다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: 0 })
    expect(view.makeImages.disabled).toBe(true)
    expect(view.defaultChoice).toBe('pickYourself')
  })

  // 왜(혼자 정한 것): 예상은 실제 걸린 시간에서 — 일괄은 4샷 시트를 두 장씩 함께 그리고 시트 하나가 약 92초다(개발 DB p50). Director 툴바 예상과 같은 셈.
  it('실사 이미지 일괄 예상은 8샷마다 약 1.5분으로 셈해 분으로 올린다', () => {
    expect([0, 1, 6, 8, 10, 24].map(realImageBatchMinutes)).toEqual([0, 2, 2, 2, 4, 5])
  })
})

describe('넘어간 뒤 Director 에서 일괄 이미지 시작', () => {
  // 넘김 서버 확인(/api/project/[id]/handoff)의 답 — ready 면 Director 를 연다(tests/writer/board-director-handoff 와 같은 꾸밈).
  const ready = { ready: true, blockers: [], warnings: [], counts: { scenes: 2, shots: 3 }, path: '/studio/director' }
  let handoffReply: unknown = ready
  beforeEach(() => {
    handoffReply = ready
    useGlobalChatStore.getState().reset()
    useProjectStore.setState({ projectId: 'proj-1', currentStage: 'writer', reachedStage: 'writer', projectLocale: 'ko', projectLocaleLocked: true })
    useLocaleStore.setState({ locale: 'ko' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(handoffReply)))
  })

  // 왜: 창에서 고른 것이 Director 가 열린 뒤에 일어나야 한다 — 같은 일괄이 두 번 돌지 않게 한 번만.
  it('넘기기 창에서 이미지 만들기를 고르고 넘어가면 Director 가 열린 뒤 일괄 이미지 만들기를 한 번만 시작한다', async () => {
    await handOverToDirector({ makeImages: true })
    expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(true)
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(false)
  })

  // 왜: 8/27 "들어가기만 해도 실사를 만들지 않는다" — 직접 고르기를 골랐거나 다른 프로젝트의 Director 가 열리면 시작하지 않는다.
  it('넘어가서 직접 고르기로 넘어가면 Director 가 열려도 이미지를 만들지 않는다', async () => {
    await handOverToDirector({ makeImages: false })
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(false)
    requestImagesOnDirectorEntry('proj-1')
    expect(takeImagesOnDirectorEntry('proj-2')).toBe(false)
  })

  // 왜(혼자 정한 것): 넘김이 막혀 Director 가 안 열렸다가 나중에 다른 길(사이드바 등)로 들어갔을 때 갑자기 만들지 않는다.
  it('넘김이 막혀 Director 가 열리지 않으면 고른 이미지 만들기는 없던 일이 된다', async () => {
    handoffReply = { ready: false, blockers: [{ code: 'missing_image', label: '코마츠: 기본 이미지 필요', action: 'Artist에서 코마츠 이미지를 준비해 주세요' }], warnings: [], counts: { scenes: 2, shots: 3 } }
    await handOverToDirector({ makeImages: true })
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(false)
    requestImagesOnDirectorEntry('proj-1', 0)
    expect(takeImagesOnDirectorEntry('proj-1', 10 * 60_000 + 1)).toBe(false)
  })

  // 왜: 시작은 Director 화면이 준비된 뒤 그 화면이 한다 — 진입 자동 채움(8/27 에 지운 것)과 다른 길이라는 것을 코드에 둔다.
  it('Director 화면은 넘기기 창에서 고른 경우에만 들어온 뒤 일괄 이미지를 시작한다', () => {
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toMatch(/if \(takeImagesOnDirectorEntry\(guideProjectId\)\) void runRealBatch\(guideProjectId\)/)
  })
})
