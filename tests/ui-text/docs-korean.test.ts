// 한국어 화면에서 이용 가이드(문서)의 모든 문구가 한국어로 보이는지 검사한다 (오너 2026-11-25).
import { describe, expect, it } from 'vitest'
import { STAGE_GUIDE, FAQ, DOCS_COPY } from '@/components/marketing/docs-content'
import { translate } from '@/lib/i18n/translate'

const hangul = /[가-힣]/

describe('이용 가이드 언어', () => {
  // 왜: 한국어 화면인데 이용 가이드만 영어로 나왔다 (오너 2026-11-25).
  it('한국어 화면에서 이용 가이드를 열면 제목·시작 순서·단계 설명·자주 묻는 질문이 모두 한국어로 보인다', () => {
    const all = [...DOCS_COPY, ...STAGE_GUIDE.flatMap((s) => [s.name, s.body]), ...FAQ.flatMap((f) => [f.q, f.a])]
    const missing = all.filter((text) => !hangul.test(translate('ko', text)))
    expect(missing).toEqual([])
  })
})
