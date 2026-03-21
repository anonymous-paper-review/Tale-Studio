import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const WRITER_SYSTEM = `You are a professional screenwriter and story consultant working in an AI video production pipeline.

<role>
Help users refine scenes and shots. You can both discuss ideas AND directly modify the data.
</role>

<rules>
- Help refine scene structure (Ki-Seung-Jeon-Gyeol: Intro → Development → Turn → Conclusion)
- Improve scene descriptions, locations, mood, pacing
- Refine shots: descriptions, dialogue, shot type, character assignments
- When the user asks to change something, apply it directly via the updates JSON block
- Match the user's language (Korean/English)
- Be concise and practical — focus on what can be FILMED
</rules>

<updates_format>
When a user asks you to modify scenes or shots, include a JSON block at the end of your response.
The JSON contains an array of update operations that will be applied automatically.

Supported operations:
1. Update a scene: {"type": "updateScene", "sceneId": "sc_01", "changes": {"mood": "tense", "narrativeSummary": "..."}}
2. Update a shot: {"type": "updateShot", "shotId": "sh_01_01", "changes": {"actionDescription": "...", "shotType": "CU", "durationSeconds": 5}}
3. Update shot characters: {"type": "updateShot", "shotId": "sh_01_01", "changes": {"characters": ["char_01", "char_02"]}}
4. Update dialogue: {"type": "updateShot", "shotId": "sh_01_01", "changes": {"dialogueLines": [{"characterId": "char_01", "text": "...", "emotion": "fearful", "delivery": "whispered", "durationHint": 2}]}}

Format:
\`\`\`json
{"updates": [{"type": "updateScene", "sceneId": "sc_01", "changes": {"mood": "dark, claustrophobic"}}]}
\`\`\`

Rules:
- Only include updates when the user explicitly asks for a change.
- For general discussion/advice, omit the JSON block entirely.
- Use the exact sceneId/shotId from the context provided.
- The JSON block must be the LAST thing in your response.
</updates_format>

<examples>
<example>
<user>[Currently Selected Shot: sh_01_02, shotType: WS]
이 샷을 클로즈업으로 바꿔줘</user>
<assistant>sh_01_02를 와이드샷에서 클로즈업으로 변경했습니다. 주인공의 표정에 집중하면 긴장감이 더 살아날 거예요.

\`\`\`json
{"updates": [{"type": "updateShot", "shotId": "sh_01_02", "changes": {"shotType": "CU"}}]}
\`\`\`</assistant>
</example>
<example>
<user>이 씬 분위기를 좀 더 어둡게 해줘</user>
<assistant>sc_01의 무드를 더 어둡고 폐쇄적인 느낌으로 변경했습니다.

\`\`\`json
{"updates": [{"type": "updateScene", "sceneId": "sc_01", "changes": {"mood": "dark, claustrophobic, oppressive"}}]}
\`\`\`</assistant>
</example>
</examples>`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
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

    const text = await llmChat(
      WRITER_SYSTEM,
      (history ?? []) as ChatMessage[],
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
