// 산문 재점검 창은 목록의 이름만 산문에 표시하고, 산문에서 고른 말로 인물 · 장소를 넣고, 이름을 고치거나 하나로 합친다 (2026-10-27 오너 · 프로토타입 WT · WTm)
import { describe, expect, it } from 'vitest'
import {
  applyRecheckOps,
  markMentions,
  pickState,
  pickWord,
  recheckEntries,
  recheckReducer,
  startRecheck,
  type ProseScene,
  type RecheckAction,
  type RecheckEntity,
  type RecheckSession,
} from '@/lib/artist/recheck'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const PROSE: ProseScene[] = [
  { sceneId: 's1', text: '민호가 자판기 앞에서 동전을 찾는다. 틴장이 다가온다.' },
  { sceneId: 's2', text: '팀장이 민호에게 커피를 건넨다. 경비원이 복도 끝에서 지켜본다.' },
  { sceneId: 's3', text: '옥상에서 민호가 혼잣말을 한다. "경비원은 어디 갔지?"' },
]
const BASE: RecheckEntity[] = [
  { key: 'c1', kind: 'person', name: '민호', aliases: [] },
  { key: 'c2', kind: 'person', name: '팀장', aliases: [] },
  { key: 'c3', kind: 'person', name: '틴장', aliases: [] },
  { key: 'b1', kind: 'background', name: '회사 복도', aliases: ['복도'] },
]

const run = (session: RecheckSession, ...actions: RecheckAction[]) =>
  actions.reduce((s, action) => recheckReducer(s, action, PROSE), session)
const marked = (text: string, session: RecheckSession) =>
  markMentions(text, recheckEntries(session, PROSE)).filter((segment) => segment.key).map((segment) => [segment.text, segment.key])
const entryNamed = (session: RecheckSession, name: string) => recheckEntries(session, PROSE).find((entry) => entry.name === name)

describe('산문 표시', () => {
  it('산문에 목록의 이름이나 다른 이름이 나오면 그 말을 그 인물 · 장소로 표시하고 목록에 없는 말은 표시하지 않는다', () => {
    // 왜: 정상 경로 고정. 프로토타입 WT "AI가 뽑은 것만 표시돼 있어요" — 짐작으로 표시하지 않는다(경비원은 목록에 없다).
    const segments = markMentions(PROSE[1].text, BASE)
    expect(segments.map((segment) => segment.text).join('')).toBe(PROSE[1].text)
    expect(segments.filter((segment) => segment.key).map((segment) => [segment.text, segment.key])).toEqual([
      ['팀장', 'c2'],
      ['민호', 'c1'],
      ['복도', 'b1'],
    ])
  })

  it('이름이 겹치면 긴 말부터 표시하고 한 자리를 두 번 표시하지 않는다', () => {
    // 왜: "김 팀장"과 "팀장"이 둘 다 목록에 있을 때 "김 팀장" 자리의 "팀장"을 따로 세면 같은 사람이 둘로 보인다.
    const entities: RecheckEntity[] = [
      { key: 'c2', kind: 'person', name: '팀장', aliases: [] },
      { key: 'c4', kind: 'person', name: '김 팀장', aliases: [] },
    ]
    expect(markMentions('김 팀장이 왔다. 팀장은 웃었다.', entities)).toEqual([
      { text: '김 팀장', key: 'c4' },
      { text: '이 왔다. ', key: null },
      { text: '팀장', key: 'c2' },
      { text: '은 웃었다.', key: null },
    ])
  })

  it('영어 이름은 낱말 경계에서만 표시하고 한국어 이름은 조사가 붙어도 표시한다', () => {
    // 왜: "Tom" 이 "Tomorrow" 안에서 표시되면 틀린 표시다. 한국어는 "팀장이"처럼 이름 뒤에 조사가 붙는다.
    const tom: RecheckEntity[] = [{ key: 'p1', kind: 'person', name: 'Tom', aliases: [] }]
    expect(markMentions('Tomorrow Tom left.', tom).filter((segment) => segment.key)).toEqual([{ text: 'Tom', key: 'p1' }])
    expect(markMentions('팀장이 웃는다.', BASE)[0]).toEqual({ text: '팀장', key: 'c2' })
  })
})

describe('산문에서 말 고르기', () => {
  it('산문에서 14자 이하로 한 줄 안에서 고른 말이면 고른 말로 잡고, 더 길거나 여러 줄이거나 산문에 없는 말이면 잡지 않는다', () => {
    // 왜: 프로토타입 규칙(14자 · 한 줄). 문장을 통째로 고른 것은 이름이 아니고, 산문에 없는 말은 표시할 곳이 없다.
    expect(pickWord('  경비원 ', PROSE)).toBe('경비원')
    expect(pickWord('민호가 자판기 앞에서 동전을 찾는다', PROSE)).toBeNull()
    expect(pickWord('경비원\n옥상', PROSE)).toBeNull()
    expect(pickWord('사장님', PROSE)).toBeNull()
    expect(pickWord('  ', PROSE)).toBeNull()
  })

  it('고른 말을 인물로 넣으면 목록에 새 인물이 생기고 산문의 그 말이 인물로 표시된다', () => {
    // 왜: 정상 경로 고정. 산문에 나오는데 AI가 빠뜨린 인물을 목록에 넣는다.
    const picked = run(startRecheck(BASE), { type: 'select', text: '경비원' })
    expect(pickState(picked, PROSE)).toBe('picked')
    const adding = run(picked, { type: 'startAdd' })
    expect(pickState(adding, PROSE)).toBe('adding')
    const added = run(adding, { type: 'add', kind: 'person' })

    const guard = entryNamed(added, '경비원')
    expect(guard).toMatchObject({ kind: 'person', added: true })
    expect(marked(PROSE[1].text, added)).toContainEqual(['경비원', guard!.key])
    expect(pickState(added, PROSE)).toBe('none')
  })

  it('고른 말을 장소로 넣으면 목록에 새 장소가 생기고 산문의 그 말이 장소로 표시된다', () => {
    // 왜: 정상 경로 고정. 산문에 나오는데 AI가 빠뜨린 장소를 목록에 넣는다.
    const added = run(startRecheck(BASE), { type: 'select', text: '옥상' }, { type: 'startAdd' }, { type: 'add', kind: 'background' })

    const roof = entryNamed(added, '옥상')
    expect(roof).toMatchObject({ kind: 'background', added: true })
    expect(marked(PROSE[2].text, added)).toContainEqual(['옥상', roof!.key])
  })

  it('고른 말이 이미 목록의 이름이나 다른 이름이면 새로 넣지 않고 이미 목록에 있다고 알린다', () => {
    // 왜: 같은 인물 · 장소가 둘로 들어가면 같은 그림이 두 장 생긴다.
    for (const word of ['팀장', '복도']) {
      const picked = run(startRecheck(BASE), { type: 'select', text: word })
      expect(pickState(picked, PROSE)).toBe('listed')
      const tried = run(picked, { type: 'startAdd' }, { type: 'add', kind: 'person' })
      expect(tried.ops).toEqual([])
      expect(recheckEntries(tried, PROSE)).toHaveLength(BASE.length)
    }
    expect(applyRecheckOps(BASE, [{ op: 'add', kind: 'person', name: '팀장' }], PROSE)).toEqual({ ok: false, issue: 'already_listed', at: 0 })
  })
})

describe('이름 고치기 · 합치기', () => {
  it('이름을 고치면 새 이름이 되고 산문에 나오는 예전 이름은 다른 이름(또는)으로 남는다', () => {
    // 왜: 산문 글은 그대로라 예전 이름이 계속 나온다. 다른 이름으로 남아야 그 자리가 계속 이 인물로 표시된다.
    const renamed = run(startRecheck(BASE), { type: 'edit', key: 'c1' }, { type: 'editValue', value: '최민호' }, { type: 'saveEdit' })

    expect(entryNamed(renamed, '최민호')).toMatchObject({ key: 'c1', aliases: ['민호'] })
    expect(marked(PROSE[0].text, renamed)).toContainEqual(['민호', 'c1'])
    expect(renamed.editing).toBeNull()
  })

  it('산문에 나오지 않는 예전 이름은 고친 뒤 다른 이름으로 남기지 않는다', () => {
    // 왜: 산문에 없는 말은 표시할 곳이 없다. AI가 붙인 이름을 남기면 "또는" 목록만 어지러워진다.
    const base: RecheckEntity[] = [...BASE, { key: 'c5', kind: 'person', name: '경비 아저씨', aliases: [] }]
    const renamed = recheckReducer(
      recheckReducer(recheckReducer(startRecheck(base), { type: 'edit', key: 'c5' }, PROSE), { type: 'editValue', value: '경비원' }, PROSE),
      { type: 'saveEdit' },
      PROSE,
    )
    expect(recheckEntries(renamed, PROSE).find((entry) => entry.key === 'c5')).toMatchObject({ name: '경비원', aliases: [] })
  })

  it('같은 종류의 이미 있는 이름이나 다른 이름으로 고치면 바로 고치지 않고 하나로 합칠지 묻는다', () => {
    // 왜: 프로토타입 WTm. 한 사람이 둘로 나뉜 경우(틴장 · 팀장)를 합친다. 묻지 않고 합치면 실수로 인물 하나가 사라진다.
    const asked = run(startRecheck(BASE), { type: 'edit', key: 'c3' }, { type: 'editValue', value: '팀장' }, { type: 'saveEdit' })
    expect(asked.merge).toEqual({ from: 'c3', into: 'c2' })
    expect(asked.ops).toEqual([])
    expect(asked.editing).toEqual({ key: 'c3', value: '팀장' })

    // 다른 이름(또는)으로 고쳐도 같다 — "복도"는 회사 복도의 다른 이름이다.
    const placeBase: RecheckEntity[] = [...BASE, { key: 'b2', kind: 'background', name: '복도 끝', aliases: [] }]
    const placeAsked = recheckReducer(
      recheckReducer(recheckReducer(startRecheck(placeBase), { type: 'edit', key: 'b2' }, PROSE), { type: 'editValue', value: '복도' }, PROSE),
      { type: 'saveEdit' },
      PROSE,
    )
    expect(placeAsked.merge).toEqual({ from: 'b2', into: 'b1' })
  })

  it('합치면 고친 쪽은 목록에서 빠지고 그 이름들은 남는 쪽의 다른 이름(또는)으로 남는다', () => {
    // 왜: 프로토타입 WTm "합치면 한 인물이 되고, 산문의 '틴장'은(는) 팀장의 다른 이름(또는)으로 남아요".
    const merged = run(startRecheck(BASE), { type: 'edit', key: 'c3' }, { type: 'editValue', value: '팀장' }, { type: 'saveEdit' }, { type: 'confirmMerge' })

    const entries = recheckEntries(merged, PROSE)
    expect(entries.some((entry) => entry.key === 'c3')).toBe(false)
    expect(entries.find((entry) => entry.key === 'c2')).toMatchObject({ name: '팀장', aliases: ['틴장'], merged: ['c3'] })
    expect(marked(PROSE[0].text, merged)).toContainEqual(['틴장', 'c2'])
    expect(merged.merge).toBeNull()
    expect(merged.editing).toBeNull()
  })

  it('합치기를 취소하면 이름 고치기로 돌아가고 목록은 그대로다', () => {
    // 왜: 합칠지 묻는 창에서 아니라고 하면 고치던 이름을 이어서 고칠 수 있어야 한다.
    const cancelled = run(startRecheck(BASE), { type: 'edit', key: 'c3' }, { type: 'editValue', value: '팀장' }, { type: 'saveEdit' }, { type: 'cancelMerge' })

    expect(cancelled.merge).toBeNull()
    expect(cancelled.editing).toEqual({ key: 'c3', value: '팀장' })
    expect(recheckEntries(cancelled, PROSE).map((entry) => entry.name)).toEqual(['민호', '팀장', '틴장', '회사 복도'])
  })

  it('인물을 장소 이름으로 고치면 합치지 않고 이름만 고치고, 인물과 장소를 합치라는 요청은 받지 않는다', () => {
    // 왜: 프로토타입 — 인물과 장소는 서로 합쳐지지 않는다. 합치면 인물 그림과 배경 그림 중 하나가 사라진다.
    const renamed = run(startRecheck(BASE), { type: 'edit', key: 'c3' }, { type: 'editValue', value: '회사 복도' }, { type: 'saveEdit' })
    expect(renamed.merge).toBeNull()
    expect(recheckEntries(renamed, PROSE).find((entry) => entry.key === 'c3')).toMatchObject({ kind: 'person', name: '회사 복도' })

    expect(applyRecheckOps(BASE, [{ op: 'merge', from: 'c3', into: 'b1' }], PROSE)).toEqual({ ok: false, issue: 'kind_mismatch', at: 0 })
  })

  it('빈 이름으로 확인하면 이름을 바꾸지 않고 고치는 칸을 그대로 둔다', () => {
    // 왜: 이름 없는 인물 · 장소가 생기면 목록과 그림이 이름 없이 남는다.
    const blank = run(startRecheck(BASE), { type: 'edit', key: 'c1' }, { type: 'editValue', value: '   ' }, { type: 'saveEdit' })
    expect(blank.ops).toEqual([])
    expect(blank.editing).toEqual({ key: 'c1', value: '   ' })
  })
})
