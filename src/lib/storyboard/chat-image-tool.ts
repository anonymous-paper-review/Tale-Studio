// Storyboard 채팅의 실사 그림 도구(오너 2026-11-26 m1126 O7 "채팅으로 — 고칠 글을 채팅에 보내면 채팅이 맥락을 보고 그 샷 실사를 다시 그린다").
//   Storyboard 단계(writer) 채팅 요청에만 싣는다 — 콘티 채팅은 Artist 앞이라 인물 시트가 없어 실사를 그릴 수 없다(혼자 정한 것 j).
//   Storyboard 채팅은 실사 고치기와 대사 고치기만 한다(오너 2026-11-27 N3 "추천대로" · Q1 "대사 수정 기능을 채팅창에서도") — 이야기 · 샷 글은 고치지 않고 Writer 콘티로 안내한다.
//   그래서 Storyboard 요청은 씬 · 샷 고치기 동작 없는 안내(STORYBOARD_CHAT_SYSTEM) · 대사 고침 말(lib/writer/chat-dialogue-edit) · 읽기 도구만 받고,
//   서버는 그림 요청 · 대사 고침 · 되묻기만 화면에 넘긴다. 대사 고침은 화면이 콘티 채팅과 같은 저장 길로 저장한다.
//   이름 · 뜻은 Director 채팅의 generateImage 와 같다(id 없으면 실사 없는 샷 전부 = [시작]). 여기 id 는 Writer 샷 id.
//   바꿀 점은 Director 샷 상세 "바꾸고 싶은 점"과 같은 글 자리에 실린다(lib/storyboard/redraw-image — 지시문 글자 변화 0).
//   서버(api/writer/chat)는 받을 모양만 받는다(architecture §3) — 적용은 화면(채팅 저장소)이 한다.
//   약속: tests/chat/storyboard-image-tool.test.ts · tests/chat/storyboard-chat-text.test.ts
import { translate } from '@/lib/i18n/translate'
import type { DialogueEditUpdate } from '@/lib/writer/chat-dialogue-edit'
import type { AppLocale } from '@/lib/locale'
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
- When the user asks to change how a shot looks, do not edit the shot text; emit generateImage with a change.
- generateImage only redraws the picture and never changes text. When the same message also asks to change dialogue (a line, narration, who says it), change it with updateDialogue (see <dialogue-edits>). Other text (the shot's story or description, a name, the length) is not changed on this screen: say that it is edited on the Writer screen's rough storyboard, and never say that other text was changed.
- Emit generateImage only when the user asks to make, remake or change a picture. Your reply says which shot (by its board name) you are redrawing and what will change.
</live-action-images>`

// 한국어 대화에서 부를 화면 이름(채팅 안내 CHAT_AGENT_GUIDE 의 콘티 이름과 같다).
const KO_CONTI = 'Writer 콘티' // i18n-ok: 모델에게 보이는 한국어 화면 이름

/** Storyboard 채팅의 AI 안내(오너 2026-11-27 N3 · Q1) — 씬 · 샷 고치기 동작이 없고 대사 고침(<dialogue-edits>, 따로 붙인다)만 있다.
 *  샷 이름 규칙(shotNumbers)은 Writer 채팅 안내의 것을 그대로 싣는다. */
export function storyboardChatSystem(shotNumbers: string): string {
  return `You are the Storyboard assistant in an AI video production pipeline called "The Set."
The user is on the Storyboard screen. The story is already broken into Scenes and Shots on the Writer screen's rough storyboard, and here each shot's rough pencil sketch is turned into a live-action image.

<role>
You discuss the story and staging, answer questions, change the shots' dialogue (see <dialogue-edits>), and make or remake the shots' live-action images (see <live-action-images>).
Dialogue is the only text you change on this screen. Do not add, split, reorder or remove scenes or shots, and do not change a scene's or a shot's story, action, shot size, length or characters. The only text edit here is updateDialogue; the app tools on this screen only read data and open screens, and none of them changes or saves anything.
When the user asks for such a change, do not pretend to make it. Say in one or two sentences that the story and shots are edited on the Writer screen's rough storyboard (call it "${KO_CONTI}" in Korean replies). If the user asks to go there, project_workflow can open it (action "open", targetStage "conti").
Restarting or re-splitting the scene and shot run is also done on the rough storyboard, not here.
Character and background descriptions are edited on the Artist screen.
If the same message also asks for a picture or dialogue change, make those parts (generateImage, updateDialogue) and say that the story or shot part is edited on the rough storyboard.
For pure discussion or questions, omit the JSON block entirely.
</role>

<model>
- Scene: location, time of day, mood, summary and the characters present.
- Shot: one cut inside a scene, with its shot size, action description, characters, length and dialogue lines.
- The context lists every scene and shot with its exact ID. Use those IDs only inside the JSON block.
</model>

${shotNumbers}

<format>
Reply text in 1-3 sentences (Korean if the user wrote Korean), then, only when changing dialogue, making images or asking which shot, a single JSON block as the LAST element:

\`\`\`json
{"updates":[ ... ]}
\`\`\`

The only update types here are updateDialogue (see <dialogue-edits>), generateImage (see <live-action-images>) and clarify:
{"type":"clarify","question":"<short question>","candidates":["<board name or wording>", ...]}
Use clarify alone when you cannot tell which shot the user means (2-4 candidates the user can answer with). Never mix it with other updates.
</format>`
}

/** Storyboard 채팅 답의 이야기 · 샷 고치기를 떨군 뒤 답 끝에 붙이는 안내(혼자 정한 것 c) — 답과 같은 채팅 언어. 대사는 여기서도 고친다(Q1). */
export function storyboardTextNotice(locale: AppLocale): string {
  return translate(locale, "Storyboard doesn't change the story or shots. Edit them in Writer's rough storyboard.")
}

/** 모델 답에서 대사 고침을 고른다(Q1) — 대사 고침 말(updateDialogue)과, 콘티 말로 온 샷 고치기의 대사 칸(patch.dialogueLines)을 같은 대사 고침으로 본다.
 *  검증은 부른 쪽이 pickDialogueEdits 로 한다(콘티와 같은 줄 규칙). 다른 칸은 여기서 버린다 — 그 수는 storyboardOnlyUpdates 가 센다. */
export function storyboardDialogueItems(raw: readonly unknown[]): unknown[] {
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    if (rec.type === 'updateDialogue') return [rec]
    const patch = rec.patch && typeof rec.patch === 'object' ? (rec.patch as Record<string, unknown>) : null
    if (rec.type === 'updateShot' && patch && 'dialogueLines' in patch) return [{ type: 'updateDialogue', id: rec.id, dialogueLines: patch.dialogueLines }]
    return []
  })
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

/** Storyboard 채팅 답에서 화면에 넘길 것 — 되묻기 · 대사 고침 · 실사 그림 요청만(오너 2026-11-27 N3 · Q1). 되묻기가 있으면 질문만.
 *  validated 는 콘티 규칙으로 검증한 씬 · 샷 고치기 — 대사 칸만 고친 샷 고치기 말고는 모두 떨군 이야기 · 샷 고치기로 센다(답 끝 안내). */
export function storyboardOnlyUpdates(
  validated: readonly unknown[],
  dialogue: readonly DialogueEditUpdate[],
  images: readonly StoryboardImageUpdate[],
): { updates: unknown[]; droppedTextEdits: number; dialogueEdits: number } {
  const typeOf = (u: unknown) => (u && typeof u === 'object' ? (u as { type?: unknown }).type : undefined)
  const clarify = validated.filter((u) => typeOf(u) === 'clarify')
  const dialogueOnly = (u: unknown) => {
    const patch = typeOf(u) === 'updateShot' ? (u as { patch?: Record<string, unknown> }).patch : undefined
    return !!patch && Object.keys(patch).every((key) => key === 'dialogueLines')
  }
  const droppedTextEdits = validated.filter((u) => typeOf(u) !== 'clarify' && !dialogueOnly(u)).length
  if (clarify.length) return { updates: [clarify[0]], droppedTextEdits, dialogueEdits: 0 }
  return { updates: [...dialogue, ...images], droppedTextEdits, dialogueEdits: dialogue.length }
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
