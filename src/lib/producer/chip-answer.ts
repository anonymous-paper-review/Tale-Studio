// Writer 화면 채팅의 그림 질문 답 읽기(2026-11-10 검토 a 보통 2 → 오너 "Writer 화면에서는 칩 말(또는 짧은 답)만 답으로 받는다").
//   산문 고침 말("Fix the typo in scene 2" · "Make the background darker" · "대사는 그대로 두고 줄여줘")이 낱말 하나 때문에
//   떠 있는 그림 질문의 답으로 잡혀 만화를 옮기거나 카드를 만들었다. 여기서는 칩 문구(이름 · 보내는 말, 영어 · 한국어)나
//   칩 낱말 하나로 된 짧은 답과 통째로 같을 때만 답으로 본다. 길이로는 못 가른다 — 산문 고침 말도 짧다.
//   스토어는 이 결과만 믿는다(image-role.ts 와 같은 짜임).
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import { comicRewriteQuestion, comicStyleQuestion, imageBatchQuestion, type ComicRewrite, type ComicStyle, type ImageBatchChoice } from '@/lib/producer/comic-intake'
import type { ImageUseAnswer } from '@/lib/producer/image-role'

type Chip = { label: string; utterance: string }
const VOICES: readonly AppLocale[] = ['en', 'ko']

/** 그림마다 묻는 쓰임새 칩 — 새 프로젝트 화면과 같은 다섯 가지(2026-10-10 오너 "채팅으로 올린 그림에도 그림체 선택지 넣어줘"). */
export function imageRoleOptions(voice: AppLocale): Chip[] {
  return [
    { label: translate(voice, 'Comic pages'), utterance: translate(voice, 'Use it as a comic page') },
    { label: translate(voice, 'Character card'), utterance: translate(voice, 'Use it as a character') },
    { label: translate(voice, 'Background card'), utterance: translate(voice, 'Use it as a background') },
    { label: translate(voice, 'Art style'), utterance: translate(voice, 'Use it as the art style') },
    { label: translate(voice, 'Reference only'), utterance: translate(voice, 'Use it as reference only') },
  ]
}

/** 인물 카드로 쓰기로 한 사진이 어느 인물인지 고르는 칩(2026-11-11 오너 결정 2) — 이름 있는 사람 카드마다 하나 + "새 인물". 이름은 산문에 적힌 그대로. */
export function characterPickOptions(voice: AppLocale, cards: ReadonlyArray<{ name: string }>): Chip[] {
  return [
    ...cards.map((card) => ({ label: card.name, utterance: translate(voice, 'This is {name}', { name: card.name }) })),
    { label: translate(voice, 'New character'), utterance: translate(voice, 'Make a new character card') },
  ]
}

/** 채팅 모델이 첨부 그림을 그림체로 쓰자고 할 때 묻는 칩(2026-10-10 오너 "묻고 정한다"). */
export function styleAttachmentOptions(voice: AppLocale): Chip[] {
  return [
    { label: translate(voice, 'Use as the art style'), utterance: translate(voice, 'Use it as the art style') },
    { label: translate(voice, 'Keep as reference'), utterance: translate(voice, 'Use it as reference only') },
  ]
}

/** 비교용으로 다듬는다 — 대소문자 · 겹친 빈칸 · 끝 문장부호, 끝에 붙은 조사 · 존댓말(으로 · 로 · 만 · 요)을 걷는다. 양쪽을 같은 규칙으로 다듬어 비교한다. */
export function chipText(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?~,…。！？]+$/u, '')
    .replace(/(?:으로|로)?만?요?$/u, '') // i18n-ok: 끝 조사 규칙 자체
    .trim()
}

function pick<K extends string>(text: string, choices: ReadonlyArray<{ key: K; phrases: readonly string[] }>): K | null {
  const t = chipText(text)
  if (!t) return null
  for (const choice of choices) if (choice.phrases.some((phrase) => chipText(phrase) === t)) return choice.key
  return null
}

/** 칩 한 개의 문구 — 이름과 보내는 말, 영어 · 한국어 모두(화면 언어와 다른 말로 쳐도 받는다). */
function chipPhrases(build: (voice: AppLocale) => readonly Chip[], index: number): string[] {
  return VOICES.flatMap((voice) => {
    const chip = build(voice)[index]
    return chip ? [chip.label, chip.utterance] : []
  })
}

// 칩 낱말 하나로 된 짧은 답 — 칩을 누르지 않고 쳐도 받는다. 문장은 받지 않는다.
const USE_WORDS: Record<ImageUseAnswer, readonly string[]> = {
  comic: ['comic', 'comics', 'comic page', 'manga', 'webtoon', '만화', '만화 원고', '웹툰', '웹툰 원고', '원고'], // i18n-ok: 답 낱말 목록 자체
  character: ['character', 'character card', 'person', '인물', '인물 카드', '캐릭터', '캐릭터 카드', '등장인물'], // i18n-ok: 답 낱말 목록 자체
  background: ['background', 'background card', 'location', 'place', '배경', '배경 카드', '장소'], // i18n-ok: 답 낱말 목록 자체
  style: ['style', 'art style', 'drawing style', '그림체', '화풍', '스타일'], // i18n-ok: 답 낱말 목록 자체
  reference: ['reference', 'references', '참고', '참고 자료', '레퍼런스'], // i18n-ok: 답 낱말 목록 자체
}
const BATCH_WORDS: Record<ImageBatchChoice, readonly string[]> = {
  comic: ['comic', 'comics', 'manga', 'webtoon', 'as drawn', '만화', '만화 원고', '웹툰', '그대로'], // i18n-ok: 답 낱말 목록 자체
  each: ['each', 'each picture', 'one by one', '그림마다', '하나씩', '따로', '각각'], // i18n-ok: 답 낱말 목록 자체
  reference: ['reference', 'all reference', '참고', '참고 자료', '모두 참고', '모두 참고 자료'], // i18n-ok: 답 낱말 목록 자체
}
const COMIC_STYLE_WORDS: Record<ComicStyle | 'stop', readonly string[]> = {
  lock: ['lock', 'fix', 'keep', 'fixed', '고정', '만화 그림체', '그대로'], // i18n-ok: 답 낱말 목록 자체
  adapt: ['adapt', 'live action', 'another style', '각색', '실사', '다른 스타일', '다른 그림체'], // i18n-ok: 답 낱말 목록 자체
  stop: ['stop', 'cancel', 'never mind', '그만', '그만두기', '취소'], // i18n-ok: 답 낱말 목록 자체
}
const REWRITE_WORDS: Record<ComicRewrite, readonly string[]> = {
  rewrite: ['rewrite', 'yes', 'ok', '다시 쓰기', '다시 써', '예', '네', '응'], // i18n-ok: 답 낱말 목록 자체
  reference: ['reference', 'reference only', 'no', '참고', '참고 자료', '아니', '아니요', '아뇨'], // i18n-ok: 답 낱말 목록 자체
}
const STYLE_ATTACHMENT_WORDS: Record<'style' | 'reference', readonly string[]> = {
  style: ['style', 'art style', 'yes', 'ok', '그림체', '예', '네', '응'], // i18n-ok: 답 낱말 목록 자체
  reference: ['reference', 'reference only', 'no', '참고', '참고 자료', '아니', '아니요', '아뇨'], // i18n-ok: 답 낱말 목록 자체
}
const RETRY_WORDS = ['again', 'retry', 'try again', '다시', '다시 옮기기'] // i18n-ok: 답 낱말 목록 자체
const NEW_CHARACTER_WORDS = ['new', 'new character', 'new card', 'new person', '새 인물', '새 카드', '새로', '새로 만들기'] // i18n-ok: 답 낱말 목록 자체

/** 그림마다 묻는 쓰임새 질문의 답. */
export function matchWriterImageUse(text: string): ImageUseAnswer | null {
  const keys: ImageUseAnswer[] = ['comic', 'character', 'background', 'style', 'reference']
  return pick(text, keys.map((key, i) => ({ key, phrases: [...chipPhrases(imageRoleOptions, i), ...USE_WORDS[key]] })))
}

/** 여러 장을 한 번에 묻는 질문의 답. */
export function matchWriterBatch(text: string): ImageBatchChoice | null {
  const keys: ImageBatchChoice[] = ['comic', 'each', 'reference']
  return pick(text, keys.map((key, i) => ({ key, phrases: [...chipPhrases((voice) => imageBatchQuestion(voice, 2).options, i), ...BATCH_WORDS[key]] })))
}

/** 만화 그림체 질문의 답 — 고정 · 각색 · 그만두기. */
export function matchWriterComicStyle(text: string): ComicStyle | 'stop' | null {
  const keys: Array<ComicStyle | 'stop'> = ['lock', 'adapt', 'stop']
  return pick(text, keys.map((key, i) => ({ key, phrases: [...chipPhrases((voice) => comicStyleQuestion(voice, { stop: true }).options, i), ...COMIC_STYLE_WORDS[key]] })))
}

/** 만화로 산문 다시 쓰기 질문의 답 — 다시 쓰기 · 참고로만. */
export function matchWriterComicRewrite(text: string): ComicRewrite | null {
  const keys: ComicRewrite[] = ['rewrite', 'reference']
  return pick(text, keys.map((key, i) => ({ key, phrases: [...chipPhrases((voice) => comicRewriteQuestion(voice).options, i), ...REWRITE_WORDS[key]] })))
}

/** 첨부 그림을 그림체로 쓸지 묻는 질문의 답. */
export function matchWriterStyleAttachment(text: string): 'style' | 'reference' | null {
  const keys: Array<'style' | 'reference'> = ['style', 'reference']
  return pick(text, keys.map((key, i) => ({ key, phrases: [...chipPhrases(styleAttachmentOptions, i), ...STYLE_ATTACHMENT_WORDS[key]] })))
}

/** "어느 인물의 그림인가요?"의 답 — 고른 카드(localId) · 'new' · null. 칩 말 · 인물 이름 · "새 인물" 같은 짧은 답만 받는다(문장은 받지 않는다). */
export function matchCharacterPick(text: string, cards: ReadonlyArray<{ localId: string; name: string }>): string | 'new' | null {
  return pick(text, [
    ...cards.map((card) => ({
      key: card.localId,
      phrases: [card.name, ...VOICES.map((voice) => translate(voice, 'This is {name}', { name: card.name }))],
    })),
    { key: 'new', phrases: [...VOICES.flatMap((voice) => [translate(voice, 'New character'), translate(voice, 'Make a new character card')]), ...NEW_CHARACTER_WORDS] },
  ])
}

/** 만화 다시 옮기기 질문의 답. */
function matchComicRetry(text: string): 'retry' | null {
  const phrases = VOICES.flatMap((voice) => [translate(voice, 'Read the comic again'), translate(voice, 'Turn the comic into a script again')])
  return pick(text, [{ key: 'retry' as const, phrases: [...phrases, ...RETRY_WORDS] }])
}

// 그림 질문의 칩 기록 id 머리 — 새로 고침 뒤에는 칩만 돌아오고 올린 그림 · 질문 상태는 빠진다.
//   "어느 인물의 그림인가요?"는 카드 목록 대신 돌아온 칩 이름(인물 이름)으로 칩 말을 읽는다.
const IMAGE_QUESTIONS: ReadonlyArray<readonly [string, (text: string, labels: readonly string[]) => string | null]> = [
  ['image-role:', matchWriterImageUse],
  ['image-character:', (text, labels) => matchCharacterPick(text, labels.map((name) => ({ localId: name, name })))],
  ['image-batch:', matchWriterBatch],
  ['comic-style:', matchWriterComicStyle],
  ['comic-rewrite:', matchWriterComicRewrite],
  ['comic-retry:', matchComicRetry],
  ['style-attachment:', matchWriterStyleAttachment],
]

/** 그림 질문(쓰임새 · 어느 인물 · 여러 장 · 만화 그림체 · 다시 쓰기 · 다시 옮기기 · 그림체로 쓸지)의 칩 기록 id 인가. */
export function isImageQuestionId(id: string): boolean {
  return IMAGE_QUESTIONS.some(([prefix]) => id.startsWith(prefix))
}

/** 새로 고침 뒤 돌아온 그림 질문(칩만 남은 것)에 답한 말인가 — 돌아온 칩 이름이거나 그 질문의 칩 말 · 짧은 답. 그림 질문이 아니면 false. */
export function answersRestoredImageQuestion(question: { id: string; labels: readonly string[] }, text: string): boolean {
  const match = IMAGE_QUESTIONS.find(([prefix]) => question.id.startsWith(prefix))?.[1]
  const t = chipText(text)
  if (!match || !t) return false
  return question.labels.some((label) => chipText(label) === t) || match(text, question.labels) !== null
}
