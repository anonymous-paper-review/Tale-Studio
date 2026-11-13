// 채팅의 영상 부탁이 사용자가 분명히 말한 샷에만 Take 를 쓰고, 모호하면 만들지 않고 번호를 묻는지 검사한다 (오너 2026-11-14 9번 · 검토 b 보통 2)
//   원칙: 묻기는 공짜고 잘못 쓴 Take 는 못 돌린다. 검토자 예는 문장 그대로 시험 이름에 싣는다.
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
const ASK = { kind: 'ask' }
const NONE = { kind: 'none' }
const run = (...shotIds: string[]) => ({ kind: 'run', shotIds })

describe('번호가 있으면 그 번호의 샷만(검토 b 예)', () => {
  // 왜: 번호를 말했는데 모델이 더 담으면 잘못 읽은 것이다 — 더 담은 샷을 만들지 않고 묻는다.
  it('"전부 말고 3번 샷만 영상 만들어줘"에 모델이 모든 샷을 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('전부 말고 3번 샷만 영상 만들어줘', ALL)).toEqual(ASK)
  })
  it('"Make a video for shot 3 where all the characters wave."에 모델이 모든 샷을 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('Make a video for shot 3 where all the characters wave.', ALL)).toEqual(ASK)
  })
  it('"샷 2 영상 만들어줘. 다 만들면 알려줘"에 모델이 샷 2~4 를 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 2 영상 만들어줘. 다 만들면 알려줘', ['n2', 'n3', 'n4'])).toEqual(ASK)
  })
  it('"샷 3 영상 만들어줘, 전체적으로 밝게"에 모델이 모든 샷을 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 3 영상 만들어줘, 전체적으로 밝게', ALL)).toEqual(ASK)
  })
  it('"샷 2 영상 만들어줘, 실패하지 않게"에 모델이 실패한 샷까지 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 2 영상 만들어줘, 실패하지 않게', ['n2', 'n5', 'n6'])).toEqual(ASK)
  })
  it('"샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘"에 모델이 이미지 있는 샷을 다 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 1 은 이미지가 있는 상태니까 그걸로 영상 만들어줘', ['n1', 'n2', 'n3', 'n4'])).toEqual(ASK)
  })
  it('"이 샷 말고 샷 5 영상"에 모델이 고른 샷까지 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('이 샷 말고 샷 5 영상', ['n3', 'n5'], ['n3'])).toEqual(ASK)
  })
  // 왜: "남은"이 샷이 아니라 Take 를 꾸민다 — 번호가 있으면 묶음 말로 읽지 않는다. 모델이 "남은 샷 전부"로 읽었으면 말한 번호보다 넓어 묻는다.
  it('"남은 Take 로 샷 3 영상 만들어줘"에 모델이 남은 샷 전부로 읽으면 만들지 않고 번호를 묻고, 샷 3 만 담으면 샷 3 을 만든다', () => {
    expect(ground('남은 Take 로 샷 3 영상 만들어줘', null)).toEqual(ASK)
    expect(ground('남은 Take 로 샷 3 영상 만들어줘', ['n3'])).toEqual(run('n3'))
  })
  it('"샷 1~3 영상 만들어줘"에 모델이 샷 4 를 더 담으면 만들지 않고 번호를 묻는다', () => {
    expect(ground('샷 1~3 영상 만들어줘', ['n1', 'n2', 'n3', 'n4'])).toEqual(ASK)
  })
  // 왜: 정상 경로 고정.
  it('"샷 1~3 영상 만들어줘"에 모델이 샷 1~3 을 담으면 그 셋을 만든다', () => {
    expect(ground('샷 1~3 영상 만들어줘', ['n1', 'n2', 'n3'])).toEqual(run('n1', 'n2', 'n3'))
  })
  it('"세 번째 샷 영상 만들어줘"처럼 몇 번째로 말해도 그 번호의 샷을 만든다', () => {
    expect(ground('세 번째 샷 영상 만들어줘', ['n3'])).toEqual(run('n3'))
    expect(ground('Make a video for the third shot', ['n3'])).toEqual(run('n3'))
  })
})

describe('뺀 번호 · 만들지 말라는 말', () => {
  // 왜: 검토 b 예 — "만들지 마"를 영상 부탁으로 읽으면 안 된다.
  it('"샷 2 는 영상 만들지 마"면 아무 영상도 만들지 않는다', () => {
    expect(ground('샷 2 는 영상 만들지 마', ['n2'])).toEqual(NONE)
    expect(ground("Don't make a video for shot 4", ['n4'])).toEqual(NONE)
  })
  it('"말고 · 빼고 · 제외 · except · not"으로 뺀 번호는 대상에서 빼고, 모델이 그 샷을 담으면 묻는다', () => {
    expect(ground('샷 1~3 영상 만들어줘, 2 빼고', ['n1', 'n3'])).toEqual(run('n1', 'n3'))
    expect(ground('샷 1~3 영상 만들어줘, 2 빼고', ['n1', 'n2', 'n3'])).toEqual(ASK)
    expect(ground('Make videos for shots 1 to 3 except shot 2', ['n1', 'n3'])).toEqual(run('n1', 'n3'))
    expect(ground('샷 4 말고 샷 1 영상 만들어줘', ['n1'])).toEqual(run('n1'))
    expect(ground('Make shot 1, not shot 4', ['n1', 'n4'])).toEqual(ASK)
  })
  it('샷 2 는 만들지 말고 샷 3 만 만들어 달라고 하면 샷 3 만 만든다', () => {
    expect(ground('샷 2 는 만들지 말고 샷 3 만 영상 만들어줘', ['n3'])).toEqual(run('n3'))
  })
})

describe('번호가 없으면 생성 말과 붙은 묶음 말만', () => {
  it('"영상 다 만들어줘" · "Make all the videos" · "남은 샷 영상"은 남은 샷 전부를 만든다', () => {
    expect(ground('영상 다 만들어줘', null)).toEqual(run(...ALL))
    expect(ground('Make all the videos', null)).toEqual(run(...ALL))
    expect(ground('남은 샷 영상 만들어줘', null)).toEqual(run(...ALL))
    expect(ground('Make videos for the remaining shots', null)).toEqual(run(...ALL))
  })
  it('"실패한 샷 다시 만들어줘"는 영상이 실패한 샷만 만들고, 그 밖을 담으면 묻는다', () => {
    expect(ground('실패한 샷 다시 만들어줘', ['n5', 'n6'])).toEqual(run('n5', 'n6'))
    expect(ground('Remake the failed shots', ['n5', 'n1'])).toEqual(ASK)
    expect(ground('실패한 샷 다시 만들어줘', null)).toEqual(ASK)
  })
  it('"이미지 나온 샷 영상 만들어줘"는 이미지가 나온 샷만, "고른 샷 영상 만들어줘"는 지금 고른 샷만 만든다', () => {
    expect(ground('이미지 나온 샷 영상 만들어줘', ['n1', 'n2'])).toEqual(run('n1', 'n2'))
    expect(ground('Make videos for the shots with images', ['n1', 'n5'])).toEqual(ASK)
    expect(ground('고른 샷 영상 만들어줘', ['n2'], ['n2'])).toEqual(run('n2'))
    expect(ground('Make a video for the selected shot', ['n2', 'n3'], ['n2'])).toEqual(ASK)
  })
  it('묶음 말이 생성 말과 붙지 않았거나 번호도 묶음 말도 없으면 묻는다', () => {
    expect(ground('영상 만들어줘. 다 만들면 알려줘', ALL)).toEqual(ASK)
    expect(ground('영상 만들어줘', ['n1'])).toEqual(ASK)
    expect(ground('Make a video where all the characters wave', ALL)).toEqual(ASK)
  })
  it('"전부 말고"처럼 묶음 말을 뺐으면 그 묶음으로 만들지 않는다', () => {
    expect(ground('영상 전부 말고 하나만 만들어줘', null)).toEqual(ASK)
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
    // 칸이 아예 없으면 지금처럼 "남은 샷 전부" — 화면 막이가 사용자 말에 묶음 말이 있는지 본다.
    expect(await updatesOf([{ type: 'generateVideos' }])).toEqual([{ type: 'generateVideos' }])
  })
})
