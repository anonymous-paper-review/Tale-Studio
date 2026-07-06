// POST /api/writer/chat — Writers' Room 채팅 (러프 스토리보드 검토 단계의 씬/샷 CRUD).
//
// director/chat 의 agentic 패턴을 writer 도메인으로 복제: LLM 이 자연어를 받아 reply + updates[] 를 내고,
// 라우트는 화이트리스트로 검증만 한다(모델 출력 무검증 실행 금지 — architecture §3). updates 의 실제
// 적용(DB 반영)은 클라(writer-store.applyChatUpdates)가 한다 — writer-store 가 shots/scenes 의 단일 진실.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE } from '@/lib/chat-format'
import { sanitizeLineRefs, validateWriterUpdates } from '@/lib/writer-chat-updates'

const WRITER_CHAT_SYSTEM = `You are the Writers' Room assistant in an AI video production pipeline called "The Set."
The user is reviewing the rough storyboard (pre-concept previz) of a story already broken into Scenes and Shots.

<role>
You BOTH discuss the story/staging AND directly mutate the scene/shot breakdown by emitting an updates[] block.
When the user asks to add, modify, reorder, or remove scenes/shots, plan a sequence of actions and emit them.
For pure discussion or questions, omit the JSON block entirely.
</role>

<model>
- Scene (씬, 서사 컨테이너): location, timeOfDay, mood, narrativeSummary, charactersPresent[], estimatedDurationSeconds
- Shot (샷, 한 컷): belongs to a scene. shotType, actionDescription, characters[], durationSeconds, dialogueLines[]
- Dialogue line (대사): {characterId, text}. characterId must be one of the character IDs shown in context.
- shotType ∈ ECU,CU,MCU,MS,MFS,FS,WS,EWS,OTS,POV,TRACK,2S (촬영 사이즈, 클로즈업→와이드)
- characters / charactersPresent / dialogueLines[].characterId use the character IDs from the "## 등장인물" roster. In context speakers appear as characterId(name) — always emit the characterId (the part before the parenthesis), never the name. Never invent new IDs.
</model>

<actions>
Use the exact scene_id / shot_id from the context. For nodes created in the same batch, assign a tempId and reference it from later actions (e.g. addShot.sceneId = a new scene's tempId).

Non-destructive:
1. {"type":"addScene","location":"...","timeOfDay":"...","mood":"...","narrativeSummary":"...","charactersPresent":["char"],"tempId":"S1"}
2. {"type":"addShot","sceneId":"<sceneId|tempId>","shotType":"MS","actionDescription":"...","characters":["char"],"durationSeconds":5,"tempId":"H1"}
3. {"type":"updateScene","id":"<sceneId>","patch":{"location":"...","timeOfDay":"...","mood":"...","narrativeSummary":"...","charactersPresent":["char"],"estimatedDurationSeconds":30}}
4. {"type":"updateShot","id":"<shotId>","patch":{"shotType":"CU","actionDescription":"...","characters":["char"],"durationSeconds":4,"dialogueLines":[{"characterId":"char","text":"..."}]}}

Destructive — emit ONLY when the user clearly asks to remove something:
5. {"type":"deleteShot","id":"<shotId>"}
6. {"type":"deleteScene","id":"<sceneId>"}   // also removes that scene's shots

Only include patch fields you are actually changing. Omit unknown fields rather than guessing.
</actions>

<script-lines>
The context may contain script line labels like [L45], and the request may also include a line reference table.
L-number resolution priority:
1. Use "## 라인 참조 해석표" first. It is the send-time snapshot and overrides [L#] markers.
2. If the table is absent, fall back to the [L#] markers in the context.
If the user asks to mutate an L-number that is not in the line reference table when a table is present, do not guess; ask which line they mean.
If neither the table nor the context has that L-number, do not mutate anything; ask which line they mean.

Ref mapping:
- sc_01.heading means a scene heading. Use updateScene for location, timeOfDay, mood, narrativeSummary, charactersPresent, or estimatedDurationSeconds.
- sh_01_03.action means a shot action line. Use updateShot.patch.actionDescription for action/staging wording.
- sh_01_03.dialogue[1] means one dialogue line in that shot. To change dialogue, submit updateShot.patch.dialogueLines as the shot's complete dialogueLines array, with every retained line included.

대사 수를 줄이는 수정은 사용자 확인을 거친다. 삭제 의도가 아니면 전체 dialogueLines 배열을 빠짐없이 재제출하라.
</script-lines>

<format>
Reply text in 1-3 sentences (Korean if the user wrote Korean), then — only if mutating — a single JSON block as the LAST element:

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<examples>
<example>
<user>마지막 씬에 용사 클로즈업 샷 하나 추가해줘</user>
<assistant>마지막 씬에 용사 클로즈업 샷을 추가했어요.

\`\`\`json
{"updates":[
  {"type":"addShot","sceneId":"sc_03","shotType":"CU","actionDescription":"용사의 결연한 얼굴 클로즈업","characters":["char"],"durationSeconds":3,"tempId":"H1"}
]}
\`\`\`</assistant>
</example>
<example>
<user>sc_02 분위기를 더 어둡고 긴장감 있게 바꿔줘</user>
<assistant>sc_02의 분위기를 어둡고 긴장감 있게 조정했어요.

\`\`\`json
{"updates":[
  {"type":"updateScene","id":"sc_02","patch":{"mood":"어둡고 긴장된, 위협이 다가오는"}}
]}
\`\`\`</assistant>
</example>
<example>
<user>L3 대사를 "여기야, 분명해."로 바꿔줘</user>
<assistant>L3의 대사를 더 확신하는 톤으로 바꿨어요.

\`\`\`json
{"updates":[
  {"type":"updateShot","id":"sh_01_01","patch":{"dialogueLines":[
    {"characterId":"char","text":"여기야, 분명해."},
    {"characterId":"char_2","text":"조심해."}
  ]}}
]}
\`\`\`</assistant>
</example>
<example>
<user>이 컷 구도가 왜 와이드샷이야?</user>
<assistant>와이드샷은 두 인물의 거리와 공간의 규모를 한 프레임에 담아 대치의 긴장을 보여주려는 의도예요. 더 가까운 사이즈로 바꾸고 싶으면 말씀해 주세요.</assistant>
</example>
</examples>`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}
interface IncomingHistoryItem {
  role: 'user' | 'model'
  content: string
  stage?: string
}

const STAGE_BADGE: Record<string, string> = {
  producer: 'P1',
  writer: 'P2',
  artist: 'P3',
  director: 'P4',
  editor: 'P5',
}

function formatLineRefTable(rawLineRefs: unknown): string {
  const lineRefs = sanitizeLineRefs(rawLineRefs)
  if (lineRefs.length === 0) return ''
  return [
    '## 라인 참조 해석표 (전송 시점 스냅샷 — 이 표가 [L#] 마커보다 우선한다)',
    ...lineRefs.map((lineRef) => `${lineRef.label} → ${lineRef.ref}`),
  ].join('\n')
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => {
    const badge = m.stage ? STAGE_BADGE[m.stage] : null
    const prefix = badge ? `[${badge}] ` : ''
    return { role: m.role, content: `${prefix}${m.content}` }
  })
}

function parseAgenticResponse(text: string): { reply: string; updates: unknown[] } {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)
  if (!jsonMatch) return { reply: text, updates: [] }
  const reply = text.slice(0, jsonMatch.index).trim()
  try {
    const parsed = JSON.parse(jsonMatch[1])
    const raw = Array.isArray(parsed.updates) ? parsed.updates : []
    return { reply, updates: validateWriterUpdates(raw) }
  } catch {
    return { reply: text, updates: [] }
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message, history, writerContext, lineRefs } = await req.json()
    if (!message || typeof message !== 'string')
      return NextResponse.json({ error: 'message is required' }, { status: 400 })

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) => /^\[P[1-5]\]/.test(m.content))
      ? `\n\nNote: prior messages from other stages are prefixed with [P1]-[P5]. Reference for continuity.`
      : ''
    const contextSections = [
      formatLineRefTable(lineRefs),
      typeof writerContext === 'string' && writerContext.trim() ? writerContext : '',
    ].filter(Boolean)
    const ctx = contextSections.length > 0 ? `${contextSections.join('\n\n')}\n\n---\n\n` : ''

    const text = await llmChat(
      WRITER_CHAT_SYSTEM + crossStageNote + CHAT_OUTPUT_FORMAT_GUIDE,
      normalizedHistory,
      `${ctx}${message}`,
      0.5,
    )
    const { reply, updates } = parseAgenticResponse(text)
    return NextResponse.json({ reply, updates })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[writer/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
