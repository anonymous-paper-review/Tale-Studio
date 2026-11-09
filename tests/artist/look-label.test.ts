// Artist 인물 모습 이름은 화면 언어로 보인다 — 서버가 붙인 기본 모습 이름 "현재"가 영어 화면에 그대로 나왔다(오너 2026-11-10)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'
import { appearanceLabel } from '@/lib/artist/look-label'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const en = (text: string, params?: Record<string, string | number>) => translate('en', text, params)

describe('인물 모습 이름', () => {
  it('인물 기본 모습의 원래 이름 "현재"는 영어 화면에서 "Present"로 보인다', () => {
    // 왜: 오너 2026-11-10 "영어 언어에서 한국어 나오는거 수정해줘(Artist의 인물 버전이 "현재"로 나옴)" — 기본 모습 이름은 저장할 때 한국어 하나로 붙는다.
    //   모습 시점(Past · Present · Future)과 같은 말이라 같은 이름을 쓴다(혼자 정한 것).
    expect(appearanceLabel({ label: '현재', isDefault: true }, en)).toBe('Present')
  })

  it('한국어 화면에서는 기본 모습 이름이 "현재" 그대로 보인다', () => {
    // 왜: 정상 경로 고정 — 한국어 화면의 모습 칩은 지금과 같다.
    expect(appearanceLabel({ label: '현재', isDefault: true }, ko)).toBe('현재')
  })

  it('사람이 붙이거나 바꾼 모습 이름은 화면 언어와 상관없이 적은 그대로 보인다', () => {
    // 왜: "젊은 시절"처럼 사람이 지은 이름은 작품 글이다 — 바꿔 보이면 안 된다. 기본 모습이라도 이름을 바꿨으면 그 이름이다.
    expect(appearanceLabel({ label: '젊은 시절', isDefault: false }, en)).toBe('젊은 시절')
    expect(appearanceLabel({ label: '현재', isDefault: false }, en)).toBe('현재')
    expect(appearanceLabel({ label: 'Present day', isDefault: true }, ko)).toBe('Present day')
  })

  it('Artist 카드의 모습 칩과 인물 상세 창이 모두 화면 언어 이름을 쓴다', () => {
    // 왜: 한 곳이라도 원래 이름을 그대로 쓰면 그 자리만 영어 화면에 한국어가 남는다(카드 칩 · 상세 창 머리 · 설명 칸 이름 · 모습 목록).
    const panel = readFileSync('src/features/artist/character-panel.tsx', 'utf8')
    expect(panel).toContain('{appearanceLabel(ap, t)}')
    expect(panel).not.toMatch(/\{ap\.label\}/)
    const dialog = readFileSync('src/features/artist/character-view-dialog.tsx', 'utf8')
    expect(dialog).not.toMatch(/\{look\.label\}|label: (default)?[aA]ppearance\.label|\? appearance\.label :/)
    expect(dialog.match(/appearanceLabel\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
