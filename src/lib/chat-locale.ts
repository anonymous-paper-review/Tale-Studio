// 채팅 언어 규칙(#chat-locale-follow v2, 2026-09-08 오너 결정) — 순수 함수(DB·프레임워크 무의존).
//   오너: "웹페이지 언어 상속받아서 표시하되 채팅에서 다른 언어로 여러 번 말하거나 요청하면 프로젝트 언어 변경 가능하게."
//   ① 잠기지 않은 프로젝트는 웹페이지(UI) 언어를 물려받는다(chat-format.resolveChatLocale 의 inherit).
//   ② 사용자가 다른 언어로 LOCALE_FOLLOW_STREAK 번 연속 말하거나, 바꿔 달라고 말하면 그 언어로 바꾸고 잠근다.
//      작가가 이미 돌았어도 바꾼다(종전 비대칭·writerRan 가드는 오너 결정으로 폐기).
//   글자 없는 말(숫자·이모지)은 언어로 세지 않는다. 대사·자막 언어 얘기("영어 대사로 해줘")는 채팅 언어 요청이 아니다.
import type { AppLocale } from '@/lib/locale'

/** 다른 언어로 이만큼 연속 말하면 프로젝트 언어를 바꾼다. */
export const LOCALE_FOLLOW_STREAK = 3

/** 한 문장의 언어 — 한글이 있으면 ko, 라틴 글자가 둘 이상이면 en, 글자가 없으면 null(세지 않음). */
export function detectMessageLocale(text: string | null | undefined): AppLocale | null {
  if (!text) return null
  if (/[가-힣]/.test(text)) return 'ko' // i18n-ok: 언어 감지 규칙(화면 문구 아님)
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return latin >= 2 ? 'en' : null
}

const KO_VERB = String.raw`(?:만|로만)?\s*(?:말|답|대답|대화|바꿔|바꾸|전환|해\s*줘|해줘|해주세요|해|부탁|써|진행|얘기|이야기)` // i18n-ok: 언어 감지 규칙(화면 문구 아님)
const WANTS_KO = [
  new RegExp(String.raw`(?:한국어|한글|korean)\s*(?:로|으로)?\s*${KO_VERB}`, 'i'), // i18n-ok: 언어 감지 규칙(화면 문구 아님)
  /\b(?:in|to|into)\s+korean\b/i,
  /\bkorean\b[^.!?]*\b(?:please|from now on|instead|only)\b/i,
]
const WANTS_EN = [
  new RegExp(String.raw`(?:영어|영문|english)\s*(?:로|으로)?\s*${KO_VERB}`, 'i'), // i18n-ok: 언어 감지 규칙(화면 문구 아님)
  /\b(?:in|to|into)\s+english\b/i,
  /\benglish\b[^.!?]*\b(?:please|from now on|instead|only)\b/i,
]
// 대사·자막 언어(프로듀서 설정 dialogueLanguage)는 채팅 언어가 아니다.
const NOT_CHAT_LANGUAGE = /대사|자막|dialogue|subtitle/i // i18n-ok: 언어 감지 규칙(화면 문구 아님)

/** 이 말이 채팅(프로젝트) 언어를 바꿔 달라는 요청인가 — 원하는 언어, 아니면 null. */
export function explicitLocaleRequest(text: string | null | undefined): AppLocale | null {
  if (!text || NOT_CHAT_LANGUAGE.test(text)) return null
  const ko = WANTS_KO.some((re) => re.test(text))
  const en = WANTS_EN.some((re) => re.test(text))
  if (ko && !en) return 'ko'
  if (en && !ko) return 'en'
  return null
}

export interface LocaleFollowDecision {
  locale: AppLocale
  reason: 'explicit' | 'repeated'
}

/**
 * 바꿀지 결정 — recentUserMessages 는 오래된 것부터, 마지막이 지금 말. 명시 요청이 먼저, 그다음 연속 발화.
 *   이미 그 언어면 null. 글자 없는 말은 건너뛴다(끊지도 세지도 않음).
 */
export function decideLocaleFollow(input: {
  current: AppLocale | null
  recentUserMessages: ReadonlyArray<string>
}): LocaleFollowDecision | null {
  const msgs = input.recentUserMessages.filter((m) => typeof m === 'string' && m.trim())
  if (!msgs.length) return null
  const explicit = explicitLocaleRequest(msgs[msgs.length - 1])
  if (explicit) return explicit === input.current ? null : { locale: explicit, reason: 'explicit' }
  const detected = msgs.map(detectMessageLocale).filter((l): l is AppLocale => l !== null)
  if (detected.length < LOCALE_FOLLOW_STREAK) return null
  const last = detected.slice(-LOCALE_FOLLOW_STREAK)
  const lang = last[0]
  if (!last.every((l) => l === lang)) return null
  if (lang === input.current) return null
  return { locale: lang, reason: 'repeated' }
}

/** 대화 기록(클라 history: role/content)에서 사용자 말만 — 오래된 것부터, 마지막에 지금 말을 붙인다. */
export function recentUserMessages(history: unknown, message: string, limit = LOCALE_FOLLOW_STREAK): string[] {
  const out: string[] = []
  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h || typeof h !== 'object') continue
      const role = (h as { role?: unknown }).role
      if (role !== 'user') continue
      const c = (h as { content?: unknown; text?: unknown }).content ?? (h as { text?: unknown }).text
      if (typeof c === 'string' && c.trim()) out.push(c)
    }
  }
  const prev = out.slice(-(limit - 1))
  return [...prev, message]
}
