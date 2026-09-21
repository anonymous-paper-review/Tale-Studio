// 이 파일이 지키는 약속: 사용자가 붙여 넣은 글이 대본이면 그것을 알아보고, 씬·인물·대사·지문·카메라·화면 문자·소리를 종류별로 나누되 대사는 한 글자도 바꾸지 않는다.
//   근거: 2026-09-17 오너 — producer 입력이 writer 시드로 각색되는 문제. 창작자의 대본은 그대로 담겨야 한다. 실측 시드: LCFA 촬영용 10편 · 무대 희곡 7편 · 라디오 1편.
import { describe, it, expect } from 'vitest'
import { detectScript, parseScript } from '@/lib/writer/script/parse'

// 촬영용(할리우드 꼴) — 씬 헤딩 · 인물 큐 · 괄호 지시 · 트랜지션 · 화면 문자 · 효과음 · 인물 설정 앞머리
const SCREENPLAY = `BABY SHARK

written by
Edemilson C. Morais

BABY SHARK – Character Breakdown

ELENA RIVAS – Protagonist, Head of Security
(45, authoritative, head of mall operations)
It took a while before Elena decided to try for a child.

MAYA RIVAS – Elena's Daughter
(5, shy but curious)
At this age, Maya sees her parents as her main reference.

FADE IN:
ON SCREEN: Based on a true story.

INT. SECURITY ROOM – DAY
The sound fades as the camera pulls back from the TV screen.
Two security guards monitor multiple monitors: JEFF (30, skeptical) and BRUNO (25).

JEFF (O.S.)
Oh, man… it's getting messy outside.

The door swings open. ELENA RIVAS (45, authoritative) strides in.

ELENA RIVAS
Guys, c'mon, turn off the TV.
(switching tone)
And I need the stairwell footage from November 22, Wing B.

INT. ELENA'S OFFICE – CONTINUOUS
Elena sets Maya in her chair. DING. A text buzzes.

MAYA
I heard the song. I thought… maybe it was my toy.

CUT TO:

EXT. STREET – NIGHT
PUSH IN on Elena's face. A Christmas song begins to play.

FADE OUT.
THE END.`

// 무대 희곡(한국어) — 막·장 · 등장인물·때·무대광경 앞머리 · "이름: 대사" 꼴
const STAGE_PLAY = `인쇄한 러브레터

1막
등장인물
* 강양수(姜良洙)
* 강애경(姜愛卿)(그의 누님)

때
현대, 어떤 날의 오후

무대광경
양수의 화실. 막이 열리면 양수는 책상 앞에 앉아 책을 보고 있다.

양수: (한참동안 책을 물끄러미 보고 있다가 홱 덮어놓고) 뭐예요, 누님!
애경: (빙그레 웃으며) 얘 양수! 너는 요새 무슨 편지를 그렇게 밤낮 내 보니?
양수: 그 따위 편지라니? 아니, 누님은 이게 어떤 편진 줄 알구나 그러시유?

수연과 명효 무대 좌측에서 등장.

수연: 여보게 양수군!

2막
무대광경
같은 화실, 저녁.

애경: 이야기라니 무슨 이야기예요?
─〈막을 급히〉`

// 라디오 드라마 — 이름: 대사 · (MUSIC …) (SOUND …) 큐 · 내레이션, 씬 헤딩 없음
const RADIO = `Quiet, Please! #59 The Thing on the Fourble Board

CHAPPELL:
Quiet, please.

(MUSIC ... THEME ... FADE FOR)

ANNOUNCER:
The Mutual Broadcasting System presents "Quiet, Please!"

(MUSIC ... THEME ... END)

PORKY (narrates): Me, I'm a roughneck. Well, I was a roughneck.

(SOUND ... A DOOR OPENS AND CLOSES)

MIKE: Porky? Is that you?

PORKY: It's me, Mike.

(MUSIC ... STING)`

// 대본이 아닌 줄거리 산문 — 지금 producer 입력의 보통 꼴
const PROSE = `겨울이 오면 마을의 세 부족장이 무너진 다리 앞에서 만난다. 용족의 수장은 오래된 약속을 지키려 하고,
요정의 수장은 그 약속이 자기 부족을 죽일 것이라 믿는다. 수인의 수장은 두 사람 사이에서 자기 백성을 먹일 길만 찾는다.
셋은 하룻밤 동안 다리를 건널지 말지를 두고 다투고, 새벽에 한 사람이 먼저 다리 위로 발을 내딛는다.`

describe('대본 판별', () => {
  // 왜: 정상 경로 고정 — LCFA 10편이 모두 이 꼴이다.
  it('INT./EXT. 씬 헤딩과 인물 큐가 있는 글은 촬영용 대본으로 판별한다', () => {
    const d = detectScript(SCREENPLAY)
    expect(d.kind).toBe('screenplay')
    expect(d.confidence).toBeGreaterThanOrEqual(0.8)
  })

  // 왜: 위키문헌 희곡 7편은 씬 헤딩이 없고 막·장과 앞머리가 그 역할을 한다 — INT./EXT. 만 찾으면 놓친다.
  it('막·장과 등장인물·때·무대 앞머리가 있는 글은 무대 희곡으로 판별한다', () => {
    const d = detectScript(STAGE_PLAY)
    expect(d.kind).toBe('stage_play')
    expect(d.confidence).toBeGreaterThanOrEqual(0.7)
  })

  // 왜: 라디오 대본은 장면 전환이 음악 큐라 헤딩·막이 둘 다 없다.
  it('(MUSIC …)·(SOUND …) 큐와 "이름: 대사" 꼴이 있고 씬 헤딩이 없으면 라디오 드라마로 판별한다', () => {
    const d = detectScript(RADIO)
    expect(d.kind).toBe('radio')
  })

  // 왜: 보통 줄거리 입력을 대본으로 오판하면 보존 질문이 엉뚱하게 뜬다 — 지금 동작(각색)을 지켜야 하는 경우.
  it('줄거리 산문은 대본으로 판별하지 않는다', () => {
    const d = detectScript(PROSE)
    expect(d.kind).toBe('none')
  })
})

describe('촬영용 대본 파싱', () => {
  const doc = parseScript(SCREENPLAY)!

  // 왜: 정상 경로 고정 — 씬 헤딩이 장소·시간으로 갈라져야 무대 솔버와 씬 자료형(location·time_of_day)에 그대로 들어간다.
  it('씬 헤딩마다 씬이 하나씩 생기고 장소와 시간이 갈라진다', () => {
    expect(doc.scenes.map((s) => s.location)).toEqual(['SECURITY ROOM', "ELENA'S OFFICE", 'STREET'])
    expect(doc.scenes.map((s) => s.time_of_day)).toEqual(['DAY', 'CONTINUOUS', 'NIGHT'])
    expect(doc.scenes.map((s) => s.int_ext)).toEqual(['INT', 'INT', 'EXT'])
  })

  // 왜: 큐 이름이 정체성 키다. (O.S.) 같은 확장은 이름에서 떼고 따로 둔다.
  it('인물 큐 아래 줄이 대사가 되고 괄호 줄은 그 대사의 지시가 되며, (O.S.) 같은 확장은 이름에서 떼어 둔다', () => {
    const s1 = doc.scenes[0]
    const lines = s1.elements.filter((e) => e.type === 'dialogue')
    expect(lines.map((l) => l.type === 'dialogue' && l.character)).toEqual(['JEFF', 'ELENA RIVAS'])
    expect(lines[0].type === 'dialogue' && lines[0].extension).toBe('O.S.')
    expect(lines[1].type === 'dialogue' && lines[1].parenthetical).toBe('switching tone')
    expect(lines[1].type === 'dialogue' && lines[1].text).toBe("Guys, c'mon, turn off the TV.\nAnd I need the stairwell footage from November 22, Wing B.")
  })

  // 왜: 카메라·트랜지션·화면 문자·효과음은 우리 V축·러프 경로와 충돌하는 요소라 종류별로 갈라 둬야 보존/표시를 정할 수 있다.
  it('지문·카메라·트랜지션·화면 문자·소리는 종류별로 갈라진다', () => {
    const types = (i: number) => doc.scenes[i].elements.map((e) => e.type)
    // 빈 줄 없이 이어진 지문 두 줄은 한 문단(한 덩이)이다.
    expect(types(0)).toEqual(['action', 'dialogue', 'action', 'dialogue'])
    expect(doc.scenes[1].elements.some((e) => e.type === 'sound' && /DING/.test(e.text))).toBe(true)
    expect(doc.scenes[1].elements.some((e) => e.type === 'transition' && /CUT TO/.test(e.text))).toBe(true)
    expect(doc.scenes[2].elements.some((e) => e.type === 'camera' && /PUSH IN/.test(e.text))).toBe(true)
    expect(doc.front_matter.on_screen).toEqual(['Based on a true story.'])
  })

  // 왜: 9/10 대본에 인물 설정이 붙어 있다 — cast 입력과 1:1 로 가져갈 재료.
  it('인물 설정 앞머리가 있으면 인물마다 설명이 붙고 큐 이름과 이어진다', () => {
    const elena = doc.characters.find((c) => c.name === 'ELENA RIVAS')!
    expect(elena.description).toContain('Head of Security')
    expect(elena.line_count).toBe(1)
    // 큐는 "MAYA" 뿐이지만 설명의 "MAYA RIVAS" 와 이어져 한 인물이 된다(별칭 보존).
    const maya = doc.characters.find((c) => c.name === 'MAYA RIVAS')!
    expect(maya.line_count).toBe(1)
    expect(maya.aliases).toContain('MAYA')
    expect(doc.title).toBe('BABY SHARK')
    expect(doc.author).toBe('Edemilson C. Morais')
  })

  // 왜: 보존의 핵심 약속 — 파싱이 대사를 손대면 뒤의 모든 단계가 각색이 된다.
  it('대사는 한 글자도 바뀌지 않는다', () => {
    const all = doc.scenes.flatMap((s) => s.elements).filter((e) => e.type === 'dialogue').map((e) => (e.type === 'dialogue' ? e.text : ''))
    expect(all).toEqual([
      "Oh, man… it's getting messy outside.",
      "Guys, c'mon, turn off the TV.\nAnd I need the stairwell footage from November 22, Wing B.",
      'I heard the song. I thought… maybe it was my toy.',
    ])
  })
})

describe('무대 희곡 파싱', () => {
  const doc = parseScript(STAGE_PLAY)!

  // 왜: 무대 희곡은 막·장이 씬 단위다. 앞머리의 무대광경이 씬의 장소가 된다.
  it('막·장이 씬이 되고 무대광경·때 앞머리가 장소·시간이 된다', () => {
    expect(doc.kind).toBe('stage_play')
    expect(doc.scenes).toHaveLength(2)
    expect(doc.scenes[0].heading).toBe('1막')
    expect(doc.scenes[0].location).toContain('양수의 화실')
    expect(doc.scenes[0].time_of_day).toBe('현대, 어떤 날의 오후')
    expect(doc.scenes[1].location).toContain('같은 화실')
  })

  // 왜: "이름: (지문) 대사" 가 한국 희곡의 기본 꼴이다. 지문은 대사에서 떼고 대사 본문만 남긴다.
  it('"이름: 대사" 꼴이 대사가 되고 앞의 괄호 지문은 지시로 떨어진다', () => {
    const lines = doc.scenes[0].elements.filter((e) => e.type === 'dialogue')
    expect(lines).toHaveLength(4) // 양수·애경·양수·수연
    expect(lines[0].type === 'dialogue' && lines[0].character).toBe('강양수') // 큐 "양수" 는 등장인물 "강양수" 로 이어진다
    expect(lines[0].type === 'dialogue' && lines[0].parenthetical).toBe('한참동안 책을 물끄러미 보고 있다가 홱 덮어놓고')
    expect(lines[0].type === 'dialogue' && lines[0].text).toBe('뭐예요, 누님!')
    expect(doc.scenes[0].elements.some((e) => e.type === 'action' && e.text === '수연과 명효 무대 좌측에서 등장.')).toBe(true)
  })

  // 왜: 등장인물 목록의 이름은 한자 병기·역할 괄호가 붙어 있어도 큐 이름(강양수 → 양수)과 이어져야 한다.
  it('등장인물 목록이 인물이 되고 큐의 줄인 이름과 이어진다', () => {
    const names = doc.characters.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['강양수', '강애경', '수연']))
    expect(doc.characters.find((c) => c.name === '강양수')!.line_count).toBe(2)
  })
})
