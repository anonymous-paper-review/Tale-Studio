// 샷 고치기 팝업 맨 위 설명이 무엇을 고치면 러프를 새로 그리고 무엇은 저장만 하는지 맞게 말하는지 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n/translate'

const dialog = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
const key = /<DialogDescription>\{t\('([^']+)'\)\}<\/DialogDescription>/.exec(dialog)?.[1] ?? ''

describe('샷 고치기 팝업 설명', () => {
  // 왜: 2026-11-02 대사만 고치면 [적용]이 저장만 하게 바뀌었는데(리드 결정 D2), 맨 위 설명은 여전히 "시작을 고치면 이 샷의 러프를 새로 그린다"고 했다.
  it('샷 고치기 팝업 설명은 스토리 · 샷 타입을 고치면 러프를 새로 그리고, 대사만 고치면 저장만 한다고 알린다', () => {
    const ko = translate('ko', key)
    expect(ko).toContain('대사만 고치면 저장만')
    expect(ko).not.toContain('시작을 고치면')
    expect(translate('en', key)).toMatch(/only the dialogue/i)
    for (const text of [ko, translate('en', key)]) expect(text).not.toContain('—')
  })
})
