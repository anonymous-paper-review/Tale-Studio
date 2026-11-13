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
      { label: '다음', value: '러프 → 실사 이미지 3장 · 약\u00a02분 · Takes 안 써요' },
      { label: '그다음', value: '이미지를 확인하고 영상을 만들어요 · 샷마다 5 Take' },
    ])
  })

  // 왜(리드 2026-11-14, 시안 없음): 실사가 이미 다 있으면 넘어가며 만들 것이 없다 — 꺼진 "0장 만들기"에 "추천"을 달아 두지 않고 칸째 숨긴다.
  it('만들 실사 이미지가 없으면 넘어가면서 만들기 칸과 추천을 숨기고 직접 고르기만 둔다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: 0 })
    expect(view.makeImages).toBeNull()
    expect(view.defaultChoice).toBe('pickYourself')
    expect(view.rows[1].value).toBe('실사 이미지는 이미 다 있어요')
  })

  // 왜(검토 b 낮음 5): Take 과금이 꺼진 때는 노드의 Take 값도 숨긴다(#payments-phase-2) — 넘기기 창도 같은 규칙. 꺼진 때 보이라는 오너 답은 없다.
  it('Take 과금이 꺼져 있으면 Director 넘기기 창에 Take 값을 보이지 않는다', () => {
    const view = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, takesPerShot: null })
    expect(view.rows.slice(1)).toEqual([
      { label: '다음', value: '러프 → 실사 이미지 3장 · 약\u00a02분' },
      { label: '그다음', value: '이미지를 확인하고 영상을 만들어요' },
    ])
  })

  // 왜(검토 b 낮음 7): 저장된 실사를 다 읽기 전이나 읽기에 실패했을 때 샷 전부를 만들 수로 보였다 — 모르는 것은 모른다고, 아는 만큼만 보인다.
  it('Director 넘기기 창은 저장된 실사 그림을 다 읽기 전엔 만들 그림 수를 "세는 중"으로, 읽기에 실패하면 "최대 N장"으로 보인다', () => {
    const counting = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: 'counting' })
    expect(counting.rows[1].value).toBe('러프 → 실사 이미지 · 세는 중')
    expect(counting.makeImages).toMatchObject({ label: '넘어가면서 이미지 만들기', disabled: false })
    expect(counting.description).toBeNull()
    const unknown = directorConfirmView(directorHandoffSummary(manifest, board()), 'ko', { ...extra, imagesToMake: { atMost: 3 } })
    expect(unknown.rows[1].value).toBe('러프 → 실사 이미지 최대 3장 · 약\u00a02분 · Takes 안 써요')
    expect(unknown.makeImages?.label).toBe('넘어가면서 이미지 최대 3장 만들기')
    expect(unknown.defaultChoice).toBe('makeImages')
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

  // 왜(검토 b 낮음 6): 넘어가는 중에 채팅으로 "취소"하면 넘김은 거둬지는데 고른 이미지 만들기 표시가 남아, 10분 안에 다른 길로 Director 에
  //   들어가면 일괄이 시작됐다 — 취소는 넘김과 함께 그 표시도 거둔다.
  it('Director 로 넘어가는 중에 채팅으로 취소하면 "넘어가면서 이미지 만들기"도 거둔다', async () => {
    await handOverToDirector({ makeImages: true })
    await useGlobalChatStore.getState().sendMessage('취소')
    expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(false)
  })

  // 왜(검토 b 낮음 6, 정상 경로 고정): Director 를 여는 데 실패한 것은 사람이 마음을 바꾼 것이 아니다 — 고른 대로 다음 진입에서 시작한다(리드 판단).
  it('Director 를 여는 데 실패해도 고른 "넘어가면서 이미지 만들기"는 남는다', async () => {
    await handOverToDirector({ makeImages: true })
    useGlobalChatStore.getState().failDirectorHandoff()
    expect(takeImagesOnDirectorEntry('proj-1')).toBe(true)
  })

  // 왜: 시작은 Director 화면이 준비된 뒤 그 화면이 한다 — 진입 자동 채움(8/27 에 지운 것)과 다른 길이라는 것을 코드에 둔다.
  it('Director 화면은 넘기기 창에서 고른 경우에만 들어온 뒤 일괄 이미지를 시작한다', () => {
    const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
    expect(page).toMatch(/if \(takeImagesOnDirectorEntry\(guideProjectId\)\) void runRealBatch\(guideProjectId\)/)
  })
})
