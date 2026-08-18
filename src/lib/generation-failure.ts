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
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(generation-notify.ts 등)가 조용히 안 깨지도록 기존 동작(항상
//   한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

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

export function explainGenerationFailure(
  raw: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): FailureExplanation {
  const t = (text: string, params?: Record<string, string | number>) => translate(locale, text, params)
  const text = (raw || '').toLowerCase()

  // 레퍼런스 이미지를 프로바이더가 못 가져옴 — 우리 스토리지/터널 도달 문제.
  if (
    text.includes('file_download_error') ||
    text.includes('failed to download') ||
    text.includes('not accessible or has expired')
  ) {
    return {
      what: t("We couldn't fetch the reference image."),
      next: t('Please try again in a moment. If it keeps failing, try re-uploading the reference image.'),
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
      what: t('The generation policy blocked this image.'),
      next: t(
        "Try softening risky wording in the description (blood, injury, minors, etc.), or retry using the card's safe mode.",
      ),
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
      what: t('Generation requests are backed up right now.'),
      next: t('Please try again in a moment.'),
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
      what: t('Lost connection to the generation server.'),
      next: t('Please try again. If it keeps happening, try again after a bit.'),
    }
  }

  // 인증/권한 — 사용자가 풀 수 없는 종류라 그렇게 말한다.
  if (text.includes('status=401') || text.includes('status=403') || text.includes('unauthorized')) {
    return {
      what: t("There's an authentication problem with the generation service."),
      next: t("This is a configuration issue, so retrying won't help. Please let an admin know."),
    }
  }

  return {
    what: t('Image generation failed — {detail}', { detail: condense(raw) || t('unknown error') }),
    next: t('Please try again. If it keeps happening, try tweaking the description a bit.'),
  }
}

/** 실패 알림 본문. `⚠` prefix 는 채팅이 상태 행으로 분류하는 마커다(chat-blocks). */
export function generationFailureMessage(
  label: string,
  raw: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string {
  const { what, next } = explainGenerationFailure(raw, locale)
  return `⚠ ${label} — ${what} ${next}`
}

/**
 * give-up 게이트 알림.
 *
 * 반복 실패 슬롯은 자동 재시도를 멈춘다(과금 폭주 방지). 문제는 **멈췄다는 사실을 아무도
 * 안 알려준다**는 것 — 사용자에겐 그냥 아무 일도 안 일어난 화면이 남는다. 원인이 고쳐져도
 * 자동으로는 영영 안 돌아오므로, 사람이 눌러야 한다는 걸 반드시 말해야 한다.
 */
export function generationGaveUpMessage(
  label: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string {
  return `⚠ ${translate(
    locale,
    "{label} auto-generation stopped — repeated failures triggered a cost-protection pause on automatic retries. Click generate again on the card (manual requests aren't limited).",
    { label },
  )}`
}
