// writer-v2 가 저장한 dynamic_spec 모양(문자열)이 모션 계약 컴파일을 깨뜨리는지 재현.
//   실측 근거: shots 1893행 중 8행이 camera_motion/character_motion 을 문자열로 보관
//   (project 090042eb, design_ref 'writer-v2:...', 2026-08-17T11:33Z).
import { describe, it, expect } from 'vitest'
import { compileMotionContract } from '@/lib/director/motion-contract'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// DB 실측 행을 그대로 옮긴 것 — 계약 타입과 어긋나므로 단언 캐스팅으로 넣는다.
const liveV2Row = {
  camera_motion: 'Dynamic handheld tracking shot.',
  character_motion:
    'Girl presses back against beam, tightly rolling blueprint into her chest, searching for escape route.',
  transition: 'cut',
} as unknown as ShotDynamicSpec

describe('writer-v2 문자열 dynamic_spec', () => {
  it('character_motion 이 문자열이면 계약 컴파일이 죽지 않아야 한다', () => {
    expect(() => compileMotionContract(liveV2Row, 5)).not.toThrow()
  })

  it('camera_motion 문자열의 실제 뜻(tracking)이 static 으로 접히지 않아야 한다', () => {
    const c = compileMotionContract(liveV2Row, 5)
    expect(c.cameraStatic).toBe(false)
    expect(c.text).toContain('tracks')
    expect(c.text).toContain('The camera itself travels')
    expect(c.text).not.toContain('LOCKED tripod shot')
  })

  it('character_motion 문자열을 영상 계약에 보존해야 한다', () => {
    const c = compileMotionContract(liveV2Row, 5)
    expect(c.text).toContain('Girl presses back against beam')
  })
})
