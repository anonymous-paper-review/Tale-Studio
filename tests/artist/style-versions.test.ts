// 작품 스타일 기록(버전) 판정 — 머리 줄 단추 · 재생성 창 요약 · 그릴 칸과 순서 · 이어 그리기 · 카드 기록의 스타일 판정 (2026-10-28 오너, 프로토타입 A5 · A6 · AV · A7)
import { describe, expect, it } from 'vitest'
import { mediaUrlOf } from '../fixtures/_memory-supabase'
import {
  buildRegenPlan,
  historyOrder,
  historyPick,
  nextRegenTargets,
  previousVersionWithStyle,
  regenCounts,
  regenKeptUploads,
  regenProgress,
  regenSlotKey,
  regenSlotState,
  regenStyleNote,
  styleLookTokens,
  versionHeader,
  type RegenRecord,
  type RegenSlot,
  type VersionSummary,
} from '@/lib/artist/style-versions'

const T0 = '2026-10-28T01:00:00.000Z'
const T1 = '2026-10-28T02:00:00.000Z'
const T2 = '2026-10-28T03:00:00.000Z'
const T3 = '2026-10-28T04:00:00.000Z'
const T4 = '2026-10-28T05:00:00.000Z'

const v = (n: number, styleId: string | null, active: VersionSummary['active'], current = false): VersionSummary => ({ n, styleId, current, active })

describe('머리 줄 — 작품 스타일 · 버전 · 두 단추', () => {
  it('기록이 하나뿐이면 [불러오기]가 꺼지고 재생성하면 이전 버전이 기록에 남는다고 알린다', () => {
    // 왜: 프로토타입 A5 — 아직 다른 버전이 없으면 불러올 것이 없다. 무엇을 하면 기록이 생기는지 알려 준다.
    expect(versionHeader({ versions: [], completed: false, drawing: false })).toEqual({ n: 1, count: 1, canLoad: false, canRegenerate: true, note: 'single' })
    expect(versionHeader({ versions: [v(1, 'real', [{ from: null, to: null }], true)], completed: false, drawing: false })).toMatchObject({ n: 1, count: 1, canLoad: false, note: 'single' })
  })

  it('기록이 둘 이상이면 [불러오기 · 기록 N]이 켜지고 머리 줄에 지금 버전 번호를 보인다', () => {
    // 왜: 정상 경로 고정 — 재생성 뒤에는 지금 버전 번호와 기록 수가 보이고 이전 버전을 불러올 수 있다.
    const versions = [v(1, 'real', [{ from: null, to: T1 }]), v(2, 'watercolor', [{ from: T1, to: null }], true)]
    expect(versionHeader({ versions, completed: false, drawing: false })).toEqual({ n: 2, count: 2, canLoad: true, canRegenerate: true, note: null })
  })

  it('[완료하기] 뒤(Storyboard 열림)에는 [불러오기] · [재생성하기]가 꺼지고 그 까닭이 보인다', () => {
    // 왜: 오너 결정(2) — 스타일을 바꾸는 일은 Storyboard 를 열기 전에만 한다. 러프 · 샷이 지금 그림으로 이미 만들어진다.
    const versions = [v(1, 'real', [{ from: null, to: T1 }]), v(2, 'watercolor', [{ from: T1, to: null }], true)]
    expect(versionHeader({ versions, completed: true, drawing: false })).toEqual({ n: 2, count: 2, canLoad: false, canRegenerate: false, note: 'completed' })
  })

  it('그림을 그리는 동안에는 [불러오기] · [재생성하기]가 꺼진다', () => {
    // 왜: 그리는 중에 버전을 바꾸면 그리던 그림이 어느 버전 것인지 어긋난다(다 그린 뒤 다시 누른다).
    const versions = [v(1, 'real', [{ from: null, to: T1 }]), v(2, 'watercolor', [{ from: T1, to: null }], true)]
    expect(versionHeader({ versions, completed: false, drawing: true })).toEqual({ n: 2, count: 2, canLoad: false, canRegenerate: false, note: 'drawing' })
  })

  it('버전을 불러오는 동안에는 [불러오기] · [재생성하기]가 꺼지고 "그리는 중"이 아니라 불러오는 중이라고 보인다', () => {
    // 왜: 멈춘 재생성에서 [이전 버전으로 돌아가기]를 누르면 머리 줄이 "그림을 그리는 중이에요"로 바뀌어 아직 그리는 줄 알았다(2026-10-28 개발 DB e2e).
    const versions = [v(1, 'real', [{ from: null, to: T1 }]), v(2, 'watercolor', [{ from: T1, to: null }], true)]
    expect(versionHeader({ versions, completed: false, drawing: false, loading: true, stopped: true })).toEqual({ n: 2, count: 2, canLoad: false, canRegenerate: false, note: 'loading' })
  })
})

describe('재생성 창 — 어떤 스타일로 다시 만들까요?', () => {
  it('고른 스타일로 만든 이전 버전이 있으면 다시 만들지 않고 그 버전을 불러올 수 있다고 알린다', () => {
    // 왜: 프로토타입 A6 "✦ v{k}에 ~로 만든 게 있어요" — 같은 스타일을 또 그리면 시간과 비용이 든다.
    const versions = [
      v(1, 'real', [{ from: null, to: T1 }]),
      v(2, 'watercolor', [{ from: T1, to: T2 }]),
      v(3, 'real', [{ from: T2, to: T3 }]),
      v(4, 'anime', [{ from: T3, to: null }], true),
    ]
    expect(previousVersionWithStyle(versions, 'real')?.n).toBe(3)
    expect(previousVersionWithStyle(versions, 'watercolor')?.n).toBe(2)
    // 지금 버전의 스타일은 "이전 버전"이 아니다.
    expect(previousVersionWithStyle(versions, 'anime')).toBeNull()
    expect(previousVersionWithStyle(versions, 'ink')).toBeNull()
  })

  it('요약 줄은 다시 만드는 인물 · 배경 수(모습은 따로 세지 않음)와 작품 스타일이 그대로인지 바뀌는지를 보인다', () => {
    // 왜: 프로토타입 A6 요약 — 무엇을 얼마나 다시 그리는지, 작품 스타일이 바뀌는지를 누르기 전에 본다(긴 대시 없이).
    const plan = buildRegenPlan({
      characters: [{ characterId: 'minho', entityType: 'person' }, { characterId: 'soonja', entityType: 'person' }],
      appearances: [
        { characterId: 'minho', appearanceKey: 'current', isDefault: true, sheetUrl: 'https://img/m.png' },
        { characterId: 'minho', appearanceKey: 'young', isDefault: false, sheetUrl: 'https://img/my.png' },
        { characterId: 'soonja', appearanceKey: 'current', isDefault: true, sheetUrl: 'https://img/s.png' },
      ],
      locations: [{ locationId: 'hall', wideShot: 'https://img/h.png' }],
      locationAppearances: [{ locationId: 'hall', appearanceKey: 'night', wideShot: 'https://img/hn.png' }],
    })
    expect(regenCounts(plan)).toEqual({ persons: 2, places: 1 })
    expect(regenStyleNote('real', 'real')).toBe('same')
    expect(regenStyleNote('watercolor', 'real')).toBe('changes')
  })
})

describe('그림 지시의 그림체 값', () => {
  const anime = { art_style: 'japanese_anime', line_quality: 'clean', shape_language: 'mixed', texture_philosophy: 'flat', character_proportion: '6.5:1' }

  it('다른 스타일로 다시 만들면 인물 그림 지시의 그림체 값(매체 · 선 · 형태 · 질감)이 새 스타일 것으로 바뀌고, 같은 스타일이면 그대로다', () => {
    // 왜: 개발 DB e2e(2026-10-28) — 2D 일본 애니 작품을 실사로 다시 만들었는데 그림 지시에 "art style: japanese_anime"가 남아 그대로 애니로 나왔다.
    //   그림체 값은 처음 만들 때 그 스타일로 정한 값이다(v0 visual) — 스타일이 바뀌면 같이 바꾼다. 실사는 처음 실사로 만든 작품의 값과 같게.
    expect(styleLookTokens('live_action', anime)).toEqual({ art_style: 'live_action', line_quality: 'none', shape_language: 'natural', texture_philosophy: 'photorealistic', character_proportion: '7.5:1' })
    expect(styleLookTokens('watercolor', anime)).toMatchObject({ art_style: 'watercolor', texture_philosophy: 'painterly', character_proportion: '6.5:1' })
    expect(styleLookTokens('2d_anime', { ...anime, art_style: 'live_action' }).art_style).toBe('2d_anime')
    // 매체를 모르면(직접 올린 그림체 · 옛 키) 바꾸지 않는다 — 그 그림체는 그림과 분석이 정한다.
    expect(styleLookTokens(null, anime)).toEqual(anime)
  })
})

describe('재생성 계획 — 무엇을 어떤 순서로 그리나', () => {
  const plan = buildRegenPlan({
    characters: [{ characterId: 'minho', entityType: 'person' }, { characterId: 'cup', entityType: 'object' }],
    appearances: [
      { characterId: 'minho', appearanceKey: 'current', isDefault: true, sheetUrl: 'https://img/m.png' },
      { characterId: 'minho', appearanceKey: 'young', isDefault: false, sheetUrl: null },
      { characterId: 'cup', appearanceKey: 'current', isDefault: true, sheetUrl: 'https://img/cup.png' },
    ],
    locations: [{ locationId: 'hall', wideShot: 'https://img/h.png' }],
    locationAppearances: [{ locationId: 'hall', appearanceKey: 'night', wideShot: 'https://img/hn.png' }],
  })

  it('재생성은 인물 시트의 모든 모습과 배경의 모든 모습을 다시 그린다', () => {
    // 왜: 오너 "인물 시트(모든 모습 포함)와 배경(모든 모습 포함) 전체를 새로 그려 새 버전" — 모습 하나라도 옛 스타일로 남으면 안 된다.
    expect(plan.map(regenSlotKey).sort()).toEqual(['c:minho:current', 'c:minho:young', 'l:hall:default', 'l:hall:night'])
    // 시작할 때의 그림 주소를 적어 둔다 — 이어 그릴 때 그 칸이 바뀌었는지 본다.
    expect(plan.find((slot) => regenSlotKey(slot) === 'c:minho:current')?.fromUrl).toBe('https://img/m.png')
  })

  it('사물 카드는 재생성에서 다시 그리지 않는다', () => {
    // 왜: 요약 줄이 "인물 N · 배경 M"만 센다 — 사물은 예전 흐름에만 남은 카드라 지금 그림을 그대로 두고 기록에만 남긴다.
    expect(plan.some((slot) => slot.id === 'cup')).toBe(false)
  })

  it('기본 모습을 먼저 그리고, 다른 모습은 그 인물 · 배경의 기본 모습이 끝난 뒤 그린다', () => {
    // 왜: 다른 모습은 기본 모습 얼굴(대표 얼굴) · 기본 배경 그림을 참고로 그린다 — 새 스타일 기본 모습이 먼저 있어야 덜 섞인다.
    const record: RegenRecord = { startedAt: T1, slots: plan, failed: [], doneAt: null }
    const keys = (states: Record<string, 'done' | 'failed' | 'drawing' | 'todo'>) => nextRegenTargets(record, states).map(regenSlotKey).sort()
    expect(keys({ 'c:minho:current': 'todo', 'c:minho:young': 'todo', 'l:hall:default': 'todo', 'l:hall:night': 'todo' })).toEqual(['c:minho:current', 'l:hall:default'])
    expect(keys({ 'c:minho:current': 'drawing', 'c:minho:young': 'todo', 'l:hall:default': 'done', 'l:hall:night': 'todo' })).toEqual(['l:hall:night'])
    // 기본 모습이 실패해도 다른 모습은 그린다(지금 대표 얼굴을 참고로).
    expect(keys({ 'c:minho:current': 'failed', 'c:minho:young': 'todo', 'l:hall:default': 'done', 'l:hall:night': 'done' })).toEqual(['c:minho:young'])
  })
})

describe('이어 그리기 — 남은 칸만 그린다', () => {
  const slot: RegenSlot = { kind: 'character', id: 'minho', appearanceKey: 'current', phase: 0, fromUrl: 'https://img/old.png' }
  const record: RegenRecord = { startedAt: T1, slots: [slot], failed: [], doneAt: null }
  const facts = (over: Partial<Parameters<typeof regenSlotState>[2]> = {}) => ({ exists: true, currentUrl: 'https://img/old.png', jobs: [], ...over })

  it('화면을 떠났다 돌아오면 남은 칸만 그리고, 다 그린 칸 · 그리는 중인 칸 · 실패한 칸은 다시 보내지 않는다', () => {
    // 왜: 오너 "떠났다 돌아오면 남은 것을 이어 그린다" + 9/11 규칙 "실패한 칸은 자동으로 다시 그리지 않는다".
    expect(regenSlotState(slot, record, facts({ jobs: [{ status: 'completed', fresh: true }] }))).toBe('done')
    expect(regenSlotState(slot, record, facts({ currentUrl: 'https://img/new.png' }))).toBe('done')
    expect(regenSlotState(slot, record, facts({ jobs: [{ status: 'queued', fresh: true }] }))).toBe('drawing')
    expect(regenSlotState(slot, record, facts({ jobs: [{ status: 'failed', fresh: true }] }))).toBe('failed')
    expect(regenSlotState(slot, { ...record, failed: ['c:minho:current'] }, facts())).toBe('failed')
    expect(regenSlotState(slot, record, facts())).toBe('todo')
    // 실패한 뒤 카드에서 사람이 다시 그려 성공했으면 다 그린 칸이다.
    expect(regenSlotState(slot, record, facts({ jobs: [{ status: 'failed', fresh: false }, { status: 'completed', fresh: true }] }))).toBe('done')
    // 그 사이 지운 인물 · 배경 · 모습은 그리지 않는다.
    expect(regenSlotState(slot, record, facts({ exists: false }))).toBe('done')
  })

  it('10분 넘게 대기로 멈춘 그림 작업은 실패한 칸으로 본다', () => {
    // 왜: 웹훅을 놓친 오래된 대기 작업은 서버가 같은 칸을 계속 막는다 — 기다리기만 하면 재생성이 영영 끝나지 않는다.
    expect(regenSlotState(slot, record, facts({ jobs: [{ status: 'queued', fresh: false }] }))).toBe('failed')
  })

  it('그리다 실패한 칸이 남아도 나머지를 다 그리면 재생성이 끝나고 진행은 그린 수/전체 수로 센다', () => {
    // 왜: 실패한 칸은 실패 카드로 남겨 카드의 다시 만들기로 사람이 고른다 — 재생성 전체를 붙잡지 않는다.
    const slots: RegenSlot[] = [slot, { ...slot, id: 'soonja' }, { kind: 'location', id: 'hall', appearanceKey: null, phase: 0, fromUrl: null }]
    const states = { 'c:minho:current': facts({ jobs: [{ status: 'completed', fresh: true }] }), 'c:soonja:current': facts({ jobs: [{ status: 'failed', fresh: true }] }), 'l:hall:default': facts({ currentUrl: 'https://img/h2.png' }) }
    const progress = regenProgress(3, { ...record, slots }, (s) => states[regenSlotKey(s) as keyof typeof states])
    expect(progress).toMatchObject({ n: 3, total: 3, done: 2, failed: 1, drawing: 0, complete: true, announced: false })
    const waiting = regenProgress(3, { ...record, slots }, (s) => (regenSlotKey(s) === 'l:hall:default' ? facts({ currentUrl: null, jobs: [{ status: 'queued', fresh: true }] }) : states[regenSlotKey(s) as keyof typeof states]))
    expect(waiting).toMatchObject({ done: 1, failed: 1, drawing: 1, complete: false })
  })
})

describe('카드 상세의 기록 — 지금 스타일 그림만 불러온다', () => {
  const versions = [
    v(1, 'real', [{ from: null, to: T1 }, { from: T3, to: null }], true),
    v(2, 'watercolor', [{ from: T1, to: T3 }]),
  ]

  it('카드 기록은 지금 작품 스타일과 같은 스타일 그림만 불러올 수 있고, 다른 스타일 그림은 어느 버전 것인지 안다', () => {
    // 왜: 오너 "스타일은 작품에 하나" — 카드 하나만 다른 스타일 그림으로 바꾸면 작품 안에 스타일이 섞인다.
    expect(historyPick({ generatedAt: T0, versions, currentStyleId: 'real' })).toEqual({ loadable: true, version: versions[0] })
    expect(historyPick({ generatedAt: T2, versions, currentStyleId: 'real' })).toEqual({ loadable: false, version: versions[1] })
    // v1 을 다시 불러온 뒤 그린 그림은 다시 v1(실사) 그림이다.
    expect(historyPick({ generatedAt: T4, versions, currentStyleId: 'real' })).toEqual({ loadable: true, version: versions[0] })
  })

  it('기록 기능 전에 그린 그림은 v1 그림으로 보고, 버전 기록이 아직 없으면 지금처럼 모두 불러올 수 있다', () => {
    // 왜: 혼자 정한 것 — 이 기능 전에 그린 그림은 모두 지금 스타일(v1)로 그렸다고 본다. 기록이 없으면 가릴 근거가 없다.
    expect(historyPick({ generatedAt: '2026-01-01T00:00:00.000Z', versions, currentStyleId: 'real' }).version?.n).toBe(1)
    expect(historyPick({ generatedAt: T2, versions: [], currentStyleId: 'real' })).toEqual({ loadable: true, version: null })
  })
})

describe('생성 기록 창(AV)', () => {
  it('생성 기록은 새 버전부터 보이고 지금 버전에는 "지금"이 붙는다', () => {
    // 왜: 프로토타입 AV — 가장 최근 것이 맨 위, 지금 버전은 불러오기 단추 대신 "지금" 표시.
    const versions = [v(1, 'real', [{ from: null, to: T1 }]), v(3, 'anime', [{ from: T2, to: null }], true), v(2, 'watercolor', [{ from: T1, to: T2 }])]
    expect(historyOrder(versions).map((item) => [item.n, item.current])).toEqual([[3, true], [2, false], [1, false]])
  })
})

describe('올린 그림(그대로 쓰기)은 재생성에서 그대로', () => {
  const media = (path: string) => mediaUrlOf(path)
  const input = {
    projectId: 'p1',
    characters: [{ characterId: 'minho', entityType: 'person' }, { characterId: 'soonja', entityType: 'person' }],
    appearances: [
      { characterId: 'minho', appearanceKey: 'current', isDefault: true, sheetUrl: media('ws1/p1/breakdown/minho-upload.png') },
      { characterId: 'minho', appearanceKey: 'young', isDefault: false, sheetUrl: media('ws1/p1/characters/minho/young_main.png') },
      // 다른 프로젝트 브레이크다운 그림은 이 작품이 올린 그림이 아니다.
      { characterId: 'soonja', appearanceKey: 'current', isDefault: true, sheetUrl: media('ws1/other-project/breakdown/soonja.png') },
    ],
    locations: [{ locationId: 'hall', wideShot: media('ws1/p1/breakdown/hall-upload.webp') }, { locationId: 'roof', wideShot: null }],
    locationAppearances: [],
  }

  it('지금 그림이 이 작품 브레이크다운에 올린 그림인 칸은 재생성에서 다시 그리지 않고, 그대로 두는 장수를 센다', () => {
    // 왜: 2026-10-31 오너 결정 C — 사용자가 올려 그대로 쓰기로 한 그림을 다른 스타일로 다시 그리면 올린 그림이 사라진다.
    const plan = buildRegenPlan(input)
    expect(plan.map(regenSlotKey).sort()).toEqual(['c:minho:young', 'c:soonja:current', 'l:roof:default'])
    expect(regenKeptUploads(input)).toBe(2)
    // 요약 줄의 "인물 N · 배경 M"은 다시 그리는 것만 센다.
    expect(regenCounts(plan)).toEqual({ persons: 2, places: 1 })
  })

  it('올린 그림이 없으면 지금처럼 인물 · 배경의 모든 모습을 다시 그린다', () => {
    // 왜: 정상 경로 고정 — 작품을 모르면(projectId 없음) 올린 그림을 가리지 않는다.
    expect(buildRegenPlan({ ...input, projectId: undefined })).toHaveLength(5)
    expect(regenKeptUploads({ ...input, projectId: undefined })).toBe(0)
  })
})

