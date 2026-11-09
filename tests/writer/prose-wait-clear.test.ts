// Writer 산문을 고치는 동안 기다리는 창은 화면을 덮지 않고(잠금은 그대로) 고치는 문단을 알린다(11/5 시안 WL, 리드 추천안 ㉠ · 오너 2026-11-09)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { proseWaitDescription, proseWaitFrame } from '@/lib/prose/screen'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)
const WORKSPACE = 'src/features/prose/prose-workspace.tsx'

describe('고치는 동안 기다리는 창 모양', () => {
  it('산문을 고치는 동안 기다리는 창은 화면을 덮지 않는다(투명 덮개)', () => {
    // 왜: 11/5 시안 WL "다른 씬은 그대로 볼 수 있어요" — 고치는 동안에도 산문을 읽는다. 고치기 · 채팅 입력 잠금은 그대로다(리드 2026-11-09 ㉠).
    //   카드에는 Writer 옷 Lumi 가 선다(오너 2026-11-09 결정 4 — prose-one-screen 의 큰 Lumi 문장).
    expect(proseWaitFrame({ kind: 'revise' })).toEqual({ scrim: 'clear' })
    expect(proseWaitFrame({ kind: 'rewrite' })).toEqual({ scrim: 'clear' })
  })

  it('산문 초안을 기다리는 동안은 지금처럼 화면을 덮는다', () => {
    // 왜: 정상 경로 고정 — Producer 에서 넘어와 아직 읽을 산문이 없는 기다림은 Writer 옷 Lumi 카드가 화면을 덮는다(오너 결정 8).
    expect(proseWaitFrame({ kind: 'draft', step: 1 })).toEqual({ scrim: 'dim' })
    expect(proseWaitFrame(null)).toEqual({ scrim: 'dim' })
  })

  it('산문 칸은 투명 덮개 너머로 휠 · 손가락 끌기로 스크롤되고, 기다리는 창은 그 모양 · 설명을 받는다', () => {
    // 왜: 투명 덮개가 받은 휠 · 끌기는 [data-ai-busy-scroll] 칸으로만 넘어간다 — 표시가 없으면 보이기만 하고 스크롤은 안 된다.
    const workspace = readFileSync(WORKSPACE, 'utf8')
    expect(workspace).toMatch(/<div className="[^"]*overflow-y-auto[^"]*" data-ai-busy-scroll>/)
    const overlay = workspace.match(/<AiBusyOverlay[\s\S]*?\/>/)?.[0] ?? ''
    expect(overlay).toContain('scrim={waitFrame.scrim}')
    expect(overlay).toContain('description={waitDescription}')
  })
})

describe('고치는 동안 기다리는 창 설명', () => {
  it('고쳐 달라고 보낸 문단이 있으면 기다리는 창은 "S2를 고치는 중이에요. 다른 씬은 그대로 볼 수 있어요."라고 알린다', () => {
    // 왜: 11/5 시안 WL — 어느 문단을 고치는지, 그동안 무엇을 할 수 있는지 기다리는 창이 말한다.
    expect(proseWaitDescription(ko, { busy: { kind: 'revise' }, revisingIndex: 1 })).toBe('S2를 고치는 중이에요. 다른 씬은 그대로 볼 수 있어요.')
    expect(proseWaitDescription(en, { busy: { kind: 'revise' }, revisingIndex: 1 })).toBe('Revising S2. You can still read the other scenes.')
  })

  it('문단 번호 받침에 맞춰 "을 · 를"을 붙인다', () => {
    // 왜: S3 · S6 처럼 받침 있게 읽히는 번호 뒤에 "를"이 붙으면 어색하다(S3을 · S2를).
    expect(proseWaitDescription(ko, { busy: { kind: 'revise' }, revisingIndex: 2 })).toBe('S3을 고치는 중이에요. 다른 씬은 그대로 볼 수 있어요.')
  })

  it('문단 없이 고치거나 세 가지 안을 쓰는 동안은 기다리는 창에 기본 잠금 안내를 그대로 둔다', () => {
    // 왜: 정상 경로 고정 — 채팅으로 산문 전체를 고치거나 세 가지 안을 쓸 때는 고치는 문단이 따로 없다.
    expect(proseWaitDescription(ko, { busy: { kind: 'revise' }, revisingIndex: null })).toBeUndefined()
    expect(proseWaitDescription(ko, { busy: { kind: 'rewrite' }, revisingIndex: 1 })).toBeUndefined()
    expect(proseWaitDescription(ko, { busy: { kind: 'draft', step: 0 }, revisingIndex: null })).toBeUndefined()
  })
})
