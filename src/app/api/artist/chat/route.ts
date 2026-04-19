import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const ARTIST_SYSTEM = `You are the Concept Artist assistant in an AI video production pipeline called "The Visual Studio."

<role>
Help users curate character reference sheets and location backgrounds. You can both discuss ideas AND directly trigger image regeneration.
</role>

<rules>
- Advise on character appearance, outfit, silhouette, and location mood
- When the user asks to "redraw" / "regenerate" / "다시 그려" a character view or a location background, emit an updates[] block
- Match the user's language (Korean/English)
- Be concise and practical — focus on what can be VISUALIZED
</rules>

<updates_format>
Supported operations:
1. Regenerate character (all views or a subset):
   {"type": "regenerateCharacter", "characterId": "char_kai", "views": ["front"]}
   Views must be a subset of: "front", "side", "back", "threeQuarterLeft", "threeQuarterRight".
   Omit "views" to regenerate the full 5-view sheet.

2. Regenerate world background (wide + establishing shots):
   {"type": "regenerateWorldAsset", "locationId": "loc_alley"}

Format:
\`\`\`json
{"updates": [{"type": "regenerateCharacter", "characterId": "char_kai", "views": ["side"]}]}
\`\`\`

Rules:
- Only emit updates when the user explicitly asks for a regeneration.
- For general discussion, omit the JSON block entirely.
- Use exact characterId/locationId from the provided context.
- The JSON block must be the LAST thing in your response.
</updates_format>

<examples>
<example>
<user>[Context: characterAssets includes char_kai]
카이 옆모습만 다시 그려줘</user>
<assistant>카이의 옆모습을 새로 생성합니다. 정면과 뒷모습은 유지돼요.

\`\`\`json
{"updates": [{"type": "regenerateCharacter", "characterId": "char_kai", "views": ["side"]}]}
\`\`\`</assistant>
</example>
<example>
<user>[Context: worldAssets includes loc_alley]
골목 배경 다시 뽑아줘</user>
<assistant>loc_alley 배경을 다시 생성합니다.

\`\`\`json
{"updates": [{"type": "regenerateWorldAsset", "locationId": "loc_alley"}]}
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

const VALID_VIEWS = new Set([
  'front',
  'side',
  'back',
  'threeQuarterLeft',
  'threeQuarterRight',
])

type ArtistUpdate =
  | { type: 'regenerateCharacter'; characterId: string; views?: string[] }
  | { type: 'regenerateWorldAsset'; locationId: string }

function parseUpdates(
  text: string,
): { reply: string; updates: ArtistUpdate[] } {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)

  if (!jsonMatch) {
    return { reply: text, updates: [] }
  }

  const reply = text.slice(0, jsonMatch.index).trim()
  try {
    const parsed = JSON.parse(jsonMatch[1])
    const raw = Array.isArray(parsed.updates) ? parsed.updates : []

    const updates: ArtistUpdate[] = []
    for (const u of raw) {
      if (!u || typeof u !== 'object') continue
      if (
        u.type === 'regenerateCharacter' &&
        typeof u.characterId === 'string'
      ) {
        let views: string[] | undefined
        if (Array.isArray(u.views)) {
          const filtered = u.views.filter(
            (v: unknown): v is string =>
              typeof v === 'string' && VALID_VIEWS.has(v),
          )
          views = filtered.length > 0 ? filtered : undefined
        }
        updates.push({
          type: 'regenerateCharacter',
          characterId: u.characterId,
          ...(views ? { views } : {}),
        })
      } else if (
        u.type === 'regenerateWorldAsset' &&
        typeof u.locationId === 'string'
      ) {
        updates.push({
          type: 'regenerateWorldAsset',
          locationId: u.locationId,
        })
      }
    }

    return { reply, updates }
  } catch {
    return { reply: text, updates: [] }
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, characterContext, locationContext } =
      await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    const contextParts: string[] = []
    if (characterContext) {
      contextParts.push(
        `[Characters]\n${JSON.stringify(characterContext, null, 2)}`,
      )
    }
    if (locationContext) {
      contextParts.push(
        `[Locations]\n${JSON.stringify(locationContext, null, 2)}`,
      )
    }
    const contextPrefix = contextParts.length
      ? contextParts.join('\n\n') + '\n\n'
      : ''

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) =>
      /^\[P[1-5]\]/.test(m.content),
    )
      ? `\n\nThe user is currently in the Artist (P3) stage. Prior messages from other stages are prefixed with [P1]/[P2]/[P3]/[P4]/[P5]. Reference them for continuity, but only emit updates[] operations valid for the Artist stage (regenerateCharacter / regenerateWorldAsset).`
      : ''

    const text = await llmChat(
      ARTIST_SYSTEM + crossStageNote,
      normalizedHistory,
      `${contextPrefix}${message}`,
      0.7,
    )

    const { reply, updates } = parseUpdates(text)

    return NextResponse.json({ reply, updates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
