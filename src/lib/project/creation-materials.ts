// 새 프로젝트 자료의 쓰임새 (2026-10-09 오너 "업로드를 먼저 받고, 무엇인지 고르게 하자"). 순수 — 화면과 Producer 가 같이 쓴다.
//   글은 대본 꼴이면 "대본 그대로"를 미리 골라 둔다. 그림은 미리 고르지 않는다 — 그림 종류를 짐작하려면 그림마다
//   모델을 불러야 해 비용이 크다(10/9 오너 "그림은 고르게 해줘"). 고른 쓰임새로 Producer 가 할 일(planCreation)과
//   마지막 길이 · 화면 질문(creationLengthStep)이 정해진다.
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import { MAX_COMIC_PAGES, type ComicStyle } from '@/lib/producer/comic-intake'
import { detectScript, parseScript } from '@/lib/writer/script/parse'
import type { ProjectFormat } from '@/types/project'

export type TextUse = 'script_keep' | 'script_polish' | 'memo'
export type ImageUse = 'comic' | 'character' | 'background' | 'style' | 'reference'

export const TEXT_USES: readonly TextUse[] = ['script_keep', 'script_polish', 'memo']
export const IMAGE_USES: readonly ImageUse[] = ['comic', 'character', 'background', 'style', 'reference']
/** 그림 두 장 이상을 한 번에 고를 때 — 그림체는 한 장만 쓰므로 빠진다. */
export const IMAGE_GROUP_USES: readonly ImageUse[] = ['comic', 'character', 'background', 'reference']

/** 쓰임새 이름(영어 원문 = 사전 키). */
export const TEXT_USE_LABEL: Record<TextUse, string> = {
  script_keep: 'Script as written',
  script_polish: 'Script to polish',
  memo: 'Idea or notes',
}
export const IMAGE_USE_LABEL: Record<ImageUse, string> = {
  comic: 'Comic pages',
  character: 'Character card',
  background: 'Background card',
  style: 'Art style',
  reference: 'Reference only',
}

/** 원작을 그대로 쓸 때 화면 비율의 처음 값. */
export const DEFAULT_ORIGINAL_FORMAT: ProjectFormat = 'horizontal_16:9'

export interface CreationImage {
  id: string
  name: string
  thumbUrl: string
  sliceUrls: string[]
}
export interface MaterialText {
  id: string
  name: string
  text: string
  use: TextUse
}
export interface MaterialImage extends CreationImage {
  /** null = 아직 고르지 않음. */
  use: ImageUse | null
}

/** image_unchosen = 쓰임새를 고르지 않은 그림이 있다. two_originals = 대본 그대로와 만화 원고를 함께 골랐다.
 *  too_many_comic_pages = 만화 원고가 한 번에 읽는 쪽 수(MAX_COMIC_PAGES)를 넘는다 — Producer 가 읽지 못하고 멈춘다.
 *  comic_style_unchosen = 만화 원고의 그림체(고정 · 각색)를 고르지 않았다. */
export type MaterialProblem = 'image_unchosen' | 'two_originals' | 'too_many_comic_pages' | 'comic_style_unchosen'

/** 자료를 올렸으면 쓰임새 고르기로, 아이디어만 있으면 바로 길이 · 화면으로. */
export function materialNextStep(fileCount: number): 'uses' | 'length' {
  return fileCount > 0 ? 'uses' : 'length'
}

/** 올린 글의 처음 쓰임새 — 대본 꼴이면 그대로, 아니면 아이디어 · 메모. */
export function defaultTextUse(text: string): TextUse {
  return text.trim() && detectScript(text).kind !== 'none' && parseScript(text) ? 'script_keep' : 'memo'
}

/** 그림 한 장의 쓰임새를 고른다. 그림체는 한 장만 — 다른 그림을 그림체로 고르면 앞의 그림은 참고 자료만으로 바뀐다. */
export function chooseImageUse<T extends MaterialImage>(images: readonly T[], id: string, use: ImageUse): T[] {
  return images.map((image) => {
    if (image.id === id) return { ...image, use }
    if (use === 'style' && image.use === 'style') return { ...image, use: 'reference' as const }
    return image
  })
}

/** 묶음(그림 두 장 이상)에 한 번에 고른다. 그림체는 묶음으로 고르지 않는다. */
export function chooseGroupUse<T extends MaterialImage>(images: readonly T[], use: ImageUse): T[] {
  if (!IMAGE_GROUP_USES.includes(use)) return [...images]
  return images.map((image) => ({ ...image, use }))
}

/** 만화 원고를 골랐고 그림체 그림을 따로 고르지 않았으면 만화 그림체를 묻는다(10/9 오너 "그림체로 고정할지 실사와 같은 각색을 할지 물어봐줘"). */
export function needsComicStyle(images: ReadonlyArray<Pick<MaterialImage, 'use'>>): boolean {
  return images.some((image) => image.use === 'comic') && !images.some((image) => image.use === 'style')
}

export function materialProblems(
  texts: ReadonlyArray<Pick<MaterialText, 'use'>>,
  images: ReadonlyArray<Pick<MaterialImage, 'use'>>,
  comicStyle: ComicStyle | null = null,
): MaterialProblem[] {
  const problems: MaterialProblem[] = []
  if (images.some((image) => image.use === null)) problems.push('image_unchosen')
  if (texts.some((text) => text.use === 'script_keep') && images.some((image) => image.use === 'comic')) problems.push('two_originals')
  if (images.filter((image) => image.use === 'comic').length > MAX_COMIC_PAGES) problems.push('too_many_comic_pages')
  if (needsComicStyle(images) && !comicStyle) problems.push('comic_style_unchosen')
  return problems
}

/** 만화 원고 · 그림체는 그림을 분석 모델로 보낸다 — 고르는 자리에서 알린다. */
export function needsAnalysisNotice(images: ReadonlyArray<Pick<MaterialImage, 'use'>>): boolean {
  return images.some((image) => image.use === 'comic' || image.use === 'style')
}

export function analysisNotice(locale: AppLocale): string {
  return translate(locale, 'Comic pages and art style pictures go to an analysis model to make a script and an art style description.')
}

/** 고른 쓰임새로 정한 Producer 의 할 일. */
export interface CreationPlan {
  /** 트리트먼트 바탕(원작이 없을 때) 또는 그대로 쓸 대본. 만화는 옮기기 전이라 비어 있다. */
  story: string
  preserveScript: boolean
  /** 그대로 쓰는 원작. */
  original: 'script' | 'comic' | null
  /** 원작이 있을 때 아이디어 칸 글과 메모 — 대본에 합치지 않고 채팅에 사용자의 메모로 남긴다. */
  note: string | null
  comicPages: CreationImage[]
  /** 만화 원고의 그림체 — 그림체 그림을 따로 골랐거나 만화가 없으면 null. */
  comicStyle: ComicStyle | null
  styleImage: CreationImage | null
  cards: Array<{ image: CreationImage; role: 'character' | 'background' }>
  references: CreationImage[]
}

const bareImage = ({ id, name, thumbUrl, sliceUrls }: CreationImage): CreationImage => ({ id, name, thumbUrl, sliceUrls })

export function planCreation(input: { idea: string; texts: readonly MaterialText[]; images: readonly MaterialImage[]; comicStyle?: ComicStyle | null }): CreationPlan {
  const keep = input.texts.filter((text) => text.use === 'script_keep')
  const others = input.texts.filter((text) => text.use !== 'script_keep')
  const comicPages = input.images.filter((image) => image.use === 'comic').map(bareImage)
  const original: CreationPlan['original'] = keep.length ? 'script' : comicPages.length ? 'comic' : null
  // 아이디어 + 글 한 덩이(글이 여러 개면 파일 이름을 머리로) — 원작이 없으면 트리트먼트 바탕, 있으면 채팅에 남길 메모.
  const merged = [input.idea.trim(), ...others.map((text) => (others.length > 1 ? `# ${text.name}\n\n${text.text}` : text.text).trim())]
    .filter(Boolean)
    .join('\n\n')
  const style = input.images.find((image) => image.use === 'style')
  return {
    story: original === 'script' ? keep.map((text) => text.text.trim()).join('\n\n') : original === 'comic' ? '' : merged,
    preserveScript: original === 'script',
    original,
    note: original && merged ? merged : null,
    comicPages,
    comicStyle: needsComicStyle(input.images) ? (input.comicStyle ?? null) : null,
    styleImage: style ? bareImage(style) : null,
    cards: input.images.flatMap((image) => (image.use === 'character' || image.use === 'background' ? [{ image: bareImage(image), role: image.use }] : [])),
    references: input.images.filter((image) => image.use === 'reference').map(bareImage),
  }
}

/** 마지막 단계 — 원작을 그대로 쓰면 길이는 원작 길이대로라 화면 비율만, 아니면 만들 것 카드. */
export function creationLengthStep(plan: Pick<CreationPlan, 'original'>): 'format' | 'purpose' {
  return plan.original ? 'format' : 'purpose'
}
