import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE, CHAT_UPDATES_BATCH_GUIDE, fetchProjectLocale, responseLanguageDirective } from '@/lib/chat-format'
import {
  NOTICE_PARTIAL,
  parseFencedJsonReply,
  parseFencedUpdates,
} from '@/lib/agentic-reply-guard'
import { normalizeProvider } from '@/lib/video-models'
import type {
  DirectorImageTargetHandle,
  DirectorVideoFrameTargetHandle,
  DirectorVideoChainTargetHandle,
} from '@/types/director'
import { userOwnsProject } from '@/lib/generation-jobs'
import {
  buildChatTrace,
  createChatTraceId,
  type ChatLlmUsage,
} from '@/lib/chat-trace'
import { persistChatTraceBestEffort } from '@/lib/chat-trace-server'

// ──────────────────────────────────────────────────────────────────────
// Legacy system prompt — `director-store.ts` (구 P4) 사용 시
// ──────────────────────────────────────────────────────────────────────

const DIRECTOR_LEGACY_SYSTEM = `You are Director Kim, a master cinematographer and shooting Director working in an AI video production pipeline called "The Set."

Your role:
- Guide the user through shot composition, camera angles, and lighting
- Recommend cinematography techniques from your knowledge base
- Suggest specific 6-axis camera settings (horizontal, vertical, pan, tilt, roll, zoom — each -10 to +10)
- Advise on lighting (position: left/top/right/front, brightness 0-100%, colorTemp 2000-10000K)
- Explain WHY certain techniques create emotional impact

Style:
- Expert but approachable — like a real Director on set
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
  - 'image' 이미지 source→Shot image-reference (image-reference 입력은 여러 source 허용)
  - 'frame' 이미지 source→Video START/END/REF (START·END는 하나, REF는 여러 개)
  - 'video-chain' 완료된 Video의 마지막 프레임→다음 Video START (공개 이미지로 추출)
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
9b. {"type":"generateImage","id":"<shotId>"}  — 그 샷의 실사 이미지 생성. id 를 빼면 미생성 샷 전체 일괄.
    (실사는 클라이언트 승인 카드를 거친 뒤에만 생성된다)
9c. {"type":"generateVideos"}  — 영상이 없는 샷 전체의 영상 일괄 생성. 클라이언트 승인 카드가 만들 영상 수·필요한 Take·가진 Take 를
    보여 준 뒤에만 시작된다. 특정 샷 하나의 영상은 채팅으로 시작할 수 없다.
10. {"type":"connect","sourceId":"<id>","targetId":"<id>","category":"relates-to","relationText":"..."}
11. {"type":"connectFrame","sourceId":"<sourceId|tempId>","targetId":"<videoId|tempId>","targetHandle":"frame-start"|"frame-end"|"frame-ref"}
    (semantic frame wiring only; targetHandle must be exactly frame-start, frame-end, or frame-ref)
12. {"type":"connectImage","sourceId":"<sourceId|tempId>","targetId":"<shotId|tempId>","targetHandle":"image-reference"}
    (image reference wiring only; targetHandle must be exactly image-reference)
13. {"type":"connectVideo","sourceId":"<sourceId|tempId>","targetId":"<videoId|tempId>","targetHandle":"video-chain"}
    (completed source Video's last frame becomes the target START image; never send a video URL)
14. {"type":"selectNode","id":"<id>"}

Destructive — opens confirmation modal (NOT immediate):
15. {"type":"requestDelete","id":"<id>","reason":"..."}

<hybrid_intent_rule>
- For free canvas edits, emit only the requested edit actions. Never infer or append generateImage.
- Emit generateImage only when the user explicitly asks to generate or regenerate an image.
- generateImage is a paid action and the client presents an approval card before it runs.
</hybrid_intent_rule>

<video_request_rule>
- When the user asks to generate videos for all remaining shots ("영상 다 만들어줘", "generate all the videos"), emit exactly one {"type":"generateVideos"} and say that an approval card will show how many videos it makes and how many Takes it needs. Do not say generation started.
- A single shot's video still cannot start from chat: for that request do NOT emit generateVideo and do NOT emit addVideoTake. Emitting addVideoTake alone creates an empty take placeholder while implying a video was queued, which is misleading, so skip both actions entirely.
- For a single shot, reply honestly that chat only starts the whole batch, and point them to the Video take button on the Shot node.
- Never reply as if a video generation started, is queued, or will be ready soon.
</video_request_rule>
</actions>

<format>
Emit updates ONLY when the user clearly intends a canvas mutation. For pure discussion, omit JSON.
Reply text in 1-3 sentences, Korean if the user wrote Korean.
JSON block must be the LAST element.

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

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
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => ({
    role: m.role,
    content: m.content,
  }))
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
  'generateImage',
  'generateVideos',
  'connect',
  'connectFrame',
  'connectImage',
  'connectVideo',
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
const VALID_FRAME_TARGET_HANDLES = new Set<DirectorVideoFrameTargetHandle>([
  'frame-start',
  'frame-end',
  'frame-ref',
])
const VALID_IMAGE_TARGET_HANDLES = new Set<DirectorImageTargetHandle>([
  'image-reference',
])
const VALID_VIDEO_CHAIN_TARGET_HANDLES = new Set<DirectorVideoChainTargetHandle>([
  'video-chain',
])

function asString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}
function asNonEmptyString(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined
  const value = x.trim()
  return value ? value : undefined
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
      case 'generateImage': {
        // id 는 선택 — 없으면 미생성 전체 일괄(#c5). 있으면 그 Shot 만.
        out.push(asString(rec.id) ? { type: 'generateImage', id: rec.id } : { type: 'generateImage' })
        break
      }
      case 'generateVideos': {
        // 약속 E3: 필드 없음 — 미생성 샷 전체. 클라이언트가 승인 카드(만들 영상 수·필요한 Take·가진 Take)를 띄운다.
        out.push({ type: 'generateVideos' })
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
      case 'connectFrame': {
        const sourceId = asNonEmptyString(rec.sourceId)
        const targetId = asNonEmptyString(rec.targetId)
        const targetHandle = rec.targetHandle
        if (
          sourceId &&
          targetId &&
          typeof targetHandle === 'string' &&
          VALID_FRAME_TARGET_HANDLES.has(targetHandle as DirectorVideoFrameTargetHandle)
        ) {
          out.push({
            type: 'connectFrame',
            sourceId,
            targetId,
            targetHandle,
          })
        }
        break
      }
      case 'connectImage': {
        const sourceId = asNonEmptyString(rec.sourceId)
        const targetId = asNonEmptyString(rec.targetId)
        const targetHandle = rec.targetHandle
        if (
          sourceId &&
          targetId &&
          typeof targetHandle === 'string' &&
          VALID_IMAGE_TARGET_HANDLES.has(targetHandle as DirectorImageTargetHandle)
        ) {
          out.push({
            type: 'connectImage',
            sourceId,
            targetId,
            targetHandle,
          })
        }
        break
      }
      case 'connectVideo': {
        const sourceId = asNonEmptyString(rec.sourceId)
        const targetId = asNonEmptyString(rec.targetId)
        const targetHandle = rec.targetHandle
        if (
          sourceId &&
          targetId &&
          typeof targetHandle === 'string' &&
          VALID_VIDEO_CHAIN_TARGET_HANDLES.has(
            targetHandle as DirectorVideoChainTargetHandle,
          )
        ) {
          out.push({
            type: 'connectVideo',
            sourceId,
            targetId,
            targetHandle,
          })
        }
        break
      }
    }
  }
  return out
}

function parseAgenticResponse(text: string): {
  reply: string
  updates: unknown[]
  parseStatus: string
  rawUpdateCount: number
  validUpdateCount: number
} {
  // 펜스 추출·복구·유출 방어·신호·부분 적용 안내는 공용 가드가 담당(#p4-json-guard).
  const { reply, updates, raw, status } = parseFencedUpdates(
    text,
    'director/chat',
    validateCanvasUpdates,
  )
  return {
    reply,
    updates,
    parseStatus: status,
    rawUpdateCount: raw.length,
    validUpdateCount: updates.length,
  }
}

function parseLegacyResponse(text: string): {
  reply: string
  suggestedCamera?: Record<string, number>
  suggestedLighting?: Record<string, unknown>
  techniques?: string[]
  parseStatus: string
} {
  // agentic 경로와 같은 가드를 태운다 — 종전엔 실패 시 raw JSON 이 그대로 노출됐다(#p4-json-guard).
  //   이 경로의 산출은 배열이 아니라 제안 3종이라 "몇 건 적용" 을 셀 수 없다 — 일반 문구를 쓴다.
  const { reply: head, data, status } = parseFencedJsonReply(text, 'director/chat:legacy')
  const reply = status === 'recovered' ? (head ? `${head}\n\n${NOTICE_PARTIAL}` : NOTICE_PARTIAL) : head
  if (!data) return { reply, parseStatus: status }
  return {
    reply,
    suggestedCamera: data.suggestedCamera as Record<string, number> | undefined,
    suggestedLighting: data.suggestedLighting as Record<string, unknown> | undefined,
    techniques: data.techniques as string[] | undefined,
    parseStatus: status,
  }
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      message,
      history,
      shotContext,
      canvasContext,
      projectId,
      traceId: requestedTraceId,
    } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: message is required' },
        { status: 400 },
      )
    }

    // 응답 언어 강제(#i18n-s5-batch6-chat) — projects.locale 조회. 소유 확인 실패/미상은
    //   fetchProjectLocale 이 null 을 주고, responseLanguageDirective(null) 이 종전 동작(무주입)으로 폴백.
    let projectLocale: Awaited<ReturnType<typeof fetchProjectLocale>> = null
    if (typeof projectId === 'string' && projectId) {
      try {
        if (await userOwnsProject(projectId, user.id)) {
          projectLocale = await fetchProjectLocale(projectId)
        }
      } catch (err) {
        console.warn('[director/chat] locale lookup skipped:', err instanceof Error ? err.message : err)
      }
    }

    const normalizedHistory = normalizeHistory(history)
    const traceId = createChatTraceId(requestedTraceId)

    // 분기: canvasContext가 있으면 agentic 모드 (Director Canvas), 없으면 legacy 모드
    if (typeof canvasContext === 'string' && canvasContext.trim()) {
      let llmUsage: ChatLlmUsage | null = null
      const systemPrompt =
        DIRECTOR_CANVAS_SYSTEM +
        CHAT_OUTPUT_FORMAT_GUIDE +
        CHAT_UPDATES_BATCH_GUIDE +
        responseLanguageDirective(projectLocale)
      const userPrompt = `${canvasContext}\n\n---\n\n${message}`
      const text = await llmChat(
        systemPrompt,
        normalizedHistory,
        userPrompt,
        0.7,
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
        parseStatus,
        rawUpdateCount,
        validUpdateCount,
      } = parseAgenticResponse(text)
      const trace = buildChatTrace({
        traceId,
        stage: 'director',
        route: 'director/chat',
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
        reply,
        updates,
        trace,
      })
    }

    // Legacy path — 기존 director-store 사용 시
    const contextPrefix = shotContext
      ? `[Current Shot]\n${JSON.stringify(shotContext)}\n\n`
      : ''
    let llmUsage: ChatLlmUsage | null = null
    const systemPrompt =
      DIRECTOR_LEGACY_SYSTEM +
      CHAT_OUTPUT_FORMAT_GUIDE +
      responseLanguageDirective(projectLocale)
    const userPrompt = `${contextPrefix}${message}`
    const text = await llmChat(
      systemPrompt,
      normalizedHistory,
      userPrompt,
      0.7,
      `chat:${traceId}`,
      {
        onUsage: (usage) => {
          llmUsage = usage
        },
      },
    )
    const result = parseLegacyResponse(text)
    const { parseStatus, ...legacyResult } = result
    const trace = buildChatTrace({
      traceId,
      stage: 'director',
      route: 'director/chat',
      system: systemPrompt,
      history: normalizedHistory,
      contextMessage: userPrompt,
      usage: llmUsage,
      parseStatus,
    })
    await persistChatTraceBestEffort(projectId, trace)

    return NextResponse.json({
      ...legacyResult,
      trace,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/chat]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
