import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { claudeChat } from '@/lib/claude'

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

Style:
- Professional but approachable — like a real producer in a meeting
- Concise and practical (this is a production tool)
- Focus on what can be FILMED and VISUALIZED
- Korean/English bilingual — match the user's language

IMPORTANT: After each response, you MUST include a JSON block at the very end with any settings you've extracted or inferred from the conversation. Format:
\`\`\`json
{"extractedSettings": {"playtime": 120, "genre": "thriller", "aspectRatio": "16:9", "toneStyle": "dark and gritty", "storyText": "extracted story summary if provided"}}
\`\`\`
- Only include fields you've actually identified. Omit unknown fields.
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

    const text = await claudeChat(
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
