import type { ToolCall, ToolOutcome, ToolResult } from './protocol'

export interface ProjectWorkflowSnapshot {
  projectId: string
  currentStage: string
  reachedStage: string
  allowedStages: string[]
  producer: { canHandoff: boolean; blockers: string[]; [key: string]: unknown }
  writer: { started: boolean; status: string | null; [key: string]: unknown }
  artist: { images_ready: boolean; [key: string]: unknown }
}

export function unresolvedChatEdits(outcomes: ToolOutcome[], required: boolean): boolean {
  const fields = new Map<string, string>()
  for (const { call, result } of outcomes) {
    if (call.name !== 'edit_project' || !call.input || typeof call.input !== 'object') continue
    const input = call.input as Record<string, unknown>
    const patch = input.patch && typeof input.patch === 'object' ? input.patch : {}
    for (const field of Object.keys(patch).length ? Object.keys(patch) : ['*']) {
      fields.set(JSON.stringify([input.resource, input.id, field]), result.status)
    }
  }
  return (required && fields.size === 0) || [...fields.values()].some(status => status !== 'ok')
}

export function createProjectWorkflow(deps: {
  read: () => Promise<ProjectWorkflowSnapshot>
  refresh: (snapshot: ProjectWorkflowSnapshot) => Promise<void>
  navigate: (target: string) => Promise<ToolResult>
  handoff: () => Promise<ToolResult>
  resume: () => Promise<ToolResult>
  authorized: (action: string, target?: string) => boolean
  isCurrent: () => boolean
  outcomes: () => ToolOutcome[]
  requiresEdit: boolean
}) {
  // Per user turn, independent of the model's tool IDs. Blocked attempts remain retryable.
  const completed = new Map<string, ToolResult>()
  const check = () => { if (!deps.isCurrent()) throw new DOMException('Chat stopped', 'AbortError') }
  return async (call: ToolCall): Promise<ToolResult> => {
    check()
    const input = call.input as Record<string, unknown> | null
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['action', 'targetStage'].includes(key)) ||
      !['status', 'refresh', 'open', 'handoff', 'resume'].includes(String(input.action)) ||
      (input.targetStage !== undefined && !['producer', 'writer', 'artist'].includes(String(input.targetStage)))) {
      return { status: 'invalid_input', message: 'Use a supported action and Producer, Writer or Artist target.' }
    }
    const action = String(input.action)
    const target = typeof input.targetStage === 'string' ? input.targetStage : undefined
    if (['open', 'handoff'].includes(action) && !target) return { status: 'invalid_input', message: 'Specify targetStage.' }
    if (action !== 'status' && !deps.authorized(action, target)) return { status: 'blocked', message: 'The current user request does not authorize this action. Ask before changing stage or resuming generation.' }
    const key = `${action}:${target ?? ''}`
    if (completed.has(key)) return completed.get(key)!
    let state: ProjectWorkflowSnapshot
    try { state = await deps.read() } catch (error) {
      check()
      return { status: 'read_failed', message: error instanceof Error ? error.message : 'Project state could not be read. No action was executed.' }
    }
    check()
    if (action === 'status') return { status: 'ok', state }
    if (action === 'refresh') {
      await deps.refresh(state)
      check()
      return { status: 'ok', message: 'The visible project state was refreshed. No generation was started.', state }
    }
    if (unresolvedChatEdits(deps.outcomes(), deps.requiresEdit)) return { status: 'blocked', message: 'The original request still has an edit that is missing, awaiting approval, or not verified. Finish that work before moving or resuming.' }
    let result: ToolResult
    if (action === 'resume') {
      if (!state.writer.started || !['failed', 'running'].includes(state.writer.status ?? '')) return { status: 'blocked', message: `Writer is ${state.writer.status ?? 'not started'}. No execution was resumed. Approval waits must use the existing approval action.` }
      result = await deps.resume()
    } else if (action === 'handoff' && target === 'writer' && !state.writer.started && !state.allowedStages.includes('writer')) {
      if (!state.producer.canHandoff) return { status: 'blocked', message: 'Producer requirements are not ready.', blockers: state.producer.blockers, state }
      result = await deps.handoff()
    } else {
      if (!state.allowedStages.includes(target!)) return { status: 'blocked', message: `${target} is not ready to open. Inspect the state and resolve the remaining requirements.`, state }
      result = await deps.navigate(target!)
    }
    check()
    if (['ok', 'navigation_requested', 'approval_required', 'queued'].includes(result.status)) completed.set(key, result)
    return result
  }
}
