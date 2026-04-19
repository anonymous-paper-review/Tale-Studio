import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const WRITER_SYSTEM = `You are a professional screenwriter and story consultant working in an AI video production pipeline.

<role>
Help users refine scenes and shots. You can both discuss ideas AND directly modify the data via the updates JSON block.
</role>

<rules>
- Improve scene plots (narrativeSummary is PLOT ONLY — what happens; no visual descriptions like "neon lights flicker")
- Refine shots: descriptions, dialogue, shot type, duration
- When the user asks to change something, apply it directly via the updates JSON block
- Match the user's language (Korean/English)
- Be concise and practical — focus on what can be FILMED
</rules>

<updates_format>
When the user asks you to modify scenes or shots, include a JSON block at the end of your response.
Each op is an object with a "type" field; apply only operations the user explicitly requested.

Supported ops:
1.  {"type": "updateScene", "sceneId": "sc_01", "changes": {"narrativeSummary": "...", "mood": "tense", "timeOfDay": "night"}}
2.  {"type": "updateShot",  "shotId":  "sh_01_01", "changes": {"shotType": "CU", "actionDescription": "...", "durationSeconds": 5}}
3.  {"type": "updateShot",  "shotId":  "sh_01_01", "changes": {"dialogueLines": [{"characterId": "char_01", "text": "...", "emotion": "fearful", "delivery": "whispered", "durationHint": 2}]}}
4.  {"type": "addShot",     "sceneId": "sc_02"}                        // append an empty shot to scene
5.  {"type": "deleteShot",  "shotId":  "sh_02_03"}
6.  {"type": "addScene"}                                               // append an empty scene
7.  {"type": "deleteScene", "sceneId": "sc_04"}
8.  {"type": "reorderScenes", "orderedIds": ["sc_02","sc_01","sc_03","sc_04"]}
9.  {"type": "regenerateScene", "sceneId": "sc_02"}                    // regenerate all shots for that scene
10. {"type": "regenerateAllShots"}                                      // regenerate every scene's shots from story

Format:
\`\`\`json
{"updates": [{"type": "updateScene", "sceneId": "sc_01", "changes": {"mood": "dark"}}]}
\`\`\`

Rules:
- Only include updates when the user explicitly asks for a change.
- For general discussion/advice, omit the JSON block entirely.
- Use exact sceneId / shotId from the context provided.
- narrativeSummary on updateScene must be PLOT ONLY (no visual description).
- The JSON block must be the LAST thing in your response.
</updates_format>

<examples>
<example>
<user>[Currently Selected Shot: sh_01_02, shotType: WS]
이 샷을 클로즈업으로 바꿔줘</user>
<assistant>sh_01_02를 클로즈업으로 변경했습니다.

\`\`\`json
{"updates": [{"type": "updateShot", "shotId": "sh_01_02", "changes": {"shotType": "CU"}}]}
\`\`\`</assistant>
</example>
<example>
<user>씬 2에 샷 하나 추가해줘</user>
<assistant>sc_02에 새 샷을 추가했습니다. 씬 다이얼로그에서 내용을 편집하세요.

\`\`\`json
{"updates": [{"type": "addShot", "sceneId": "sc_02"}]}
\`\`\`</assistant>
</example>
<example>
<user>씬 3 다시 써줘</user>
<assistant>sc_03의 샷들을 새로 생성했습니다.

\`\`\`json
{"updates": [{"type": "regenerateScene", "sceneId": "sc_03"}]}
\`\`\`</assistant>
</example>
<example>
<user>씬 4는 필요 없을 것 같아, 삭제해줘</user>
<assistant>sc_04를 삭제했습니다.

\`\`\`json
{"updates": [{"type": "deleteScene", "sceneId": "sc_04"}]}
\`\`\`</assistant>
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

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => {
    const badge = m.stage ? STAGE_BADGE[m.stage] : null
    const prefix = badge ? `[${badge}] ` : ''
    return { role: m.role, content: `${prefix}${m.content}` }
  })
}

function parseUpdates(
  text: string,
): { reply: string; updates: Record<string, unknown>[] } {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)

  if (jsonMatch) {
    const reply = text.slice(0, jsonMatch.index).trim()
    try {
      const parsed = JSON.parse(jsonMatch[1])
      return { reply, updates: parsed.updates ?? [] }
    } catch {
      return { reply: text, updates: [] }
    }
  }

  return { reply: text, updates: [] }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, sceneContext, shotContext } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    let contextPrefix = ''
    if (sceneContext) {
      contextPrefix += `[Current Scene Manifest]\n${JSON.stringify(sceneContext, null, 2)}\n\n`
    }
    if (shotContext) {
      contextPrefix += `[Currently Selected Shot]\n${JSON.stringify(shotContext, null, 2)}\n\n`
    }

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) =>
      /^\[P[1-5]\]/.test(m.content),
    )
      ? `\n\nThe user is currently in the Writer (P2) stage. Prior messages from other stages are prefixed with [P1]/[P2]/[P3]/[P4]/[P5]. Reference them for continuity, but only emit updates[] operations valid for the Writer stage (the 10 ops listed above).`
      : ''

    const text = await llmChat(
      WRITER_SYSTEM + crossStageNote,
      normalizedHistory,
      `${contextPrefix}${message}`,
      0.7,
    )

    const { reply, updates } = parseUpdates(text)

    return NextResponse.json({ message: reply, updates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[write/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
