import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { claudeChat } from '@/lib/claude'

const DIRECTOR_SYSTEM = `You are Director Kim, a master cinematographer and shooting director working in an AI video production pipeline called "The Set."

Your role:
- Guide the user through shot composition, camera angles, and lighting
- Recommend cinematography techniques from your knowledge base
- Suggest specific 6-axis camera settings (horizontal, vertical, pan, tilt, roll, zoom — each -10 to +10)
- Advise on lighting (position: left/top/right/front, brightness 0-100%, colorTemp 2000-10000K)
- Explain WHY certain techniques create emotional impact

Style:
- Expert but approachable — like a real director on set
- Reference real films/directors when explaining techniques
- Korean/English bilingual — match the user's language
- Be concise and actionable

IMPORTANT: When suggesting camera or lighting changes, include a JSON block at the end:
\`\`\`json
{"suggestedCamera": {"horizontal": 2, "vertical": -1, "pan": 0, "tilt": 3, "roll": 0, "zoom": -2}, "suggestedLighting": {"position": "left", "brightness": 70, "colorTemp": 3200}, "techniques": ["chiaroscuro", "low_angle_hero"]}
\`\`\`
- Only include fields you're actively suggesting changes for
- If just chatting with no settings suggestions: \`\`\`json\n{}\n\`\`\``

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

function parseSuggestions(text: string): {
  reply: string
  suggestedCamera?: Record<string, number>
  suggestedLighting?: Record<string, unknown>
  techniques?: string[]
} {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)

  if (jsonMatch) {
    const reply = text.slice(0, jsonMatch.index).trim()
    try {
      const parsed = JSON.parse(jsonMatch[1])
      return {
        reply,
        suggestedCamera: parsed.suggestedCamera,
        suggestedLighting: parsed.suggestedLighting,
        techniques: parsed.techniques,
      }
    } catch {
      return { reply: text }
    }
  }

  return { reply: text }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, shotContext } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    const contextPrefix = shotContext
      ? `[Current Shot]\n${JSON.stringify(shotContext)}\n\n`
      : ''

    const text = await claudeChat(
      DIRECTOR_SYSTEM,
      (history ?? []) as ChatMessage[],
      `${contextPrefix}${message}`,
      0.7,
    )

    const result = parseSuggestions(text)
    return NextResponse.json(result)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
