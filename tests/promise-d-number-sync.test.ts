// 약속 D — 핀·탭 숫자·버튼 숫자는 서버 생성 큐 하나만 본다 (_tdd.md D, 2026-09-04 오너 확정)
//
//   오너 결정: D6 실패는 카드 표시 + 완료 줄에 "N개 완료, M개 실패"(1안), D15 Artist 복귀는 보던 탭·카드 그대로(1안),
//   완료 줄 합치기는 화면에서(1안 — 안드로이드 알림처럼 스택, 앞줄에 "+N", 누르면 펼침). 문장 하나 = 테스트 하나.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  BATCH_WINDOW_MS,
  completionsOf,
  deriveStageBadges,
  summarizeGenerationBatches,
  withStoryboardBacklog,
  type GenerationBatchRow,
} from '@/lib/generation-batches'
import { buildChatBlocks, groupStatusStacks } from '@/lib/chat-blocks'
import { batchWorks } from '@/lib/pipeline-progress'
import { inFlightPollCount, pollGenerationJob } from '@/lib/generation-jobs-client'
import { markStageSeen, readStageSeen } from '@/lib/stage-seen'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const T0 = Date.parse('2026-09-04T10:00:00Z')
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()
const row = (over: Partial<GenerationBatchRow> & { kind: GenerationBatchRow['kind']; status: GenerationBatchRow['status'] }): GenerationBatchRow => ({
  id: over.id ?? `${over.kind}-${Math.random().toString(36).slice(2, 7)}`,
  target: over.target ?? null,
  created_at: over.created_at ?? iso(0),
  updated_at: over.updated_at ?? over.created_at ?? iso(0),
  ...over,
})

describe('약속 D — 숫자 싱크', () => {
  it('이미지 생성이 N건 쌓이면 채팅 핀에 "0/N"이 뜬다', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row({ id: `c${i}`, kind: 'character_view', status: 'queued', created_at: iso(i * 1000) }))
    const [batch] = summarizeGenerationBatches(rows, T0 + 10_000)
    expect(batch).toMatchObject({ lane: 'artist', stage: 'artist', active: 5, total: 5, done: 0, failed: 0 })
    const [work] = batchWorks([batch], 'ko')
    expect(work).toMatchObject({ done: 0, total: 5, stage: 'artist' })
  })

  it('탭을 바꾸거나 다른 채팅을 하거나 새로고침해도 핀 숫자는 바뀌지 않는다', () => {
    // 숫자의 근거가 서버 잡 행뿐이라 같은 행이면 언제 어디서 계산해도 같다(화면 상태는 입력이 아니다).
    const rows = [row({ id: 'a', kind: 'world_shot', status: 'queued', created_at: iso(0) }), row({ id: 'b', kind: 'world_shot', status: 'completed', created_at: iso(500), updated_at: iso(60_000) })]
    const first = summarizeGenerationBatches(rows, T0 + 70_000)
    const again = summarizeGenerationBatches([...rows].reverse(), T0 + 70_000)
    expect(again).toEqual(first)
    const pin = read('src/components/layout/chat-progress-pin.tsx')
    expect(pin).toMatch(/useGenerationBatches\(projectId\)/)
    expect(pin).not.toMatch(/generatingViews|generatingLocations|artistAssetProgress|videoBatchProgress|s\.nodes/)
    // Director 스토어에서 읽는 것은 아직 제출 못 한 일괄 잔여(realBatchRemaining) 하나뿐 — 곧 큐에 들어갈 일이다.
    const directorSelectors = [...pin.matchAll(/useDirectorCanvasStore\(\(s\) => s\.(\w+)\)/g)].map((m) => m[1])
    expect(directorSelectors).toEqual(['realBatchRemaining'])
  })

  it('한 건 완료되면 핀이 "1/N"이 되고 왼쪽 Artist 탭 숫자가 1 올라간다', () => {
    const rows = [
      row({ id: 'a', kind: 'character_view', status: 'completed', created_at: iso(0), updated_at: iso(30_000) }),
      row({ id: 'b', kind: 'character_view', status: 'queued', created_at: iso(1000) }),
      row({ id: 'c', kind: 'world_shot', status: 'queued', created_at: iso(2000) }),
    ]
    const [batch] = summarizeGenerationBatches(rows, T0 + 40_000)
    expect(batch).toMatchObject({ done: 1, total: 3, active: 2 })
    // 배지 = Artist 탭을 마지막으로 본 뒤 완료된 수. 다른 탭(writer)을 보고 있을 때만 센다.
    const badges = deriveStageBadges(completionsOf(rows), { artist: T0 + 10_000 }, 'writer')
    expect(badges.artist).toBe(1)
    // 배지 근거는 서버 완료 기록 — 사이드바가 그 훅을 쓴다.
    expect(read('src/components/layout/sidebar.tsx')).toMatch(/useStageBadges\(/)
    expect(read('src/stores/global-chat-store.ts')).not.toMatch(/\[stage\]: \(state\.stageBadges\[stage\] \?\? 0\) \+ 1/)
  })

  it('N건 다 되면 핀이 사라진다', () => {
    const rows = [1, 2, 3].map((i) => row({ id: `d${i}`, kind: 'character_view', status: 'completed', created_at: iso(i * 1000), updated_at: iso(60_000) }))
    expect(summarizeGenerationBatches(rows, T0 + 70_000)).toEqual([])
    expect(batchWorks([])).toEqual([])
  })

  it('서버에 도는 작업이 없으면 핀이 보이지 않는다. 화면에서만 기다리는 표시는 세지 않는다', () => {
    // 유령 queued(10분 넘게 제출 뒤 소식 없음)도 도는 것으로 세지 않는다.
    const ghost = row({ id: 'g', kind: 'shot_video', status: 'queued', created_at: iso(-20 * 60_000) })
    expect(summarizeGenerationBatches([ghost], T0)).toEqual([])
    // 핀은 서버 배치와 writer 파이프라인 상태만 입력으로 받는다(store 의 in-flight 플래그 없음).
    const pin = read('src/components/layout/chat-progress-pin.tsx')
    expect(pin).toMatch(/batchWorks\(withStoryboardBacklog\(batches, realBatchRemaining \?\? 0\), locale\)/)
    expect(pin).not.toMatch(/artistImageWork|directorShotImageWork|directorVideoWork|queueWorks/)
  })

  it('한 건 실패하면 그 건은 핀의 N에서 빠지고 카드 표시와 "N개 완료, M개 실패" 줄이 남는다', () => {
    const rows = [
      row({ id: 'a', kind: 'shot_storyboard', status: 'failed', created_at: iso(0), updated_at: iso(20_000) }),
      row({ id: 'b', kind: 'shot_storyboard', status: 'completed', created_at: iso(500), updated_at: iso(25_000) }),
      row({ id: 'c', kind: 'shot_storyboard', status: 'queued', created_at: iso(1000) }),
    ]
    const [batch] = summarizeGenerationBatches(rows, T0 + 30_000)
    // 실패는 done 에 들어가지 않고(N에서 빠짐) 따로 센다.
    expect(batch).toMatchObject({ done: 1, failed: 1, active: 1, total: 3 })
    const [work] = batchWorks([batch], 'ko')
    expect(work.failed).toBe(1)
    // 채팅 스택의 머리글은 "N개 완료, M개 실패".
    const blocks = buildChatBlocks([
      { id: 'm1', role: 'model', content: '✓ 캐릭터 이미지 생성이 끝났어요' },
      { id: 'm2', role: 'model', content: '✓ 캐릭터 이미지 생성이 끝났어요' },
      { id: 'm3', role: 'model', content: '⚠ 캐릭터 이미지 생성이 실패했어요' },
    ])
    const [stack] = groupStatusStacks(blocks)
    expect(stack.kind).toBe('statusStack')
    if (stack.kind === 'statusStack') expect(stack).toMatchObject({ done: 2, failed: 1 })
    expect(read('src/lib/i18n/messages-ko.ts')).toMatch(/'\{done\} done, \{failed\} failed': '\{done\}개 완료, \{failed\}개 실패'/)
  })

  it('Director도 같다: "영상 생성" 버튼의 숫자와 채팅 핀의 N이 같고, "스토리보드 생성" 버튼도 같다', () => {
    const rows = [
      row({ id: 'g1', kind: 'storyboard_real_grid', status: 'queued', created_at: iso(0), target: { writerShotIds: ['s1', 's2', 's3', 's4'] } }),
      row({ id: 'g2', kind: 'storyboard_real_grid', status: 'completed', created_at: iso(500), updated_at: iso(50_000), target: { writerShotIds: ['s5', 's6'] } }),
      row({ id: 'v1', kind: 'shot_video', status: 'queued', created_at: iso(1000) }),
    ]
    const batches = summarizeGenerationBatches(rows, T0 + 60_000)
    expect(batches.find((b) => b.lane === 'director-storyboard')).toMatchObject({ done: 2, total: 6, active: 4 })
    expect(batches.find((b) => b.lane === 'director-video')).toMatchObject({ done: 0, total: 1 })
    // 페이지의 두 버튼이 같은 배치를 읽는다.
    const page = read('src/app/studio/director/page.tsx')
    expect(page).toMatch(/const storyboardBatch = withStoryboardBacklog\(generationBatches, realBatchRemaining \?\? 0\)\.find\(\(b\) => b\.lane === 'director-storyboard'\)/)
    // 아직 제출 못 한 일괄 잔여는 핀과 버튼이 같은 함수로 더한다 — 두 숫자가 같다.
    expect(withStoryboardBacklog(batches, 3).find((b) => b.lane === 'director-storyboard')).toMatchObject({ done: 2, total: 9, active: 7 })
    expect(withStoryboardBacklog(batches, 0)).toEqual(batches)
    expect(page).toMatch(/const videoBatch = generationBatches\.find\(\(b\) => b\.lane === 'director-video'\)/)
    expect(page).toMatch(/\{storyboardBatch\.done\}\/\{storyboardBatch\.total\}/)
    expect(page).toMatch(/\{videoBatch\.done\}\/\{videoBatch\.total\}/)
  })

  it('Artist 탭을 세 번 떠났다 돌아와도 같은 생성 작업의 상태 확인은 하나만 돈다', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      // 두 번째 조회에서 완료
      const done = calls >= 2
      return { ok: true, json: async () => ({ data: { status: done ? 'completed' : 'queued', resultUrl: done ? 'https://x/a.png' : null, error: null } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const p1 = pollGenerationJob('job-1', { intervalMs: 5 })
    const p2 = pollGenerationJob('job-1', { intervalMs: 5 })
    const p3 = pollGenerationJob('job-1', { intervalMs: 5 })
    expect(inFlightPollCount()).toBe(1)
    expect(p2).toBe(p1)
    expect(p3).toBe(p1)
    await expect(p1).resolves.toBe('https://x/a.png')
    expect(inFlightPollCount()).toBe(0)
    vi.unstubAllGlobals()
  })

  it('배경 첫 이미지가 만들어지는 동안 Artist↔Writer를 왕복해도 그 배경의 생성 요청은 하나만 나간다', () => {
    // 세션 안: 이미 도는 배경은 자동 생성이 건너뛴다. 서버: 같은 슬롯의 queued 잡이 있으면 라우트가 deduped 로 답한다.
    const store = read('src/stores/artist-store.ts')
    expect(store).toMatch(/if \(get\(\)\.generatingLocations\.includes\(w\.locationId\)\) \{\s*skipped\.push/)
    expect(read('src/app/api/artist/generate-world/route.ts')).toMatch(/hasQueuedWorldShotJob\(projectId, locationId, column, appearanceKey\)/)
  })

  it('이미 만들어지고 있는 배경은 자동 생성이 다시 요청하지 않는다', () => {
    const store = read('src/stores/artist-store.ts')
    const fn = store.slice(store.indexOf('autoGenerateBaseImages: async () => {'), store.indexOf('refreshLookPendingDrafts: async'))
    expect(fn).toMatch(/already generating/)
  })

  it('캐릭터 이미지가 띄엄띄엄 완성돼도 채팅에는 한 줄만 보이고 N이 하나씩 올라간다', () => {
    const line = (id: string) => ({ id, role: 'model' as const, content: '✓ 캐릭터 이미지 생성이 끝났어요. Artist 탭을 확인하세요.' })
    const one = groupStatusStacks(buildChatBlocks([line('a')]))
    expect(one[0].kind).toBe('status') // 한 건은 그대로
    const three = groupStatusStacks(buildChatBlocks([line('a'), line('b'), line('c')]))
    expect(three).toHaveLength(1)
    expect(three[0]).toMatchObject({ kind: 'statusStack', done: 3, failed: 0 })
    // 저장은 한 건 한 줄(코얼레싱 타이머 없음) — 화면이 합친다.
    const store = read('src/stores/global-chat-store.ts')
    expect(store).not.toMatch(/COMPLETION_COALESCE_MS/)
    expect(read('src/components/layout/global-chat.tsx')).toMatch(/function StatusStackRow/)
  })

  it('사이에 다른 대화가 끼면 그 뒤 완료는 새 줄로 시작한다', () => {
    const line = (id: string) => ({ id, role: 'model' as const, content: '✓ 배경 이미지 생성이 끝났어요' })
    const blocks = groupStatusStacks(buildChatBlocks([line('a'), line('b'), { id: 'u', role: 'user', content: '고마워' }, line('c'), line('d')]))
    expect(blocks.map((b) => b.kind)).toEqual(['statusStack', 'user', 'statusStack'])
  })

  it('완료 알림은 새로고침해도 합쳐진 채로 보인다', () => {
    // 합치기는 저장본이 아니라 렌더 규칙이라 같은 메시지 목록이면 언제나 같은 스택이다.
    const msgs = [
      { id: 'a', role: 'model' as const, content: '✓ 배경 이미지 생성이 끝났어요' },
      { id: 'b', role: 'model' as const, content: '✓ 배경 이미지 생성이 끝났어요' },
    ]
    expect(groupStatusStacks(buildChatBlocks(msgs))).toEqual(groupStatusStacks(buildChatBlocks([...msgs])))
  })

  it('지금 보고 있는 단계의 완료는 채팅에 알리지 않는다. (지금 동작 유지)', () => {
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/if \(currentStage === stage\) return \/\/ 이미 해당 stage를 보고 있음/)
    // 배지도 보고 있는 스테이지는 0 이다.
    const rows = [row({ id: 'a', kind: 'character_view', status: 'completed', created_at: iso(0), updated_at: iso(5000) })]
    expect(deriveStageBadges(completionsOf(rows), { artist: T0 }, 'artist')).toEqual({})
    // 마지막으로 본 시각은 프로젝트별로 남는다.
    markStageSeen('proj-x', 'artist', T0 + 1)
    expect(readStageSeen('proj-x').artist).toBe(T0 + 1)
  })

  it('Artist 탭을 떠났다 돌아오면 보던 탭(인물/배경)과 고른 카드가 그대로다', () => {
    const page = read('src/app/studio/artist/page.tsx')
    expect(page).toMatch(/const tab = useArtistStore\(\(s\) => s\.uiTab\)/)
    expect(page).not.toMatch(/useState<ArtistTab>\('characters'\)/)
    // 고른 카드(selectedCharacterId/selectedLocationId)는 원래 스토어에 있다.
    const store = read('src/stores/artist-store.ts')
    expect(store).toMatch(/uiTab: 'characters',\s*setUiTab: \(tab\) => set\(\{ uiTab: tab \}\)/)
  })

  it('배치 창은 도는 잡 기준 2분 — 한참 전에 따로 만든 이미지는 이번 배치에 섞이지 않는다', () => {
    const old = row({ id: 'old', kind: 'character_view', status: 'completed', created_at: iso(-30 * 60_000), updated_at: iso(-29 * 60_000) })
    const fresh = row({ id: 'q', kind: 'character_view', status: 'queued', created_at: iso(0) })
    const [batch] = summarizeGenerationBatches([old, fresh], T0 + 1000)
    expect(batch).toMatchObject({ total: 1, done: 0 })
    expect(BATCH_WINDOW_MS).toBe(120_000)
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
