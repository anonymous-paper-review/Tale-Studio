// Artist 카드 스튜디오 채팅 에이전트 (카드 모델, 2026-06-06 재작성)
//
// 옛 L0 노드그래프(Actor/World/Status) 프롬프트를 폐기하고, 현재의 카드형 Artist
// (Characters / World 탭)에 맞춘 카드 액션 모델로 재정의했다. 채팅으로 새 캐릭터를
// 만들거나(createCharacter) 기존 에셋 이미지를 재생성(regenerateCharacter /
// regenerateWorldAsset)할 수 있다. 실제 mutation 은 클라이언트(global-chat-store →
// artist-store.applyUpdates)가 수행하고, 이 라우트는 검증된 updates[] 만 반환한다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const ARTIST_SYSTEM = `You are the Concept Artist agent for the Tale L0 Artist studio — a CARD-based studio (no node graph). Users define Characters and World locations as cards. Each character card holds 4 turnaround views (main / back / side-left / side-right) produced by the image pipeline; each world card holds a wide shot + establishing shot.

<role>
You can both discuss concept/art-direction AND directly mutate the studio by emitting an updates[] block.
When the user wants to CREATE a new character, or REGENERATE a character's images or a world's background, plan the actions and emit them.
</role>

<context>
A summary of the current assets (existing characters/worlds with their ids) is provided before the user's message. When referencing an EXISTING asset, use its exact id from that summary. For a NEW character you don't need an id — the studio assigns one.
</context>

<actions>
1. {"type":"createCharacter","name":"...","role":"protagonist"|"antagonist"|"supporting","description":"성격·서사적 배경","appearance":"외형 prose (이미지 생성 프롬프트로 사용)"}
   - role / description / appearance 는 선택. 사용자가 새 캐릭터를 원할 때 사용.
2. {"type":"regenerateCharacter","characterId":"<id>","views":["main","back","sideLeft","sideRight"]}
   - views 선택 (생략 = 4뷰 전체 재생성). context 의 정확한 id 사용.
3. {"type":"regenerateWorldAsset","locationId":"<id>"}
   - context 의 정확한 id 사용.
</actions>

<format>
Emit updates ONLY when the user clearly intends a mutation. For pure discussion/questions, omit the JSON block entirely.
Keep the reply text concise (1-3 sentences), Korean if the user wrote Korean.
The JSON block (if any) MUST be the LAST element in the response.

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<examples>
<example>
<user>Kai라는 캐릭터 만들어줘. 갈색 머리에 검은 롱코트, 주인공이야.</user>
<assistant>Kai를 주인공 캐릭터로 추가했습니다. 카드에서 “Generate All Views”로 이미지를 만들 수 있어요.

\`\`\`json
{"updates":[
  {"type":"createCharacter","name":"Kai","role":"protagonist","description":"주인공","appearance":"갈색 머리, 검은 롱코트, 날카로운 눈매"}
]}
\`\`\`</assistant>
</example>

<example>
<user>char_woman 옆모습 다시 뽑아줘</user>
<assistant>char_woman의 좌/우 측면 뷰를 재생성합니다.

\`\`\`json
{"updates":[
  {"type":"regenerateCharacter","characterId":"char_woman","views":["sideLeft","sideRight"]}
]}
\`\`\`</assistant>
</example>

<example>
<user>이 스토리에 어울리는 조연 한 명 추천해줄래?</user>
<assistant>주인공과 대비되는 냉정한 정보원 캐릭터를 제안합니다. 이름만 정해주시면 카드로 만들어 드릴게요.</assistant>
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

// ── 카드 모델 update 검증 (artist-store ArtistUpdate 와 1:1) ────────────────
const VALID_ROLES = new Set(['protagonist', 'antagonist', 'supporting'])
const VALID_VIEWS = new Set(['main', 'back', 'sideLeft', 'sideRight'])
const VALID_TYPES = new Set([
  'createCharacter',
  'regenerateCharacter',
  'regenerateWorldAsset',
])

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}

function validateUpdates(raw: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue
    const rec = u as Record<string, unknown>
    if (typeof rec.type !== 'string' || !VALID_TYPES.has(rec.type)) continue

    switch (rec.type) {
      case 'createCharacter': {
        const name = asString(rec.name)?.trim()
        if (name) {
          out.push({
            type: 'createCharacter',
            name,
            ...(typeof rec.role === 'string' && VALID_ROLES.has(rec.role)
              ? { role: rec.role }
              : {}),
            ...(asString(rec.description)
              ? { description: rec.description }
              : {}),
            ...(asString(rec.appearance)
              ? { appearance: rec.appearance }
              : {}),
          })
        }
        break
      }
      case 'regenerateCharacter':
        if (asString(rec.characterId)) {
          const views = Array.isArray(rec.views)
            ? rec.views.filter(
                (v): v is string =>
                  typeof v === 'string' && VALID_VIEWS.has(v),
              )
            : []
          out.push({
            type: 'regenerateCharacter',
            characterId: rec.characterId,
            ...(views.length ? { views } : {}),
          })
        }
        break
      case 'regenerateWorldAsset':
        if (asString(rec.locationId)) {
          out.push({
            type: 'regenerateWorldAsset',
            locationId: rec.locationId,
          })
        }
        break
    }
  }
  return out
}

function parseUpdates(text: string): { reply: string; updates: unknown[] } {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)
  if (!jsonMatch) return { reply: text, updates: [] }

  const reply = text.slice(0, jsonMatch.index).trim()
  try {
    const parsed = JSON.parse(jsonMatch[1])
    const raw = Array.isArray(parsed.updates) ? parsed.updates : []
    return { reply, updates: validateUpdates(raw) }
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

    const { message, history, canvasContext } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    const contextPrefix =
      typeof canvasContext === 'string' && canvasContext.trim()
        ? `${canvasContext}\n\n---\n\n`
        : ''

    const normalizedHistory = normalizeHistory(history)

    const text = await llmChat(
      ARTIST_SYSTEM,
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
