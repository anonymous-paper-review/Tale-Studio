// 대본 그대로의 장면 머리 배경 번호(BUS · COUNTRY ROAD)가 문장 속 보통 낱말(bus)을 이름으로 바꾸지 않는지 검사한다
import { describe, expect, it } from 'vitest'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { replaceSlugs } from '@/lib/script-lines'
import { cleanDecoupageProse, cleanShotDesignProse } from '@/lib/writer/pipeline/util/prose_names'

// qa1110 R2(1df92686) — 대본 그대로에서는 배경 번호가 장면 머리 글자 그대로다(번호 = 이름).
const HEADINGS = [
  { id: 'COUNTRY BUS STOP', name: 'COUNTRY BUS STOP' },
  { id: 'COUNTRY ROAD', name: 'COUNTRY ROAD' },
  { id: 'BUS', name: 'BUS' },
]
const CAST = [{ id: 'maya', name: 'MAYA' }]

describe('장면 머리 배경 번호', () => {
  // 왜: qa1110 R2 — 배경 번호 "BUS"가 대소문자를 가리지 않고 문장 속 "bus"를 바꿔, 저장된 샷 글 67곳이 "an empty BUS stop" ·
  //   "'Last BUS 11:40 PM'"이 되고 그 글로 그린 러프에 휴대폰 화면 "Last BUS"가 그려졌다.
  it('대본 그대로의 장면 머리 배경 번호는 문장 속 보통 낱말을 이름으로 바꾸지 않는다', () => {
    const entities = [...CAST, ...HEADINGS]
    expect(resolveEntityNames('Rain falls on an empty bus stop under a single streetlight.', entities)).toBe('Rain falls on an empty bus stop under a single streetlight.')
    expect(replaceSlugs("CLOSE-UP on the phone screen: 'Last bus 11:40 PM'.", HEADINGS.map((h) => ({ slug: h.id, name: h.name })), ''))
      .toBe("CLOSE-UP on the phone screen: 'Last bus 11:40 PM'.")
  })

  // 왜: 저장 길(데쿠파주 · V4)과 그림 프롬프트(first_frame_prompt)도 같은 바꾸기를 거친다 — 러프 그림에 "Last BUS"가 그려진 길.
  it('장면 머리 배경 번호는 저장하는 샷 글과 그림 프롬프트에서도 보통 낱말을 바꾸지 않는다', () => {
    const entities = [...CAST, ...HEADINGS]
    const [beat] = cleanDecoupageProse([{ beat_summary: 'An old bus slows down near maya.' }], entities)
    expect(beat.beat_summary).toBe('An old bus slows down near MAYA.')
    const shot = cleanShotDesignProse(
      { static_spec: { first_frame_prompt: "A phone screen reads 'Last bus 11:40 PM'." } } as unknown as Parameters<typeof cleanShotDesignProse>[0],
      entities,
    )
    expect(shot.static_spec?.first_frame_prompt).toBe("A phone screen reads 'Last bus 11:40 PM'.")
  })

  // 왜: 장면 머리 글자를 그대로 쓴 자리(BUS)는 그 배경을 가리키니 지금처럼 이름으로 바꾼다 — 글자가 같을 때만.
  it('장면 머리 배경 번호는 글자 그대로 쓴 자리만 이름으로 바꾼다', () => {
    const NIGHT_BUS = [{ id: 'INT. BUS', name: 'Night Bus Interior' }]
    expect(resolveEntityNames('We cut to INT. BUS for the last ride.', NIGHT_BUS)).toBe('We cut to Night Bus Interior for the last ride.')
    expect(resolveEntityNames('We cut to Int. bus for the last ride.', NIGHT_BUS)).toBe('We cut to Int. bus for the last ride.')
    const NIGHT_BUS_SLUGS = NIGHT_BUS.map((e) => ({ slug: e.id, name: e.name }))
    expect(replaceSlugs('We cut to INT. BUS for the last ride.', NIGHT_BUS_SLUGS)).toBe('We cut to @Night Bus Interior for the last ride.')
    expect(replaceSlugs('We cut to Int. bus for the last ride.', NIGHT_BUS_SLUGS)).toBe('We cut to Int. bus for the last ride.')
  })

  // 왜: 번호와 이름이 대소문자만 다르면 바꿔도 대소문자만 바뀐다 — 장면 머리 글자("COUNTRY ROAD")를 문장에서 일부러 대문자로 쓴 것을 지키다.
  it('장면 머리 배경 번호와 이름이 대소문자만 다르면 바꾸지 않는다', () => {
    const ROAD = [{ id: 'COUNTRY ROAD', name: 'Country Road' }]
    expect(resolveEntityNames('The COUNTRY ROAD is flooded.', ROAD)).toBe('The COUNTRY ROAD is flooded.')
    expect(replaceSlugs('The COUNTRY ROAD is flooded.', [{ slug: 'COUNTRY ROAD', name: 'Country Road' }], '')).toBe('The COUNTRY ROAD is flooded.')
  })

  // 왜: 정상 경로 고정 — 슬러그 꼴 번호(bus_stop)와 인물 이름은 지금처럼 대소문자를 가리지 않고 바꾼다(모델이 id 를 문장에 쓰는 경우).
  it('슬러그 꼴 배경 번호와 인물 이름은 지금처럼 대소문자를 가리지 않고 이름으로 바꾼다', () => {
    const entities = [{ id: 'bus_stop', name: 'Country Bus Stop' }, ...CAST]
    expect(resolveEntityNames('maya waits at Bus_Stop.', entities)).toBe('MAYA waits at Country Bus Stop.')
    expect(replaceSlugs('Maya waits at bus_stop.', entities.map((e) => ({ slug: e.id, name: e.name })), '')).toBe('MAYA waits at Country Bus Stop.')
  })
})
