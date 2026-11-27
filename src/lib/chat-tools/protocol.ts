import type { BetaMessageParam, BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages'

export type ToolBlock = { type: string; [key: string]: unknown }
export type ToolCall = ToolBlock & { type: 'tool_use'; id: string; name: string; input: unknown }
export type ToolMessage = { role: 'assistant' | 'user'; content: ToolBlock[] }
export type ToolTurn = { content: ToolBlock[]; stopReason: string }
export type ToolResult = { status: string; message?: string; [key: string]: unknown }
export type ToolOutcome = { call: ToolCall; result: ToolResult }
export interface ChatToolContext {
  tools: BetaTool[]
  messages: BetaMessageParam[]
  turn?: ToolTurn
}

/** 콘티(conti)는 Storyboard(writer)와 같은 씬 · 샷 보드라 같은 도구 · 같은 서버 길(api/writer/chat)을 쓴다(O1 오너 2026-11-26).
 *  도구 층(대상 목록 · 들여다보기 · 고침 영수증)은 보드 단계를 writer 로 읽는다. 승인 카드는 낸 단계(콘티)에 뜬다 — stores/chat-tool-bindings. */
export function toolStageOf(stage: string): string {
  return stage === 'conti' ? 'writer' : stage
}

export function toolResourcesForStage(stageId: string): string[] {
  const stage = toolStageOf(stageId)
  if (stage === 'producer') return ['settings']
  // Director 채팅은 대사만 읽고 고친다(오너 2026-11-27 3차 "대사 수정 기능을 채팅창에서도") — 콘티 · Storyboard 와 같은 대사 자원.
  if (stage === 'director') return ['dialogue']
  if (stage === 'writer') return ['scenes', 'shots', 'dialogue', 'characters', 'backgrounds']
  if (stage === 'artist') return ['characters', 'backgrounds', 'appearances', 'background_appearances']
  return []
}

// 한국어 대화의 보드 이름 예(오너 2026-11-14 답 7 — boardLabel 은 대화 언어로 적힌다).
const KO_BOARD_LABEL_EXAMPLE = '씬 2 · 샷 8' // i18n-ok: 모델에게 보이는 한국어 보드 이름 예

export const CHAT_TOOL_GUIDE = `
<app-tools>
Use read_project and edit_project for their supported queries and edits. They are real app operations.
Before editing, read the target and use its exact id and revision. Never invent IDs or revisions.
Supported edits must use tools instead of extractedSettings or updates JSON. Do not repeat a tool edit in final JSON.
Settings fields: playtime (seconds), genre, subGenre, format (horizontal_16:9/vertical_9:16/cinema_2.39:1/square_1:1), tone (array of labels), dialogueLanguage (ko/en/ja/zh).
Scene fields: location, timeOfDay, mood, narrativeSummary, originalTextQuote, charactersPresent, estimatedDurationSeconds.
Shot fields: shotType, actionDescription, characters, durationSeconds, dialogueLines.
Shot rows carry boardLabel (read-only), the board name the user sees, written in the conversation language ("Scene 2 · Shot 8" in English, "${KO_BOARD_LABEL_EXAMPLE}" in Korean; shot numbers count across the board). The user may name a shot in either language. Find a shot the user names by number through boardLabel, and call shots by boardLabel exactly as written in replies, never by id.
Dialogue fields: dialogueLines (complete array; retain every unchanged line and all its metadata; characterId:null means narration).
Character fields: name, role, description, appearance (base appearance source; approval required).
Background fields: visualDescription (base description source; approval required).
Appearance rows (Artist only; id is characterId/appearanceKey): label, narrativeTime (present/past/future/null), isDefault (true only: make this the default appearance), appearance (this appearance's description; the default appearance requires approval), selectedCandidateId (restore a previous image from candidateIds without generating).
Background appearance rows (Artist only; id is locationId/appearanceKey, base is locationId/default): label and narrativeTime (variants only), visualDescription (base requires approval), selectedCandidateId (restore a previous image without generating).
Deleting an appearance, safe-mode retries and image generation stay on the existing JSON/approval actions.
The results tell you what was actually saved. Only status ok from an edit proves a saved change.
For invalid_input fix the arguments; for stale_state read again and reconsider the user's request.
For unknown_result/unverified, query the current target before considering any further edit. Never blindly repeat a write.
For approval_required, explain the pending approval and stop editing that target. Never approve on the user's behalf.
For permission failures, unsupported operations or ambiguous targets, explain or ask a concise question.
Successful targets are already done: preserve them and continue only the remaining requested targets.
Do not introduce unrelated planning questions or choices after a tool result.
An answer to an ongoing planning question is not a standalone settings edit. When the conversation or [Current Planning Answer] identifies that continuation, saving the answer completes only that part of the planning goal: acknowledge the verified result, then ask about one remaining required item using the updated project context. Do not repeat a field already saved. Approval-required or failed saves must be resolved before another planning question; a separate settings query/edit still ends after its own result.
Once the original request is answered, saved, or awaiting approval, summarize those results and end the turn. Only ask questions needed to resolve remaining requested work.
An approval card is already the user's next action for that target; do not add choice buttons for it or begin a new interview.
Consultation is allowed without tools. Never claim an edit succeeded from a text-only answer.
When project_workflow is available, use status for fresh saved stage/run/entry requirements, refresh to reload readiness without generation, and open to view an existing stage. handoff to the Storyboard run (targetStage "writer") uses the existing start approval when no run exists. resume restarts only an existing execution and requires the user's explicit request to resume generation.
In the Artist readiness from project_workflow, queued_count is images still being made (under 10 minutes old), stale_count is images stuck for over 10 minutes (stalled jobs: neither running nor failed), and failed_count is failed jobs only. Say stale_count as "N stalled jobs" in the conversation language. Never call a stalled job failed, queued or running.
Screen names: targetStage "producer" is the Writer screen (the prose), "conti" is the rough storyboard (the second part of the Writer screen: scenes, shots and dialogue), "writer" is the Storyboard screen (scenes and shots), "artist" is the Artist screen. The next screen after Artist is Storyboard, not Director. Use the screen names in your replies. A "writer" run in a status result belongs to the Storyboard screen, not to the prose Writer screen.
No Storyboard run record (targetStage "writer") is not proof of missing script: imported/restored projects may have saved scenes and shots without run history. Use savedScenes/savedShots and read_project to answer about actual content.
For a compound edit-then-move request, finish and verify ALL edits before opening the next stage. Approval or uncertain results keep that move pending. A navigation_requested result is only a request to open a screen; do not claim arrival. queued means execution accepted, not completed.
Keep using the existing approval/JSON paths for operations these tools do not support (creation, deletion, generation, Director handoff).
</app-tools>`

/** options.edit === false: 고치기 도구(edit_project)를 뺀다 · options.edit === 'dialogue': 고치기 도구가 대사 자원만 고친다(읽기는 그대로) ·
 *  options.resume === false: 화면 도구에서 Writer 실행 다시 돌리기(resume)를 뺀다 —
 *  Storyboard 채팅은 대사만 도구로 고치고 씬 · 샷을 다시 나누지 않는다(오너 2026-11-27 N3 · Q1 "채팅창에서도", 리드 "도구 하나로" — Director 채팅과 같은 대사 도구,
 *  검토 rev-flow 리드 2 · 7). 화면 열기 대상에는 Writer 콘티(conti)가 있다(리드 6). */
export function prepareChatTools(stage: string, enabled: unknown, history: unknown, workflow: unknown = false, domain: unknown = false, options: { edit?: boolean | 'dialogue'; resume?: boolean } = {}): ChatToolContext | undefined {
  const resources = toolResourcesForStage(stage)
  if (enabled !== true || resources.length === 0) return undefined
  const messages = history ?? []
  if (!Array.isArray(messages) || messages.length > 18 || JSON.stringify(messages).length > 800_000 ||
    messages.some(m => !m || !['assistant', 'user'].includes(m.role) || !Array.isArray(m.content) ||
      m.content.length > 32 || m.content.some((b: ToolBlock) => !b || typeof b.type !== 'string'))) {
    throw new Error('Invalid chat tool history')
  }
  const resource = { type: 'string', enum: resources }
  // 고치기 도구가 고칠 수 있는 자원 — 'dialogue' 면 대사 자원만(그 단계에 없으면 고치기 도구를 주지 않는다).
  const editResources = options.edit === 'dialogue' ? resources.filter((name) => name === 'dialogue') : resources
  return {
    messages: messages as BetaMessageParam[],
    tools: [
      { name: 'read_project', description: 'Read the current project data before answering state questions or editing. Returns exact target IDs, editable values and revisions. Settings are the current working board; other resources are saved rows.', input_schema: {
        type: 'object', properties: { resource, id: { type: 'string', description: 'Optional exact ID. Omit to list targets.' } }, required: ['resource'], additionalProperties: false,
      } },
      ...(options.edit === false || editResources.length === 0 ? [] : [{ name: 'edit_project', description: 'Edit one previously read target with its revision and only requested patch fields. Wait for saved/approval/failure result. No generation, creation, deletion or automatic approval.', input_schema: {
        type: 'object' as const, properties: { resource: { type: 'string', enum: editResources }, id: { type: 'string' as const }, revision: { type: 'string' as const }, patch: { type: 'object' as const, description: 'Only editable fields listed in the app-tools instructions; preserve unchanged dialogue metadata.' } }, required: ['resource', 'id', 'revision', 'patch'], additionalProperties: false,
      } }]),
      ...(domain === true && ['writer', 'artist'].includes(stage) ? [{ name: 'inspect_project', description: 'Read saved domain evidence for one exact target. Writer: current shot/scene specs and linked generation-time intent. Artist: all appearance descriptions; includeImage with an exact appearanceKey supplies that existing sheet/background for visual inspection. Read-only: never edits, selects candidates, approves or generates.', input_schema: {
        type: 'object' as const, properties: {
          target: { type: 'string' as const, enum: stage === 'writer' ? ['scene', 'shot'] : ['character', 'background'] },
          id: { type: 'string' as const, description: 'Exact project entity ID from current context or read_project.' },
          ...(stage === 'artist' ? {
            appearanceKey: { type: 'string' as const, description: 'Exact key from appearance list or explicit UI selection. Background base uses default.' },
            includeImage: { type: 'boolean' as const, description: 'Use only to look at an existing image. Requires appearanceKey; omit for description/list queries.' },
          } : {}),
        }, required: ['target', 'id'], additionalProperties: false,
      } }] : []),
      // 화면 열기 · 실행 다시 돌리기는 Director 채팅에 주지 않는다 — 그 채팅의 앱 도구는 대사 읽기 · 고치기뿐이다(3차).
      ...(workflow === true && stage !== 'director' ? [{ name: 'project_workflow', description: `Read fresh project/run/entry state; refresh visible readiness; open an existing screen (targetStage producer = the Writer prose screen, conti = the Writer rough storyboard, writer = the Storyboard screen, artist = the Artist screen); propose the initial scene and shot run${options.resume === false ? '' : '; or explicitly resume the existing run'}. Never bypass approval or trigger generation from a status question.`, input_schema: {
        type: 'object' as const, properties: { action: { type: 'string' as const, enum: ['status', 'refresh', 'open', 'handoff', ...(options.resume === false ? [] : ['resume'])] }, targetStage: { type: 'string' as const, enum: ['producer', 'conti', 'writer', 'artist'] } }, required: ['action'], additionalProperties: false,
      } }] : []),
    ],
  }
}

// 고치기 도구가 없는 채팅의 도구 안내(검토 rev-flow 리드 2) — 고치기 절차 줄을 빼고 읽기 전용이라는 줄을 넣는다. 고치기 도구를 주면 CHAT_TOOL_GUIDE 그대로.
const EDIT_ONLY_LINES = [
  'Use read_project and edit_project for their supported queries and edits.',
  'Before editing, read the target',
  'Supported edits must use tools instead of',
  'The results tell you what was actually saved.',
  'For invalid_input fix the arguments',
  'For unknown_result/unverified, query the current target',
  'For approval_required, explain the pending approval',
  'For a compound edit-then-move request',
]
const READ_ONLY_LINE = 'Use read_project to look up saved project data. The app tools here are read-only: none of them changes or saves anything, so never say something was changed or saved because of a tool.'
const RESUME_SENTENCE = " resume restarts only an existing execution and requires the user's explicit request to resume generation."

/** 그 요청에 준 도구에 맞는 도구 안내 — 고치기 도구(edit_project)가 없으면 고치기 문장을, 실행 다시 돌리기(resume)가 없으면 그 문장을 뺀다(리드 2 · 7). */
export function chatToolGuide(tools: ReadonlyArray<{ name: string; input_schema?: unknown }>): string {
  const workflow = tools.find((tool) => tool.name === 'project_workflow')
  const actions = (workflow?.input_schema as { properties?: { action?: { enum?: unknown } } } | undefined)?.properties?.action?.enum
  const canEdit = tools.some((tool) => tool.name === 'edit_project')
  const canResume = !workflow || (Array.isArray(actions) && actions.includes('resume'))
  if (canEdit && canResume) return CHAT_TOOL_GUIDE
  let lines = CHAT_TOOL_GUIDE.split('\n')
  if (!canEdit) {
    lines = lines.filter((line) => !EDIT_ONLY_LINES.some((prefix) => line.startsWith(prefix)))
    lines.splice(lines.indexOf('<app-tools>') + 1, 0, READ_ONLY_LINE)
  }
  if (!canResume) lines = lines.map((line) => line.replace(RESUME_SENTENCE, ''))
  return lines.join('\n')
}

/** 모델이 그 요청에 주지 않은 도구 호출(id) — 서버가 거절 목록으로 넘기고 화면은 실행하지 않는다(리드 2 · architecture §3).
 *  주지 않은 이름, 그리고 고치기 도구(edit_project)를 그 요청에서 고칠 수 있는 자원 밖으로 부른 것(Storyboard 는 대사만 — 오너 Q1, 리드 "도구 하나로"). */
export function rejectedToolCallIds(turn: ToolTurn, tools: ReadonlyArray<{ name: string; input_schema?: unknown }>): string[] {
  const given = new Map(tools.map((tool) => [tool.name, tool]))
  const allowed = (call: ToolCall) => {
    const tool = given.get(String(call.name))
    if (!tool) return false
    if (call.name !== 'edit_project') return true
    const resources = (tool.input_schema as { properties?: { resource?: { enum?: unknown } } } | undefined)?.properties?.resource?.enum
    const resource = (call.input as { resource?: unknown } | null | undefined)?.resource
    return !Array.isArray(resources) || (typeof resource === 'string' && resources.includes(resource))
  }
  return turn.content.filter((block): block is ToolCall => block.type === 'tool_use' && !allowed(block as ToolCall)).map((call) => call.id)
}

/** 그 화면이 도구 호출을 실행해도 되는가 — Storyboard(writer)는 고치기 도구를 대사 자원에만 쓴다(오너 N3 · Q1, 리드 2 · "도구 하나로"). 콘티 · 다른 화면은 그대로. */
export function toolCallAllowedOnStage(stage: string, name: string, input?: unknown): boolean {
  if (stage !== 'writer' || name !== 'edit_project') return true
  return (input as { resource?: unknown } | null | undefined)?.resource === 'dialogue'
}

/** Storyboard 에서 대사 밖을 고치는 도구 호출에 모델로 돌려줄 결과 글(모델이 읽는다 — 사람에게는 모델이 화면 언어로 전한다). */
export const STORYBOARD_EDIT_REFUSAL = 'Storyboard changes only dialogue (edit_project with resource "dialogue"), so nothing was executed. The story, shots and scenes are edited on the rough storyboard of the Writer screen.'
