// 영상 제출은 화면에서 오든 서버가 이어가든 같은 길로 간다
//
// #batch-resume(2026-09-09) 슬라이스 A. 완료 알림·주기 점검이 다음 영상을 내려면 서버가 사용자
// 세션 없이 제출할 수 있어야 한다. 지금 라우트는 getUser() 로만 신원을 얻어서 그게 불가능하다.
//
// 이 커밋의 목표는 **기능을 하나도 안 바꾸는 것**이다. 신원을 얻는 방법만 갈래로 만든다:
//   화면에서 올 때  → 세션(getUser)
//   서버가 이어갈 때 → 잡에 남은 user_id(generation_jobs.user_id)
// 요리법(프롬프트 조립·프레임 해석·예약·hold·제출)은 그대로다. 주문을 어디서 받느냐만 달라진다.
//
// 한 번에 리팩터링과 새 기능을 같이 하면 뭐가 깨졌는지 알 수 없다. 여기서는 갈래만 만들고,
// 실제로 서버가 부르는 것은 다음 커밋이다.
import { describe, expect, it, vi } from 'vitest'
// #batch-resume(2026-09-09) 슬라이스 A
import { resolveSubmitIdentity } from '@/lib/director/video-submit-identity'

describe('영상 제출 신원 확인', () => {
  it('화면에서 오면 로그인한 사람으로 본다', async () => {
    const identity = await resolveSubmitIdentity({
      getUser: async () => ({ id: 'user-1' }),
    })

    expect(identity).toEqual({ ok: true, userId: 'user-1' })
  })

  it('로그인하지 않았으면 거절한다', async () => {
    const identity = await resolveSubmitIdentity({
      getUser: async () => null,
    })

    expect(identity).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('서버가 이어갈 때는 작업에 남은 주인을 쓴다', async () => {
    // 완료 알림·주기 점검에는 세션이 없다. generation_jobs.user_id 가 주인을 안다.
    const getUser = vi.fn()

    const identity = await resolveSubmitIdentity({
      getUser: getUser as never,
      onBehalfOfUserId: 'user-7',
    })

    expect(identity).toEqual({ ok: true, userId: 'user-7' })
    // 세션을 아예 묻지 않는다 — 서버 경로에는 요청 컨텍스트가 없다.
    expect(getUser).not.toHaveBeenCalled()
  })

  it('이어가기 신원이 비어 있으면 거절한다', async () => {
    // 잡에 user_id 가 없는 옛 행일 수 있다. 주인을 모르면 남의 Take 를 쓸 수 있으므로 멈춘다.
    const identity = await resolveSubmitIdentity({
      getUser: async () => null,
      onBehalfOfUserId: '   ',
    })

    expect(identity).toEqual({ ok: false, reason: 'unauthorized' })
  })

  // #batch-resume(2026-09-09) 이어가기 신원 프로퍼티가 명시적으로 null/undefined 로 온 경우
  // 세션을 대신 읽어버리면 다른 로그인 사용자로 제출되거나 요청 컨텍스트 오류가 튈 수 있다.
  // 서버 경로임을 이미 알고 있으므로 getUser 를 아예 부르지 말고 거절해야 한다.
  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('이어가기 신원이 비어 있으면 거절한다 (명시적 %s)', async (_label, value) => {
    const getUser = vi.fn(async () => {
      throw new Error('요청 컨텍스트 없음 — 세션을 읽으면 안 되는 경로다')
    })

    const identity = await resolveSubmitIdentity({
      getUser: getUser as never,
      onBehalfOfUserId: value,
    })

    expect(identity).toEqual({ ok: false, reason: 'unauthorized' })
    expect(getUser).not.toHaveBeenCalled()
  })
})
