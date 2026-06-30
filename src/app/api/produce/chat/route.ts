import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'
import { PRODUCER_SYSTEM } from './system-prompt'
import { parseExtractedSettings } from '@/lib/parse-extracted-settings'

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


export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, currentSettings, currentCast, currentBackgrounds, storyText, gate } = await req.json()

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
    if (Array.isArray(currentCast) && currentCast.length > 0) {
      // 캐스트 카드를 LLM 에 노출 — 이게 없으면 LLM 이 기존 인물/사물을 못 보고
      //   "캐릭터가 없다"고 환각하거나 같은 카드를 중복 제안한다.
      const castSummary = (currentCast as Array<Record<string, unknown>>).map((m) => ({
        name: m.name,
        entityType: m.entityType,
        appearance: m.appearance,
        role: m.role,
        arc: m.arc,
        motivation: m.motivation,
      }))
      contextParts.push(
        `[Current Cast Cards]\n${JSON.stringify(castSummary)}`,
      )
    }
    if (currentBackgrounds) {
      contextParts.push(
        `[Current Background Cards]\n${JSON.stringify(currentBackgrounds)}`,
      )
    }
    // 핸드오프 가부의 단일 판정자 = 코드 게이트. LLM 이 자기 기준으로 "준비 완료"를 선언하지 않도록
    //   실제 게이트 상태(남은 하드 항목)를 명시 주입한다.
    if (gate && typeof gate === 'object') {
      const g = gate as { canHandoff?: boolean; hardMissing?: string[]; softMissing?: string[] }
      const hard = Array.isArray(g.hardMissing) ? g.hardMissing : []
      const soft = Array.isArray(g.softMissing) ? g.softMissing : []
      const lines = [
        `canHandoff: ${g.canHandoff === true}`,
        hard.length ? `남은 필수 항목(hard, 핸드오프 차단): ${hard.join(' / ')}` : '남은 필수 항목: 없음',
        soft.length ? `권장 항목(soft, 차단 안 함): ${soft.join(' / ')}` : null,
      ].filter(Boolean)
      contextParts.push(`[Handoff Gate Status]\n${lines.join('\n')}`)
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
