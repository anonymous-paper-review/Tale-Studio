// 대본의 카메라 지시("메모장으로 푸시 인: …")는 인물 대사로 읽지 않고 카메라 지시로 원문 그대로 남긴다 (2026-10-06 오너 · 운영 제보)
import { describe, expect, it } from 'vitest'
import { parseScript } from '@/lib/writer/script/parse'

// 운영 제보 대본(03-zen-of-petty-revenge.ko)과 같은 꼴: 한국어 번역에서 카메라 지시가 "무엇으로 푸시 인: …"이 됐다.
const script = (cameraLine: string) => `INT. 붐비는 카페 - 낮

애시가 노트북을 연다.

애시: 오늘은 꼭 끝낸다.
미나코: 그래, 그래야지.

${cameraLine}

EXT. 카페 앞 인도 - 오후

미나코: 끝났어?
애시: 아직.
`

const speakers = (text: string) => parseScript(text)?.characters.map((c) => c.name) ?? []

describe('카메라 지시를 인물로 읽지 않기', () => {
  it('카메라 움직임으로 끝나는 줄은 인물 대사로 읽지 않고 카메라 지시로 원문 그대로 남긴다', () => {
    // 왜: 운영 프로젝트에서 "메모장으로 푸시 인"이 인물 카드로 들어왔다. Writer·Artist 까지 가짜 인물이 따라간다.
    const line = '메모장으로 푸시 인: "쩨쩨한 복수의 선(禪): 망상과 몰락, 그리고 괜찮은 와이파이에 관한 이야기."'
    const doc = parseScript(script(line))
    expect(doc?.characters.map((c) => c.name)).toEqual(['애시', '미나코'])
    expect(doc?.scenes[0].elements).toContainEqual({ type: 'camera', text: line })
  })

  it('클로즈업 · 줌 인 · 영어 카메라 지시도 같은 꼴이면 인물로 읽지 않는다', () => {
    expect(speakers(script('얼굴 클로즈업: 눈가가 붉다.'))).toEqual(['애시', '미나코'])
    expect(speakers(script('화면으로 줌 인: 알림이 쌓인다.'))).toEqual(['애시', '미나코'])
    expect(speakers(script('PHONE PUSH IN: 13 new comments.'))).toEqual(['애시', '미나코'])
  })

  it('팬 · 줌처럼 이름일 수도 있는 낱말은 방향 말 뒤에 올 때만 카메라 지시로 본다', () => {
    expect(speakers(script('왼쪽으로 팬: 문이 열린다.'))).toEqual(['애시', '미나코'])
    expect(speakers(script('피터 팬: 나랑 같이 가자.'))).toEqual(['애시', '미나코', '피터 팬'])
  })
})
