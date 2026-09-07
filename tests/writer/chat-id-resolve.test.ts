// 채팅 샷 id 관용 해석(#p4-understand A2, 2026-08-06) 회귀.
//   계약: 실재 id 그대로 / 레거시↔메인 상호 변환 / 위치형("scene2 shot3"·"씬2 샷3") / 실패는 null.
import { describe, it, expect } from 'vitest'
import { resolveChatShotId } from '@/lib/writer/chat-id-resolve'

const SHOTS = [
  { shotId: 'sh_01_01', sceneId: 'sc_01' },
  { shotId: 'sh_01_02', sceneId: 'sc_01' },
  { shotId: 'sh_02_03', sceneId: 'sc_02' },
  { shotId: 'sh_02_04', sceneId: 'sc_02' },
]

describe('resolveChatShotId', () => {
  it('실재 id 는 그대로 통과한다', () => {
    expect(resolveChatShotId(SHOTS, 'sh_02_03')).toBe('sh_02_03')
  })

  it('레거시 shot_N 을 전역 번호로 메인 id 에 매핑한다', () => {
    expect(resolveChatShotId(SHOTS, 'shot_3')).toBe('sh_02_03')
    expect(resolveChatShotId(SHOTS, 'shot_1')).toBe('sh_01_01')
  })

  it('구 프로젝트(레거시 행)에선 메인 표기를 레거시로 역매핑한다', () => {
    const legacy = [
      { shotId: 'shot_1', sceneId: 'sc_01' },
      { shotId: 'shot_2', sceneId: 'sc_01' },
    ]
    expect(resolveChatShotId(legacy, 'sh_01_02')).toBe('shot_2')
  })

  it('위치형 지칭을 씬 순서 × 씬 내 순서로 해석한다', () => {
    expect(resolveChatShotId(SHOTS, 'scene2 shot2')).toBe('sh_02_04')
    expect(resolveChatShotId(SHOTS, '씬1 샷2')).toBe('sh_01_02')
    expect(resolveChatShotId(SHOTS, 'sc_02 1번째')).toBe('sh_02_03')
  })

  it('해석 불가는 null — 호출자가 skipped 로 표면화한다', () => {
    expect(resolveChatShotId(SHOTS, 'sh_09_99')).toBeNull()
    expect(resolveChatShotId(SHOTS, '없는샷')).toBeNull()
  })
})
