// 채팅의 영상 부탁은 아주 분명한 두 꼴(샷 번호만 · 생성 말과 붙은 묶음 말만)일 때만 바로 만들고, 그 밖이면 만들지 않고 화면이 센 샷 목록으로 되묻는지 검사한다
//   (오너 2026-11-14 9번 · 검토 b 보통 2 → 재검토 보통 A, 리드 원칙). 원칙: 묻기는 공짜고 잘못 쓴 Take 는 못 돌린다. 검토자 예는 문장 그대로 시험 이름에 싣는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), llmChat: vi.fn(), persistTrace: vi.fn(), userOwnsProject: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))

import { groundVideoRequest, type ChatShotRef } from '@/lib/director/chat-video-targets'
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

describe('샷 번호만 있고 빼기 · 부정 · 범위 말이 없으면 그 번호만 바로 만든다', () => {
  // 왜: 번호를 분명히 말했다 — 모델이 더 담은 샷은 더하지 않는다(사용자가 말한 것보다 많이 만들지 않는다).
  it('"샷 1~3 영상 만들어줘"는 모델이 샷 4 를 더 담아도 샷 1~3 만 바로 만든다', () => {
    expect(ground('샷 1~3 영상 만들어줘', ids(1, 2, 3, 4))).toEqual(run(1, 2, 3))
    expect(ground('샷 1~3 영상 만들어줘', ids(1, 2, 3))).toEqual(run(1, 2, 3))
  })
  it('"Make a video for shot 3 where all the characters wave."는 모델이 모든 샷을 담아도 샷 3 만 바로 만든다', () => {
    expect(ground('Make a video for shot 3 where all the characters wave.', ALL)).toEqual(run(3))
  })
  it('"샷 2 영상 만들어줘. 다 만들면 알려줘"는 모델이 샷 2~4 를 담아도 샷 2 만 바로 만든다', () => {
    expect(ground('샷 2 영상 만들어줘. 다 만들면 알려줘', ids(2, 3, 4))).toEqual(run(2))
  })
  it('"샷 3 영상 만들어줘, 전체적으로 밝게"는 모델이 모든 샷을 담아도 샷 3 만 바로 만든다', () => {
    expect(ground('샷 3 영상 만들어줘, 전체적으로 밝게', ALL)).toEqual(run(3))
  })
  it('"샷 2 영상 만들어줘, 실패하지 않게"는 모델이 실패한 샷까지 담아도 샷 2 만 바로 만든다', () => {
    expect(ground('샷 2 영상 만들어줘, 실패하지 않게', ids(2, 5, 6))).toEqual(run(2))
  })
  it('"샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘"는 모델이 이미지 있는 샷을 다 담아도 샷 1 만 바로 만든다', () => {
    expect(ground('샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘', ids(1, 2, 3, 4))).toEqual(run(1))
  })
  // 왜: "남은"이 샷이 아니라 Take 를 꾸민다 — 번호가 있으니 그 번호만.
  it('"남은 Take 로 샷 3 영상 만들어줘"는 모델이 남은 샷 전부로 읽어도 샷 3 만 바로 만든다', () => {
    expect(ground('남은 Take 로 샷 3 영상 만들어줘', null)).toEqual(run(3))
  })
  // 왜: 한 말에 샷 여럿을 다른 일로 말할 수 있다 — 모델이 영상으로 고르지 않은 샷은 만들지 않는다.
  it('번호를 여럿 말해도 모델이 영상으로 고른 샷만 만들고, 모델이 말한 번호 밖만 고르면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 1 영상 만들고 샷 3 이미지는 다시 그려줘', ids(1))).toEqual(run(1))
    expect(ground('샷 3 영상 만들어줘', ids(4))).toEqual(ASK)
  })
})

describe('생성 말과 붙은 묶음 말만 있으면 그 묶음만 바로 만든다', () => {
  it('"영상 다 만들어줘" · "Make all the videos" · "남은 샷 영상 만들어줘" · "Make videos for the remaining shots"는 남은 샷 전부를 바로 만든다', () => {
    for (const text of ['영상 다 만들어줘', 'Make all the videos', '남은 샷 영상 만들어줘', 'Make videos for the remaining shots']) {
      expect(ground(text, null), text).toEqual(run(1, 2, 3, 4, 5, 6))
    }
  })
  it('"실패한 샷 다시 만들어줘"는 영상이 실패한 샷만 바로 만들고, 모델이 더 담아도 더하지 않는다', () => {
    expect(ground('실패한 샷 다시 만들어줘', null)).toEqual(run(5, 6))
    expect(ground('Remake the failed shots', ids(5, 1))).toEqual(run(5))
  })
  it('"이미지 나온 샷 영상 만들어줘"는 이미지가 나온 샷만, "고른 샷 영상 만들어줘"는 지금 고른 샷만 바로 만든다', () => {
    expect(ground('이미지 나온 샷 영상 만들어줘', null)).toEqual(run(1, 2, 3, 4))
    expect(ground('Make videos for the shots with images', ids(1, 5))).toEqual(run(1))
    expect(ground('고른 샷 영상 만들어줘', null, ids(2))).toEqual(run(2))
    expect(ground('Make a video for the selected shot', ids(2, 3), ids(2))).toEqual(run(2))
  })
})

describe('그 밖이면 바로 만들지 않고 화면이 센 목록으로 되묻는다(재검토 b 예)', () => {
  it('"샷 2 빼고 영상 다 만들어줘"는 바로 만들지 않고 샷 2 를 뺀 목록으로 되묻는다', () => {
    expect(ground('샷 2 빼고 영상 다 만들어줘', null)).toEqual(confirm(1, 3, 4, 5, 6))
  })
  it('"Make all the videos except shot 2"는 바로 만들지 않고 샷 2 를 뺀 목록으로 되묻는다', () => {
    expect(ground('Make all the videos except shot 2', null)).toEqual(confirm(1, 3, 4, 5, 6))
  })
  it('"실패한 샷 빼고 영상 다 만들어줘"는 바로 만들지 않고 실패한 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('실패한 샷 빼고 영상 다 만들어줘', null)).toEqual(confirm(1, 2, 3, 4))
  })
  it('"이 샷 말고 영상 다 만들어줘"는 바로 만들지 않고 고른 샷을 뺀 목록으로 되묻는다', () => {
    expect(ground('이 샷 말고 영상 다 만들어줘', null, ids(3))).toEqual(confirm(1, 2, 4, 5, 6))
  })
  it('"씬 2 영상 다 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('씬 2 영상 다 만들어줘', ids(5, 6))).toEqual(confirm(5, 6))
  })
  it('"영상 하나만 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('영상 하나만 만들어줘', ids(1))).toEqual(confirm(1))
  })
  it('"Make two of the remaining videos"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('Make two of the remaining videos', ids(1, 2))).toEqual(confirm(1, 2))
  })
  it('"영상 다 만들기 전에 물어봐"는 바로 만들지 않고 목록으로 되묻는다', () => {
    expect(ground('영상 다 만들기 전에 물어봐', null)).toEqual(confirm(1, 2, 3, 4, 5, 6))
  })
  it('"전부 말고 3번 샷만 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('전부 말고 3번 샷만 영상 만들어줘', ALL)).toEqual(confirm(3))
  })
  it('"이 샷 말고 샷 5 영상"은 바로 만들지 않고 샷 5 목록으로 되묻는다', () => {
    expect(ground('이 샷 말고 샷 5 영상', ids(3, 5), ids(3))).toEqual(confirm(5))
  })
  it('"샷 1~3 영상 만들어줘, 2 빼고" · "Make videos for shots 1 to 3 except shot 2"는 바로 만들지 않고 샷 1 · 3 목록으로 되묻는다', () => {
    expect(ground('샷 1~3 영상 만들어줘, 2 빼고', ids(1, 2, 3))).toEqual(confirm(1, 3))
    expect(ground('Make videos for shots 1 to 3 except shot 2', ids(1, 3))).toEqual(confirm(1, 3))
  })
  it('"샷 4 말고 샷 1 영상 만들어줘" · "Make shot 1, not shot 4"는 바로 만들지 않고 샷 1 목록으로 되묻는다', () => {
    expect(ground('샷 4 말고 샷 1 영상 만들어줘', ids(1))).toEqual(confirm(1))
    expect(ground('Make shot 1, not shot 4', ids(1, 4))).toEqual(confirm(1))
  })
  it('"샷 2 는 만들지 말고 샷 3 만 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 2 는 만들지 말고 샷 3 만 영상 만들어줘', ids(3))).toEqual(confirm(3))
  })
  it('"세 번째 샷 영상 만들어줘"처럼 몇 번째로 말하면 바로 만들지 않고 그 샷 목록으로 되묻는다', () => {
    expect(ground('세 번째 샷 영상 만들어줘', ids(3))).toEqual(confirm(3))
    expect(ground('Make a video for the third shot', ids(3))).toEqual(confirm(3))
  })
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
  it('"샷 2 는 그대로 두고 샷 3 영상 만들어줘"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('샷 2 는 그대로 두고 샷 3 영상 만들어줘', ids(3))).toEqual(confirm(3))
  })
  it('"Leave shot 2 as it is and make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('Leave shot 2 as it is and make the video for shot 3', ids(3))).toEqual(confirm(3))
  })
  it('"Don\'t bother with shot 2, make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground("Don't bother with shot 2, make the video for shot 3", ids(3))).toEqual(confirm(3))
  })
  it('"No video for shot 2, make the video for shot 3"는 바로 만들지 않고 샷 3 목록으로 되묻는다', () => {
    expect(ground('No video for shot 2, make the video for shot 3', ids(3))).toEqual(confirm(3))
  })
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
  it('"씬 2의 세 번째 샷 영상 만들어줘"는 바로 만들지 않고 모델이 고른 샷 목록으로 되묻는다', () => {
    expect(ground('씬 2의 세 번째 샷 영상 만들어줘', ids(5))).toEqual(confirm(5))
  })
})

describe('만들지 말라는 말이면 만들지 않는다', () => {
  it('"샷 2 는 영상 만들지 마" · "Don\'t make a video for shot 4"면 아무 영상도 만들지 않는다', () => {
    expect(ground('샷 2 는 영상 만들지 마', ids(2))).toEqual(NONE)
    expect(ground("Don't make a video for shot 4", ids(4))).toEqual(NONE)
  })
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
})
