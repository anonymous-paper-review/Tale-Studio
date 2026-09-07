// 장면이 길어도 동작은 자연스러운 속도로 끝까지 보이고, 짧아도 마지막 화면까지 이어진다 (#g1 2026-08-27 오너)
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

describe('G1 — 장면이 길어도 동작이 느려 보이지 않는다', () => {
  it('장면이 길어도 동작을 자연스러운 속도로 보여 준다고 약속한다', () => {
    const long = compileMotionContract(spec('small'), 10).text
    expect(long).toContain('natural, lifelike speed')
    expect(long).toContain('do NOT slow it down')
    // 남는 시간을 무엇으로 채울지까지 말해야 정지 화면이 안 된다
    expect(long).toContain('aftermath')
  })

  it('짧은 장면도 동작을 자연스러운 속도로 보여 준다 (#d3 오너 실측)', () => {
    // 2026-08-31 개정: 옛 전제("짧은 샷은 문제가 없던 경로")가 실측으로 반박됐다 —
    //   실제 분포의 87.3%가 7초 미만이라 "전체 N초에 걸쳐 페이싱" 문장이 남은 주 슬로모
    //   원인이었다(5초 샷 + 2초 동작 = 2.5배 슬로모). 짧은 샷 고유 목적(마지막 프레임 전
    //   완결)은 유지된 채 자연 속도 지시가 들어가야 한다.
    const short = compileMotionContract(spec('small'), 5).text
    expect(short).toContain('natural, lifelike speed')
    expect(short).toContain('do NOT stretch or slow it')
    expect(short).toContain('completes by the final frame')
    expect(short).toContain('never slow motion')
    expect(short).not.toContain('Pace the motion across')
  })

  it('같은 동작이라도 장면 길이가 다르면 안내가 달라진다', () => {
    const a = compileMotionContract(spec('small'), 5).text
    const b = compileMotionContract(spec('small'), 10).text
    expect(a).not.toBe(b)
  })

  it('큰 동작은 장면이 길어도 남은 시간을 채우라는 안내를 덧붙이지 않는다', () => {
    const large = compileMotionContract(spec('large'), 10).text
    expect(large).toContain('a large, clearly visible movement')
    expect(large).not.toContain('aftermath carry the remaining time')
  })

  it('동작의 크기는 연출자가 정한 대로 두고 임의로 바꾸지 않는다', () => {
    // small 을 medium 으로 승격시키는 식의 조작이 있으면 이 문장이 사라진다
    expect(compileMotionContract(spec('small'), 10).text).toContain('a small, restrained movement')
    expect(compileMotionContract(spec('micro'), 10).text).toContain('barely-perceptible micro movement')
  })

  it('같은 동작과 시간을 넣으면 같은 안내가 나와 일관된다', () => {
    const x = compileMotionContract(spec('small'), 10).text
    const y = compileMotionContract(spec('small'), 10).text
    expect(x).toBe(y)
  })
})

describe('#coverage-first — 한 인물의 이어지는 동작은 입력 순서를 따른다', () => {
  it('한 인물의 두 동작은 차례대로 이어진다고 안내한다', () => {
    const text = compileMotionContract(
      {
        character_motion: [
          { verb: 'opens eyes', magnitude: 'small', character_id: 'char' },
          { verb: 'pushes himself up', magnitude: 'medium', character_id: 'char' },
        ],
        camera_motion: { type: 'static' },
      } as never,
      6,
    ).text
    expect(text).toContain('then the same subject: "pushes himself up"')
    expect(text).toContain('strictly in the order given')
  })

  it('서로 다른 인물의 동작은 각자 동시에 진행한다고 안내한다', () => {
    const text = compileMotionContract(
      {
        character_motion: [
          { verb: 'draws sword', magnitude: 'medium', character_id: 'a' },
          { verb: 'steps back', magnitude: 'small', character_id: 'b' },
        ],
        camera_motion: { type: 'static' },
      } as never,
      5,
    ).text
    expect(text).toContain('subject 2: "steps back"')
    expect(text).not.toContain('strictly in the order given')
  })
})

describe('#coverage-first 리뷰 M2 — 이어지는 동작 중간에는 남은 시간 안내를 붙이지 않는다', () => {
  it('긴 장면에서 작은 첫 동작 뒤에 같은 인물의 동작이 이어지면 남은 시간 안내를 붙이지 않는다', () => {
    const text = compileMotionContract(
      {
        character_motion: [
          { verb: 'opens eyes', magnitude: 'small', character_id: 'char' },
          { verb: 'pushes himself up', magnitude: 'medium', character_id: 'char' },
        ],
        camera_motion: { type: 'static' },
      } as never,
      7,
    ).text
    const first = text.indexOf('"opens eyes"')
    const second = text.indexOf('then the same subject')
    expect(text.slice(first, second)).not.toContain('aftermath')
  })
})
