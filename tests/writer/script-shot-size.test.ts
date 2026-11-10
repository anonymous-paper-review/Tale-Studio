// 대본의 샷 크기 · 앵글 지시(LONG SHOT. · MEDIUM SHOT. …)는 인물로 읽지 않고, 그 줄의 뒤 문장은 지문으로 남긴다 (오너 · 리드 2026-11-10 B1)
import { describe, expect, it } from 'vitest'
import { parseScript, type ScriptElement } from '@/lib/writer/script/parse'

// 11/10 영어 점검(C03)의 시험 대본(앞머리 줄의 줄표만 쉼표로 바꿨다). 이 시험을 위해 지은 글이다(실제 작품 아님).
const LAST_BUS = `THE LAST BUS
(written for this test, not a real work)

1. EXT. COUNTRY BUS STOP - NIGHT
WIDE SHOT. Rain falls on an empty bus stop under a single streetlight.
MAYA (20s, yellow raincoat) runs in, out of breath, and checks her phone.
CLOSE-UP on the phone screen: "Last bus 11:40 PM". The clock reads 11:42.
MAYA: No, no, no...

2. EXT. COUNTRY ROAD - CONTINUOUS
LONG SHOT. Headlights appear around the bend. An old bus slows down.
MEDIUM SHOT. The door folds open. The DRIVER (60s, kind eyes, wool cap) smiles.
DRIVER: I always wait two minutes for the rain.
Maya laughs and steps inside.

3. INT. BUS - CONTINUOUS
TRACKING SHOT down the empty aisle. Maya sits by the window.
CLOSE-UP. She draws a small smile on the fogged glass.
FADE OUT.`

// 한 줄만 바꿔 끼우는 짧은 대본. 앞뒤 인물은 MAYA · DRIVER 둘이다.
const withLine = (line: string) => `EXT. COUNTRY ROAD - NIGHT

MAYA: Is that the last bus?

${line}

DRIVER: Hop in.

INT. BUS - CONTINUOUS

MAYA: Thank you.
`

const speakers = (text: string) => parseScript(text, { assumeScript: true })?.characters.map((c) => c.name) ?? []
const dialogue = (elements: ScriptElement[]) =>
  elements.flatMap((e) => (e.type === 'dialogue' ? [`${e.character}: ${e.text}`] : []))

describe('같이 정한 것', () => {
  // 왜: 11/10 점검(C03 · L2#0)에서 인물 목록이 MAYA · LONG SHOT · MEDIUM SHOT 이 되고 DRIVER 가 빠졌다. [만들기]가 "LONG SHOT" 인물 시트를 그린다.
  it('대본 그대로 쓰기에서 LONG SHOT. · MEDIUM SHOT. 으로 시작하는 줄은 인물로 읽지 않아, 인물은 대본에서 말하는 사람만 나온다', () => {
    expect(speakers(LAST_BUS)).toEqual(['MAYA', 'DRIVER'])
  })

  // 왜: 11/10 점검(L2#2)에서 지문 "Headlights appear…"가 대사가 되고, DRIVER 의 진짜 대사가 지문과 한 줄로 묶여 화자 없는 V.O. 로
  //   Storyboard 대사 탭 · 마스터 시트에 실렸다.
  it('대본 그대로 쓰기에서 대사는 대본에 적힌 화자 그대로 나뉘고, 지문은 대사가 되지 않는다', () => {
    const doc = parseScript(LAST_BUS, { assumeScript: true })!

    expect(doc.scenes.map((scene) => dialogue(scene.elements))).toEqual([
      ['MAYA: No, no, no...'],
      ['DRIVER: I always wait two minutes for the rain.'],
      [],
    ])
    expect(doc.stats.dialogue_lines).toBe(2)
  })
})

describe('혼자 정한 것', () => {
  // 왜: 줄 전체를 연출로 두면 그 장면에서 일어나는 일(버스가 온다 · 문이 열린다)이 지문에서 빠져, 샷을 나눌 때 보이지 않는다.
  //   예전 WIDE SHOT 줄도 그랬다. 카메라 말은 연출 지시로 따로 남긴다.
  it('카메라 말 + 마침표로 시작하는 줄은 카메라 말은 연출로, 뒤 문장은 지문으로 나눈다', () => {
    const doc = parseScript(LAST_BUS, { assumeScript: true })!

    expect(doc.scenes[1].elements).toEqual([
      { type: 'camera', text: 'LONG SHOT.' },
      { type: 'action', text: 'Headlights appear around the bend. An old bus slows down.' },
      { type: 'camera', text: 'MEDIUM SHOT.' },
      { type: 'action', text: 'The door folds open. The DRIVER (60s, kind eyes, wool cap) smiles.' },
      { type: 'dialogue', character: 'DRIVER', character_id: 'driver', text: 'I always wait two minutes for the rain.', parenthetical: undefined, extension: undefined },
      { type: 'action', text: 'Maya laughs and steps inside.' },
    ])
    expect(doc.scenes[0].elements[0]).toEqual({ type: 'camera', text: 'WIDE SHOT.' })
    expect(doc.scenes[0].elements[1]).toMatchObject({ type: 'action', text: expect.stringMatching(/^Rain falls on an empty bus stop under a single streetlight\./) })
    expect(doc.scenes[2].elements).toContainEqual({ type: 'action', text: 'She draws a small smile on the fogged glass.' })
  })

  // 왜: 대본마다 쓰는 샷 말이 다르다. LONG · MEDIUM 둘만 막으면 FULL SHOT 같은 줄이 또 인물이 된다. 이름 · 대사 꼴(쌍점 · 마침표 · 이름만 있는 줄) 어느 쪽이든 같다.
  it('샷 크기 · 앵글 말로 시작하는 대문자 줄은 이름 · 대사 꼴이어도 카메라 지시로 읽는다', () => {
    const lines = [
      'FULL SHOT. Maya waves at the bus.',
      'MEDIUM CLOSE-UP. Maya hesitates at the door.',
      'EXTREME LONG SHOT. The bus is a dot on the road.',
      'EXTREME WIDE SHOT. Fields in the rain.',
      'ESTABLISHING SHOT. A village at night.',
      'MEDIUM WIDE SHOT. The driver waits.',
      'TWO SHOT. Maya and the driver look at each other.',
      'HIGH ANGLE. The bus stop from above.',
      'LOW ANGLE. The bus looms over Maya.',
      'DUTCH ANGLE. Rain slants across the frame.',
      'OVER THE SHOULDER. Maya looks at the driver.',
      'OVERHEAD. The empty road.',
      'AERIAL SHOT. The bus winds through the hills.',
      "BIRD'S EYE VIEW. The bus stop.",
      'LONG SHOT: Headlights appear around the bend.',
      'MEDIUM SHOT: The door folds open.',
      '**LONG SHOT:** Headlights appear around the bend.',
    ]
    for (const line of lines) expect(speakers(withLine(line)), line).toEqual(['MAYA', 'DRIVER'])
    // 이름만 있는 줄 다음에 글이 오는 꼴(대문자 큐처럼 보이는 줄)
    expect(speakers(withLine('LONG SHOT\nHeadlights appear around the bend.'))).toEqual(['MAYA', 'DRIVER'])
  })

  // 왜: MEDIUM(영매) · LONG(성) 은 인물 이름일 수 있다. 샷 말은 SHOT · CLOSE-UP · ANGLE 이 붙을 때만 본다.
  it('맨 낱말 MEDIUM · LONG 이 이름인 대사 줄은 그대로 인물 대사로 읽는다', () => {
    expect(speakers(withLine('MEDIUM: The spirits are here.'))).toEqual(['MAYA', 'MEDIUM', 'DRIVER'])
    expect(speakers(withLine('LONG. Who is there?'))).toEqual(['MAYA', 'LONG', 'DRIVER'])
  })

  // 왜: 번역 대본에서도 같은 오독이 난다(2026-10-06 "메모장으로 푸시 인:" 제보와 같은 꼴). 한국어 샷 말로 끝나는 "이름: 대사" 줄은 카메라 지시다.
  it('한국어 샷 크기 말(롱 숏 · 미디엄 숏 · 풀 숏 · 바스트 숏 · 투 숏 · 하이 앵글 · 로우 앵글)로 끝나는 "이름: 대사" 꼴 줄도 인물로 읽지 않는다', () => {
    const lines = ['롱 숏: 헤드라이트가 다가온다.', '롱숏: 버스가 선다.', '미디엄 숏: 문이 열린다.', '풀 숏: 마야가 손을 흔든다.', '바스트 숏: 기사가 웃는다.', '투 숏: 둘이 마주 본다.', '하이 앵글: 빈 정류장.', '로우 앵글: 버스가 크게 보인다.']
    for (const line of lines) expect(speakers(withLine(line)), line).toEqual(['MAYA', 'DRIVER'])
  })
})
