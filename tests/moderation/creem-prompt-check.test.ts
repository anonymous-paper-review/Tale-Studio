// 이미지·영상 모델로 나가기 전 Creem 검사가 사용자가 쓴 글만 보내고, 허용이 아니면 전부 막는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ModerationBlockedError,
  ModerationUnavailableError,
  assertUserTextAllowed,
  hashModeratedText,
  reusableModerationReceipt,
} from '@/lib/moderation/creem'

const CTX = { projectId: 'project-1', kind: 'character_view', userId: 'user-9' }

function creemResponse(decision: string, id = 'mod_1') {
  return new Response(
    JSON.stringify({
      id,
      object: 'moderation_result',
      prompt: 'ignored',
      external_id: 'ignored',
      decision,
      usage: { units: 1 },
      future_field_we_do_not_know: true,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function installFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    impl(String(input), init ?? {}),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('CREEM_API_KEY', 'creem_test_abc')
  vi.stubEnv('CREEM_MODERATION_MODE', '')
  vi.stubEnv('VERCEL_ENV', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Creem 프롬프트 검사', () => {
  // 왜: 정상 경로 고정 — 통과한 글만 모델로 나가고, 영수증이 작업 기록에 남는다.
  it('검사 결과가 allow 면 통과 영수증을 돌려준다', async () => {
    installFetch(async () => creemResponse('allow', 'mod_allow'))

    const receipt = await assertUserTextAllowed(['a girl walking home'], CTX)

    expect(receipt).toMatchObject({ decision: 'allow', id: 'mod_allow', chars: 'a girl walking home'.length })
    expect(Date.parse(receipt.checked_at)).not.toBeNaN()
  })

  // 왜: flag 는 "애매하다"가 아니라 "내보내지 않는다"다 — deny 와 같은 취급이어야 심사 기준을 만족한다.
  it('검사 결과가 flag 면 생성을 막는다', async () => {
    installFetch(async () => creemResponse('flag'))

    await expect(assertUserTextAllowed(['borderline text'], CTX)).rejects.toBeInstanceOf(ModerationBlockedError)
  })

  // 왜: 금지 내용 요청은 작업 행·Take·모델 제출 전에 끊어야 한다.
  it('검사 결과가 deny 면 생성을 막는다', async () => {
    installFetch(async () => creemResponse('deny'))

    const error = await assertUserTextAllowed(['forbidden text'], CTX).catch((e) => e)
    expect(error).toBeInstanceOf(ModerationBlockedError)
    expect((error as ModerationBlockedError).decision).toBe('deny')
  })

  // 왜: 검사가 늦으면 생성이 "검사 없이" 나가는 쪽으로 기울기 쉽다 — 10초에서 끊고 막는다
  //   (실측 p95 4.3초 · 최대 4.9초의 두 배).
  it('검사가 10초를 넘기면 생성을 막는다', async () => {
    vi.useFakeTimers()
    installFetch(() => new Promise<Response>(() => {}))

    const pending = assertUserTextAllowed(['slow text'], CTX)
    const settled = pending.catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)

    const error = await settled
    expect(error).toBeInstanceOf(ModerationUnavailableError)
    expect((error as ModerationUnavailableError).reason).toBe('timeout')
  })

  // 왜: 실측 최대(4.9초)보다 짧게 끊으면 평소 요청이 "검사 불가"로 막힌다 — 9초까지는 기다린다.
  it('검사가 9초에 답하면 그 판정을 쓴다', async () => {
    vi.useFakeTimers()
    installFetch(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(creemResponse('allow', 'mod_slow')), 9_000)
        }),
    )

    const pending = assertUserTextAllowed(['slow but fine'], CTX)
    await vi.advanceTimersByTimeAsync(9_000)

    await expect(pending).resolves.toMatchObject({ decision: 'allow', id: 'mod_slow' })
  })

  // 왜: 검사 장애를 통과로 해석하면 장애 시간대에 검사 없는 생성이 전부 나간다.
  it('검사가 서버 오류로 답하면 생성을 막는다', async () => {
    installFetch(async () => new Response('boom', { status: 502 }))

    const error = await assertUserTextAllowed(['any text'], CTX).catch((e) => e)
    expect(error).toBeInstanceOf(ModerationUnavailableError)
    expect((error as ModerationUnavailableError).reason).toBe('http_error')
  })

  // 왜: 통신이 끊긴 것도 "검사하지 못했다"다.
  it('검사를 부르지 못하면 생성을 막는다', async () => {
    installFetch(async () => {
      throw new TypeError('fetch failed')
    })

    const error = await assertUserTextAllowed(['any text'], CTX).catch((e) => e)
    expect(error).toBeInstanceOf(ModerationUnavailableError)
    expect((error as ModerationUnavailableError).reason).toBe('network')
  })

  // 왜: 키를 안 넣은 배포가 "검사 없는 배포"가 되면 안 된다.
  it('검사 키가 없으면 검사도 생성도 하지 않는다', async () => {
    vi.stubEnv('CREEM_API_KEY', '')
    const fetchMock = installFetch(async () => creemResponse('allow'))

    const error = await assertUserTextAllowed(['any text'], CTX).catch((e) => e)
    expect(error).toBeInstanceOf(ModerationUnavailableError)
    expect((error as ModerationUnavailableError).reason).toBe('no_key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 왜: 키 접두사가 주소를 정한다 — 운영 키로 시험 주소를 부르면 심사 증빙이 남지 않는다.
  it('운영 키는 운영 주소로, 시험 키는 시험 주소로 보낸다', async () => {
    const fetchMock = installFetch(async () => creemResponse('allow'))

    await assertUserTextAllowed(['text'], CTX)
    expect(fetchMock.mock.calls[0][0]).toBe('https://test-api.creem.io/v1/moderation/prompt')

    vi.stubEnv('CREEM_API_KEY', 'creem_live_abc')
    await assertUserTextAllowed(['text'], CTX)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.creem.io/v1/moderation/prompt')
  })

  // 왜: 모르는 판정을 통과로 읽으면 새 판정값이 생기는 날 검사가 조용히 열린다.
  it('모르는 판정이 오면 생성을 막는다', async () => {
    installFetch(async () => creemResponse('escalate'))

    const error = await assertUserTextAllowed(['any text'], CTX).catch((e) => e)
    expect(error).toBeInstanceOf(ModerationUnavailableError)
    expect((error as ModerationUnavailableError).reason).toBe('unknown_decision')
  })

  // 왜: 운영에서 끄기 스위치가 통하면 심사 약속이 설정 하나로 무력화된다.
  it('운영에서는 검사 끄기 설정이 있어도 검사한다', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('CREEM_MODERATION_MODE', 'off')
    const fetchMock = installFetch(async () => creemResponse('deny'))

    await expect(assertUserTextAllowed(['forbidden text'], CTX)).rejects.toBeInstanceOf(ModerationBlockedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // 왜: 로컬 개발이 Creem 호출 없이 돌아가야 하지만, 건너뛴 사실은 작업 기록에 남아야 한다.
  it('운영이 아닌 곳에서 검사를 끄면 부르지 않고 건너뜀 영수증을 남긴다', async () => {
    vi.stubEnv('CREEM_MODERATION_MODE', 'off')
    const fetchMock = installFetch(async () => creemResponse('allow'))

    const receipt = await assertUserTextAllowed(['any text'], CTX)

    expect(receipt).toMatchObject({ decision: 'skipped', reason: 'disabled', id: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 왜: 우리 고정 템플릿·앵커 절까지 보내면 'no people'·'no violence' 같은 우리 문구가 오탐을 만들고 비용도 늘어난다.
  it('여러 조각을 줄바꿈으로 합쳐 한 번만 보낸다', async () => {
    const fetchMock = installFetch(async () => creemResponse('allow'))

    await assertUserTextAllowed(['appearance text', '', null, undefined, '  costume text  '], CTX)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.prompt).toBe('appearance text\ncostume text')
  })

  // 왜: 검사 기록에 이메일 같은 개인정보를 보내면 개인정보 처리방침과 어긋난다.
  it('내부 참조에는 내부 식별자만 싣는다', async () => {
    const fetchMock = installFetch(async () => creemResponse('allow'))

    await assertUserTextAllowed(['text'], CTX)

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.external_id).toBe('user_user-9:character_view:project-1')
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'creem_test_abc' })
  })

  // 왜: 사용자가 쓴 글이 없는 경로(화살표 지우기 등)는 검사할 것이 없다 — 빈 글을 유료로 보내지 않는다.
  it('사용자가 쓴 글이 없으면 부르지 않고 건너뜀 영수증을 남긴다', async () => {
    const fetchMock = installFetch(async () => creemResponse('allow'))

    const receipt = await assertUserTextAllowed(['', '   ', null], CTX)

    expect(receipt).toMatchObject({ decision: 'skipped', reason: 'no_user_text', chars: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 왜: 응답이 JSON 이 아닌 장애(프록시의 HTML 오류 페이지 등)도 "검사하지 못했다"다.
  it('응답이 JSON 이 아니면 생성을 막는다', async () => {
    installFetch(async () => new Response('<html>502</html>', { status: 200 }))

    await expect(assertUserTextAllowed(['text'], CTX)).rejects.toBeInstanceOf(ModerationUnavailableError)
  })

  // 왜: 영수증만 보고 "어떤 글의 것이냐"를 알 수 있어야 저장된 영수증을 다시 쓸지 판단할 수 있다.
  it('통과 영수증에 검사한 글의 해시를 담는다', async () => {
    installFetch(async () => creemResponse('allow'))

    const receipt = await assertUserTextAllowed(['appearance text', 'costume text'], CTX)

    expect(receipt.text_sha256).toBe(await hashModeratedText(['appearance text\ncostume text']))
    expect(receipt.text_sha256).toHaveLength(64)
  })

  // 왜: 옛 영수증을 다른 글에 쓰면 검사 없는 생성이 된다 — 같은 글일 때만 다시 쓴다.
  it('저장된 영수증은 글이 같을 때만 다시 쓰고 다르면 쓰지 않는다', async () => {
    installFetch(async () => creemResponse('allow', 'mod_stored'))
    const stored = await assertUserTextAllowed(['she opens the door'], CTX)

    await expect(reusableModerationReceipt(stored, ['she opens the door'])).resolves.toMatchObject({
      decision: 'allow',
      id: 'mod_stored',
    })
    await expect(reusableModerationReceipt(stored, ['she opens the window'])).resolves.toBeNull()
    await expect(reusableModerationReceipt(undefined, ['she opens the door'])).resolves.toBeNull()
  })
})
