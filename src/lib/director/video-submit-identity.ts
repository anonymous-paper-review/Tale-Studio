// 영상 제출의 신원 확인 — 화면에서 오는 요청과 서버가 이어가는 경우를 한 자리에서 가른다.
//
// #batch-resume(2026-09-09) 슬라이스 A: 완료 알림·주기 점검이 다음 영상을 내려면 서버가 사용자
//   세션 없이 제출할 수 있어야 한다. 라우트가 getUser() 로만 신원을 얻으면 그게 불가능하다.
//
//   화면에서 올 때  → 세션(getUser)
//   서버가 이어갈 때 → 잡에 남은 주인(generation_jobs.user_id)
//
//   신원 확인만 갈래로 만들고 그 뒤(소유권 검사·예산·한도·예약·hold·제출)는 종전 그대로다.
//   userId 하나만 다르게 들어갈 뿐이라 아래 단계는 두 경로에서 같은 검사를 그대로 받는다 —
//   서버가 이어간다고 해서 예산·한도·잔액 검사를 건너뛰지 않는다는 뜻이다.

export type SubmitIdentity =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unauthorized' }

export interface SubmitIdentityInput {
  /** 요청 세션에서 사용자를 얻는다. 서버가 이어가는 경우에는 호출되지 않는다. */
  getUser: () => Promise<{ id: string } | null>
  /**
   * 서버가 대신 제출할 때의 주인. generation_jobs.user_id 에서 온다.
   *   비어 있으면 거절한다 — 주인을 모르면 남의 Take 를 쓸 수 있다.
   */
  onBehalfOfUserId?: string | null
}

export async function resolveSubmitIdentity(
  input: SubmitIdentityInput,
): Promise<SubmitIdentity> {
  // 서버 경로가 먼저다. 요청 컨텍스트가 없으므로 세션을 아예 묻지 않는다.
  if (input.onBehalfOfUserId !== undefined && input.onBehalfOfUserId !== null) {
    const userId = input.onBehalfOfUserId.trim()
    return userId ? { ok: true, userId } : { ok: false, reason: 'unauthorized' }
  }

  const user = await input.getUser()
  return user?.id ? { ok: true, userId: user.id } : { ok: false, reason: 'unauthorized' }
}
