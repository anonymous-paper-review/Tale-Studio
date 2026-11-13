// 샷 상세 영상 고치기의 바꿀 점은 서버도 새 Take 설정에 기록으로 남긴다 — 다시 열어도 칸에 미리 채워진다 (디자이너 11/13 D7 · 리드 검토 c ③)
import { describe, expect, it } from 'vitest'
import { newTakeOverride } from '@/lib/director/video-submit'

describe('새 Take 설정의 바꿀 점', () => {
  it('새 Take 설정의 바꿀 점은 서버도 기록으로 남기고, 글이 아니거나 너무 길면 버린다', () => {
    // 왜: 리드 검토 c ③ — 바꿀 점은 Take 에 기록으로 남는다. 서버는 새 Take 설정에서 아는 칸만 골라 남긴다(모르는 칸은 버림 — 정상 경로 고정).
    expect(newTakeOverride({ provider: 'veo', changeNote: 'slow push in', unknown: 1 })).toEqual({ provider: 'veo', changeNote: 'slow push in' })
    expect(newTakeOverride({ changeNote: 3 })).toEqual({})
    expect(newTakeOverride({ changeNote: 'x'.repeat(2001) })).toEqual({})
  })
})
