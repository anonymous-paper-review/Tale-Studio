// Storyboard 채팅의 실사 그림 도구(오너 2026-11-26 m1126 O7 "채팅으로 — 고칠 글을 채팅에 보내면 채팅이 맥락을 보고 그 샷 실사를 다시 그린다").
//   Storyboard 단계(writer) 채팅 요청에만 싣는다 — 콘티 채팅은 Artist 앞이라 인물 시트가 없어 실사를 그릴 수 없다(혼자 정한 것 j).
//   Storyboard 채팅은 실사 고치기와 대사 고치기만 한다(오너 2026-11-27 N3 "추천대로" · Q1 "대사 수정 기능을 채팅창에서도") — 이야기 · 샷 글은 고치지 않고 Writer 콘티로 안내한다.
//   그래서 Storyboard 요청은 씬 · 샷 고치기 동작 없는 안내(STORYBOARD_CHAT_SYSTEM)와 도구(읽기 + 대사 자원만 고치는 edit_project — Director 채팅과 같은 대사 도구,
//   리드 "도구 하나로")를 받고, 서버는 답의 JSON 에서 그림 요청 · 되묻기만 화면에 넘긴다(대사도 JSON 으로는 고치지 않는다).
//   이름 · 뜻은 Director 채팅의 generateImage 와 같다(id 없으면 실사 없는 샷 전부 = [시작]). 여기 id 는 Writer 샷 id.
//   바꿀 점은 Director 샷 상세 "바꾸고 싶은 점"과 같은 글 자리에 실린다(lib/storyboard/redraw-image — 지시문 글자 변화 0).
//   서버(api/writer/chat)는 받을 모양만 받는다(architecture §3) — 적용은 화면(채팅 저장소)이 한다.
//   약속: tests/chat/storyboard-image-tool.test.ts · tests/chat/storyboard-chat-text.test.ts
import { translate } from '@/lib/i18n/translate'
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
- generateImage only redraws the picture and never changes text. When the same message also asks to change dialogue (a line, narration, who says it), change it with the dialogue tool (see <dialogue-tool>). Other text (the shot's story or description, a name, the length) is not changed on this screen: say that it is edited on the Writer screen's rough storyboard, and never say that other text was changed.
- Emit generateImage only when the user asks to make, remake or change a picture. Your reply says which shot (by its board name) you are redrawing and what will change.
</live-action-images>`

// 한국어 대화에서 부를 화면 이름(채팅 안내 CHAT_AGENT_GUIDE 의 콘티 이름과 같다).
const KO_CONTI = 'Writer 콘티' // i18n-ok: 모델에게 보이는 한국어 화면 이름

/** Storyboard 채팅의 AI 안내(오너 2026-11-27 N3 · Q1) — 씬 · 샷 고치기 동작이 없고 대사는 대사 도구(<dialogue-tool>)로만 고친다.
 *  샷 이름 규칙(shotNumbers)은 Writer 채팅 안내의 것을 그대로 싣는다. */
export function storyboardChatSystem(shotNumbers: string): string {
  return `You are the Storyboard assistant in an AI video production pipeline called "The Set."
The user is on the Storyboard screen. The story is already broken into Scenes and Shots on the Writer screen's rough storyboard, and here each shot's rough pencil sketch is turned into a live-action image.

<role>
You discuss the story and staging, answer questions, change the shots' dialogue with the app tools (see <dialogue-tool>), and make or remake the shots' live-action images (see <live-action-images>).
Dialogue is the only text you change on this screen. Do not add, split, reorder or remove scenes or shots, and do not change a scene's or a shot's story, action, shot size, length or characters. The app tools here read data, open screens and edit dialogue only; they never change a shot's story or the scenes and shots themselves.
When the user asks for such a change, do not pretend to make it. Say in one or two sentences that the story and shots are edited on the Writer screen's rough storyboard (call it "${KO_CONTI}" in Korean replies). If the user asks to go there, project_workflow can open it (action "open", targetStage "conti").
Restarting or re-splitting the scene and shot run is also done on the rough storyboard, not here.
Character and background descriptions are edited on the Artist screen.
If the same message also asks for a picture or dialogue change, make those parts (generateImage, the dialogue tool) and say that the story or shot part is edited on the rough storyboard.
For pure discussion or questions, omit the JSON block entirely.
</role>

<model>
- Scene: location, time of day, mood, summary and the characters present.
- Shot: one cut inside a scene, with its shot size, action description, characters, length and dialogue lines.
- The context lists every scene and shot with its exact ID. Use those IDs only inside the JSON block.
</model>

${shotNumbers}

<format>
Reply text in 1-3 sentences (Korean if the user wrote Korean), then, only when making images or asking which shot, a single JSON block as the LAST element:

\`\`\`json
{"updates":[ ... ]}
\`\`\`

The only update types here are generateImage (see <live-action-images>) and clarify (dialogue is changed with the app tools, never in this block):
{"type":"clarify","question":"<short question>","candidates":["<board name or wording>", ...]}
Use clarify alone when you cannot tell which shot the user means (2-4 candidates the user can answer with). Never mix it with other updates.
</format>`
}

/** Storyboard 채팅 답의 이야기 · 샷 고치기를 떨군 뒤 답 끝에 붙이는 안내(혼자 정한 것 c) — 답과 같은 채팅 언어. 대사는 여기서도 고친다(Q1). */
export function storyboardTextNotice(locale: AppLocale): string {
  return translate(locale, "Storyboard doesn't change the story or shots. Edit them in Writer's rough storyboard.")
}

/** 모델이 대사 고침을 대사 도구 대신 답의 JSON 으로 내 떨궜다 — 대사가 저장되지 않았다고 알린다(검토 rev-flow-2-4 낮음 4).
 *  모델 답이 "대사를 바꿨어요"라고 해도 사람이 그 사실을 알게. 다시 부탁하면 대사 도구로 고친다. */
export function storyboardDialogueNotSavedNotice(locale: AppLocale): string {
  return translate(locale, "This dialogue change wasn't saved. Please ask again.")
}

/** Storyboard 채팅의 대사 도구 안내(오너 2026-11-27 Q1 "채팅창에서도" · 리드 "도구 하나로") — Director 채팅 <dialogue_tool> 과 같은 규칙(같은 대사 자원 · 같은 검사 · 같은 저장).
 *  답 끝의 "새로 만드는 영상부터" 한 줄은 화면이 붙인다(receipt dialogueEditNote) — 모델은 쓰지 않는다. */
export const STORYBOARD_DIALOGUE_TOOL_GUIDE = `

<dialogue-tool>
- A shot's dialogue (spoken lines and narration) is changed only with the app tools: read_project with resource "dialogue", then edit_project with that shot's complete dialogueLines. Keep every unchanged line with all of its fields; characterId null means narration; use only character IDs that appear in the read rows. You can change a line's text or its speaker, add lines and remove lines (removing a line waits for the user's approval).
- Find the shot the user names through the boardLabel of the read rows.
- edit_project here edits only the "dialogue" resource. Never put a dialogue change in the "change" of generateImage or in the updates block.
- After a saved dialogue edit, the app itself adds one line saying that the changed dialogue goes into videos made from now on and that videos already made keep their dialogue. Never write that yourself, not even in other words.
</dialogue-tool>`

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

/** Storyboard 채팅 답에서 화면에 넘길 것 — 되묻기 · 실사 그림 요청만(오너 2026-11-27 N3 — 대사는 대사 도구로, Q1). 떨군 글 고치기 수도 센다(답 끝 안내).
 *  떨군 것에 대사가 섞인 샷(droppedDialogueShotIds) · 이야기 · 샷 고침이 섞였나(droppedStory)도 가른다 — 답 끝 안내를 고른다(검토 rev-flow-2-4 낮음 4).
 *  샷 고치기(updateShot)의 대사 칸은 대사, 나머지 칸 · 다른 고치기(씬 · 샷 더하기 · 지우기)는 이야기 · 샷이다. */
export function storyboardOnlyUpdates(
  validated: readonly unknown[],
  images: readonly StoryboardImageUpdate[],
): { updates: unknown[]; droppedTextEdits: number; droppedDialogueShotIds: string[]; droppedStory: boolean } {
  const isClarify = (u: unknown) => !!u && typeof u === 'object' && (u as { type?: unknown }).type === 'clarify'
  const clarify = validated.filter(isClarify)
  const dropped = validated.filter((u) => !isClarify(u))
  const droppedDialogueShotIds: string[] = []
  let droppedStory = false
  for (const edit of dropped) {
    const { type, id, patch } = edit as { type?: unknown; id?: unknown; patch?: unknown }
    const keys = type === 'updateShot' && !!patch && typeof patch === 'object' ? Object.keys(patch) : null
    if (keys?.includes('dialogueLines')) droppedDialogueShotIds.push(String(id))
    if (!keys || keys.some((key) => key !== 'dialogueLines')) droppedStory = true
  }
  return { updates: withStoryboardImageUpdates(clarify, images), droppedTextEdits: dropped.length, droppedDialogueShotIds, droppedStory }
}

/** 이번 차례에 대사 도구(edit_project · 대사 자원)로 고친 샷 — 끝 답 JSON 이 같은 샷의 대사 고침을 되풀이해도 "저장하지 않았어요"라고 하지 않는다
 *  (재검토 71db3c21 낮음 — "저장 확인"과 어긋났다). 그 샷의 결과(저장 · 승인 대기 · 실패)는 화면의 실행 결과가 따로 알린다. 대사 자원 id = Writer 샷 id. */
export function dialogueToolTargets(toolMessages: unknown): Set<string> {
  const targets = new Set<string>()
  if (!Array.isArray(toolMessages)) return targets
  for (const message of toolMessages as Array<{ role?: unknown; content?: unknown }>) {
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue
    for (const block of message.content as Array<{ type?: unknown; name?: unknown; input?: { resource?: unknown; id?: unknown } }>) {
      if (block?.type === 'tool_use' && block.name === 'edit_project' && block.input?.resource === 'dialogue' && typeof block.input.id === 'string') targets.add(block.input.id)
    }
  }
  return targets
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
