import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'

const ARTIST_SYSTEM = `You are the Concept Artist agent operating an L0 Concept Canvas — a node graph where users build characters (Actor nodes) and environments (World nodes) and their variants (Status nodes).

<role>
You can both discuss ideas AND directly mutate the canvas by emitting an updates[] block.
When the user asks to create, modify, generate, or relate nodes, plan a sequence of actions and emit them.
</role>

<canvas_model>
- Node kinds: 'actor' (붉은 박스, 캐릭터), 'world' (파란 박스, 장소/환경), 'status' (마더의 연동 변형)
- Output modes: 'single' (1장, 1 credit), 'five-view' (5장 front/left/right/back/detail, 5 credits), 'sixteen-angle' (16장 22.5° 간격, 16 credits)
- Edge categories: 'parent' (상속), 'in-world' (월드 안에 개체 배치), 'references' (시각적 참고)
- Status 노드는 마더 prompt를 자동 결합 (effective prompt = mother prompt + "[변형] " + 자체 prompt)
- 캐릭터 등록 임계: 한 노드 서브트리 누적 이미지 ≥ 20장
</canvas_model>

<actions>
Each update follows one of these shapes. Use the exact id from the canvas context. For new nodes you create in the same batch, assign a tempId and reference it in subsequent actions.

Non-destructive (direct execution):
1. {"type":"addNode","kind":"actor"|"world","label":"...","prompt":"...","tempId":"T1"}
2. {"type":"updateNode","id":"<nodeId|tempId>","patch":{"label":"...","prompt":"...","modelId":"imagen"|"h100-self","outputMode":"single"|"five-view"|"sixteen-angle"}}
3. {"type":"connect","sourceId":"<id>","targetId":"<id>","category":"parent"|"in-world"|"references","relationText":"..."}
4. {"type":"setOutputMode","id":"<id>","mode":"single"|"five-view"|"sixteen-angle"}
5. {"type":"generate","id":"<id>"}
6. {"type":"branchStatus","motherId":"<actorOrWorldId>","label":"...","prompt":"...","tempId":"T2"}
7. {"type":"duplicateNode","id":"<id>","tempId":"T3"}
8. {"type":"selectNode","id":"<id>"}

Destructive — opens a confirmation modal (NOT immediate):
9. {"type":"requestDelete","id":"<id>","reason":"..."}
10. {"type":"requestRegister","id":"<id>","suggestedName":"...","suggestedAlias":"...","suggestedBackground":"...","suggestedDescription":"..."}
</actions>

<format>
Emit updates ONLY when the user clearly intends a canvas mutation. For pure discussion, omit the JSON block.
Keep the reply text concise (1-3 sentences), Korean if user wrote Korean.
The JSON block (if any) must be the LAST element in the response.

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<examples>
<example>
<user>Kai라는 캐릭터 만들어줘. 갈색 머리에 검은 코트.</user>
<assistant>Kai 노드를 만들고 외모를 입력했습니다.

\`\`\`json
{"updates":[
  {"type":"addNode","kind":"actor","label":"Kai","prompt":"갈색 머리, 검은 롱코트, 어두운 분위기","tempId":"T1"}
]}
\`\`\`</assistant>
</example>

<example>
<user>방금 만든 Kai 5-view로 생성해줘</user>
<assistant>Kai의 5-View 시트 5장 생성합니다.

\`\`\`json
{"updates":[
  {"type":"setOutputMode","id":"n_abc","mode":"five-view"},
  {"type":"generate","id":"n_abc"}
]}
\`\`\`</assistant>
</example>

<example>
<user>Kai에 부상 상태 Status 추가, 왼쪽 눈에 흉터</user>
<assistant>Kai의 Status 자식을 만들었습니다.

\`\`\`json
{"updates":[
  {"type":"branchStatus","motherId":"n_abc","label":"Kai — injured","prompt":"왼쪽 눈에 흉터, 피로 얼룩진 코트"}
]}
\`\`\`</assistant>
</example>

<example>
<user>사막 월드 만들어서 Kai를 거기 배치</user>
<assistant>사막 World 노드와 Kai를 연결합니다.

\`\`\`json
{"updates":[
  {"type":"addNode","kind":"world","label":"사막","prompt":"황량한 모래 언덕, 강한 햇빛","tempId":"W1"},
  {"type":"connect","sourceId":"n_abc","targetId":"W1","category":"in-world","relationText":"사막에 거주"}
]}
\`\`\`</assistant>
</example>

<example>
<user>등록 가능한 상태야?</user>
<assistant>현재 누적 12장, 등록까지 8장 더 필요합니다. 5-View나 16-Angle 모드로 더 생성해보세요.</assistant>
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

// Valid enums for shallow validation
const VALID_KINDS = new Set(['actor', 'world'])
const VALID_MODES = new Set(['single', 'five-view', 'sixteen-angle'])
const VALID_MODELS = new Set(['imagen', 'h100-self'])
const VALID_CATEGORIES = new Set(['parent', 'in-world', 'references'])
const VALID_TYPES = new Set([
  'addNode',
  'updateNode',
  'connect',
  'setOutputMode',
  'generate',
  'branchStatus',
  'duplicateNode',
  'requestDelete',
  'requestRegister',
  'selectNode',
])

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}

function validatePatch(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== 'object') return null
  const out: Record<string, unknown> = {}
  const rec = p as Record<string, unknown>
  if (typeof rec.label === 'string') out.label = rec.label
  if (typeof rec.prompt === 'string') out.prompt = rec.prompt
  if (typeof rec.modelId === 'string' && VALID_MODELS.has(rec.modelId))
    out.modelId = rec.modelId
  if (typeof rec.outputMode === 'string' && VALID_MODES.has(rec.outputMode))
    out.outputMode = rec.outputMode
  return Object.keys(out).length > 0 ? out : null
}

function validateUpdates(raw: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue
    const rec = u as Record<string, unknown>
    if (typeof rec.type !== 'string' || !VALID_TYPES.has(rec.type)) continue

    switch (rec.type) {
      case 'addNode':
        if (typeof rec.kind === 'string' && VALID_KINDS.has(rec.kind)) {
          out.push({
            type: 'addNode',
            kind: rec.kind,
            ...(asString(rec.label) ? { label: rec.label } : {}),
            ...(asString(rec.prompt) ? { prompt: rec.prompt } : {}),
            ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
          })
        }
        break
      case 'updateNode':
        if (asString(rec.id)) {
          const patch = validatePatch(rec.patch)
          if (patch) out.push({ type: 'updateNode', id: rec.id, patch })
        }
        break
      case 'connect':
        if (
          asString(rec.sourceId) &&
          asString(rec.targetId) &&
          typeof rec.category === 'string' &&
          VALID_CATEGORIES.has(rec.category)
        ) {
          out.push({
            type: 'connect',
            sourceId: rec.sourceId,
            targetId: rec.targetId,
            category: rec.category,
            ...(asString(rec.relationText)
              ? { relationText: rec.relationText }
              : {}),
          })
        }
        break
      case 'setOutputMode':
        if (
          asString(rec.id) &&
          typeof rec.mode === 'string' &&
          VALID_MODES.has(rec.mode)
        ) {
          out.push({ type: 'setOutputMode', id: rec.id, mode: rec.mode })
        }
        break
      case 'generate':
      case 'selectNode':
      case 'requestDelete':
        if (asString(rec.id)) {
          out.push({
            type: rec.type,
            id: rec.id,
            ...(rec.type === 'requestDelete' && asString(rec.reason)
              ? { reason: rec.reason }
              : {}),
          })
        }
        break
      case 'branchStatus':
        if (asString(rec.motherId)) {
          out.push({
            type: 'branchStatus',
            motherId: rec.motherId,
            ...(asString(rec.label) ? { label: rec.label } : {}),
            ...(asString(rec.prompt) ? { prompt: rec.prompt } : {}),
            ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
          })
        }
        break
      case 'duplicateNode':
        if (asString(rec.id)) {
          out.push({
            type: 'duplicateNode',
            id: rec.id,
            ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
          })
        }
        break
      case 'requestRegister':
        if (asString(rec.id)) {
          out.push({
            type: 'requestRegister',
            id: rec.id,
            ...(asString(rec.suggestedName)
              ? { suggestedName: rec.suggestedName }
              : {}),
            ...(asString(rec.suggestedAlias)
              ? { suggestedAlias: rec.suggestedAlias }
              : {}),
            ...(asString(rec.suggestedBackground)
              ? { suggestedBackground: rec.suggestedBackground }
              : {}),
            ...(asString(rec.suggestedDescription)
              ? { suggestedDescription: rec.suggestedDescription }
              : {}),
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
