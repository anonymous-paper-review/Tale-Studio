// 채팅의 영상 부탁은 샷 번호 · 묶음 말을 지운 나머지가 시키는 꼴 그대로일 때만 바로 만들고, 그 밖이면 만들지 않고 화면이 센 샷 목록으로 되묻는지 검사한다
//   (오너 2026-11-14 9번 · 검토 b 보통 2 → 재검토 보통 A → 재재검토 보통 C, 리드 원칙: 막는 말 목록 대신 허락하는 꼴 하나).
//   원칙: 묻기는 공짜고 잘못 쓴 Take 는 못 돌린다. 검토자 예는 문장 그대로 시험 이름에 싣는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), llmChat: vi.fn(), persistTrace: vi.fn(), userOwnsProject: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))

import { answeredShotNumbers, askedBackShotNumbers, groundVideoRequest, type ChatShotRef } from '@/lib/director/chat-video-targets'
import { POST } from '@/app/api/director/chat/route'

// 보드: 샷 1~6 — 샷 1~4 는 이미지가 나왔고, 샷 5 · 6 은 영상이 실패했다.
const shots: ChatShotRef[] = [1, 2, 3, 4, 5, 6].map((n) => ({ nodeId: `n${n}`, shotNo: n, imageReady: n <= 4, videoFailed: n >= 5 }))
const ALL = shots.map((shot) => shot.nodeId)
const ground = (text: string, requested: string[] | null, selected: string[] = []) =>
  groundVideoRequest({ text, requested, shots, eligible: ALL, selected })
const ids = (...numbers: number[]) => numbers.map((n) => `n${n}`)
const run = (...numbers: number[]) => ({ kind: 'run', shotIds: ids(...numbers) })
const confirm = (...numbers: number[]) => ({ kind: 'confirm', shotIds: ids(...numbers) })
const ASK = { kind: 'ask' }
const NONE = { kind: 'none' }

describe('샷 번호를 지운 나머지가 시키는 꼴("영상 만들어 줘" · "make the video for")이면 그 번호만 바로 만든다', () => {
  // 왜: 번호를 분명히 말했다 — 모델이 더 담은 샷은 더하지 않는다(사용자가 말한 것보다 많이 만들지 않는다).
  it('"샷 1~3 영상 만들어줘"는 모델이 샷 4 를 더 담아도 샷 1~3 만 바로 만든다', () => {
    expect(ground('샷 1~3 영상 만들어줘', ids(1, 2, 3, 4))).toEqual(run(1, 2, 3))
    expect(ground('샷 1~3 영상 만들어줘', ids(1, 2, 3))).toEqual(run(1, 2, 3))
  })
  // 왜: 검토 b 보통 C 의 예 — 영상 내용 바람("모두 손 흔들기")이 붙은 부탁이라 시키는 꼴 밖이다. 바로 쓴 Take 는 못 돌리니 한 번 묻는다.
  it('"Make a video for shot 3 where all the characters wave."는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('Make a video for shot 3 where all the characters wave.', ALL)).toEqual(confirm(3))
  })
  // 왜: 검토 b 보통 C 의 예 — 시키는 꼴 밖의 말(완료 알림 부탁)이 붙은 부탁. 모델이 더 담은 샷 3 · 4 는 목록에도 넣지 않는다.
  it('"샷 2 영상 만들어줘. 다 만들면 알려줘"는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 2 목록으로 되묻는다', () => {
    expect(ground('샷 2 영상 만들어줘. 다 만들면 알려줘', ids(2, 3, 4))).toEqual(confirm(2))
  })
  // 왜: 검토 b 보통 C 의 예 — 꾸밈 바람("전체적으로 밝게")이 붙은 부탁. 바람이 영상에 들어갔는지 모른 채 바로 만들지 않는다.
  it('"샷 3 영상 만들어줘, 전체적으로 밝게"는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 3 영상 만들어줘, 전체적으로 밝게', ALL)).toEqual(confirm(3))
  })
  // 왜: 검토 b 보통 C 의 예 — 조건("실패하지 않게")이 붙은 부탁. 모델이 더 담은 실패 샷 5 · 6 은 목록에도 넣지 않는다.
  it('"샷 2 영상 만들어줘, 실패하지 않게"는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 2 목록으로 되묻는다', () => {
    expect(ground('샷 2 영상 만들어줘, 실패하지 않게', ids(2, 5, 6))).toEqual(confirm(2))
  })
  // 왜: 검토 b 보통 C 의 예 — 까닭 · 조건("이미지가 있으니 그걸로")이 붙은 부탁. 모델이 더 담은 샷 2~4 는 목록에도 넣지 않는다.
  it('"샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘"는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 1 목록으로 되묻는다', () => {
    expect(ground('샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘', ids(1, 2, 3, 4))).toEqual(confirm(1))
  })
  // 왜: "남은"이 샷이 아니라 Take 를 꾸민다 — 번호가 있으니 그 번호만.
  it('"남은 Take 로 샷 3 영상 만들어줘"는 시키는 꼴 밖의 말이 남아 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('남은 Take 로 샷 3 영상 만들어줘', null)).toEqual(confirm(3))
  })
  // 왜: 한 말에 샷 여럿을 다른 일로 말할 수 있다 — 모델이 영상으로 고르지 않은 샷은 만들지 않는다.
  it('번호를 여럿 말해도 모델이 영상으로 고른 샷만 담고, 모델이 말한 번호 밖만 고르면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 1 영상 만들고 샷 3 이미지는 다시 그려줘', ids(1))).toEqual(confirm(1))
    expect(ground('Make videos for shots 1 and 3', ids(1))).toEqual(run(1))
    expect(ground('샷 3 영상 만들어줘', ids(4))).toEqual(ASK)
  })
  // 왜: 재검토 b 낮음 3 — 시키는 꼴 끝에 흔히 붙는 말(~ · … · 요 · ㅎㅎ · pls)과 "generate"까지 되묻기로 보내면 분명한 부탁도 한 번 더 묻는다.
  it('시키는 꼴 끝말이 "~ · … · 요 · ㅎㅎ · pls"이거나 "Generate the video for shot 3"이어도 번호만 있으면 바로 만든다', () => {
    for (const text of ['샷 3 영상 만들어줘~', '샷 3 영상 만들어줘…', '샷 3 영상 만들어 줘요', '샷 3 영상 만들어줘 ㅎㅎ', 'Make the video for shot 3 pls', 'Generate the video for shot 3', 'Regenerate the video for shot 3 please']) {
      expect(ground(text, null), text).toEqual(run(3))
    }
  })
  // 왜: 정상 경로 고정 — 번호와 시키는 말뿐인 부탁(존댓말 · "다시" · "3번 샷" · @멘션 · please)은 묻지 않고 바로 만든다(오너 9번 "말로 부탁하면 바로 실행").
  it('시키는 꼴은 "샷 3 영상 만들어줘" · "샷 3 영상 다시 만들어 주세요" · "Make shot 3\'s video" · "Make the video for shot 3, please"처럼 번호와 시키는 말뿐이다', () => {
    for (const text of ['샷 3 영상 만들어줘', '샷 3 영상 다시 만들어 주세요', '3번 샷 영상을 만들어줄래', "Make shot 3's video", 'Make the video for shot 3, please', '@Real Shot 3 영상 만들어줘']) {
      expect(ground(text, null), text).toEqual(run(3))
    }
  })
})

describe('생성 말과 붙은 묶음 말만 있으면 그 묶음만 바로 만든다', () => {
  // 왜: 정상 경로 고정 — 묶음 말과 시키는 말뿐인 부탁("영상 다 만들어줘")은 그 묶음(남은 샷 전부)을 묻지 않고 바로 만든다(오너 9번).
  it('"영상 다 만들어줘" · "Make all the videos" · "남은 샷 영상 만들어줘" · "Make videos for the remaining shots"는 남은 샷 전부를 바로 만든다', () => {
    for (const text of ['영상 다 만들어줘', 'Make all the videos', '남은 샷 영상 만들어줘', 'Make videos for the remaining shots']) {
      expect(ground(text, null), text).toEqual(run(1, 2, 3, 4, 5, 6))
    }
  })
  // 왜: 정상 경로 고정 — 실패한 샷 다시 만들기는 영상 말이 없어도 분명하다. 모델이 더 담은 샷 1 처럼 묶음 밖 샷에는 Take 를 쓰지 않는다.
  it('"실패한 샷 다시 만들어줘"는 영상이 실패한 샷만 바로 만들고, 모델이 더 담아도 더하지 않는다', () => {
    expect(ground('실패한 샷 다시 만들어줘', null)).toEqual(run(5, 6))
    expect(ground('Remake the failed shots', ids(5, 1))).toEqual(run(5))
  })
  // 왜: 정상 경로 고정 — "이미지 나온 샷" · "고른 샷" 부탁은 화면이 센 그 묶음 안에서만 만든다(모델이 더 담은 샷 5 · 3 은 뺀다).
  it('"이미지 나온 샷 영상 만들어줘"는 이미지가 나온 샷만, "고른 샷 영상 만들어줘"는 지금 고른 샷만 바로 만든다', () => {
    expect(ground('이미지 나온 샷 영상 만들어줘', null)).toEqual(run(1, 2, 3, 4))
    expect(ground('Make videos for the shots with images', ids(1, 5))).toEqual(run(1))
    expect(ground('고른 샷 영상 만들어줘', null, ids(2))).toEqual(run(2))
    expect(ground('Make a video for the selected shot', ids(2, 3), ids(2))).toEqual(run(2))
  })
})

describe('그 밖이면 바로 만들지 않고 화면이 센 목록으로 되묻는다(재검토 b 예)', () => {
  // 왜: 재검토 b 의 예 — 빼는 말("샷 2 빼고")이 섞인 부탁. 바로 만들지 않고 샷 2 를 뺀 목록을 보여 "응"을 받는다.
  it('"샷 2 빼고 영상 다 만들어줘"는 바로 만들지 않고 샷 2 를 뺀 목록으로 되묻는다', () => {
    expect(ground('샷 2 빼고 영상 다 만들어줘', null)).toEqual(confirm(1, 3, 4, 5, 6))
  })
  // 왜: 재검토 b 의 예 — 영어로 빼는 말("except shot 2")이 섞인 부탁. 샷 2 를 뺀 목록으로 묻는다.
  it('"Make all the videos except shot 2"는 바로 만들지 않고 샷 2 를 뺀 목록으로 되묻는다', () => {
    expect(ground('Make all the videos except shot 2', null)).toEqual(confirm(1, 3, 4, 5, 6))
  })
  // 왜: 재검토 b 의 예 — 묶음을 빼는 말("실패한 샷 빼고")이 섞인 부탁. 실패한 샷 5 · 6 을 뺀 목록으로 묻는다.
  it('"실패한 샷 빼고 영상 다 만들어줘"는 바로 만들지 않고 실패한 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('실패한 샷 빼고 영상 다 만들어줘', null)).toEqual(confirm(1, 2, 3, 4))
  })
  // 왜: 재검토 b 의 예 — 고른 샷을 빼는 말("이 샷 말고")이 섞인 부탁. 지금 고른 샷 3 을 뺀 목록으로 묻는다.
  it('"이 샷 말고 영상 다 만들어줘"는 바로 만들지 않고 고른 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('이 샷 말고 영상 다 만들어줘', null, ids(3))).toEqual(confirm(1, 2, 4, 5, 6))
  })
  // 왜: 재검토 b 의 예 — 씬 범위("씬 2")는 화면이 샷으로 바꾸지 못한다. 모델이 고른 샷 5 · 6 을 목록으로 보여 맞는지 묻는다.
  it('"씬 2 영상 다 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('씬 2 영상 다 만들어줘', ids(5, 6))).toEqual(confirm(5, 6))
  })
  // 왜: 재검토 b 의 예 — 수량 말("하나만")은 어느 샷인지 말하지 않았다. 모델이 고른 샷을 목록으로 보여 맞는지 묻는다.
  it('"영상 하나만 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('영상 하나만 만들어줘', ids(1))).toEqual(confirm(1))
  })
  // 왜: 재검토 b 의 예 — 영어 수량 말("two of")도 어느 샷인지 말하지 않았다. 모델이 고른 샷 1 · 2 를 목록으로 묻는다.
  it('"Make two of the remaining videos"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('Make two of the remaining videos', ids(1, 2))).toEqual(confirm(1, 2))
  })
  // 왜: 재검토 b 의 예 — "만들기 전에 물어봐"는 먼저 묻기를 바란 말이다. 바로 만들지 않고 목록으로 묻는다.
  it('"영상 다 만들기 전에 물어봐"는 바로 만들지 않고 목록으로 되묻는다', () => {
    expect(ground('영상 다 만들기 전에 물어봐', null)).toEqual(confirm(1, 2, 3, 4, 5, 6))
  })
  // 왜: 재검토 b 의 예 — "전부 말고 3번만"은 좁히는 말이다. 모델이 전부를 담아도 샷 3 만 묻는다.
  it('"전부 말고 3번 샷만 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('전부 말고 3번 샷만 영상 만들어줘', ALL)).toEqual(confirm(3))
  })
  // 왜: 재검토 b 의 예 — 고른 샷은 빼고 번호로 다른 샷을 고른 부탁. 모델이 담은 고른 샷 3 은 빼고 샷 5 만 묻는다.
  it('"이 샷 말고 샷 5 영상"은 바로 만들지 않고 샷 5 목록으로 되묻는다', () => {
    expect(ground('이 샷 말고 샷 5 영상', ids(3, 5), ids(3))).toEqual(confirm(5))
  })
  // 왜: 재검토 b 의 예 — 번호 구간 뒤에 빼는 번호가 붙은 부탁(한국어 · 영어). 샷 2 를 뺀 샷 1 · 3 목록으로 묻는다.
  it('"샷 1~3 영상 만들어줘, 2 빼고" · "Make videos for shots 1 to 3 except shot 2"는 바로 만들지 않고 샷 1 · 3 목록으로 되묻는다', () => {
    expect(ground('샷 1~3 영상 만들어줘, 2 빼고', ids(1, 2, 3))).toEqual(confirm(1, 3))
    expect(ground('Make videos for shots 1 to 3 except shot 2', ids(1, 3))).toEqual(confirm(1, 3))
  })
  // 왜: 재검토 b 의 예 — 다른 번호를 함께 말하며 뺀 부탁("샷 4 말고" · "not shot 4"). 뺀 샷 4 는 목록에도 넣지 않는다.
  it('"샷 4 말고 샷 1 영상 만들어줘" · "Make shot 1, not shot 4"는 바로 만들지 않고 샷 1 목록으로 되묻는다', () => {
    expect(ground('샷 4 말고 샷 1 영상 만들어줘', ids(1))).toEqual(confirm(1))
    expect(ground('Make shot 1, not shot 4', ids(1, 4))).toEqual(confirm(1))
  })
  // 왜: 재검토 b 의 예 — 한 문장에 "만들지 마" 절과 부탁 절이 같이 있다. 만들지 말라고 한 샷 2 는 빼고 샷 3 만 묻는다.
  it('"샷 2 는 만들지 말고 샷 3 만 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 2 는 만들지 말고 샷 3 만 영상 만들어줘', ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 의 예 — 몇 번째("세 번째")는 보드 번호와 다를 수 있다. 번호로 바로 만들지 않고 모델이 고른 샷을 목록으로 묻는다.
  it('"세 번째 샷 영상 만들어줘"처럼 몇 번째로 말하면 바로 만들지 않고 그 샷 목록으로 되묻는다', () => {
    expect(ground('세 번째 샷 영상 만들어줘', ids(3))).toEqual(confirm(3))
    expect(ground('Make a video for the third shot', ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 의 예 — 대상 샷을 말하지 않은 부탁("영상 만들어줘")이나 묶음 말이 생성 말과 떨어진 부탁. 모델이 고른 샷을 목록으로 묻는다.
  it('번호도 묶음 말도 없거나 묶음 말이 생성 말과 붙지 않았으면 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('영상 만들어줘', ids(1))).toEqual(confirm(1))
    expect(ground('영상 만들어줘. 다 만들면 알려줘', ALL)).toEqual(confirm(1, 2, 3, 4, 5, 6))
    expect(ground('Make a video where all the characters wave', ids(2))).toEqual(confirm(2))
  })
  // 왜: 되물을 목록이 비면(모델이 고른 샷이 다 빠짐) 번호로 묻는다.
  it('되물을 목록이 비면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 2 빼고 영상 다 만들어줘', ids(2))).toEqual(ASK)
  })
})

describe('번호 길의 틈 — 그대로 두기 · 단위 · 서수 · 비슷한 낱말(재검토 b 낮음 2)', () => {
  // 왜: 재검토 b 낮음 2 의 예 — "그대로 두고"로 샷 2 를 뺀 부탁. 바로 만들지 않고 샷 3 만 목록으로 묻는다.
  it('"샷 2 는 그대로 두고 샷 3 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 2 는 그대로 두고 샷 3 영상 만들어줘', ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 낮음 2 의 예 — 영어로 샷 2 를 그대로 두라는 부탁("Leave shot 2 as it is"). 샷 3 만 목록으로 묻는다.
  it('"Leave shot 2 as it is and make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('Leave shot 2 as it is and make the video for shot 3', ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 낮음 2 의 예 — "Don't bother with shot 2"로 샷 2 를 뺀 부탁. 샷 3 만 목록으로 묻는다.
  it('"Don\'t bother with shot 2, make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground("Don't bother with shot 2, make the video for shot 3", ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 낮음 2 의 예 — "No video for shot 2"로 샷 2 를 뺀 부탁. 샷 3 만 목록으로 묻는다.
  it('"No video for shot 2, make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('No video for shot 2, make the video for shot 3', ids(3))).toEqual(confirm(3))
  })
  // 왜: 재검토 b 낮음 2 의 예 — 번호가 있어도 "만들기 전에 물어봐"는 먼저 묻기를 바란 말이다. 바로 만들지 않는다.
  it('"샷 3 영상 만들기 전에 물어봐"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 3 영상 만들기 전에 물어봐', ids(3))).toEqual(confirm(3))
  })
  // 왜: 숫자 바로 뒤 단위(초 · s · sec · % · 배)는 샷 번호가 아니다 — "샷 3, 5초짜리로"를 샷 3 · 5 로 읽었다.
  it('"샷 3, 5초짜리로 영상 만들어줘"는 5초를 샷 5 로 읽지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 3, 5초짜리로 영상 만들어줘', ids(3, 5))).toEqual(confirm(3))
    expect(ground('Make the video for shot 3 at 5s', ids(3, 5))).toEqual(confirm(3))
  })
  // 왜: "a second shot"(하나 더) · "The first shot looks great"(감상)는 샷 번호가 아니다 — 서수는 번호로 읽지 않고 되묻는다.
  it('"a second shot" · "The first shot looks great"처럼 서수는 샷 번호로 읽지 않고 되묻는다', () => {
    expect(ground('Make a second shot of the hallway as a video', ids(2))).toEqual(confirm(2))
    expect(ground('The first shot looks great, make its video', ids(1))).toEqual(confirm(1))
  })
  // 왜: "Screenshots 2 and 3"의 "shots 2 and 3"은 샷 번호가 아니다(낱말 가운데).
  it('"Screenshots 2 and 3"은 샷 번호로 읽지 않고 되묻는다', () => {
    expect(ground('Make videos like the screenshots 2 and 3', ids(2, 3))).toEqual(confirm(2, 3))
    expect(ground('스크린샷 2 처럼 영상 만들어줘', ids(2))).toEqual(confirm(2))
  })
  // 왜: 재검토 b 낮음 2 의 예 — 씬 안의 몇 번째 샷은 보드 번호(전체 번호)와 다르다. 번호로 읽지 않고 모델이 고른 샷을 목록으로 묻는다.
  it('"씬 2의 세 번째 샷 영상 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('씬 2의 세 번째 샷 영상 만들어줘', ids(5))).toEqual(confirm(5))
  })
})

describe('시키는 꼴이 아닌 말(재재검토 b 보통 C)', () => {
  // 왜: 막는 말 목록에 없는 부정 · 질문이 바로 시작됐다(실제 상점 C7 25 Take · C8) — 허락하는 꼴이 아니면 바로 만들지 않는다.
  it('"영상 다 만들진 마" · "Take 얼마나 들어?"처럼 시키는 꼴이 아닌 말은 모델이 영상 부탁을 담아도 바로 만들지 않는다', () => {
    const cases: Array<[string, string[] | null]> = [
      ['영상 다 만들진 마', null],
      ['샷 3 영상 만들면 안 돼', ids(3)],
      ['영상 만들기 싫어', null],
      ['Stop making all the videos', null],
      ['Cancel all the videos', null],
      ['샷 3 영상 만들까 말까', ids(3)],
      ['샷 3 영상 만들어도 될까?', ids(3)],
      ['Should I make the video for shot 3?', ids(3)],
      ['Did you make the video for shot 3?', ids(3)],
      ['샷 4 영상 만들면 Take 얼마나 들어?', ids(4)],
    ]
    for (const [text, picks] of cases) expect(ground(text, picks).kind, text).not.toBe('run')
  })
  // 왜: 재재검토 b 보통 C 의 예 — "만들진 마 · 만들면 안 돼 · 싫어 · stop · cancel"은 만들지 말라는 말이다. 목록으로도 묻지 않고 아무것도 만들지 않는다.
  it('"영상 다 만들진 마" · "만들면 안 돼" · "만들기 싫어" · "Stop making …" · "Cancel …"이면 아무 영상도 만들지 않는다', () => {
    for (const text of ['영상 다 만들진 마', '샷 3 영상 만들면 안 돼', '영상 만들기 싫어', 'Stop making all the videos', 'Cancel all the videos']) {
      expect(ground(text, null), text).toEqual(NONE)
    }
  })
  // 왜: 재재검토 b 보통 C 의 예 — "만들어도 될까?" · "Take 얼마나 들어?"는 묻는 말이지 부탁이 아니다. 바로 만들지 않고 목록으로 되묻는다.
  it('묻는 말("샷 3 영상 만들어도 될까?" · "Should I make …?" · "Take 얼마나 들어?")은 바로 만들지 않고 목록으로 되묻는다', () => {
    expect(ground('샷 3 영상 만들어도 될까?', ids(3))).toEqual(confirm(3))
    expect(ground('Should I make the video for shot 3?', ids(3))).toEqual(confirm(3))
    expect(ground('샷 4 영상 만들면 Take 얼마나 들어?', ids(4))).toEqual(confirm(4))
  })
})

describe('만들지 말라는 절 · 범위 말(재재검토 b 낮음 1)', () => {
  // 왜: "만들지 마" 절 안의 묶음(실패한 · 이미지 나온 · 고른)도 뺀 것이다 — 되묻는 목록에 넣으면 "응"으로 그 샷에 Take 를 쓴다.
  it('"실패한 샷은 만들지 마, 영상 다 만들어줘"는 실패한 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('실패한 샷은 만들지 마, 영상 다 만들어줘', null)).toEqual(confirm(1, 2, 3, 4))
    expect(ground('이 샷은 만들지 마, 영상 다 만들어줘', null, ids(3))).toEqual(confirm(1, 2, 4, 5, 6))
  })
  // 왜: 범위 · 수량 말이 있는데 모델이 샷 칸을 비우면(남은 전부) 그 말이 가리키는 샷을 화면이 모른다 — 전부를 목록으로 내밀지 않고 번호로 묻는다.
  it('범위 · 수량 말("씬" · "하나만" · "two of …")이 있는데 모델이 샷 칸을 비우면 목록 대신 번호로 묻는다', () => {
    for (const text of ['씬 2 영상 다 만들어줘', '이 씬 영상 다 만들어줘', 'Make all the videos for scene 2', '남은 샷 중에 하나만 영상 만들어줘', 'Make videos for two of the remaining shots']) {
      expect(ground(text, null), text).toEqual(ASK)
    }
  })
})

describe('되묻는 목록에서 빼는 말(검토자 탐침 revb22)', () => {
  // 왜: "샷 2 는 그대로 두고"처럼 뺀 번호가 되묻는 목록에 남으면 "응" 한 번에 그 샷에 Take 를 쓴다.
  it('"샷 2 는 그대로 두고 · 됐고 · 영상 필요 없고" · "Leave shot 2 as it is" · "Don\'t bother with shot 2" · "No video for shot 2"처럼 뺀 번호는 되묻는 목록에서도 뺀다', () => {
    for (const text of ['샷 2 는 그대로 두고 샷 3 영상 만들어줘', '샷 2 는 됐고 샷 3 영상 만들어줘', '샷 2 는 영상 필요 없고 샷 3 만들어줘', 'Leave shot 2 as it is and make the video for shot 3', "Don't bother with shot 2, make the video for shot 3", 'No video for shot 2, just shot 3']) {
      expect(ground(text, ids(2, 3)), text).toEqual(confirm(3))
    }
  })
  // 왜: 검토자 탐침 revb22 의 예 — 영어로 묶음을 빼는 말("except the failed ones")을 놓치면 실패한 샷이 되묻는 목록에 남아 "응" 한 번에 Take 를 쓴다.
  it('"Make all the remaining videos except the failed ones"는 실패한 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('Make all the remaining videos except the failed ones', null)).toEqual(confirm(1, 2, 3, 4))
  })
  // 왜: 검토자 탐침 revb22 의 예 — "다 만드는 건 아니야" · "만들지 않을래"는 만들지 말라는 말이다. "아직 만들지 않은 샷"은 그 말이 아니라 부탁으로 둔다.
  it('"영상 다 만드는 건 아니야" · "샷 3 영상 만들지 않을래"면 아무 영상도 만들지 않는다', () => {
    expect(ground('영상 다 만드는 건 아니야', null)).toEqual(NONE)
    expect(ground('샷 3 영상 만들지 않을래', ids(3))).toEqual(NONE)
    // "아직 만들지 않은 샷"은 만들지 말라는 말이 아니다.
    expect(ground('아직 영상 만들지 않은 샷 3 영상 만들어줘', ids(3)).kind).not.toBe('none')
  })
})

describe('반대로 걸리던 말(검토 b efac9881 탐침)', () => {
  // 왜: "건 아니"는 만들기 말에 붙었을 때만 만들지 말라는 말이다 — "급한 건 아니니까"는 부탁이다.
  it('"급한 건 아니니까 영상 다 만들어줘" · "어려운 건 아니지만 샷 3 영상 만들어줘"는 만들지 말라는 말이 아니라 목록으로 되묻는다', () => {
    expect(ground('급한 건 아니니까 영상 다 만들어줘', null)).toEqual(confirm(1, 2, 3, 4, 5, 6))
    expect(ground('어려운 건 아니지만 샷 3 영상 만들어줘', ids(3))).toEqual(confirm(3))
  })
  // 왜: "다 만드는 건 아니고 샷 3 만"처럼 한 문장에 이어 부탁하면 뒤의 샷 3 까지 만들지 말라는 말로 읽어 아무것도 만들지 않았다.
  it('"영상 다 만드는 건 아니고 샷 3 만 만들어줘" · "영상 다 만들라는 건 아니고 샷 3 만 만들어줘"는 만들지 말라는 말을 앞 절에만 두고 샷 3 목록으로 되묻는다', () => {
    expect(ground('영상 다 만드는 건 아니고 샷 3 만 만들어줘', null)).toEqual(confirm(3))
    expect(ground('영상 다 만들라는 건 아니고 샷 3 만 만들어줘', ids(3))).toEqual(confirm(3))
  })
  // 왜: "빼지 말고" · "don't skip"은 빼는 말이 아니다 — 그 샷을 목록에서 빼면 사람이 넣으라고 한 샷이 빠진다.
  it('"영상 다 만들어줘, 한 개도 빼지 말고" · "샷 2 빼지 말고 영상 다 만들어줘" · "Don\'t skip shot 2, make all the videos" · "Make all the videos without skipping shot 2"는 빼는 말이 아니라 아무 샷도 빼지 않은 목록으로 되묻는다', () => {
    for (const text of ['영상 다 만들어줘, 한 개도 빼지 말고', '샷 2 빼지 말고 영상 다 만들어줘', "Don't skip shot 2, make all the videos", 'Make all the videos without skipping shot 2']) {
      expect(ground(text, null), text).toEqual(confirm(1, 2, 3, 4, 5, 6))
    }
  })
  // 왜: 빼는 영어 말이 목록에 없어 빼라고 한 샷이 되묻는 목록에 남았다 — "응" 한 번에 그 샷에 Take 를 쓴다.
  it('"Make all the videos but leave out shot 2" · "Make all the videos other than shot 2"는 샷 2 를 뺀 목록으로 되묻는다', () => {
    expect(ground('Make all the videos but leave out shot 2', null)).toEqual(confirm(1, 3, 4, 5, 6))
    expect(ground('Make all the videos other than shot 2', null)).toEqual(confirm(1, 3, 4, 5, 6))
    expect(ground("Make all the videos, don't leave out shot 2", null)).toEqual(confirm(1, 2, 3, 4, 5, 6))
  })
  // 왜: "하나씩 · 하나도 · one by one"은 몇 개만 고르라는 말이 아니다 — 번호를 물으면 "다 만들어줘"에 답하지 못한다.
  it('"영상 다 하나씩 만들어줘" · "하나도 빼지 말고 영상 다 만들어줘" · "영상 다 만들어줘, 한 개도 빠짐없이" · "Make all the videos one by one"의 "하나씩 · 하나도 · 한 개도 · one by one"은 수량 말이 아니라 번호를 묻지 않고 목록으로 되묻는다', () => {
    for (const text of ['영상 다 하나씩 만들어줘', '하나도 빼지 말고 영상 다 만들어줘', '영상 다 만들어줘, 한 개도 빠짐없이', 'Make all the videos one by one']) {
      expect(ground(text, null), text).toEqual(confirm(1, 2, 3, 4, 5, 6))
    }
    // "하나만" · "한 개만"은 지금처럼 수량 말이다.
    expect(ground('영상 하나만 만들어줘', null)).toEqual(ASK)
    expect(ground('Make one of the videos', null)).toEqual(ASK)
  })
  // 왜: 휴대폰의 자동 따옴표는 don't 를 don’t 로 바꾼다 — 만들지 말라는 말을 놓쳐 목록으로 되물었다.
  it('"Don’t make the videos" · "Don’t skip shot 2, make all the videos"처럼 둥근 따옴표(’)로 써도 같은 말로 읽는다', () => {
    expect(ground('Don’t make the videos', null)).toEqual(NONE)
    expect(ground('Don’t skip shot 2, make all the videos', null)).toEqual(confirm(1, 2, 3, 4, 5, 6))
  })
})

describe('고르는 말(검토 a 통합 낮음)', () => {
  // 왜: 검토 a 통합 낮음 — "샷 3이나 4"는 둘 중 하나를 고르는 말인데 "그리고"로 읽어 두 샷 영상을 바로 만들었다(Take 두 배).
  it('고르는 말("샷 3이나 4" · "샷 3 또는 4" · "shot 3 or 4")이 있으면 바로 만들지 않고 두 샷을 센 목록으로 되묻는다', () => {
    for (const text of ['샷 3이나 4 영상 만들어줘', '샷 3 또는 4 영상 만들어줘', 'Make the video for shot 3 or 4']) {
      expect(ground(text, ids(3, 4)), text).toEqual(confirm(3, 4))
    }
  })
})

describe('번호 목록의 이음말(검토 b 낮음)', () => {
  // 왜: 검토 b 낮음 — "샷 3이랑 4"의 4 를 읽지 못해 샷 3 만 되물었다("응"이면 샷 3 만 만듦). "과 · 와"와 같은 "그리고" 말이다.
  it('"샷 3이랑 4" · "샷 3하고 4" · "샷 3랑 4"처럼 "그리고" 말로 이은 번호는 모두 세어 "샷 3과 4"처럼 바로 만든다', () => {
    for (const text of ['샷 3이랑 4 영상 만들어줘', '샷 3하고 4 영상 만들어줘', '샷 3랑 4 영상 만들어줘']) {
      expect(ground(text, ids(3, 4)), text).toEqual(run(3, 4))
    }
  })
  // 왜: 같은 까닭 — 고르는 말("이든 · / · vs")도 두 번호를 다 읽어, 바로 만들지 않고 센 목록으로 되묻는다.
  it('"샷 3이든 4든" · "샷 3/4" · "shot 3 vs 4"처럼 고르는 말은 두 샷을 센 목록으로 되묻는다', () => {
    for (const text of ['샷 3이든 4든 영상 만들어줘', '샷 3/4 영상 만들어줘', 'Make the video for shot 3 vs 4']) {
      expect(ground(text, ids(3, 4)), text).toEqual(confirm(3, 4))
    }
  })
})

describe('고르는 말 앞뒤의 번호(검토 b 탐침 revb35 C1 · C2)', () => {
  // 왜: 검토 b 탐침 — "샷 3 아니면 4" · "3이나 4번 샷"은 번호 하나를 놓쳐 그 샷만 되물었고, 번호를 물은 뒤 "3 아니면 4" · "3이든 4든"은 대답으로도 되묻기로도 읽지 못했다.
  it('"샷 3 아니면 4" · "3이나 4번 샷"처럼 고르는 말 앞뒤의 번호를 모두 읽어 두 샷을 센 목록으로 되묻고, 번호를 물은 뒤의 "3 아니면 4" · "3이든 4든"도 그 목록으로 되묻는다', () => {
    for (const text of ['샷 3 아니면 4 영상 만들어줘', '3이나 4번 샷 영상 만들어줘']) {
      expect(ground(text, ids(3, 4)), text).toEqual(confirm(3, 4))
    }
    for (const text of ['3 아니면 4', '3이든 4든']) {
      expect(answeredShotNumbers(text), text).toBeNull()
      expect([...(askedBackShotNumbers(text) ?? [])], text).toEqual([3, 4])
    }
  })
})

describe('다시 만들기 — 영상이 이미 있는 샷(리드 결정)', () => {
  // 왜: 리드 결정(오너 9번 · 샷 상세 [다시 만들기]는 늘 새 Take) — 영상이 있는 샷을 번호로 다시 부탁하면 "지금 그런 샷이 없어요"였다.
  //   묶음 말("실패한 샷" · "남은 샷")은 지금처럼 영상이 있는 샷을 넣지 않는다.
  it('다시 만들기 부탁이면 번호로 댄 샷은 영상이 있어도 겨누고(번호 + 시키는 말뿐이면 바로, 아니면 목록으로 되묻기), 묶음 말은 지금처럼 영상이 없는 샷만 겨눈다', () => {
    // 샷 1 · 3 · 4 는 영상이 있고(만들 수 있는 샷이 아님), 샷 2 · 5 · 6 은 영상이 없다. 만드는 중인 샷은 없다(다시 만들 수 있는 샷 = 전부).
    const remake = (text: string, requested: string[] | null) =>
      groundVideoRequest({ text, requested, shots, eligible: ids(2, 5, 6), selected: [], remakable: ALL })
    expect(remake('샷 1 영상 다시 만들어줘', ids(1))).toEqual(run(1))
    expect(remake('샷 1 영상 다시 만들어줘, 더 밝게', ids(1))).toEqual(confirm(1))
    expect(remake('실패한 샷 다시 만들어줘', null)).toEqual(run(5, 6))
    expect(remake('남은 샷 영상 다시 만들어줘', null)).toEqual(run(2, 5, 6))
    // 다시 만들기가 아니면(remakable 없음) 영상이 있는 샷은 지금처럼 겨누지 않는다.
    expect(groundVideoRequest({ text: '샷 1 영상 만들어줘', requested: ids(1), shots, eligible: ids(2, 5, 6), selected: [] })).toEqual(run())
  })
})

describe('만들지 말라는 말이면 만들지 않는다', () => {
  // 왜: 정상 경로 고정 — 번호를 대고 만들지 말라고 하면(한국어 · 영어) 모델이 그 샷 영상을 담아도 만들지 않는다.
  it('"샷 2 는 영상 만들지 마" · "Don\'t make a video for shot 4"면 아무 영상도 만들지 않는다', () => {
    expect(ground('샷 2 는 영상 만들지 마', ids(2))).toEqual(NONE)
    expect(ground("Don't make a video for shot 4", ids(4))).toEqual(NONE)
  })
  // 왜: 정상 경로 고정 — 미루는 말("만들지는 마" · "Hold off" · "later, not now")이면 모델이 영상 부탁을 담아도 만들지 않는다.
  it('"영상 다 만들지는 마" · "Hold off on the videos" · "Make the videos later, not now"면 아무 영상도 만들지 않는다', () => {
    expect(ground('영상 다 만들지는 마', null)).toEqual(NONE)
    expect(ground('Hold off on the videos', null)).toEqual(NONE)
    expect(ground('Make the videos later, not now', null)).toEqual(NONE)
  })
})

describe('서버가 넘기는 영상 부탁', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.userOwnsProject.mockResolvedValue(false)
    mocks.persistTrace.mockResolvedValue(undefined)
  })
  async function updatesOf(updates: unknown[]) {
    mocks.llmChat.mockResolvedValue(`Okay.\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``)
    const response = await POST(new Request('http://test/api/director/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'make shot 3 video', canvasContext: 'Scene_01 > shot-3' }),
    }))
    return ((await response.json()) as { updates: unknown[] }).updates
  }
  // 왜: 검토 b 보통 2(e) — 모델이 샷 칸을 비우거나 이상한 값을 넣은 것을 "남은 샷 전부"로 바꾸면 Take 가 가장 많이 나가는 쪽으로 틀린다.
  it('서버는 영상 부탁의 샷 칸이 있는데 쓸 값이 없으면 "전부"로 바꾸지 않고 빈 칸으로 넘긴다(화면이 번호를 묻는다)', async () => {
    expect(await updatesOf([{ type: 'generateVideos', shotIds: [] }])).toEqual([{ type: 'generateVideos', shotIds: [] }])
    expect(await updatesOf([{ type: 'generateVideos', shotIds: ['', 5] }])).toEqual([{ type: 'generateVideos', shotIds: [] }])
    expect(await updatesOf([{ type: 'generateVideos', shotIds: 'all' }])).toEqual([{ type: 'generateVideos', shotIds: [] }])
    // 칸이 아예 없으면 지금처럼 "남은 샷 전부" — 화면 막이가 사용자 말이 분명한 꼴인지 본다.
    expect(await updatesOf([{ type: 'generateVideos' }])).toEqual([{ type: 'generateVideos' }])
  })

  // 왜: 영어 재점검(qa-golden f19330d7) B3 — "Make shots 3 or 4"(그림 없음)에 Lumi 가 "I've lined them up. The app will show the list for you to confirm"라고 했는데
  //   목록은 나오지 않았다(앱은 이미지 없는 샷을 묻지 않고 "이미지가 먼저 필요해요"라고 말한다). 모델 답의 품질은 시험으로 못 본다 — 규칙이 실리는지만 본다.
  it('Director 채팅 프롬프트에는 이미지 없는 샷의 영상을 보낸다거나 목록을 보인다고 약속하지 말고, 그런 샷은 앱이 "이미지가 먼저 필요해요"라고 말한다는 규칙이 실린다', async () => {
    await updatesOf([])
    const [system] = mocks.llmChat.mock.calls[0] as [string]
    expect(system).toContain('The board context lists each shot\'s image under "### Shot images". The app makes a video only for a shot whose image is ready.')
    expect(system).toContain('For a shot with no image the app tells the user the video needs an image first, and for a shot whose image is being made it says to wait.')
    expect(system).toContain('So for those shots never say you are sending, starting or lining up a video, or that the app will show a list. Say the image comes first.')
  })
})
