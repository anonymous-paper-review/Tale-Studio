import { describe, expect, it } from 'vitest'
import { compileMotionContract } from '@/lib/director/motion-contract'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// #g1 (2026-08-27 오너) — "End 프레임의 변화폭이 적음. 이게 결국 슬로우 모션을 야기시킴.
//   Shot 시간에 따른 변화폭도 반영되었으면 함."
//
// 원인: 카메라 절은 durationSeconds 를 받아 "N초에 걸쳐"를 말했는데 피사체 절은 길이를
//   아예 안 봤다. 실측(테스트 프로젝트): sh_01_01 10초 / sh_02_04 5초 — 둘 다 magnitude
//   small 이라 똑같은 문장이 나갔다. 같은 동작을 10초에 펴면 그게 슬로우모션이다.
//
// 수리 원칙: magnitude 를 임의로 키우지 않는다(그건 연출 의도다). 대신 "이 길이 안에서
//   무엇이 완결돼야 하는가"를 말한다 — 동작은 제 속도로, 남는 시간은 여파로.

const spec = (magnitude: string): ShotDynamicSpec =>
  ({
    character_motion: [{ verb: 'places towel', magnitude, character_id: 'char_2' }],
    camera_motion: { type: 'static' },
  }) as never

describe('G1 — 긴 샷이 동작을 늘여 슬로우모션이 되지 않는다', () => {
  it('긴 샷에는 "느리게 하지 말라"를 명시한다', () => {
    const long = compileMotionContract(spec('small'), 10).text
    expect(long).toContain('natural, lifelike speed')
    expect(long).toContain('do NOT slow it down')
    // 남는 시간을 무엇으로 채울지까지 말해야 정지 화면이 안 된다
    expect(long).toContain('aftermath')
  })

  it('짧은 샷은 기존 문장 그대로 — 문제가 없던 경로를 건드리지 않는다', () => {
    const short = compileMotionContract(spec('small'), 5).text
    expect(short).toContain('Pace the motion across the full 5-second duration')
    expect(short).not.toContain('do NOT slow it down')
    expect(short).not.toContain('aftermath')
  })

  it('같은 spec 이라도 길이가 다르면 계약문이 달라진다', () => {
    const a = compileMotionContract(spec('small'), 5).text
    const b = compileMotionContract(spec('small'), 10).text
    expect(a).not.toBe(b)
  })

  it('큰 동작은 긴 샷이어도 여파 문구를 덧붙이지 않는다 — 이미 화면을 채운다', () => {
    const large = compileMotionContract(spec('large'), 10).text
    expect(large).toContain('a large, clearly visible movement')
    expect(large).not.toContain('aftermath carry the remaining time')
  })

  it('magnitude 자체는 손대지 않는다 — 연출 의도를 앱이 바꾸지 않는다', () => {
    // small 을 medium 으로 승격시키는 식의 조작이 있으면 이 문장이 사라진다
    expect(compileMotionContract(spec('small'), 10).text).toContain('a small, restrained movement')
    expect(compileMotionContract(spec('micro'), 10).text).toContain('barely-perceptible micro movement')
  })

  it('결정론 유지 — 같은 입력이면 같은 계약문(LLM 없음)', () => {
    const x = compileMotionContract(spec('small'), 10).text
    const y = compileMotionContract(spec('small'), 10).text
    expect(x).toBe(y)
  })
})
