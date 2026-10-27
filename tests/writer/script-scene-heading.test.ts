// 원작 대본의 씬 머리가 "SCENE 1. INT. 장소 — 시간"처럼 번호로 시작해도 씬으로 나누고 장소 · 시간을 가른다 (2026-10-27 오너)
import { describe, expect, it } from 'vitest'
import { parseScript } from '@/lib/writer/script/parse'

// 이 시험을 위해 새로 지은 대본 — 실제 작품이 아니다. 문단 사이에 빈 줄이 없다(붙여 넣은 글에 흔하다).
const NUMBERED = [
  '아침 장면은 따뜻하고, 밤 장면은 차갑다. 장면이 바뀔 때마다 소리가 먼저 들어온다.',
  'SCENE 1. INT. 민지의 부엌 / 일요일 아침 — 현재',
  'SFX. 주전자 끓는 소리.',
  '민지(29)가 창문을 연다. 바람이 커튼을 밀어 올린다.',
  '민지: 오늘은 늦지 마.',
  'SCENE 2. EXT. 아파트 옥상 — 밤',
  '도윤이 난간에 기대 서 있다.',
  '도윤: 다 끝났어.',
  'SCENE 3. INT. 거실 / 주방 / 침실 — 연속',
  '민지가 불을 하나씩 끈다.',
  '민지: 잘 자.',
].join('\n')

describe('번호로 시작하는 씬 머리', () => {
  it('원작 대본의 씬 머리가 "SCENE 1."처럼 번호로 시작하면 장소 설명으로 읽지 않고 씬마다 나눈다', () => {
    // 왜: 2026-10-27 운영 — "SCENE 1. INT. … — 현재" 줄을 연극 앞머리의 무대 장소 줄("SCENE: 거실")로 읽어, 대본 전체가 장소 한 칸에 들어가고
    //   씬이 0개가 됐다. 원작 그대로 만든 프로젝트의 산문이 비어 Writer 에서 넘어갈 수 없었다(오너 "이 프로젝트 오류").
    const doc = parseScript(NUMBERED)!
    expect(doc.scenes).toHaveLength(3)
    expect(doc.front_matter.default_location).toBeUndefined()
    expect(doc.scenes[0].elements.some((el) => el.type === 'dialogue' && el.text === '오늘은 늦지 마.')).toBe(true)
    expect(doc.scenes[2].elements.some((el) => el.type === 'dialogue' && el.text === '잘 자.')).toBe(true)
  })

  it('번호 붙은 씬 머리에 INT. · EXT.가 있으면 떼고 — 앞은 장소, 뒤는 시간으로 나눈다', () => {
    // 왜: 오너 결정(2026-10-27) — "INT."가 장소 이름에 붙거나, "거실 / 주방 / 침실 — 연속"의 "/"에서 잘려 장소 "거실" · 시간 "주방 침실 연속"이 되면
    //   브레이크다운 배경 이름이 이상해진다.
    const doc = parseScript(NUMBERED)!
    expect(doc.scenes.map((scene) => [scene.int_ext, scene.location, scene.time_of_day])).toEqual([
      ['INT', '민지의 부엌 / 일요일 아침', '현재'],
      ['EXT', '아파트 옥상', '밤'],
      ['INT', '거실 / 주방 / 침실', '연속'],
    ])
  })

  it('INT. · EXT.가 없는 S# 씬 머리는 지금처럼 / 와 — 로 장소와 시간을 나눈다', () => {
    // 왜: 정상 경로 고정 — 한국 촬영 대본의 "S#3. 편의점 / 밤" 꼴은 그대로 읽는다.
    const doc = parseScript(['S#1. 편의점 / 밤', '수아가 컵라면을 고른다.', '수아: 이거 주세요.', 'S#2. 골목 — 새벽', '수아가 뛴다.', '점원: 거스름돈 가져가요!', '수아: 괜찮아요.'].join('\n'))!
    expect(doc.scenes.map((scene) => [scene.location, scene.time_of_day])).toEqual([['편의점', '밤'], ['골목', '새벽']])
  })

  it('번호 없는 "SCENE: 다방" 같은 무대 장소 줄은 지금처럼 장소 설명으로 읽는다', () => {
    // 왜: 정상 경로 고정 — 희곡 앞머리의 무대 장소 줄은 씬이 아니라 그 막의 장소다.
    const doc = parseScript(['등장인물', '영수: 다방 주인', '미자: 손님', '', 'SCENE: 낡은 다방', '때: 1970년대 겨울', '', '1막', '영수: 어서 오세요.', '미자: 커피 한 잔 주세요.', '영수: 네, 잠시만요.'].join('\n'))!
    expect(doc.front_matter.default_location).toBe('낡은 다방')
    expect(doc.scenes).toHaveLength(1)
    expect(doc.scenes[0].heading).toBe('1막')
  })

  it('앞머리의 때 · 장소 줄 바로 아래에 빈 줄 없이 씬 머리가 오면 그 줄에서 앞머리를 닫고 씬으로 나눈다', () => {
    // 왜: 붙여 넣은 글에는 빈 줄이 없기 쉽다 — "때: 현재" 바로 아래 씬 머리부터 대본 끝까지가 시간 한 칸에 들어가 씬이 0개가 됐다(2026-10-27 검토 지적, 같은 증상).
    for (const head of ['때: 현재', '장소: 서울의 작은 동네']) {
      const doc = parseScript(['토요일의 꿈', head, 'SCENE 1. INT. 수민의 방 / 토요일 아침 — 현재', '수민이 일어난다.', '수민: 또 그 꿈이야.', 'SCENE 2. EXT. 골목 — 낮', '지호: 왔어?', '수민: 응.', '지호: 가자.'].join('\n'))!
      expect(doc.scenes.map((scene) => scene.location), head).toEqual(['수민의 방 / 토요일 아침', '골목'])
    }
    const play = parseScript(['등장인물', '영수: 다방 주인', '미자: 손님', '', '때: 1970년대 겨울', '1막', '영수: 어서 오세요.', '미자: 커피 한 잔 주세요.', '영수: 네, 잠시만요.'].join('\n'))!
    expect(play.front_matter.default_time).toBe('1970년대 겨울')
    expect(play.scenes.map((scene) => scene.heading)).toEqual(['1막'])
  })

  it('S# 번호 뒤 촬영 헤딩의 시간을 괄호로 쓰면 괄호 안을 시간으로 읽는다', () => {
    // 왜: "S#1. EXT. 해변 (낮)"은 예전에 시간 "낮"으로 읽혔다 — INT. · EXT.를 떼면서 괄호 시간이 장소에 붙지 않게 한다(2026-10-27 검토 지적).
    const doc = parseScript(['S#1. EXT. 해변 (낮)', '파도가 친다.', '수아: 바다다!', 'S#2. INT. 버스 안 — 밤', '수아가 존다.', '기사: 종점입니다.', '수아: 네!'].join('\n'))!
    expect(doc.scenes.map((scene) => [scene.int_ext, scene.location, scene.time_of_day])).toEqual([['EXT', '해변', '낮'], ['INT', '버스 안', '밤']])
  })
})
