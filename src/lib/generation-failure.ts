/**
 * 생성 실패를 사용자 언어로 번역한다 — "무슨 일이 있었나 + 뭘 하면 되나".
 *
 * 왜 필요한가: 프로바이더 원문은 사용자에게 아무 정보가 아니다. 실제로 나온 것 예:
 *
 *   status=422 | body={"detail":[{"loc":["body","input.image_urls"],
 *     "msg":"Failed to download the file...","type":"file_download_error", ...}]}
 *
 * 이걸 그대로 채팅에 띄우면 "그래서 내가 뭘 하라고?"가 남는다. 분류해서 다음 행동을 준다.
 * 모르는 오류는 지어내지 말고 원문을 짧게 보여준 뒤 재시도를 권한다.
 */

export interface FailureExplanation {
  /** 무슨 일이 있었나 (사용자 언어, 한 문장) */
  what: string
  /** 뭘 하면 되나 (구체적 행동) */
  next: string
}

/** 원문에서 사람이 읽을 만한 조각만 남긴다(JSON 덩어리·URL 제거). */
function condense(raw: string): string {
  const msg = /"msg"\s*:\s*"([^"]+)"/.exec(raw)?.[1]
  const source = msg ?? raw
  return source.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function explainGenerationFailure(raw: string): FailureExplanation {
  const text = (raw || '').toLowerCase()

  // 레퍼런스 이미지를 프로바이더가 못 가져옴 — 우리 스토리지/터널 도달 문제.
  if (
    text.includes('file_download_error') ||
    text.includes('failed to download') ||
    text.includes('not accessible or has expired')
  ) {
    return {
      what: '참고 이미지를 가져오지 못했어요.',
      next: '잠시 후 다시 시도해 주세요. 계속 실패하면 올린 레퍼런스 이미지를 다시 올려 주세요.',
    }
  }

  // 콘텐츠 정책 — 표현 완화나 안전 모드 재시도로 풀린다.
  if (
    text.includes('moderation') ||
    text.includes('content_policy') ||
    text.includes('prohibited') ||
    text.includes('safety') ||
    text.includes('nsfw')
  ) {
    return {
      what: '생성 정책에 걸려 이미지를 만들지 못했어요.',
      next: '묘사에서 위험해 보이는 표현(피·상해·미성년 등)을 완화하거나, 카드의 안전 모드로 다시 시도해 주세요.',
    }
  }

  // 쿼터·레이트리밋 — 기다리면 풀린다.
  if (
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('quota') ||
    text.includes('status=429')
  ) {
    return {
      what: '지금 생성 요청이 몰려 있어요.',
      next: '잠시 후 다시 시도해 주세요.',
    }
  }

  // 네트워크/타임아웃.
  if (
    text.includes('timeout') ||
    text.includes('etimedout') ||
    text.includes('econnreset') ||
    text.includes('network') ||
    text.includes('fetch failed')
  ) {
    return {
      what: '생성 서버와 연결이 끊겼어요.',
      next: '다시 시도해 주세요. 반복되면 잠시 후에 시도해 주세요.',
    }
  }

  // 인증/권한 — 사용자가 풀 수 없는 종류라 그렇게 말한다.
  if (text.includes('status=401') || text.includes('status=403') || text.includes('unauthorized')) {
    return {
      what: '생성 서비스 인증에 문제가 있어요.',
      next: '이건 설정 문제라 다시 시도해도 같아요. 관리자에게 알려 주세요.',
    }
  }

  return {
    what: `이미지 생성에 실패했어요 — ${condense(raw) || '알 수 없는 오류'}`,
    next: '다시 시도해 주세요. 반복되면 묘사를 조금 바꿔 보세요.',
  }
}

/** 실패 알림 본문. `⚠` prefix 는 채팅이 상태 행으로 분류하는 마커다(chat-blocks). */
export function generationFailureMessage(label: string, raw: string): string {
  const { what, next } = explainGenerationFailure(raw)
  return `⚠ ${label} — ${what} ${next}`
}

/**
 * give-up 게이트 알림.
 *
 * 반복 실패 슬롯은 자동 재시도를 멈춘다(과금 폭주 방지). 문제는 **멈췄다는 사실을 아무도
 * 안 알려준다**는 것 — 사용자에겐 그냥 아무 일도 안 일어난 화면이 남는다. 원인이 고쳐져도
 * 자동으로는 영영 안 돌아오므로, 사람이 눌러야 한다는 걸 반드시 말해야 한다.
 */
export function generationGaveUpMessage(label: string): string {
  return (
    `⚠ ${label} 자동 생성을 멈췄어요 — 연속으로 실패해서 비용 보호를 위해 자동 재시도를 중단했어요. ` +
    `카드에서 다시 생성을 눌러 주세요 (수동 요청은 이 제한을 받지 않아요).`
  )
}
