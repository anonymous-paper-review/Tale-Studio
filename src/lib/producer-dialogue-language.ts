import { parseDialogueLanguage, type DialogueLanguage } from '@/lib/writer/pipeline/util/output-language'

const LANGUAGE_NAMES: Record<DialogueLanguage, string> = {
  ko: '(?:한국어|한글|Korean)', // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  en: '(?:영어|영문|English)', // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  ja: '(?:일본어|Japanese|日本語)', // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  zh: '(?:중국어|Chinese|Mandarin|中文)', // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
}
const KO_DIALOGUE = '(?:대사(?:\\s*언어)?|내레이션|나레이션|더빙)' // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
const EN_DIALOGUE = '(?:dialogue|dialog|narration|voiceover|spoken language)'
const DIALOGUE_TOPIC = /대사|내레이션|나레이션|더빙|dialogue|dialog|narration|voiceover|spoken language/i // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
const ANY_LANGUAGE = `(?:${Object.values(LANGUAGE_NAMES).join('|')})`
const KO_SELECTION = `${KO_DIALOGUE}(?:는|은|를|을|도)?\\s*(?:(?:모두|전부|전체|꼭|다|이제|앞으로|오직)\\s*)*(?:${ANY_LANGUAGE}(?:로|으로)?\\s*(?:하지\\s*말고|쓰지\\s*말고|말고|아니라|대신)\\s*)?` // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님

function affirmativeKoreanSelection(clause: string, name: string): boolean {
  const patterns = [
    new RegExp(`${KO_SELECTION}${name}(?=\\s*(?:으로|로|$))`, 'i'), // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
    new RegExp(`${name}\\s*(?:로\\s*)?${KO_DIALOGUE}(?:으로|로|를|는|은|도)?`, 'i'), // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
    new RegExp(`${KO_DIALOGUE}\\s*[:=]\\s*${name}\\s*$`, 'i'),
    new RegExp(`(?:등장인물|인물|주인공|캐릭터)(?:들)?(?:은|는|이|가)\\s*${name}(?=(?:으로|로)\\s*(?:말|대화))`, 'i'), // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  ]
  return patterns.some((pattern) => {
    const match = pattern.exec(clause)
    if (!match) return false
    const tail = clause.slice(match.index + match[0].length).trim()
    if (/(?:하지|쓰지)\s*(?:마|말)|안\s*(?:돼|되|해|하)|필요\s*없|말고|아니|대신|않/.test(tail)) return false // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
    return /^(?:(?:으로|로)(?:만|는)?\s*)?(?:$|해|하|할|써|쓰|쓸|부탁|바꿔|바꾸|진행|설정|말|대화)/.test(tail) // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  })
}

/** 배경·국적·그림체는 근거가 아니다. 대사 언어를 직접 지정하는 문장만 받는다. */
function explicitDialogueLanguage(message: string): DialogueLanguage | null {
  const requested = new Set<DialogueLanguage>()
  for (const part of message.split(/[,，.!?\n]+/)) {
    const clause = part.trim()
    // 부정하거나 적합성을 묻는 말은 언어를 선택한 것이 아니다.
    if (/어울릴까|좋을까|\b(?:don't|do not|never|avoid|without)\b/i.test(clause)) continue // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
    for (const [language, name] of Object.entries(LANGUAGE_NAMES)) {
      const englishPatterns = [
        new RegExp(`^(?:please\\s+)?(?:make|set|change|write|switch)\\s+(?:the\\s+)?${EN_DIALOGUE}(?:\\s+(?:language|to|in|is|should|be|must|spoken|the|as)){0,5}\\s+${name}\\b`, 'i'),
        new RegExp(`^(?:please\\s+)?(?:use|write|I want|I need|we want|we need|I'd like|I would like)\\s+${name}\\s+(?:for\\s+(?:the\\s+)?)?${EN_DIALOGUE}\\b`, 'i'),
      ]
      if (affirmativeKoreanSelection(clause, name) || englishPatterns.some((pattern) => pattern.test(clause))) {
        requested.add(language as DialogueLanguage)
      }
    }
  }
  // 서로 다른 언어를 한꺼번에 요구한 경우 임의로 한 언어를 선택하지 않는다.
  return requested.size === 1 ? [...requested][0] : null
}

function languageAnswer(message: string, history: unknown): DialogueLanguage | null {
  if (!Array.isArray(history)) return null
  const previous = history[history.length - 1]
  if (!previous || typeof previous !== 'object' || !['model', 'assistant'].includes(previous.role)) return null
  const question = previous.content ?? previous.text
  if (typeof question !== 'string') return null
  const questions = question.match(/[^.!?。！？\n]*[?？]/g)
  const lastQuestion = questions?.[questions.length - 1]
  if (!lastQuestion || !DIALOGUE_TOPIC.test(lastQuestion)) return null
  for (const [language, name] of Object.entries(LANGUAGE_NAMES)) {
    if (new RegExp(`^\\s*${name}(?:로|으로)?(?:\\s*(?:해\\s*줘|해주세요|부탁해(?:요)?|please))?[.!]?\\s*$`, 'i').test(message)) return language as DialogueLanguage // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
  }
  if (/^\s*(?:응|네|예|좋아(?:요)?|그래(?:요)?|맞아(?:요)?|yes|yep|yeah|ok(?:ay)?|sure|sounds good)[.!]?\s*$/i.test(message)) { // i18n-ok: 사용자 언어 지정 구문 판별용 정규식, 화면 문구 아님
    const options = Object.entries(LANGUAGE_NAMES).filter(([, name]) => new RegExp(name, 'i').test(lastQuestion))
    if (options.length !== 1) return null
    const proposal = lastQuestion.replace(/^\s*(?:should|shall|can)\s+we\s+/i, '')
    return explicitDialogueLanguage(proposal)
  }
  return null
}

/** 모델 호출 전에 정해 컨텍스트와 응답에 함께 쓴다. 모델이 추측한 언어는 적용하지 않는다. */
export function resolveProducerDialogueLanguage(input: {
  message: string
  history?: unknown
  currentLanguage?: unknown
}): DialogueLanguage | null {
  return explicitDialogueLanguage(input.message)
    ?? languageAnswer(input.message, input.history)
    ?? parseDialogueLanguage(input.currentLanguage)
    ?? null
}
