// 브레이크다운 화면의 [인물·배경이 빠졌거나 겹쳤어요] 단추와 산문 재점검 창 · 합치기 창 · 새로 들어온 줄에 보이는 것 (2026-10-27 오너 · 프로토타입 A1 · WT · WTm)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; 'data-testid'?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className, 'data-testid': testId }: Props) => h(tag, { className, 'data-testid': testId }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})
vi.mock('@/features/series/use-series-info', () => ({ useSeriesInfo: () => ({ view: null, loading: false, error: false }) }))

import { BreakdownList } from '@/features/artist-room/breakdown-list'
import { RecheckBody, RecheckMergeDialog } from '@/features/artist-room/prose-recheck-dialog'
import { recheckReducer, startRecheck, type ProseScene, type RecheckAction, type RecheckEntity, type RecheckSession } from '@/lib/artist/recheck'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

// 이 시험을 위해 새로 지은 산문 — 실제 작품이 아니다.
const PROSE: ProseScene[] = [
  { sceneId: 's1', text: '민호가 자판기 앞에서 동전을 찾는다. 틴장이 다가온다.' },
  { sceneId: 's2', text: '팀장이 민호에게 커피를 건넨다. 경비원이 복도 끝에서 지켜본다.' },
  { sceneId: 's3', text: '옥상에서 민호가 혼잣말을 한다.' },
]
const BASE: RecheckEntity[] = [
  { key: 'c1', kind: 'person', name: '민호', aliases: [] },
  { key: 'c2', kind: 'person', name: '팀장', aliases: [] },
  { key: 'c3', kind: 'person', name: '틴장', aliases: [] },
  { key: 'b1', kind: 'background', name: '회사 복도', aliases: ['복도'] },
]

function serveCurrent(store: { getState: () => object; getInitialState: () => object }) {
  Object.assign(store.getInitialState(), store.getState())
}
const html = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(element).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
const session = (...actions: RecheckAction[]) => actions.reduce((s, action) => recheckReducer(s, action, PROSE), startRecheck(BASE))
const body = (s: RecheckSession) =>
  html(createElement(RecheckBody, { session: s, prose: PROSE, dispatch: () => {}, loading: false, failed: false, applying: false, onCancel: () => {}, onApply: () => {} }))
/** data-testid 로 찾은 첫 여는 태그(속성 확인용). */
const tagOf = (out: string, testId: string) => out.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? ''
/** 그 단추를 누를 수 없나 — class 의 disabled: 꾸밈이 아니라 disabled 속성을 본다. */
const isDisabled = (out: string, testId: string) => / disabled=""/.test(tagOf(out, testId))

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
  useProjectStore.setState({ projectId: 'p1', currentStage: 'artist', reachedStage: 'artist', producerLocked: true, treatmentDraft: true })
  useProducerStore.setState({
    cast: [{ localId: 'treatment:char', characterId: 'char', name: '민호', entityType: 'person', appearance: '서른 살 회사원', origin: 'treatment' }],
    backgrounds: [{ localId: 'treatment:hallway', locationId: 'hallway', name: '회사 복도', visualDescription: '형광등 복도', purpose: '', origin: 'treatment' }],
    recheckNewIds: [],
  })
  for (const store of [useLocaleStore, useProjectStore, useProducerStore]) serveCurrent(store)
})

describe('브레이크다운 화면', () => {
  it('브레이크다운 목록 아래에 [인물·배경이 빠졌거나 겹쳤어요] 단추가 있고 누르기 전에는 재점검 창이 열려 있지 않다', () => {
    // 왜: 프로토타입 A1 규칙 — 누를 때만 연다. 기본 화면에서 점검하라고 묻지 않는다.
    const out = html(createElement(BreakdownList, { onMake: () => {} }))
    expect(tagOf(out, 'breakdown-recheck-open')).not.toBe('')
    expect(isDisabled(out, 'breakdown-recheck-open')).toBe(false)
    expect(out).toContain('인물·배경이 빠졌거나 겹쳤어요')
    expect(out).not.toContain('data-testid="recheck-dialog"')
  })

  it('목록 상태를 아직 모르면(새로 고침 직후) [인물·배경이 빠졌거나 겹쳤어요] 단추를 누를 수 없다', () => {
    // 왜: 산문 초안인지 읽기 전에는 목록 저장이 잠겨 있다 — 그때 반영하면 고치던 설명이 사라진다.
    useProjectStore.setState({ treatmentDraft: false })
    serveCurrent(useProjectStore)
    expect(isDisabled(html(createElement(BreakdownList, { onMake: () => {} })), 'breakdown-recheck-open')).toBe(true)
  })

  it('반영해서 새로 들어온 줄은 "새로" 표시와 새 인물 · 장소 안내 문장을 보이고, 다른 이름이 있으면 "또는"으로 보인다', () => {
    // 왜: 프로토타입 A1 — 무엇이 새로 들어왔는지 목록에서 바로 보인다. 설명은 아직 비어 있어 AI가 채운다고 알린다.
    useProducerStore.setState({
      cast: [
        { localId: 'treatment:char_2', characterId: 'char_2', name: '팀장', entityType: 'person', appearance: '쉰 살, 회색 양복', origin: 'treatment', aliases: ['틴장'] },
        { localId: 'recheck:char_4', characterId: 'char_4', name: '경비원', entityType: 'person', appearance: '', role: 'supporting', origin: 'treatment' },
      ],
      backgrounds: [{ localId: 'recheck:rooftop', locationId: 'rooftop', name: '옥상', visualDescription: '', purpose: '', origin: 'treatment' }],
      recheckNewIds: ['recheck:char_4', 'recheck:rooftop'],
    })
    serveCurrent(useProducerStore)
    const out = html(createElement(BreakdownList, { onMake: () => {} }))

    const rows = out.split('data-testid="breakdown-row"').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('또는 틴장')
    expect(rows[0]).not.toContain('새로')
    expect(rows[1]).toContain('경비원')
    expect(rows[1]).toContain('새로')
    expect(rows[1]).toContain('산문에서 표시한 인물. 설명은 AI가 산문을 읽고 채워요.')
    expect(rows[2]).toContain('새로')
    expect(rows[2]).toContain('산문에서 표시한 장소.')
    expect(out.match(/data-new="true"/g)).toHaveLength(2)
  })
})

describe('산문 재점검 창', () => {
  it('재점검 창은 산문을 씬마다 S1 · S2로 보이고 목록의 이름을 인물 · 장소로 표시하며 오른쪽에 뽑은 목록과 개수를 보인다', () => {
    // 왜: 정상 경로 고정. 프로토타입 WT — 왼쪽 산문(표시만 고친다) · 오른쪽 뽑은 목록 260px.
    const out = body(startRecheck(BASE))

    expect(out).toContain('산문 재점검')
    expect(out).toContain('산문은 잠긴 채로 표시만 고쳐요. [목록에 반영]하면 Artist 목록이 이 표시대로 다시 채워져요.')
    for (const label of ['S1', 'S2', 'S3']) expect(out).toContain(`>${label}<`)
    expect(out).toMatch(/<button[^>]*data-kind="person"[^>]*title="민호 · 눌러서 수정"[^>]*>민호<\/button>/)
    expect(out).toMatch(/<button[^>]*data-kind="background"[^>]*title="회사 복도 · 눌러서 수정"[^>]*>복도<\/button>/)
    expect(out).not.toContain('title="경비원')
    expect(out).toContain('AI가 뽑은 것만 표시돼 있어요 · 표시된 말을 누르면 수정할 수 있어요')
    expect(out).toContain('뽑은 목록')
    expect(out).toContain('4개')
    expect(out).toContain('또는 복도')
    expect(tagOf(out, 'recheck-list')).toContain('w-[260px]')
  })

  it('고른 말이 없으면 [추가하기]를 누를 수 없고 산문에서 말을 드래그해 고르라고 안내한다', () => {
    // 왜: 프로토타입 WT — 무엇을 넣을지 먼저 산문에서 고른다.
    const out = body(startRecheck(BASE))
    expect(out).toContain('빠진 인물·장소가 있으면 산문에서 그 말을 드래그해서 고른 뒤 [추가하기]를 누르세요.')
    expect(isDisabled(out, 'recheck-add')).toBe(true)
    expect(out).toContain('title="산문에서 말을 먼저 골라 주세요"')
  })

  it('말을 고르면 고른 말과 [추가하기] · 다시 고르기를, [추가하기]를 누르면 인물로 추가 · 장소로 추가 · 취소를 보인다', () => {
    // 왜: 프로토타입 WT — 같은 말을 인물로 넣을지 장소로 넣을지는 사람이 고른다.
    const picked = body(session({ type: 'select', text: '경비원' }))
    expect(picked).toContain('고른 말')
    expect(picked).toContain('경비원')
    expect(isDisabled(picked, 'recheck-add')).toBe(false)
    expect(picked).toContain('다시 고르기')

    const adding = body(session({ type: 'select', text: '경비원' }, { type: 'startAdd' }))
    expect(tagOf(adding, 'recheck-add-person')).not.toBe('')
    expect(adding).toContain('인물로 추가')
    expect(adding).toContain('장소로 추가')
    expect(tagOf(adding, 'recheck-add-cancel')).not.toBe('')
    expect(tagOf(adding, 'recheck-add')).toBe('')
  })

  it('고른 말이 이미 목록에 있으면 넣는 단추 대신 이미 목록에 있다고 보인다', () => {
    // 왜: 같은 인물이 둘로 들어가지 않게 — 넣을 수 없는 말이면 왜 안 되는지 바로 보인다.
    const out = body(session({ type: 'select', text: '팀장' }))
    expect(out).toContain('팀장은(는) 이미 목록에 있어요.')
    expect(tagOf(out, 'recheck-add')).toBe('')
    expect(out).not.toContain('인물로 추가')
  })

  it('이름을 고치는 중에는 [목록에 반영]을 누를 수 없고 같은 종류의 이름을 추천하며 이미 있는 이름으로 고치면 합쳐진다고 알린다', () => {
    // 왜: 프로토타입 WT — 확인하지 않은 이름이 반영되면 안 된다. 목록에서 빼기는 없다(오너 결정 3).
    const out = body(session({ type: 'edit', key: 'c3' }))

    expect(isDisabled(out, 'recheck-apply')).toBe(true)
    expect(out).toContain('title="수정 중인 이름을 먼저 확인해 주세요"')
    expect(tagOf(out, 'recheck-rename-input')).toContain('aria-label="이름 고치기"')
    expect(out).toContain('<option value="민호">')
    expect(out).toContain('<option value="팀장">')
    expect(out).not.toContain('<option value="틴장">')
    expect(out).not.toContain('<option value="회사 복도">')
    expect(out).toContain('이미 있는 인물 이름으로 고치면 하나로 합쳐져요')
    expect(out).toContain('확인')
    expect(out).not.toContain('목록에서 빼기')
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*title="틴장 · 눌러서 수정"/)
  })

  it('합칠지 묻는 창은 두 이름과 합친 뒤 남는 다른 이름을 보인다', () => {
    // 왜: 프로토타입 WTm — 합치면 되돌릴 단추가 없다. 무엇이 무엇으로 합쳐지는지 보고 고른다.
    const asking = session({ type: 'edit', key: 'c3' }, { type: 'editValue', value: '팀장' }, { type: 'saveEdit' })
    const out = html(createElement(RecheckMergeDialog, { session: asking, prose: PROSE, dispatch: () => {} }))

    expect(out).toContain('틴장 → 팀장, 하나로 합칠까요?')
    expect(out).toContain('팀장은(는) 이미 목록에 있어요. 합치면 한 인물이 되고, 산문의 "틴장"은(는) 팀장의 다른 이름(또는)으로 남아요.')
    expect(out).toContain('취소')
    expect(out).toContain('합치기')
    expect(html(createElement(RecheckMergeDialog, { session: startRecheck(BASE), prose: PROSE, dispatch: () => {} }))).toBe('')
  })

  it('창 아래에는 산문에 없는 인물 · 배경은 산문을 다시 써야 한다는 안내만 있고 산문 다시 쓰기 단추는 없다', () => {
    // 왜: 산문 다시 쓰기(되돌아가기)는 아직 만들지 않았다 — 없는 단추를 보이지 않는다.
    const out = body(startRecheck(BASE))
    expect(out).toContain('산문에 없는 인물·배경이 필요하면 산문을 다시 써야 해요.')
    expect(out).not.toContain('산문 다시 쓰기')
    expect(tagOf(out, 'recheck-cancel')).not.toBe('')
    expect(isDisabled(out, 'recheck-apply')).toBe(false)
  })
})
