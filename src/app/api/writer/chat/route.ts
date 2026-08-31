// POST /api/writer/chat — Writers' Room 채팅 (러프 스토리보드 검토 단계의 씬/샷 CRUD).
//
// director/chat 의 agentic 패턴을 writer 도메인으로 복제: LLM 이 자연어를 받아 reply + updates[] 를 내고,
// 라우트는 화이트리스트로 검증만 한다(모델 출력 무검증 실행 금지 — architecture §3). updates 의 실제
// 적용(DB 반영)은 클라(writer-store.applyChatUpdates)가 한다 — writer-store 가 shots/scenes 의 단일 진실.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE, CHAT_UPDATES_BATCH_GUIDE, fetchProjectLocale, responseLanguageDirective } from '@/lib/chat-format'
import { parseDialogueLanguage, type DialogueLanguage } from '@/lib/writer/pipeline/util/output-language'
import { sanitizeLineRefs, validateWriterUpdates } from '@/lib/writer-chat-updates'
import { parseFencedUpdates } from '@/lib/agentic-reply-guard'
import {
  buildChatTrace,
  createChatTraceId,
  type ChatLlmUsage,
} from '@/lib/chat-trace'
import { persistChatTraceBestEffort } from '@/lib/chat-trace-server'

// #dialogue-language-chat(2026-08-27 오너): 챗으로 대사를 새로 쓰거나 고칠 때도 파이프라인과
//   같은 대사 언어를 따른다 — 단, 사용자가 그 메시지에서 명시적으로 다른 언어를 요구하면 요청이
//   이긴다(파이프라인의 '예외 없이'와 다른 점). 설정이 없으면 무주입(종전 동작).
const DIALOGUE_LANGUAGE_NAME: Record<DialogueLanguage, string> = {
  ko: '한국어', // i18n-ok: LLM 프롬프트 상수
  en: '영어(English)', // i18n-ok: LLM 프롬프트 상수
  ja: '일본어(日本語)', // i18n-ok: LLM 프롬프트 상수
  zh: '중국어(中文)', // i18n-ok: LLM 프롬프트 상수
}

function dialogueLanguageChatDirective(lang: DialogueLanguage | undefined): string {
  if (!lang) return ''
  const name = DIALOGUE_LANGUAGE_NAME[lang]
  return `\n\n[대사 언어] 이 프로젝트의 대사 언어는 ${name}(${lang})다. updates 로 대사 텍스트(dialogueLines 의 대사, 내레이션 등)를 새로 쓰거나 고칠 때는 ${name}로 쓴다. 예외는 하나 — 사용자가 이 메시지에서 명시적으로 다른 언어로 써 달라고 요구한 경우에만 그 요청을 따른다. 응답 본문 언어([응답 언어])와 대사 언어는 별개다.` // i18n-ok: LLM 프롬프트 디렉티브
}

const WRITER_CHAT_SYSTEM = `You are the Writers' Room assistant in an AI video production pipeline called "The Set."
The user is reviewing the rough storyboard (pre-concept previz) of a story already broken into Scenes and Shots.

<role>
You BOTH discuss the story/staging AND directly mutate the scene/shot breakdown by emitting an updates[] block.
When the user asks to add, modify, reorder, or remove scenes/shots, plan a sequence of actions and emit them.
For pure discussion or questions, omit the JSON block entirely.
</role>

<model>
- Scene (씬, 서사 컨테이너): location, timeOfDay, mood, narrativeSummary, charactersPresent[], estimatedDurationSeconds
- Shot (샷, 한 컷): belongs to a scene. shotType, actionDescription, characters[], durationSeconds, dialogueLines[]
- Dialogue line (대사): {characterId, text}. characterId must be one of the character IDs shown in context.
- shotType ∈ ECU,CU,MCU,MS,MFS,FS,WS,EWS,OTS,POV,TRACK,2S (촬영 사이즈, 클로즈업→와이드)
- characters / charactersPresent / dialogueLines[].characterId use the character IDs from the "## 등장인물" roster. In context speakers appear as characterId(name) — always emit the characterId (the part before the parenthesis), never the name. Never invent new IDs.
</model>

<actions>
Use the exact scene_id / shot_id from the context. For nodes created in the same batch, assign a tempId and reference it from later actions (e.g. addShot.sceneId = a new scene's tempId).

Non-destructive:
1. {"type":"addScene","location":"...","timeOfDay":"...","mood":"...","narrativeSummary":"...","charactersPresent":["char"],"tempId":"S1"}
2. {"type":"addShot","sceneId":"<sceneId|tempId>","shotType":"MS","actionDescription":"...","characters":["char"],"durationSeconds":5,"tempId":"H1"}
3. {"type":"updateScene","id":"<sceneId>","patch":{"location":"...","timeOfDay":"...","mood":"...","narrativeSummary":"...","charactersPresent":["char"],"estimatedDurationSeconds":30}}
4. {"type":"updateShot","id":"<shotId>","patch":{"shotType":"CU","actionDescription":"...","characters":["char"],"durationSeconds":4,"dialogueLines":[{"characterId":"char","text":"..."}]}}

Destructive — emit ONLY when the user clearly asks to remove something:
5. {"type":"deleteShot","id":"<shotId>"}
6. {"type":"deleteScene","id":"<sceneId>"}   // also removes that scene's shots
7. {"type":"clarify","question":"<짧은 되묻기>","candidates":["<shot_id 또는 문구>", ...]}
   // 수정 대상이 모호하면(어느 샷/씬인지 특정 불가) 임의로 고르지 말고 clarify 하나만 내라 —
   //   candidates 는 2~4개, 사용자가 그대로 답할 수 있는 구체 표현으로. 다른 액션과 섞지 마라.

Only include patch fields you are actually changing. Omit unknown fields rather than guessing.
</actions>

<script-lines>
The context may contain script line labels like [L45], and the request may also include a line reference table.
L-number resolution priority:
1. Use "## 라인 참조 해석표" first. It is the send-time snapshot and overrides [L#] markers.
2. If the table is absent, fall back to the [L#] markers in the context.
If the user asks to mutate an L-number that is not in the line reference table when a table is present, do not guess; ask which line they mean.
If neither the table nor the context has that L-number, do not mutate anything; ask which line they mean.

Ref mapping:
- sc_01.heading means a scene heading. Use updateScene for location, timeOfDay, mood, narrativeSummary, charactersPresent, or estimatedDurationSeconds.
- sh_01_03.action means a shot action line. Use updateShot.patch.actionDescription for action/staging wording.
- sh_01_03.dialogue[1] means one dialogue line in that shot. To change dialogue, submit updateShot.patch.dialogueLines as the shot's complete dialogueLines array, with every retained line included. Each retained line must carry over ALL of its existing fields unchanged (emotion, delivery, durationHint, characterId) — resubmitting a line with only characterId+text silently erases the rest.

대사 수를 줄이는 수정은 사용자 확인을 거친다. 삭제 의도가 아니면 전체 dialogueLines 배열을 빠짐없이 재제출하라.
</script-lines>

<format>
Reply text in 1-3 sentences (Korean if the user wrote Korean), then — only if mutating — a single JSON block as the LAST element:

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<examples>
<example>
<user>마지막 씬에 용사 클로즈업 샷 하나 추가해줘</user>
<assistant>마지막 씬에 용사 클로즈업 샷을 추가했어요.

\`\`\`json
{"updates":[
  {"type":"addShot","sceneId":"sc_03","shotType":"CU","actionDescription":"용사의 결연한 얼굴 클로즈업","characters":["char"],"durationSeconds":3,"tempId":"H1"}
]}
\`\`\`</assistant>
</example>
<example>
<user>sc_02 분위기를 더 어둡고 긴장감 있게 바꿔줘</user>
<assistant>sc_02의 분위기를 어둡고 긴장감 있게 조정했어요.

\`\`\`json
{"updates":[
  {"type":"updateScene","id":"sc_02","patch":{"mood":"어둡고 긴장된, 위협이 다가오는"}}
]}
\`\`\`</assistant>
</example>
<example>
<user>L3 대사를 "여기야, 분명해."로 바꿔줘</user>
<assistant>L3의 대사를 더 확신하는 톤으로 바꿔어요.

\`\`\`json
{"updates":[
  {"type":"updateShot","id":"sh_01_01","patch":{"dialogueLines":[
    {"characterId":"char","text":"여기야, 분명해.","emotion":"확신","delivery":"단호하게, 앞을 응시하며"},
    {"characterId":"char_2","text":"조심해.","emotion":"경계","delivery":"낮게 속삭이듯","durationHint":1}
  ]}}
]}
\`\`\`</assistant>
</example>
<example>
<user>이 컷 구도가 왜 와이드샷이야?</user>
<assistant>와이드샷은 두 인물의 거리와 공간의 규모를 한 프레임에 담아 대치의 긴장을 보여주려는 의도예요. 더 가까운 사이즈로 바꾸고 싶으면 말씀해 주세요.</assistant>
</example>
</examples>`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}
interface IncomingHistoryItem {
  role: 'user' | 'model'
  content: string
}

function formatLineRefTable(rawLineRefs: unknown): string {
  const lineRefs = sanitizeLineRefs(rawLineRefs)
  if (lineRefs.length === 0) return ''
  return [
    '## 라인 참조 해석표 (전송 시점 스냅샷 — 이 표가 [L#] 마커보다 우선한다)',
    ...lineRefs.map((lineRef) => `${lineRef.label} → ${lineRef.ref}`),
  ].join('\n')
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

function parseAgenticResponse(
  text: string,
  allowedCharacterIds?: ReadonlySet<string>,
): {
  reply: string
  updates: unknown[]
  droppedCharacterIds: string[]
  parseStatus: string
  rawUpdateCount: number
  validUpdateCount: number
} {
  // 펜스 추출·복구·유출 방어·신호·부분 적용 안내는 공용 가드가 담당(#p4-json-guard).
  const dropped: string[] = []
  const { reply, updates, raw, status } = parseFencedUpdates(
    text,
    'writer/chat',
    (raw) => validateWriterUpdates(raw, allowedCharacterIds, dropped),
  )
  return {
    reply,
    updates,
    droppedCharacterIds: dropped,
    parseStatus: status,
    rawUpdateCount: raw.length,
    validUpdateCount: updates.length,
  }
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      message,
      history,
      writerContext,
      lineRefs,
      projectId,
      traceId: requestedTraceId,
    } = await req.json()
    if (!message || typeof message !== 'string')
      return NextResponse.json({ error: 'message is required' }, { status: 400 })

    // 인물 id 정본 로스터(#F-003 R1) — DB 가 진실. 클라가 보내는 writerContext 의 로스터는
    //   프롬프트용 표시일 뿐 검증 근거가 아니다. 프롬프트("Never invent new IDs")는 보조 방어 —
    //   실측(dc531572): 모델이 girl/tracker 를 발명해 그대로 저장됐고 하류 에셋 조인이 전부
    //   끊겼다(architecture §3 "모델 출력의 무검증 실행 금지" 위반). projectId 미전달(구 클라)이면
    //   무필터로 종전 동작.
    let allowedCharacterIds: ReadonlySet<string> | undefined
    let projectLocale: Awaited<ReturnType<typeof fetchProjectLocale>> = null
    let dialogueLanguage: DialogueLanguage | undefined
    if (typeof projectId === 'string' && projectId) {
      if (!(await userOwnsProject(projectId, user.id))) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      // 로스터(#F-003 R1)·응답 언어(#i18n-s5-batch6-chat)·대사 언어(#dialogue-language-chat) 병렬 조회.
      const [{ data: roster }, locale, { data: projRow }] = await Promise.all([
        supabaseAdmin.from('characters').select('character_id').eq('project_id', projectId),
        fetchProjectLocale(projectId),
        supabaseAdmin.from('projects').select('settings').eq('id', projectId).maybeSingle(),
      ])
      allowedCharacterIds = new Set(
        (roster ?? []).map((r) => r.character_id as string).filter(Boolean),
      )
      projectLocale = locale
      dialogueLanguage = parseDialogueLanguage(
        (projRow?.settings as { dialogueLanguage?: unknown } | null)?.dialogueLanguage,
      )
    }

    const normalizedHistory = normalizeHistory(history)
    const contextSections = [
      formatLineRefTable(lineRefs),
      typeof writerContext === 'string' && writerContext.trim() ? writerContext : '',
    ].filter(Boolean)
    const ctx = contextSections.length > 0 ? `${contextSections.join('\n\n')}\n\n---\n\n` : ''
    const traceId = createChatTraceId(requestedTraceId)
    let llmUsage: ChatLlmUsage | null = null
    const systemPrompt =
      WRITER_CHAT_SYSTEM +
      CHAT_OUTPUT_FORMAT_GUIDE +
      CHAT_UPDATES_BATCH_GUIDE +
      responseLanguageDirective(projectLocale) +
      dialogueLanguageChatDirective(dialogueLanguage)
    const userPrompt = `${ctx}${message}`

    const text = await llmChat(
      systemPrompt,
      normalizedHistory,
      userPrompt,
      0.5,
      `chat:${traceId}`,
      {
        onUsage: (usage) => {
          llmUsage = usage
        },
      },
    )
    const {
      reply,
      updates,
      droppedCharacterIds,
      parseStatus,
      rawUpdateCount,
      validUpdateCount,
    } = parseAgenticResponse(text, allowedCharacterIds)
    // 드롭 표면화 — 침묵 드롭은 이 사고(무검증 저장)와 같은 함정을 반대 방향으로 판다.
    const dropped = [...new Set(droppedCharacterIds)]
    const replyOut = dropped.length
      ? `${reply}

(등장인물 목록에 없는 인물 ${dropped.map((d) => `\`${d}\``).join(', ')} 은(는) 반영하지 않았어요 — 새 인물이 필요하면 Producer 단계에서 추가해 주세요.)`
      : reply
    const trace = buildChatTrace({
      traceId,
      stage: 'writer',
      route: 'writer/chat',
      system: systemPrompt,
      history: normalizedHistory,
      contextMessage: userPrompt,
      usage: llmUsage,
      parseStatus,
      rawUpdateCount,
      validUpdateCount,
    })
    await persistChatTraceBestEffort(projectId, trace)

    return NextResponse.json({
      reply: replyOut,
      updates,
      trace,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[writer/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
