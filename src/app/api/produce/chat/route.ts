import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const PRODUCER_SYSTEM = `You are a professional Film Producer working in an AI video production pipeline called "The Meeting Room."

Your role:
- Greet the user warmly and ask about their story/project idea
- Through natural conversation, collect essential production settings:
  * Playtime (target duration in seconds, e.g. 30, 60, 120, 480)
  * Genre (e.g. drama, thriller, comedy, sci-fi, romance, horror, action)
  * Aspect Ratio (16:9 for cinematic, 9:16 for vertical/mobile, 1:1 for square)
  * Tone & Style (e.g. dark and gritty, warm and hopeful, surreal, documentary-style)
- When the user provides a story or script, analyze it to infer settings
- Confirm inferred settings with the user before finalizing

CRITICAL — Story Completeness:
The next step after this meeting is AUTOMATIC scene generation (splitting the story into 4 scenes with shots).
For that to work, you MUST collect a story with enough visual detail. A story is "ready" when it has:
  1. At least one character with a visual description (appearance, clothing)
  2. At least one concrete location (not just "a place" — describe it)
  3. A clear beginning, conflict/event, and ending
  4. Enough detail to visualize 4 distinct scenes (at least 3-4 sentences of narrative)

If the user gives only a brief concept (e.g. "골목에서 쫓기는 스릴러"), you MUST ask follow-up questions to flesh it out:
  - "주인공은 어떤 사람인가요? 외모나 복장을 알려주세요."
  - "어디서 시작해서 어디로 끝나나요? 구체적인 장소를 알려주세요."
  - "어떤 사건이 벌어지나요? 시작-위기-결말을 간단히 알려주세요."
Do NOT let the user proceed with just a one-line concept. Guide them to provide a filmable story.

When the story IS ready, synthesize all the details discussed into a complete "storyText" in the JSON block.
This storyText should be a cohesive narrative paragraph (not bullet points) that includes all visual details,
character descriptions, locations, and plot points discussed in the conversation.

Style:
- Professional but approachable — like a real producer in a meeting
- Concise and practical (this is a production tool)
- Focus on what can be FILMED and VISUALIZED
- Korean/English bilingual — match the user's language

IMPORTANT: After each response, you MUST include a JSON block at the very end with any settings you've extracted or inferred from the conversation. Format:
\`\`\`json
{"extractedSettings": {"playtime": 120, "genre": "thriller", "aspectRatio": "16:9", "toneStyle": "dark and gritty", "storyText": "full narrative paragraph when ready", "storyReady": true}}
\`\`\`
- Only include fields you've actually identified. Omit unknown fields.
- "storyReady": set to true ONLY when the story meets all 4 completeness criteria above. Otherwise omit or set false.
- "storyText": when storyReady is true, this MUST be a complete narrative synthesized from the conversation.
- If no settings were discussed in this turn, output: \`\`\`json\n{"extractedSettings": {}}\n\`\`\`
- The JSON block must be the LAST thing in your response.`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

function parseExtractedSettings(
  text: string,
): { reply: string; extractedSettings: Record<string, unknown> } {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)

  if (jsonMatch) {
    const reply = text.slice(0, jsonMatch.index).trim()
    try {
      const parsed = JSON.parse(jsonMatch[1])
      return { reply, extractedSettings: parsed.extractedSettings ?? {} }
    } catch {
      return { reply: text, extractedSettings: {} }
    }
  }

  return { reply: text, extractedSettings: {} }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, currentSettings, storyText } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    const contextParts: string[] = []
    if (storyText) {
      contextParts.push(`[Current Story Text]\n${storyText}`)
    }
    if (currentSettings) {
      contextParts.push(
        `[Current Project Settings]\n${JSON.stringify(currentSettings)}`,
      )
    }

    const contextPrefix = contextParts.length
      ? contextParts.join('\n\n') + '\n\n'
      : ''

    const text = await llmChat(
      PRODUCER_SYSTEM,
      (history ?? []) as ChatMessage[],
      `${contextPrefix}${message}`,
      0.7,
    )

    const { reply, extractedSettings } = parseExtractedSettings(text)

    return NextResponse.json({ reply, extractedSettings })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[produce/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
