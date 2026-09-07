// 채팅에서 가리킨 장면과 샷을 실제 화면의 위치에 맞게 찾아낸다 (#p4-understand A2, 2026-08-06)
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
  it('실제로 있는 샷을 가리키면 그 샷을 그대로 찾는다', () => {
    expect(resolveChatShotId(SHOTS, 'sh_02_03')).toBe('sh_02_03')
  })

  it('예전 방식의 전체 순번으로 가리켜도 해당 샷을 찾는다', () => {
    expect(resolveChatShotId(SHOTS, 'shot_3')).toBe('sh_02_03')
    expect(resolveChatShotId(SHOTS, 'shot_1')).toBe('sh_01_01')
  })

  it('예전 프로젝트의 샷을 새 표기로 가리켜도 원래 샷을 찾는다', () => {
    const legacy = [
      { shotId: 'shot_1', sceneId: 'sc_01' },
      { shotId: 'shot_2', sceneId: 'sc_01' },
    ]
    expect(resolveChatShotId(legacy, 'sh_01_02')).toBe('shot_2')
  })

  it('장면 순서와 장면 안의 순서로 가리켜도 해당 샷을 찾는다', () => {
    expect(resolveChatShotId(SHOTS, 'scene2 shot2')).toBe('sh_02_04')
    expect(resolveChatShotId(SHOTS, '씬1 샷2')).toBe('sh_01_02')
    expect(resolveChatShotId(SHOTS, 'sc_02 1번째')).toBe('sh_02_03')
  })

  it('없는 샷을 가리키면 찾지 못했다고 알린다', () => {
    expect(resolveChatShotId(SHOTS, 'sh_09_99')).toBeNull()
    expect(resolveChatShotId(SHOTS, '없는샷')).toBeNull()
  })
})
