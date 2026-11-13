// POST /api/editor/chat — Editor 의 Lumi 조언 채팅(오너 2026-11-14 10번 "Editor에서는 Lumi 기능 안 되게 해줘. 대신 채팅으로 조언을 얻을 수 있게
//   (작업물에는 터치 못 하게) 해줘."). 글만 돌려준다 — 바꾸는 도구를 모델에 넘기지 않고, 모델이 바꾸는 내용(JSON)을 내도 싣지 않는다.
//   타임라인 요약은 화면이 읽기만 해서 보낸다(lib/editor/chat-context). 약속: tests/chat/editor-advice-route.test.ts
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE, resolveChatLocale, responseLanguageDirective } from '@/lib/chat-format'
import { parseAppLocale, type AppLocale } from '@/lib/locale'
import { userOwnsProject } from '@/lib/generation-jobs'
import { buildChatTrace, createChatTraceId, type ChatLlmUsage } from '@/lib/chat-trace'
import { persistChatTraceBestEffort } from '@/lib/chat-trace-server'

const EDITOR_ADVICE_SYSTEM = `You are Lumi, the editing assistant in Tale Studio's Editor — a timeline where the user cuts and arranges the finished shot videos, adds title cards, subtitles, transitions and audio, and exports the film.

<role>
You give advice only. You cannot change the timeline, clips, audio, title cards, subtitles or the export — nothing you write is applied.
- Answer questions about editing: pacing, cut order, which cut feels long, transitions, titles, music and sound.
- When the user asks you to make a change, do not pretend you made it. Say briefly that you can't change it directly, then explain how the user can do it in the Editor, step by step, with the controls named by what they do (for example the cut tool, a clip's right-click menu, dragging a clip's edge, the audio track, the export button).
- Never write that something was changed, moved, deleted, added or exported.
- Never output JSON, code blocks or action lists for an app to run.
- Use the timeline summary below to talk about the user's real cuts. Call cuts by their order ("cut 3") and what they show. Never mention internal ids.
</role>`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return history
    .filter((m): m is ChatMessage => !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'model') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }))
}

/** 모델이 실수로 낸 코드 덩어리(바꾸는 내용)는 답에서 뺀다 — 화면에 날 JSON 이 보이지 않게. */
function adviceOnly(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message, history, uiLocale, timelineContext, projectId, traceId: requestedTraceId } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid request: message is required' }, { status: 400 })
    }

    let projectLocale: AppLocale | null = null
    let localeSwitched: AppLocale | null = null
    if (typeof projectId === 'string' && projectId) {
      try {
        if (await userOwnsProject(projectId, user.id)) {
          const resolved = await resolveChatLocale({
            projectId,
            message,
            history,
            uiLocale: parseAppLocale(uiLocale) ?? parseAppLocale(user.user_metadata?.locale),
          })
          projectLocale = resolved.locale
          localeSwitched = resolved.switched
        }
      } catch (err) {
        console.warn('[editor/chat] locale lookup skipped:', err instanceof Error ? err.message : err)
      }
    }

    const normalizedHistory = normalizeHistory(history)
    const traceId = createChatTraceId(requestedTraceId)
    let llmUsage: ChatLlmUsage | null = null
    const systemPrompt = EDITOR_ADVICE_SYSTEM + CHAT_OUTPUT_FORMAT_GUIDE + responseLanguageDirective(projectLocale)
    const context = typeof timelineContext === 'string' && timelineContext.trim() ? timelineContext.trim() : '<editor_timeline>\n(empty)\n</editor_timeline>'
    const userPrompt = `${context}\n\n---\n\n${message}`
    const text = await llmChat(systemPrompt, normalizedHistory, userPrompt, 0.7, `chat:${traceId}`, {
      onUsage: (usage) => {
        llmUsage = usage
      },
    })
    const trace = buildChatTrace({
      traceId,
      stage: 'editor',
      route: 'editor/chat',
      system: systemPrompt,
      history: normalizedHistory,
      contextMessage: userPrompt,
      usage: llmUsage,
      parseStatus: 'text',
    })
    await persistChatTraceBestEffort(projectId, trace)

    return NextResponse.json({ contentLocale: projectLocale, localeSwitched, reply: adviceOnly(text), trace })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
