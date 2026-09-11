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

export function toolResourcesForStage(stage: string): string[] {
  if (stage === 'producer') return ['settings']
  if (stage === 'writer') return ['scenes', 'shots', 'dialogue', 'characters', 'backgrounds']
  if (stage === 'artist') return ['characters', 'backgrounds', 'appearances', 'background_appearances']
  return []
}

export const CHAT_TOOL_GUIDE = `
<app-tools>
Use read_project and edit_project for their supported queries and edits. They are real app operations.
Before editing, read the target and use its exact id and revision. Never invent IDs or revisions.
Supported edits must use tools instead of extractedSettings or updates JSON. Do not repeat a tool edit in final JSON.
Settings fields: playtime (seconds), genre, subGenre, format (horizontal_16:9/vertical_9:16/cinema_2.39:1/square_1:1), tone (array of labels), dialogueLanguage (ko/en/ja/zh).
Scene fields: location, timeOfDay, mood, narrativeSummary, originalTextQuote, charactersPresent, estimatedDurationSeconds.
Shot fields: shotType, actionDescription, characters, durationSeconds, dialogueLines.
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
Once the original request is answered, saved, or awaiting approval, summarize those results and end the turn. Only ask questions needed to resolve remaining requested work.
An approval card is already the user's next action for that target; do not add choice buttons for it or begin a new interview.
Consultation is allowed without tools. Never claim an edit succeeded from a text-only answer.
When project_workflow is available, use status for fresh saved stage/run/entry requirements, refresh to reload readiness without generation, and open to view an existing stage. handoff to Writer uses the existing start approval when no run exists. resume restarts only an existing execution and requires the user's explicit request to resume generation.
No Writer execution record is not proof of missing script: imported/restored projects may have saved scenes and shots without run history. Use savedScenes/savedShots and read_project to answer about actual content.
For a compound edit-then-move request, finish and verify ALL edits before opening the next stage. Approval or uncertain results keep that move pending. A navigation_requested result is only a request to open a screen; do not claim arrival. queued means execution accepted, not completed.
Keep using the existing approval/JSON paths for operations these tools do not support (creation, deletion, generation, Director handoff).
</app-tools>`

export function prepareChatTools(stage: string, enabled: unknown, history: unknown, workflow: unknown = false, domain: unknown = false): ChatToolContext | undefined {
  const resources = toolResourcesForStage(stage)
  if (enabled !== true || resources.length === 0) return undefined
  const messages = history ?? []
  if (!Array.isArray(messages) || messages.length > 18 || JSON.stringify(messages).length > 800_000 ||
    messages.some(m => !m || !['assistant', 'user'].includes(m.role) || !Array.isArray(m.content) ||
      m.content.length > 32 || m.content.some((b: ToolBlock) => !b || typeof b.type !== 'string'))) {
    throw new Error('Invalid chat tool history')
  }
  const resource = { type: 'string', enum: resources }
  return {
    messages: messages as BetaMessageParam[],
    tools: [
      { name: 'read_project', description: 'Read the current project data before answering state questions or editing. Returns exact target IDs, editable values and revisions. Settings are the current working board; other resources are saved rows.', input_schema: {
        type: 'object', properties: { resource, id: { type: 'string', description: 'Optional exact ID. Omit to list targets.' } }, required: ['resource'], additionalProperties: false,
      } },
      { name: 'edit_project', description: 'Edit one previously read target with its revision and only requested patch fields. Wait for saved/approval/failure result. No generation, creation, deletion or automatic approval.', input_schema: {
        type: 'object', properties: { resource, id: { type: 'string' }, revision: { type: 'string' }, patch: { type: 'object', description: 'Only editable fields listed in the app-tools instructions; preserve unchanged dialogue metadata.' } }, required: ['resource', 'id', 'revision', 'patch'], additionalProperties: false,
      } },
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
      ...(workflow === true ? [{ name: 'project_workflow', description: 'Read fresh project/run/entry state; refresh visible readiness; open an existing stage; propose initial Writer handoff; or explicitly resume the existing Writer execution. Never bypass approval or trigger generation from a status question.', input_schema: {
        type: 'object' as const, properties: { action: { type: 'string' as const, enum: ['status', 'refresh', 'open', 'handoff', 'resume'] }, targetStage: { type: 'string' as const, enum: ['producer', 'writer', 'artist'] } }, required: ['action'], additionalProperties: false,
      } }] : []),
    ],
  }
}
