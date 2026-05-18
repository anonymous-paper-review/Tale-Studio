import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

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

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) =>
      /^\[P[1-5]\]/.test(m.content),
    )
      ? `\n\nThe user is currently in the Director (P4) stage. Prior messages from other stages are prefixed with [P1]/[P2]/[P3]/[P4]/[P5]. Reference them for continuity, but only emit suggestedCamera / suggestedLighting for the currently selected shot.`
      : ''

    const text = await llmChat(
      DIRECTOR_SYSTEM + crossStageNote,
      normalizedHistory,
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
