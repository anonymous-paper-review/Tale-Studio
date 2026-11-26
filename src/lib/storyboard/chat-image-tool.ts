// Storyboard 채팅의 실사 그림 도구(오너 2026-11-26 m1126 O7 "채팅으로 — 고칠 글을 채팅에 보내면 채팅이 맥락을 보고 그 샷 실사를 다시 그린다").
//   Storyboard 단계(writer) 채팅 요청에만 싣는다 — 콘티 채팅은 Artist 앞이라 인물 시트가 없어 실사를 그릴 수 없다(혼자 정한 것 j).
//   이름 · 뜻은 Director 채팅의 generateImage 와 같다(id 없으면 실사 없는 샷 전부 = [시작]). 여기 id 는 Writer 샷 id.
//   바꿀 점은 Director 샷 상세 "바꾸고 싶은 점"과 같은 글 자리에 실린다(lib/storyboard/redraw-image — 지시문 글자 변화 0).
//   서버(api/writer/chat)는 받을 모양만 받는다(architecture §3) — 적용은 화면(채팅 저장소)이 한다.
//   약속: tests/chat/storyboard-image-tool.test.ts
import { currentStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { hasStoryboardImage } from '@/lib/director/storyboard-image'
import type { StoryboardImage } from '@/types/director'

/** 바꿀 점 상한 — 지시문 한 줄이라 길면 다른 지시를 밀어낸다. */
const CHANGE_MAX = 500

export interface StoryboardImageUpdate {
  type: 'generateImage'
  /** Writer 샷 id. 없으면 실사 없는 샷 전부([시작]과 같다). */
  id?: string
  /** 지금 그림에서 바꿀 점(영어). 없으면 샷 글대로 그린다. */
  change?: string
}

export const STORYBOARD_IMAGE_TOOL_GUIDE = `

<live-action-images>
This chat is on the Storyboard screen. Each shot starts as a pencil rough sketch, and the user turns it into a live-action image.
To make or remake a shot's live-action image, emit (in the same updates block):
{"type":"generateImage","id":"<shotId>","change":"<what to change, in English>"}
- "id" is the exact shot_id from the context. Never invent one.
- "change" says only what should differ from the current image (expression, pose, framing, light, background detail, props). Keep it short and concrete, consistent with the shot's story, characters and location. Write it in English even when the user writes another language.
- Leave "change" out to draw the image just as the shot describes (for a shot that has no live-action image yet, or "draw it again").
- Leave "id" out to make live-action images for every shot that has none yet (the same as the Start button).
- It runs at once and uses no Takes. Each shot runs one image at a time, so emit at most one generateImage per shot.
- When the user asks to change how a shot looks, do not edit the shot text with updateShot; emit generateImage with a change.
- When the user also asks to change text (dialogue, narration, the shot's story or description, a name, the length), make that text change with the edit tools as usual. generateImage only redraws the picture and never changes text. Never say text was changed unless the edit result confirms it.
- Emit generateImage only when the user asks to make, remake or change a picture. Your reply says which shot (by its board name) you are redrawing and what will change.
</live-action-images>`

// 사람이 그림만 고쳐 달라고 했나 — 도구 고리가 "그림 요청만의 답"을 글 고치기 확인(requireEdit) 없이 받아도 되는 때(검토 2026-11-26 rev-director).
//   그림을 가리키는 말(이미지 · 그림 · 실사 · 사진 · 그려 · image · picture · redraw …)이 있고, 글을 가리키는 말(대사 · 내레이션 · 자막 · 설명 · 이야기 ·
//   대본 · 문구 · 제목 · 이름 · N초 · dialogue · narration · description · story · text · name · duration …)이 없을 때만 그렇다.
//   인물 · 배경 · 표정 · 빛 · 구도는 그림의 생김새라 글 말로 세지 않는다(AI 안내가 그림 바꿀 점으로 부르는 것과 같다).
//   "대사는 그대로"처럼 글을 두라는 말은 빼고 본다. 애매하면 false — 예전처럼 실행을 확인한다(리드 "불확실하면 안전한 쪽").
//   약속: tests/chat/storyboard-image-tool.test.ts · storyboard-image-loop.test.ts · storyboard-chat-store.test.ts
const PICTURE_WORDS = /(이미지|그림|실사|사진|그려|그리기|\b(images?|pictures?|photos?|redraw|repaint|draw)\b)/i // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
const TEXT_TARGET = '대사|내레이션|나레이션|자막|설명|스토리|이야기|줄거리|대본|문구|문장|제목|이름' // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
const TEXT_TARGET_EN = 'dialogue|dialog|lines?|narration|captions?|subtitles?|description|story|text|wording|script|title|names?'
const TEXT_WORDS = new RegExp(`(${TEXT_TARGET}|\\d+\\s*초|\\b(${TEXT_TARGET_EN}|rename|duration|seconds?)\\b)`, 'i') // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
const KEEP_TEXT = new RegExp(`(${TEXT_TARGET})(은|는|이|가|을|를|도)?\\s*(그대로|유지)|\\bkeep\\s+(the\\s+)?(${TEXT_TARGET_EN})\\b|\\b(${TEXT_TARGET_EN})\\s+(unchanged|as\\s+is)\\b`, 'gi') // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.

/** 사람이 그림만 고쳐 달라고 했나(Storyboard 채팅) — 위 주석. */
export function requestsPictureOnlyChange(message: string): boolean {
  const asked = message.replace(KEEP_TEXT, ' ')
  return PICTURE_WORDS.test(asked) && !TEXT_WORDS.test(asked)
}

/** 채팅 답의 updates 중 실사 그림 요청인가(서버가 모양을 이미 걸렀다) — 채팅 저장소가 씬 · 샷 고치기와 가른다. */
export function isStoryboardImageUpdate(update: unknown): update is StoryboardImageUpdate {
  return !!update && typeof update === 'object' && (update as { type?: unknown }).type === 'generateImage'
}

/** 모델이 낸 updates 중 실사 그림 요청만 받는다 — 샷 id · 바꿀 점은 글, 바꿀 점은 다듬고 자른다. 같은 샷은 뒤 것 하나만. */
export function pickStoryboardImageUpdates(raw: readonly unknown[]): StoryboardImageUpdate[] {
  const byShot = new Map<string, StoryboardImageUpdate>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.type !== 'generateImage') continue
    if (rec.id !== undefined && (typeof rec.id !== 'string' || !rec.id.trim())) continue
    const id = typeof rec.id === 'string' ? rec.id.trim() : undefined
    const change = typeof rec.change === 'string' ? rec.change.trim().slice(0, CHANGE_MAX) : ''
    const update: StoryboardImageUpdate = { type: 'generateImage', ...(id ? { id } : {}), ...(change ? { change } : {}) }
    const key = id ?? '*'
    byShot.delete(key)
    byShot.set(key, update)
  }
  return [...byShot.values()]
}

/** 씬 · 샷 고치기 검증 결과에 실사 그림 요청을 붙인다 — 되묻기(clarify)가 있으면 질문만(지금 Writer 채팅 규칙). */
export function withStoryboardImageUpdates(validated: readonly unknown[], images: readonly StoryboardImageUpdate[]): unknown[] {
  const clarify = validated.find((u) => !!u && typeof u === 'object' && (u as { type?: unknown }).type === 'clarify')
  return clarify ? [clarify] : [...validated, ...images]
}

/** AI 문맥 한 덩어리 — 샷마다 실사가 있는지와 지금 판 번호. 샷 이름은 문맥의 샷 줄(보드 이름)이 이미 준다. */
export function storyboardImageStatusSection(rows: ReadonlyArray<{ shot_id: string; storyboard_image: unknown }>): string {
  const lines = rows.map((row) => {
    if (!hasStoryboardImage(row.storyboard_image)) return `- ${row.shot_id}: no live-action image yet`
    const version = currentStoryboardVersion(row.storyboard_image as StoryboardImage)
    return `- ${row.shot_id}: live-action image${version ? ` v${version.n}` : ''}`
  })
  return ['## Live-action images (Storyboard)', ...lines].join('\n')
}
