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

describe('혼자 정한 것 · 검토 c 고침', () => {
  const elementsOf = (line: string) => parseScript(withLine(line), { assumeScript: true })!.scenes[0].elements

  // 왜: 검토 c 보통 2. 샷 말 뒤가 "마침표 + 영어 대문자 문장"일 때만 나눠서, 한국어 · 줄표 · 쉼표 · 숫자로 이어지는 줄은 통째로 연출이 되어
  //   지문에서 빠졌다(예전엔 지문이었다). 샷을 나눌 때 그 장면의 일이 안 보이고 길이 셈에서도 4초가 빠진다.
  it('샷 말 뒤가 마침표 · 쌍점 · 쉼표 · 줄표로 이어지면, 뒤 글이 영어 소문자 문장 · 한국어 · 숫자로 시작해도 지문으로 나눈다', () => {
    const cases: Array<[string, string, string]> = [
      ['LONG SHOT. 버스가 다가온다.', 'LONG SHOT.', '버스가 다가온다.'],
      ['MEDIUM SHOT. 문이 열린다.', 'MEDIUM SHOT.', '문이 열린다.'],
      ['LONG SHOT \u2014 Headlights appear around the bend.', 'LONG SHOT \u2014', 'Headlights appear around the bend.'],
      ['LONG SHOT - Headlights appear around the bend.', 'LONG SHOT -', 'Headlights appear around the bend.'],
      ['LONG SHOT -- Headlights appear around the bend.', 'LONG SHOT --', 'Headlights appear around the bend.'],
      ['LONG SHOT, headlights appear around the bend.', 'LONG SHOT,', 'headlights appear around the bend.'],
      ['LONG SHOT. 3 buses pass.', 'LONG SHOT.', '3 buses pass.'],
      ['LONG SHOT: Headlights appear around the bend.', 'LONG SHOT:', 'Headlights appear around the bend.'],
    ]
    for (const [line, camera, action] of cases) {
      const elements = elementsOf(line)
      expect(elements, line).toContainEqual({ type: 'camera', text: camera })
      expect(elements, line).toContainEqual({ type: 'action', text: action })
      expect(speakers(withLine(line)), line).toEqual(['MAYA', 'DRIVER'])
    }
  })

  // 왜: 검토 c 보통 3. 마크다운 대본 · 붙여 넣은 문서의 "**LONG SHOT.** …"은 굵은 이름 끝 마침표 때문에 카메라 말로 못 알아봐 인물 "LONG SHOT."이 됐다.
  it('굵은 글씨로 적은 샷 말("**LONG SHOT.** …" · "**MEDIUM SHOT.** …")도 인물로 읽지 않고, 뒤 문장은 지문으로 나눈다', () => {
    const cases: Array<[string, string, string]> = [
      ['**LONG SHOT.** Headlights appear around the bend.', 'LONG SHOT.', 'Headlights appear around the bend.'],
      ['**MEDIUM SHOT.** The door folds open.', 'MEDIUM SHOT.', 'The door folds open.'],
    ]
    for (const [line, camera, action] of cases) {
      expect(speakers(withLine(line)), line).toEqual(['MAYA', 'DRIVER'])
      expect(elementsOf(line), line).toContainEqual({ type: 'camera', text: camera })
      expect(elementsOf(line), line).toContainEqual({ type: 'action', text: action })
    }
  })

  // 왜: 검토 c 낮음 6. 카메라 줄을 나눈 뒤 빈 줄 없이 이어지는 줄을 지문으로 붙여 읽어, 예전엔 따로였던 카메라 지시 · 화면 문자 · 소리가
  //   지문에 섞였다(화면 문자가 그림에 글자로 그려질 수 있다). 카메라 줄로 시작하는 문단만 그렇다.
  it('카메라 줄 바로 아래(빈 줄 없이)에 오는 카메라 말 · 화면 문자 · 소리 큐 줄은 지문에 섞지 않고 따로 읽는다', () => {
    expect(elementsOf('WIDE SHOT. Rain falls on the stop.\nCLOSE ON the phone screen.')).toEqual([
      { type: 'dialogue', character: 'MAYA', character_id: 'maya', text: 'Is that the last bus?', parenthetical: undefined, extension: undefined },
      { type: 'camera', text: 'WIDE SHOT.' },
      { type: 'action', text: 'Rain falls on the stop.' },
      { type: 'camera', text: 'CLOSE ON the phone screen.' },
      { type: 'dialogue', character: 'DRIVER', character_id: 'driver', text: 'Hop in.', parenthetical: undefined, extension: undefined },
    ])
    expect(elementsOf('WIDE SHOT. Rain falls on the stop.\nSUPER - TEN YEARS LATER')).toContainEqual({ type: 'on_screen', text: 'TEN YEARS LATER' })
    expect(elementsOf('WIDE SHOT. Rain falls on the stop.\n(MUSIC: a slow piano)')).toContainEqual({ type: 'sound', text: 'MUSIC: a slow piano' })
    expect(elementsOf('WIDE SHOT. Rain falls on the stop.\nSUPER - TEN YEARS LATER')).toContainEqual({ type: 'action', text: 'Rain falls on the stop.' })
  })

  // 왜: 검토 c 낮음 6 을 고치며 정했다. 카메라 줄의 뒤 문장이 끝나면 다음 줄부터는 예전과 같은 덩이로 읽어야 원래 대본 읽기가 바뀌지 않는다.
  //   PDF 에서 붙여 넣은 대본처럼 문장이 줄바꿈으로 잘린 경우만 다음 줄까지 이어 한 지문으로 읽는다.
  it('카메라 줄의 뒤 문장은 문장이 끝나면 거기서 끝나고, 줄바꿈으로 잘린 문장만 다음 줄까지 이어 한 지문으로 읽는다', () => {
    const wrapped = elementsOf('LONG SHOT. Headlights appear around the\nbend as an old bus slows down.')
    expect(wrapped).toContainEqual({ type: 'action', text: 'Headlights appear around the bend as an old bus slows down.' })

    const ended = elementsOf('WIDE SHOT. Rain falls on the stop.\nMaya runs in, out of breath.\nCLOSE-UP on her phone: the last bus is gone.')
    expect(ended.filter((e) => e.type !== 'dialogue')).toEqual([
      { type: 'camera', text: 'WIDE SHOT.' },
      { type: 'action', text: 'Rain falls on the stop.' },
      { type: 'action', text: 'Maya runs in, out of breath. CLOSE-UP on her phone: the last bus is gone.' },
    ])
  })
})

describe('혼자 정한 것 · 검토 c 재검토(7982ba84)', () => {
  const elementsOf = (line: string) => parseScript(withLine(line), { assumeScript: true })!.scenes[0].elements

  // 왜: 검토 c 재검토 낮음 1(7982ba84 에서 생긴 회귀). 줄 앞 굵은 표시를 떼고 카메라 말을 보다 보니 "**CRANE:** Who goes there?"처럼
  //   카메라 맨 낱말(CRANE · DOLLY · ZOOM)이 이름인 굵은 큐가 연출이 됐다. 그 낱말로 시작하는 사람 이름(DOLLY PARTON)도 같다.
  //   검토 c(7550d031) 보통 2 를 고치며 문장을 고쳤다. 예전 문장 "…그 이름이 샷 · 카메라 지시로 끝나지 않으면 인물 대사로 읽는다"는
  //   대상을 받는 굵은 카메라 지시(**CLOSE ON MAYA.**)까지 인물로 묶었다.
  it('굵은 이름 큐가 카메라 맨 낱말이거나 그 낱말로 시작하는 사람 이름이면(**CRANE:** · **DOLLY.** · **ZOOM:** · **DOLLY PARTON:**) 인물 대사로 읽는다', () => {
    expect(speakers(withLine('**CRANE:** Who goes there?'))).toEqual(['MAYA', 'CRANE', 'DRIVER'])
    expect(speakers(withLine('**ZOOM:** Faster, faster!'))).toEqual(['MAYA', 'ZOOM', 'DRIVER'])
    expect(elementsOf('**DOLLY.** Hi there!')).toContainEqual(expect.objectContaining({ type: 'dialogue', text: 'Hi there!' }))
    expect(speakers(withLine('**DOLLY PARTON:** Hello there!'))).toEqual(['MAYA', 'DOLLY PARTON', 'DRIVER'])
  })

  // 왜: 검토 c(7550d031) 보통 2. 굵은 큐를 이름이 카메라 지시로 끝날 때만 연출로 보니 "**CLOSE ON MAYA.** She smiles."가 다시 인물
  //   "CLOSE ON MAYA."가 됐다(신고된 고장과 같은 증상: 가짜 인물 · 인물 시트). 대상을 받는 카메라 지시로 시작하면 연출이다.
  it('굵은 카메라 지시가 대상을 받는 꼴이어도(**CLOSE ON MAYA.** · **ANGLE ON THE DOOR.** · **PUSH IN ON MAYA.** · **ZOOM IN ON MAYA.**) 인물로 읽지 않고, 뒤 문장은 지문으로 나눈다', () => {
    const cases: Array<[string, string, string]> = [
      ['**CLOSE ON MAYA.** She smiles.', 'CLOSE ON MAYA.', 'She smiles.'],
      ['**ANGLE ON THE DOOR.** It creaks open.', 'ANGLE ON THE DOOR.', 'It creaks open.'],
      ['**PUSH IN ON MAYA.** She blinks.', 'PUSH IN ON MAYA.', 'She blinks.'],
      ['**ZOOM IN ON MAYA.** She freezes.', 'ZOOM IN ON MAYA.', 'She freezes.'],
    ]
    for (const [line, camera, action] of cases) {
      expect(speakers(withLine(line)), line).toEqual(['MAYA', 'DRIVER'])
      expect(elementsOf(line), line).toContainEqual({ type: 'camera', text: camera })
      expect(elementsOf(line), line).toContainEqual({ type: 'action', text: action })
    }
  })

  // 왜: 검토 c 재검토 참고 2. 굵은 샷 말 뒤에 구분자가 없는 줄("**WIDE SHOT** Rain falls…")은 통째로 연출이 되어 지문이 빠졌다. 굵은 표시 끝이 구분자다.
  it('굵은 샷 말 뒤에 구분자가 없어도(**WIDE SHOT** Rain falls…) 굵은 표시 끝에서 나눠 뒤 문장은 지문으로 남긴다', () => {
    const elements = elementsOf('**WIDE SHOT** Rain falls on the stop.')

    expect(elements).toContainEqual({ type: 'camera', text: 'WIDE SHOT' })
    expect(elements).toContainEqual({ type: 'action', text: 'Rain falls on the stop.' })
  })

  // 왜: 검토 c 재검토 낮음 3. 첫 구분자에서 나눠 "INSERT - THE LETTER: …"는 연출이 "INSERT -"뿐이었다. 대상을 받는 카메라 지시는 글(소문자 · 한글)이
  //   나오기 바로 앞의 마지막 구분자까지다. 검토 c(7550d031) 보통 1 을 고치며 문장을 좁혔다(예전 문장 "카메라 말 안에 쉼표 · 쌍점 · 줄표가 있어도
  //   소문자 · 한글 글이 나오기 바로 앞의 마지막 구분자에서 나눈다"는 샷 크기 말 뒤의 인물 소개까지 연출로 삼켰다).
  //   검토 c(acb4683d) 를 고치며 다시 좁혔다(리드 지시): 첫 구분자가 마침표면 거기서 나눈다(아래 시험). 예전 문장 "대상을 받는 카메라 지시(CLOSE ON ·
  //   ANGLE ON · INSERT …)는 소문자 · 한글 글이 나오기 바로 앞의 마지막 구분자까지 연출로 본다".
  it('대상을 받는 카메라 지시(CLOSE ON · ANGLE ON · INSERT …)는 첫 구분자가 쉼표 · 쌍점 · 줄표면 소문자 · 한글 글이 나오기 바로 앞의 마지막 구분자까지 연출로 본다', () => {
    const letter = elementsOf("INSERT - THE LETTER: 'Dear Maya, come home.'")
    expect(letter).toContainEqual({ type: 'camera', text: 'INSERT - THE LETTER:' })
    expect(letter).toContainEqual({ type: 'action', text: "'Dear Maya, come home.'" })

    const group = elementsOf('CLOSE ON MAYA, DRIVER AND THE BUS. They stare.')
    expect(group).toContainEqual({ type: 'camera', text: 'CLOSE ON MAYA, DRIVER AND THE BUS.' })
    expect(group).toContainEqual({ type: 'action', text: 'They stare.' })
  })

  // 왜: 검토 c 재검토 참고 1(610e06b8 부터). "C.U. Maya smiles."는 카메라 약어를 못 알아봐 인물 "C.U"가 됐다. 신고된 고장과 같은 꼴이다.
  it('"C.U." · "P.O.V." 처럼 점을 찍은 카메라 약어로 시작하는 줄도 인물로 읽지 않고, 뒤 문장은 지문으로 나눈다', () => {
    expect(speakers(withLine('C.U. Maya smiles.'))).toEqual(['MAYA', 'DRIVER'])
    expect(elementsOf('C.U. Maya smiles.')).toContainEqual({ type: 'camera', text: 'C.U.' })
    expect(elementsOf('C.U. Maya smiles.')).toContainEqual({ type: 'action', text: 'Maya smiles.' })
    expect(speakers(withLine('P.O.V. The dog runs.'))).toEqual(['MAYA', 'DRIVER'])
    expect(elementsOf('P.O.V. The dog runs.')).toContainEqual({ type: 'action', text: 'The dog runs.' })
  })

  // 왜: 검토 c(7550d031) 보통 1. 마지막 구분자까지 연출로 보니 "WIDE SHOT. MAYA, 20s, yellow raincoat, runs in."의 MAYA 가 연출로 넘어가 지문에서 빠졌다.
  //   씬 인물은 지문 속 이름으로도 찾기 때문에, 그 씬에서 말이 없는 인물이 씬에서 빠졌다. 샷 크기 말은 그 말 바로 뒤 구분자까지다.
  it('샷 크기 말(LONG · WIDE SHOT · C.U. · P.O.V. …)은 그 말 바로 뒤 구분자에서 나눠, 뒤에 오는 인물 소개(MAYA, 20s, …)는 지문에 남긴다', () => {
    const cases: Array<[string, string, string]> = [
      ['WIDE SHOT. MAYA, 20s, yellow raincoat, runs in.', 'WIDE SHOT.', 'MAYA, 20s, yellow raincoat, runs in.'],
      ['WIDE SHOT. JOHN, 40s, enters the bus.', 'WIDE SHOT.', 'JOHN, 40s, enters the bus.'],
      ['LONG SHOT. MAYA AND THE DRIVER, soaked, wait.', 'LONG SHOT.', 'MAYA AND THE DRIVER, soaked, wait.'],
      ['WIDE SHOT OF THE ROAD. Rain falls.', 'WIDE SHOT OF THE ROAD.', 'Rain falls.'],
    ]
    for (const [line, camera, action] of cases) {
      expect(elementsOf(line), line).toContainEqual({ type: 'camera', text: camera })
      expect(elementsOf(line), line).toContainEqual({ type: 'action', text: action })
    }
    const silent = parseScript(`EXT. BUS STOP - NIGHT

MAYA: Hello?

INT. BUS - CONTINUOUS
WIDE SHOT. MAYA, 20s, sits alone by the window.

DRIVER: Next stop, the coast.
`, { assumeScript: true })!
    expect(silent.scenes[1].characters).toEqual(['driver', 'maya'])
  })

  // 왜: 검토 c(acb4683d) 보통 1 남은 것. TRACKING · CRANE · DOLLY · (THE) CAMERA 로 시작하는 샷 이름은 대상을 받는 말로 셈해 마지막 구분자까지 보다 보니
  //   "TRACKING SHOT. MAYA, 20s, …"의 MAYA 가 연출로 넘어갔다. 마침표는 연출 문장의 끝이다(CLOSE ON 무리 · INSERT 는 첫 구분자가 쉼표 · 줄표라 그대로).
  it('대상을 받는 카메라 지시라도 첫 구분자가 마침표면 거기서 나눠, 뒤에 오는 인물 소개(TRACKING SHOT. MAYA, 20s, …)는 지문에 남긴다', () => {
    const cases: Array<[string, string, string]> = [
      ['TRACKING SHOT. MAYA, 20s, runs down the aisle.', 'TRACKING SHOT.', 'MAYA, 20s, runs down the aisle.'],
      ['CRANE SHOT. MAYA, 20s, looks up.', 'CRANE SHOT.', 'MAYA, 20s, looks up.'],
      ['DOLLY SHOT. JOHN, 40s, walks.', 'DOLLY SHOT.', 'JOHN, 40s, walks.'],
      ['THE CAMERA PANS. MAYA, 20s, enters.', 'THE CAMERA PANS.', 'MAYA, 20s, enters.'],
    ]
    for (const [line, camera, action] of cases) {
      expect(elementsOf(line), line).toContainEqual({ type: 'camera', text: camera })
      expect(elementsOf(line), line).toContainEqual({ type: 'action', text: action })
    }
    const silent = parseScript(`EXT. BUS STOP - NIGHT

MAYA: Hello?

INT. BUS - CONTINUOUS
TRACKING SHOT. MAYA, 20s, walks down the aisle.

DRIVER: Next stop, the coast.
`, { assumeScript: true })!
    expect(silent.scenes[1].characters).toEqual(['driver', 'maya'])
  })
})

describe('혼자 정한 것 · 다시 돌리기 R2(리드 2026-11-10)', () => {
  const elementsOf = (line: string) => parseScript(withLine(line), { assumeScript: true })!.scenes[0].elements

  // 왜: 다시 돌리기 R2(C03) 보통. "TRACKING SHOT down the empty aisle. Maya sits by the window."가 통째로 연출이 되어 3씬에 "She draws…"만 남고
  //   씬 인물이 비었다(그림에 Maya 가 이어지지 않는다). 카메라 말 뒤가 구분자가 아니라 낱말이라 앞 규칙에 안 걸렸다.
  it('카메라 말 뒤에 소문자 말이 이어지는 줄도 ". " 다음에 대문자로 시작하는 문장이 오면 그 앞까지는 연출, 뒤는 지문으로 나눈다', () => {
    const cases: Array<[string, string, string]> = [
      ['TRACKING SHOT down the empty aisle. Maya sits by the window.', 'TRACKING SHOT down the empty aisle.', 'Maya sits by the window.'],
      ['PAN ACROSS the room. A cat sleeps.', 'PAN ACROSS the room.', 'A cat sleeps.'],
    ]
    for (const [line, camera, action] of cases) {
      expect(elementsOf(line), line).toContainEqual({ type: 'camera', text: camera })
      expect(elementsOf(line), line).toContainEqual({ type: 'action', text: action })
    }
    expect(parseScript(LAST_BUS, { assumeScript: true })!.scenes[2].characters).toEqual(['maya'])
  })

  // 왜: 약어의 점은 문장 끝이 아니다. 나누면 "C.U." 가 "C." 와 "U. …" 로 갈리거나 장면 머리가 망가진다.
  it('약어(C.U. · P.O.V. · INT. · EXT. · 한 글자 + 점)는 문장을 나누는 자리로 보지 않는다', () => {
    expect(elementsOf('C.U. Maya smiles.')).toContainEqual({ type: 'camera', text: 'C.U.' })
    expect(elementsOf('C.U. Maya smiles.')).toContainEqual({ type: 'action', text: 'Maya smiles.' })
    expect(elementsOf('TRACKING SHOT past the U.S. Embassy sign. Maya waves.')).toContainEqual({ type: 'camera', text: 'TRACKING SHOT past the U.S. Embassy sign.' })
    expect(elementsOf('TRACKING SHOT past the U.S. Embassy sign. Maya waves.')).toContainEqual({ type: 'action', text: 'Maya waves.' })
    expect(elementsOf('TRACKING SHOT through the EXT. gate. Maya waits.')).toContainEqual({ type: 'camera', text: 'TRACKING SHOT through the EXT. gate.' })
    const heading = parseScript('INT. BUS - NIGHT\nMaya sits.\n\nMAYA: Finally.\n\nEXT. ROAD - DAY\n\nDRIVER: Hold on.', { assumeScript: true })!
    expect(heading.scenes.map((scene) => [scene.location, scene.time_of_day])).toEqual([['BUS', 'NIGHT'], ['ROAD', 'DAY']])
  })
})

