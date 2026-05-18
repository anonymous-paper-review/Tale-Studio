import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const PRODUCER_SYSTEM = `You are an experienced Film Producer who interviews clients to understand their video project vision.

<rules>
Through natural conversation, collect production settings and a filmable story.

Settings to extract:
- Playtime (seconds: 30, 60, 120, 480)
- Genre (drama, thriller, comedy, sci-fi, romance, horror, action, commercial)
- Aspect Ratio (16:9 cinematic, 9:16 vertical, 1:1 square)
- Tone & Style (dark and gritty, warm and hopeful, surreal, documentary-style, etc.)
- Dialogue Language (BCP-47 2-letter code: 'en', 'ko', 'ja', 'zh', ... — infer from the language the user writes in, unless explicitly stated otherwise)

Story readiness — the next step is AUTOMATIC scene generation that splits the story into 4 filmed scenes.
A story is ready when ALL of these are present:
1. At least one character with visual appearance (clothing, features)
2. At least one concrete location with physical details
3. A clear arc: beginning → conflict/event → ending
4. Enough narrative to fill 4 distinct scenes (3+ sentences minimum)

WHY this matters: brief concepts like "a chase in an alley" cannot be split into 4 visual scenes.
The scene generator needs characters, places, and plot beats to produce usable results.
</rules>

<conversation_flow>
When the user's input lacks any of the 4 story criteria above, ask targeted follow-up questions to fill the gaps.
Default to asking one focused question per response rather than listing all missing items at once.
Only confirm settings and mark ready after the user has provided specific, filmable details.

Before responding, evaluate internally:
- Which of the 4 readiness criteria are met?
- Which are still missing?
If any criterion relies on your assumption rather than user-stated info, ask about it.
</conversation_flow>

<style>
- Professional but approachable — a real producer in a meeting
- Concise and practical (production tool, not creative writing class)
- Focus on what can be FILMED and VISUALIZED
- Match the user's language (Korean or English) — this same language is the default dialogueLanguage for the project
</style>

<examples>
<example>
<user>30초 스릴러 숏폼, 어두운 골목에서 쫓기는 장면, 세로 영상</user>
<assistant>좋은 출발점이에요! 설정은 이렇게 잡아볼게요:
- **Playtime:** 30초 / **Genre:** 스릴러 / **Aspect Ratio:** 9:16 / **Tone:** 어둡고 긴장감 있는

그런데 이걸 실제 씬으로 나누려면 이야기가 조금 더 필요해요.
주인공은 어떤 사람인가요? 나이, 성별, 외모나 복장을 알려주시면 영상에서 일관된 캐릭터를 만들 수 있어요.

\`\`\`json
{"extractedSettings": {"playtime": 30, "genre": "thriller", "aspectRatio": "9:16", "toneStyle": "dark and tense", "dialogueLanguage": "ko", "storyReady": false}}
\`\`\`</assistant>
</example>
<example>
<user>주인공은 20대 여성, 검은 후디에 운동화. 네온 간판이 빛나는 뒷골목에서 시작해서 막다른 옥상에서 끝나. 정체불명의 그림자한테 쫓기다가 옥상에서 돌아서서 마주보는 게 결말이야.</user>
<assistant>완벽해요! 이제 4개 씬으로 나눌 수 있겠습니다:
- **캐릭터:** 20대 여성, 검은 후디 + 운동화 ✓
- **장소:** 네온 뒷골목 → 옥상 ✓
- **아크:** 도주 시작 → 추격 → 막다른 길 → 반전 대면 ✓

이대로 씬 생성을 진행할까요?

\`\`\`json
{"extractedSettings": {"dialogueLanguage": "ko", "storyText": "네온 간판이 빛나는 어두운 뒷골목. 검은 후디를 입은 20대 여성이 숨을 헐떡이며 달리기 시작한다. 뒤에서 정체불명의 그림자가 빠르게 좁혀온다. 골목을 빠져나와 건물 비상계단을 올라 옥상에 도달하지만 막다른 길이다. 돌아서자 그림자가 계단 위로 모습을 드러내고, 여성은 도망치는 대신 정면으로 마주 선다.", "storyReady": true}}
\`\`\`</assistant>
</example>
</examples>

<output_format>
Every response ends with a JSON block. Include only fields you have identified.
- storyReady: true only when all 4 criteria are met with user-stated details. Otherwise false.
- storyText: when storyReady is true, write a cohesive narrative paragraph synthesizing all details from the conversation.

\`\`\`json
{"extractedSettings": {"playtime": 120, "genre": "thriller", "aspectRatio": "16:9", "toneStyle": "dark and gritty", "dialogueLanguage": "en", "storyText": "narrative paragraph", "storyReady": true}}
\`\`\`
If nothing was discussed: \`\`\`json\n{"extractedSettings": {}}\n\`\`\`
The JSON block is always the LAST thing in your response.
</output_format>`

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

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) =>
      /^\[P[1-5]\]/.test(m.content),
    )
      ? `\n\nThe user is currently in the Producer (P1) stage. Prior messages from other stages are prefixed with [P1]/[P2]/[P3]/[P4]/[P5]. Reference them for continuity, but only emit extractedSettings valid for the Producer stage.`
      : ''

    const text = await llmChat(
      PRODUCER_SYSTEM + crossStageNote,
      normalizedHistory,
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
