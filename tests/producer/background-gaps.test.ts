// 약속 L — 배경 카드에 빈 칸이 있으면 채팅과 여정이 그 카드를 짚는다 (_tdd.md L, 2026-09-04)
//
//   오너: "opencast 때 발생하는 문제인데 원인 분석하고 해결해줘". 원인: 게이트가 "완성 배경 하나"만 보고 나머지 카드의 빈 칸을
//   목록에 싣지 않아 채팅은 "남은 필수 항목 없음"으로 알았다(겨울_6: 배경 4장 중 3장 목적 비었는데 넘김 준비 완료 문구).
//   결정(메모 두 번째 문장): 완성 배경이 하나 있으면 넘김은 막지 않는다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '@/lib/producer-gate'
import type { ProjectSettings } from '@/types'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const settings: ProjectSettings = {
  playtime: 120,
  genre: 'drama',
  subGenre: 'romance',
  format: 'horizontal_16:9',
  tone: ['warm'],
  targetEmotion: ['hope'],
  dialogueLanguage: 'ko',
}
const person: CastMember = {
  localId: 'p1',
  name: '지아',
  entityType: 'person',
  appearance: '20대 여성',
  arc: { start_state: '도주', end_state: '대면', arc_type: '용기' },
  motivation: { want: '추격자 따돌리기' },
}
const bg = (over: Partial<BackgroundSource>): BackgroundSource => ({
  localId: 'b1',
  name: '네온 골목',
  visualDescription: '젖은 아스팔트',
  purpose: '추격이 시작되는 공간',
  origin: 'producer',
  ...over,
})
const gate = (backgrounds: BackgroundSource[]) =>
  evaluateProducerGate({ settings, storyReady: true, cast: [person], backgrounds, styleAnchorKey: 'style_a', locale: 'ko' })

describe('약속 L — 배경 카드 빈 칸', () => {
  it('배경이 둘이고 하나는 완성·하나는 목적이 비어 있으면, 넘김은 통과하되 안내 목록에 "○○의 목적이 비어 있어요"가 실린다', () => {
    const r = gate([bg({}), bg({ localId: 'b2', name: '세상의 중심부', purpose: '' })])
    expect(r.canHandoff).toBe(true)
    expect(r.hardMissing).toEqual([])
    expect(r.softMissing.map((i) => i.label)).toContain('세상의 중심부: 목적이 비어 있어요')
    expect(r.softMissing.find((i) => i.field === 'background:b2:purpose')).toBeTruthy()
  })

  it('완성된 배경이 하나 있으면 다른 배경의 빈 칸 때문에 Writer 넘김을 막지 않는다', () => {
    const r = gate([bg({}), bg({ localId: 'b2', purpose: '' }), bg({ localId: 'b3', name: '', visualDescription: '' })])
    expect(r.canHandoff).toBe(true)
    expect(r.hardMissing.filter((i) => i.field.startsWith('background:'))).toEqual([])
    // 빈 칸은 전부 권장 목록에 이름과 함께 실린다.
    expect(r.softMissing.map((i) => i.field)).toEqual(
      expect.arrayContaining(['background:b2:purpose', 'background:b3:name', 'background:b3:visualDescription']),
    )
    expect(r.softMissing.find((i) => i.field === 'background:b3:name')?.label).toBe('이름 없는 배경: 이름 필요')
  })

  it('배경이 하나뿐이고 목적이 비어 있으면 넘김이 막히고, 안내에 카드 이름과 빈 칸 이름이 적힌다', () => {
    const r = gate([bg({ name: '겨울 산맥', purpose: '' })])
    expect(r.canHandoff).toBe(false)
    expect(r.hardMissing.map((i) => i.label)).toContain('겨울 산맥: 목적이 비어 있어요')
    // 배경이 아예 없을 때만 "배경 1개 필요" 일반 문구가 뜬다.
    expect(r.hardMissing.find((i) => i.field === 'background:minComplete')).toBeUndefined()
    const none = gate([])
    expect(none.canHandoff).toBe(false)
    expect(none.hardMissing.find((i) => i.field === 'background:minComplete')).toBeTruthy()
  })

  it('안내 목록의 빈 칸은 채팅 요청에 그대로 실려 간다', () => {
    // 채팅 스토어가 게이트의 hard·soft 목록을 요청 본문(gate)에 싣고, 라우트가 [Handoff Gate Status] 로 프롬프트에 넣는다.
    const store = read('src/stores/global-chat-store.ts')
    expect(store).toMatch(/hardMissing: gate\.hardMissing\.map\(\(i\) => \(i\.detail \? `\$\{i\.label\} \(\$\{i\.detail\}\)` : i\.label\)\)/)
    expect(store).toMatch(/softMissing: gate\.softMissing\.map\(\(i\) => \(i\.detail \? `\$\{i\.label\} \(\$\{i\.detail\}\)` : i\.label\)\)/)
    const route = read('src/app/api/produce/chat/route.ts')
    expect(route).toMatch(/\[Handoff Gate Status\]/)
    expect(route).toMatch(/softMissing/)
  })

  it('빈 칸이 채워지면 그 안내는 사라진다', () => {
    const before = gate([bg({}), bg({ localId: 'b2', name: '세상의 중심부', purpose: '' })])
    expect(before.softMissing.some((i) => i.field === 'background:b2:purpose')).toBe(true)
    const after = gate([bg({}), bg({ localId: 'b2', name: '세상의 중심부', purpose: '두 수장이 처음 마주치는 곳' })])
    expect(after.softMissing.some((i) => i.field.startsWith('background:'))).toBe(false)
    expect(after.hardMissing).toEqual([])
  })
})
