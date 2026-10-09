// 만화 원고 받기(2026-10-09 오너 "이 만화를 그대로 영상화하고 싶어") — Producer 에 올린 그림이 만화 원고인지,
//   여러 장을 어떻게 쓸지 말을 읽는 순수 함수와 질문 문구. 종전엔 그림마다 인물 · 배경 · 참고만 물어서 만화 원고를
//   이야기로 받을 길이 없었다(답으로 "스토리"를 쳐도 같은 질문만 되풀이했다).
//   여러 장이면 장마다 묻지 않고 한 번에 묻는다: 만화 원고로 그대로 영상화 / 그림마다 정하기 / 모두 참고 자료.
//   스토어 · 화면은 이 결과만 믿는다(image-role.ts 와 같은 짜임).
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import { matchImageRoleAnswer } from '@/lib/producer/image-role'

/** 여러 장 질문의 답 — 만화로 그대로 · 그림마다 정하기 · 모두 참고 자료. */
export type ImageBatchChoice = 'comic' | 'each' | 'reference'

/** 한 번에 읽는 쪽 수 상한 — 그림 읽기 요청 하나에 싣는 양(쪽마다 1~2천 토큰). */
export const MAX_COMIC_PAGES = 20

// 낱말 목록 — 만화 원고를 가리키는 말과, 질문에 대한 답으로 "이야기 원작"을 뜻하는 말.
const COMIC_RE = /만화|웹툰|원고|코믹|콘티|comic|manga|webtoon/i // i18n-ok: 역할 낱말 규칙 자체
const STORY_ANSWER_RE = /스토리|이야기|원작|그대로|영상화|story|adapt/i // i18n-ok: 역할 낱말 규칙 자체
const EACH_RE = /그림마다|장마다|하나씩|한 장씩|각각|따로|each|one by one|per picture/i // i18n-ok: 역할 낱말 규칙 자체
const SHORT_TEXT_MAX = 40

/**
 * 그림과 함께 쓴 말이 "이건 만화 원고다"인지 — 짧고(40자 이하) 만화 낱말이 있고 인물 · 배경 · 참고 낱말이 없을 때만.
 * "내가 준 만화를 영상화하고 싶어"는 만화, "만화 캐릭터야"는 인물이 섞여 묻는다.
 */
export function matchComicIntentInText(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t || t.length > SHORT_TEXT_MAX) return false
  if (!COMIC_RE.test(t)) return false
  return matchImageRoleAnswer(t) === null
}

/** 여러 장 질문의 답(버튼 문구 · 직접 입력)을 읽는다. 인물 · 배경이라고 답하면 그림마다 정하기로 본다. */
export function matchBatchImageAnswer(text: string): ImageBatchChoice | null {
  const t = (text ?? '').trim()
  if (!t) return null
  if (EACH_RE.test(t)) return 'each'
  const role = matchImageRoleAnswer(t)
  if (role === 'reference') return 'reference'
  if (COMIC_RE.test(t) || STORY_ANSWER_RE.test(t)) return 'comic'
  if (role) return 'each'
  return null
}

/** 그림마다 묻는 질문에 만화 · 이야기로 답했는지 — "스토리", "내가 준 만화를 영상화하고 싶어". 인물 · 배경 · 참고 낱말이 있으면 그쪽이다. */
export function matchComicAnswer(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t || matchImageRoleAnswer(t)) return false
  return COMIC_RE.test(t) || STORY_ANSWER_RE.test(t)
}

/** 쪽 순서 — 파일 이름의 숫자를 숫자로 읽어 정렬한다(comic_2 가 comic_10 보다 앞). 이름이 같으면 올린 순서. */
export function sortComicPages<T extends { name: string }>(pages: readonly T[]): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => collator.compare(a.page.name, b.page.name) || a.index - b.index)
    .map((entry) => entry.page)
}

/** 여러 장을 한 번에 묻는 질문 — 만화를 고르면 그림을 분석 모델에 보낸다는 안내를 함께 싣는다. */
export function imageBatchQuestion(voice: AppLocale, count: number): { content: string; options: Array<{ label: string; utterance: string }> } {
  return {
    content: translate(
      voice,
      'You uploaded {n} pictures. How should I use them? If you choose the comic, I send the pages to an analysis model to write the script and describe the art style.',
      { n: String(count) },
    ),
    options: [
      { label: translate(voice, 'Turn the comic into video as drawn'), utterance: translate(voice, 'Turn my comic pages into video exactly as drawn') },
      { label: translate(voice, 'Decide for each picture'), utterance: translate(voice, 'I will decide for each picture') },
      { label: translate(voice, 'Use them all as reference'), utterance: translate(voice, 'Use all the pictures as reference only') },
    ],
  }
}

/** 만화 그림체(2026-10-09 오너 "그림체로 고정할지 실사와 같은 각색을 할지 물어봐줘") —
 *  lock = 만화 그림체로 고정(첫 쪽 그림체로 만들고 나중에 바꿀 수 없다), adapt = 실사 등 다른 스타일로 각색(만화 그림을 그림체로 쓰지 않는다). */
export type ComicStyle = 'lock' | 'adapt'

const STYLE_LOCK_RE = /고정|그대로|유지|keep|fix/i // i18n-ok: 답 낱말 규칙 자체
const STYLE_ADAPT_RE = /각색|실사|다른 스타일|다른 그림체|바꿔|adapt|live action|another style/i // i18n-ok: 답 낱말 규칙 자체

/** 그림체 질문의 답(버튼 문구 · 직접 입력). 둘 다 들었거나 아무것도 없으면 null — 다시 묻는다. */
export function matchComicStyleAnswer(text: string): ComicStyle | null {
  const t = (text ?? '').trim()
  if (!t || t.length > 60) return null
  const lock = STYLE_LOCK_RE.test(t)
  const adapt = STYLE_ADAPT_RE.test(t)
  if (lock === adapt) return null
  return lock ? 'lock' : 'adapt'
}

/** 만화를 고른 뒤 대본을 옮기기 전에 묻는 그림체 질문. */
export function comicStyleQuestion(voice: AppLocale): { content: string; options: Array<{ label: string; utterance: string }> } {
  return {
    content: translate(voice, 'How should the art style work? If you keep the comic art style, it is fixed and cannot be changed later.'),
    options: [
      { label: translate(voice, 'Fix the comic art style'), utterance: translate(voice, 'Keep the comic art style and fix it') },
      { label: translate(voice, 'Adapt to another style like live action'), utterance: translate(voice, 'Adapt it to another style like live action') },
    ],
  }
}
