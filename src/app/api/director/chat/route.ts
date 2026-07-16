import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE } from '@/lib/chat-format'
import { stripLeakedUpdatesBlock } from '@/lib/agentic-reply-guard'
import { normalizeProvider } from '@/lib/video-models'

// ──────────────────────────────────────────────────────────────────────
// Legacy system prompt — `director-store.ts` (구 P4) 사용 시
// ──────────────────────────────────────────────────────────────────────

const DIRECTOR_LEGACY_SYSTEM = `You are Director Kim, a master cinematographer and shooting director working in an AI video production pipeline called "The Set."

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

// ──────────────────────────────────────────────────────────────────────
// Agentic system prompt — Director Canvas (P4 노드 그래프) 사용 시
// ──────────────────────────────────────────────────────────────────────

const DIRECTOR_CANVAS_SYSTEM = `You are Director Kim, a master cinematographer operating a Director Canvas — a node graph where the user composes Scene → Shot → Video takes for an AI video production.

<role>
You can BOTH discuss cinematography AND directly mutate the canvas by emitting an updates[] block.
When the user asks to create, modify, or generate scenes/shots/takes, plan a sequence of actions and emit them.
For pure discussion, omit the JSON block.
</role>

<canvas_model>
- Node kinds:
  - 'scene' (chart-3 주황, 씬 메타 컨테이너): label, location, timeOfDay, mood, description
  - 'shot' (chart-4 녹, 영상 생성 단위): prompt, camera (6-axis -10~+10), lighting (position/brightness/colorTemp), cameraPreset (brand/focalLength/aperture/whiteBalance), provider (happy-horse/seedance/kling-o3/veo/local)
  - 'video' (chart-5 빨강계, Shot의 자식 take): override 필드만 마더 Shot과 다르게. final 마킹 ★ 1개만 Editor로
- Edges:
  - 'parent' Scene→Shot, Shot→Video (자동, 사용자 수동 안 함)
  - 'relates-to' 사용자 정의 내러티브 관계
- 6-axis camera: horizontal/vertical (좌우/상하 슬라이드), pan (피치 상하 회전), tilt (요 좌우 회전), roll (롤), zoom (화각). Kling 매핑.
- Lighting position: left|top|right|front, brightness 0-100, colorTemp 2000-10000K (낮을수록 따뜻)
- Camera preset brand: arri (warm filmic) | panavision (anamorphic) | red (sharp) | cooke (vintage) | zeiss (clean)
</canvas_model>

<actions>
Each update follows one of these shapes. Use exact id from canvas context. For new nodes in the same batch, assign tempId and reference it.

Non-destructive (direct execution):
1. {"type":"addScene","label":"...","location":"...","timeOfDay":"...","mood":"...","description":"...","tempId":"S1"}
2. {"type":"addShot","sceneId":"<sceneId|tempId>","label":"...","prompt":"...","tempId":"H1"}
3. {"type":"updateScene","id":"<id>","patch":{"label":"...","location":"...","timeOfDay":"...","mood":"...","description":"..."}}
4. {"type":"updateShot","id":"<id>","patch":{"label":"...","prompt":"...","provider":"happy-horse"|"seedance"|"kling-o3"|"veo"|"local"}}
5. {"type":"addVideoTake","shotId":"<id>","override":{"prompt":"...","camera":{...},"lighting":{...},"cameraPreset":{...}},"tempId":"V1"}
6. {"type":"setCamera","id":"<shotOrVideoId>","camera":{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":0}}
7. {"type":"setLighting","id":"<shotOrVideoId>","lighting":{"position":"left|top|right|front","brightness":50,"colorTemp":5600}}
8. {"type":"setCameraPreset","id":"<shotOrVideoId>","preset":{"brand":"arri","focalLength":35,"aperture":2.8,"whiteBalance":5600}}
9. {"type":"generateVideo","id":"<videoId>"}
10. {"type":"connect","sourceId":"<id>","targetId":"<id>","category":"relates-to","relationText":"..."}
11. {"type":"selectNode","id":"<id>"}

Destructive — opens confirmation modal (NOT immediate):
12. {"type":"requestDelete","id":"<id>","reason":"..."}
</actions>

<format>
Emit updates ONLY when the user clearly intends a canvas mutation. For pure discussion, omit JSON.
Reply text in 1-3 sentences, Korean if the user wrote Korean.
JSON block must be the LAST element.

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<batch-limit>
Emit AT MOST 12 updates in a single response. This is a hard cap — a larger JSON block gets truncated mid-output and nothing applies.
If the request needs more (e.g. "모든 샷", "전체 씬에 대해"), do only the first batch, then in the reply text say what you did and ask the user to say "계속" for the next batch. Never attempt dozens of updates at once.
</batch-limit>

<examples>
<example>
<user>오프닝 씬 만들어줘, 다리 위에서 황혼 무렵.</user>
<assistant>오프닝 Scene을 만들었습니다.

\`\`\`json
{"updates":[
  {"type":"addScene","label":"Opening","location":"다리 위","timeOfDay":"golden hour","mood":"melancholic","tempId":"S1"}
]}
\`\`\`</assistant>
</example>

<example>
<user>방금 그 씬에 클로즈업 샷 추가, 주인공이 강을 바라보는 장면</user>
<assistant>Scene_01에 Shot을 추가했습니다.

\`\`\`json
{"updates":[
  {"type":"addShot","sceneId":"dn_xxx","label":"river_gaze","prompt":"protagonist looking at river, close-up, contemplative","tempId":"H1"},
  {"type":"setCamera","id":"H1","camera":{"horizontal":0,"vertical":0,"pan":-2,"tilt":0,"roll":0,"zoom":3}},
  {"type":"setCameraPreset","id":"H1","preset":{"brand":"cooke","focalLength":85,"aperture":2,"whiteBalance":3200}}
]}
\`\`\`</assistant>
</example>

<example>
<user>이 샷을 좀 더 따뜻한 조명으로 다른 테이크 만들어줘</user>
<assistant>따뜻한 조명 변주 테이크를 생성합니다.

\`\`\`json
{"updates":[
  {"type":"addVideoTake","shotId":"dn_yyy","override":{"lighting":{"position":"left","brightness":65,"colorTemp":3000}},"tempId":"V1"}
]}
\`\`\`</assistant>
</example>

<example>
<user>chiaroscuro 기법은 어떻게 활용하면 좋아?</user>
<assistant>chiaroscuro는 강한 단일광원으로 명암 대비를 극대화하는 기법입니다. 측면 라이트 위치 + 낮은 brightness(30-50) + 색온도 3000K 근처가 효과적이에요. 특히 인물의 내면 갈등을 표현할 때 강력합니다.</assistant>
</example>
</examples>`

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

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

const VALID_UPDATE_TYPES = new Set([
  'addScene',
  'addShot',
  'updateScene',
  'updateShot',
  'addVideoTake',
  'setCamera',
  'setLighting',
  'setCameraPreset',
  'generateVideo',
  'connect',
  'requestDelete',
  'selectNode',
])
// 새 모델 키 + legacy alias('kling') 허용. 저장 시 normalizeProvider로 canonical 키화.
const VALID_PROVIDERS = new Set([
  'happy-horse',
  'seedance',
  'kling-o3',
  'veo',
  'local',
  'kling', // legacy → normalizeProvider가 'kling-o3'로
])
const VALID_LIGHT_POSITIONS = new Set(['left', 'top', 'right', 'front'])

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}
function asObj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}
function asNumber(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined
}

function validateCamera(p: unknown): Record<string, number> | undefined {
  const o = asObj(p)
  if (!o) return
  const out: Record<string, number> = {}
  for (const k of ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom']) {
    const v = asNumber(o[k])
    if (v !== undefined) out[k] = Math.max(-10, Math.min(10, v))
  }
  return Object.keys(out).length > 0 ? out : undefined
}
function validateLighting(p: unknown): Record<string, unknown> | undefined {
  const o = asObj(p)
  if (!o) return
  const out: Record<string, unknown> = {}
  if (typeof o.position === 'string' && VALID_LIGHT_POSITIONS.has(o.position))
    out.position = o.position
  const b = asNumber(o.brightness)
  if (b !== undefined) out.brightness = Math.max(0, Math.min(100, b))
  const c = asNumber(o.colorTemp)
  if (c !== undefined) out.colorTemp = Math.max(2000, Math.min(10000, c))
  return Object.keys(out).length > 0 ? out : undefined
}
function validatePreset(p: unknown): Record<string, unknown> | undefined {
  const o = asObj(p)
  if (!o) return
  const out: Record<string, unknown> = {}
  if (typeof o.brand === 'string') out.brand = o.brand
  const fl = asNumber(o.focalLength)
  if (fl !== undefined) out.focalLength = fl
  const ap = asNumber(o.aperture)
  if (ap !== undefined) out.aperture = ap
  const wb = asNumber(o.whiteBalance)
  if (wb !== undefined) out.whiteBalance = wb
  return Object.keys(out).length > 0 ? out : undefined
}

function validateCanvasUpdates(raw: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const u of raw) {
    const rec = asObj(u)
    if (!rec) continue
    if (typeof rec.type !== 'string' || !VALID_UPDATE_TYPES.has(rec.type))
      continue

    switch (rec.type) {
      case 'addScene':
        out.push({
          type: 'addScene',
          ...(asString(rec.label) ? { label: rec.label } : {}),
          ...(asString(rec.location) ? { location: rec.location } : {}),
          ...(asString(rec.timeOfDay) ? { timeOfDay: rec.timeOfDay } : {}),
          ...(asString(rec.mood) ? { mood: rec.mood } : {}),
          ...(asString(rec.description) ? { description: rec.description } : {}),
          ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
        })
        break
      case 'addShot':
        if (asString(rec.sceneId)) {
          out.push({
            type: 'addShot',
            sceneId: rec.sceneId,
            ...(asString(rec.label) ? { label: rec.label } : {}),
            ...(asString(rec.prompt) ? { prompt: rec.prompt } : {}),
            ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
          })
        }
        break
      case 'updateScene':
      case 'updateShot': {
        if (!asString(rec.id)) break
        const patchObj = asObj(rec.patch)
        if (!patchObj) break
        const patch: Record<string, unknown> = {}
        for (const k of [
          'label',
          'prompt',
          'location',
          'timeOfDay',
          'mood',
          'description',
        ]) {
          if (typeof patchObj[k] === 'string') patch[k] = patchObj[k]
        }
        if (
          rec.type === 'updateShot' &&
          typeof patchObj.provider === 'string' &&
          VALID_PROVIDERS.has(patchObj.provider)
        ) {
          patch.provider = normalizeProvider(patchObj.provider)
        }
        if (Object.keys(patch).length > 0) {
          out.push({ type: rec.type, id: rec.id, patch })
        }
        break
      }
      case 'addVideoTake':
        if (asString(rec.shotId)) {
          const ov = asObj(rec.override) ?? {}
          const override: Record<string, unknown> = {}
          if (typeof ov.prompt === 'string') override.prompt = ov.prompt
          const cam = validateCamera(ov.camera)
          if (cam) override.camera = cam
          const lt = validateLighting(ov.lighting)
          if (lt) override.lighting = lt
          const pr = validatePreset(ov.cameraPreset)
          if (pr) override.cameraPreset = pr
          if (typeof ov.provider === 'string' && VALID_PROVIDERS.has(ov.provider))
            override.provider = normalizeProvider(ov.provider)
          out.push({
            type: 'addVideoTake',
            shotId: rec.shotId,
            ...(Object.keys(override).length > 0 ? { override } : {}),
            ...(asString(rec.tempId) ? { tempId: rec.tempId } : {}),
          })
        }
        break
      case 'setCamera': {
        const cam = validateCamera(rec.camera)
        if (asString(rec.id) && cam) {
          out.push({ type: 'setCamera', id: rec.id, camera: cam })
        }
        break
      }
      case 'setLighting': {
        const lt = validateLighting(rec.lighting)
        if (asString(rec.id) && lt) {
          out.push({ type: 'setLighting', id: rec.id, lighting: lt })
        }
        break
      }
      case 'setCameraPreset': {
        const pr = validatePreset(rec.preset)
        if (asString(rec.id) && pr) {
          out.push({ type: 'setCameraPreset', id: rec.id, preset: pr })
        }
        break
      }
      case 'generateVideo':
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
      case 'connect':
        if (
          asString(rec.sourceId) &&
          asString(rec.targetId) &&
          rec.category === 'relates-to'
        ) {
          out.push({
            type: 'connect',
            sourceId: rec.sourceId,
            targetId: rec.targetId,
            category: 'relates-to',
            ...(asString(rec.relationText)
              ? { relationText: rec.relationText }
              : {}),
          })
        }
        break
    }
  }
  return out
}

function parseAgenticResponse(text: string): {
  reply: string
  updates: unknown[]
} {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)
  // 펜스 미완결(max_tokens 잘림)·파싱 실패 시 raw JSON 을 채팅에 노출하지 않는다(유출 방어, 임시 조치).
  if (!jsonMatch) return { reply: stripLeakedUpdatesBlock(text), updates: [] }
  const reply = text.slice(0, jsonMatch.index).trim()
  try {
    const parsed = JSON.parse(jsonMatch[1])
    const raw = Array.isArray(parsed.updates) ? parsed.updates : []
    return { reply, updates: validateCanvasUpdates(raw) }
  } catch {
    return { reply: stripLeakedUpdatesBlock(text), updates: [] }
  }
}

function parseLegacyResponse(text: string): {
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
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, shotContext, canvasContext } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    const normalizedHistory = normalizeHistory(history)
    const crossStageNote = normalizedHistory.some((m) =>
      /^\[P[1-5]\]/.test(m.content),
    )
      ? `\n\nNote: prior messages from other stages are prefixed with [P1]-[P5]. Reference for continuity.`
      : ''

    // 분기: canvasContext가 있으면 agentic 모드 (Director Canvas), 없으면 legacy 모드
    if (typeof canvasContext === 'string' && canvasContext.trim()) {
      const text = await llmChat(
        DIRECTOR_CANVAS_SYSTEM + crossStageNote + CHAT_OUTPUT_FORMAT_GUIDE,
        normalizedHistory,
        `${canvasContext}\n\n---\n\n${message}`,
        0.7,
      )
      const { reply, updates } = parseAgenticResponse(text)
      return NextResponse.json({ reply, updates })
    }

    // Legacy path — 기존 director-store 사용 시
    const contextPrefix = shotContext
      ? `[Current Shot]\n${JSON.stringify(shotContext)}\n\n`
      : ''
    const text = await llmChat(
      DIRECTOR_LEGACY_SYSTEM + crossStageNote + CHAT_OUTPUT_FORMAT_GUIDE,
      normalizedHistory,
      `${contextPrefix}${message}`,
      0.7,
    )
    const result = parseLegacyResponse(text)
    return NextResponse.json(result)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
