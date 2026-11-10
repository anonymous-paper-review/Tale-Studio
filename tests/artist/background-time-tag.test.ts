// 배경 카드의 시간 꼬리표와 배경 그림 지시의 시간에는 장면 머리의 이어짐 말(CONTINUOUS · LATER · MOMENTS LATER)을 쓰지 않는다 (리드 2026-11-10 R2)
import { describe, expect, it } from 'vitest'
import { sceneTimeTag } from '@/lib/scene-time'
import { buildWorldPrompt } from '@/lib/prompts'

describe('혼자 정한 것', () => {
  // 왜: 다시 돌리기 R2(C03) 낮음. "EXT. COUNTRY ROAD - CONTINUOUS" · "INT. BUS - CONTINUOUS" 씬의 배경 카드에 시간 꼬리표 "CONTINUOUS"가 붙었고,
  //   배경 그림 지시에도 "during CONTINUOUS"가 실렸다. 이어짐 말은 때가 아니라 앞 씬과 이어진다는 표시다.
  it('배경 카드의 시간 꼬리표와 배경 그림 지시의 시간에는 장면 머리의 이어짐 말(CONTINUOUS · LATER · MOMENTS LATER)을 쓰지 않는다', () => {
    expect(sceneTimeTag('CONTINUOUS')).toBe('')
    expect(sceneTimeTag('LATER')).toBe('')
    expect(sceneTimeTag('MOMENTS LATER')).toBe('')
    expect(sceneTimeTag('Continuous')).toBe('')
    expect(sceneTimeTag('NIGHT - CONTINUOUS')).toBe('NIGHT')
    expect(sceneTimeTag('NIGHT')).toBe('NIGHT')
    expect(sceneTimeTag('dawn')).toBe('dawn')
    expect(sceneTimeTag(undefined)).toBe('')

    expect(buildWorldPrompt('a dark country road', 'CONTINUOUS', '')).not.toContain('during')
    expect(buildWorldPrompt('a dark country road', 'MOMENTS LATER', '')).not.toContain('during')
    expect(buildWorldPrompt('a dark country road', 'NIGHT', '')).toContain('during NIGHT')
  })
})
