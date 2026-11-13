// 영어 컷 수는 1개일 때 단수다 — Director → Editor 넘기기 창(D8) · Editor 머리 · Storyboard 씬 머리. 한국어는 그대로다.
import { describe, expect, it } from 'vitest'
import { proceedButtonLabel, type EditorHandoverView } from '@/lib/director/editor-handover'
import { editorHeaderMeta } from '@/features/editor/editor-labels'
import { sceneStatsLabel } from '@/lib/writer/board-summary'
import { translate } from '@/lib/i18n/translate'

const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params)
const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
// 넘기기 창 단추 글에 쓰는 것만 — 컷 수 · 길이 · 빠질 샷.
const view = (cuts: number, seconds: number, missing: string[]) =>
  ({ cuts, seconds, total: cuts + missing.length, shots: [], missing: missing.map((label) => ({ label })) }) as unknown as EditorHandoverView

describe('영어 컷 수의 단수', () => {
  // 왜(리드 11/14, 영어 재점검 qa-golden): 컷이 하나면 영어 화면에 "1 cuts"로 적혔다 — 수가 1이면 단수 문장(Lumi · 툴바와 같은 규칙).
  it('넘기기 창 · Editor 머리의 영어 컷 수는 1개일 때 단수다 — "Hand over without … · 1 cut · about 9s", "Final edit 1 cut · 9s"', () => {
    expect(proceedButtonLabel(view(1, 9, []), en)).toBe('Hand over to Editor · 1 cut · about 9s')
    expect(proceedButtonLabel(view(1, 9, ['Scene 1 · Shot 2']), en)).toBe('Hand over without Scene 1 · Shot 2 · 1 cut · about 9s')
    expect(proceedButtonLabel(view(1, 9, ['Scene 1 · Shot 2', 'Scene 1 · Shot 3']), en)).toBe('Hand over without 2 shots · 1 cut · about 9s')
    expect(proceedButtonLabel(view(2, 14, ['Scene 1 · Shot 3']), en)).toBe('Hand over without Scene 1 · Shot 3 · 2 cuts · about 14s')
    expect(proceedButtonLabel(view(1, 9, ['Scene 1 · Shot 2']), ko)).toBe('Scene 1 · Shot 2 빼고 넘기기 · 컷 1 · 약 9초')
    const one = [{ shotId: 's1', durationSec: 9 }]
    const clip = [{ shotId: 's1', url: 'https://media.test/s1.mp4' }] as never
    expect(editorHeaderMeta(one, clip, en)).toBe('1 cut · 9s · video 1/1')
    expect(editorHeaderMeta([...one, { shotId: 's2', durationSec: 5 }], clip, en)).toBe('2 cuts · 14s · video 1/2')
    expect(editorHeaderMeta(one, clip, ko)).toBe('컷 1 · 9초 · 영상 1/1')
  })

  // 왜(리드 11/14 — 같은 키 '{count} cuts · {seconds}s' 를 함께 고침): 그 키는 넘기기 창이 아니라 Storyboard 씬 머리("3컷 · 7초")였다.
  it('Storyboard 씬 머리의 영어 컷 수도 1개일 때 단수다 — "1 cut · 4s"', () => {
    expect(sceneStatsLabel({ shots: 1, seconds: 4 }, 'en')).toBe('1 cut · 4s')
    expect(sceneStatsLabel({ shots: 2, seconds: 6 }, 'en')).toBe('2 cuts · 6s')
    expect(sceneStatsLabel({ shots: 1, seconds: 4 }, 'ko')).toBe('1컷 · 4초')
  })
})
