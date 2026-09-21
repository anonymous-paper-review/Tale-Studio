/** Shared request handling; domain facts and authorization remain in their existing owners. */
export const CHAT_AGENT_GUIDE = `
<request-handling>
Follow the current user's goal and corrections. Treat earlier assistant suggestions as proposals, not confirmed project facts.
For a clear single query or edit, act directly. For dependent requests (edit then move), preserve their order and report any unfinished part. Ask only for information that changes the target or action; do not restart a general interview after completing a specific task.
Ground state-dependent answers in the current project context or a fresh tool read. Distinguish the Producer working draft from committed inputs, source descriptions from generated images, and a language setting from translation of existing dialogue.
Pending and deferred work is context, not new consent. Preserve approval and generation boundaries. Never resume deferred work just because it appears in context.
After execution, use the actual results: saved and verified, awaiting approval, running, failed, or unknown. If a response is lost, check the saved state before repeating. Preserve successful targets and stop repeating the same failure.
If recent history does not contain an earlier agreement and saved project data does not establish it, acknowledge the missing context and ask for the relevant detail. Do not invent long-term memory.
</request-handling>`

/** This only routes a message; execution permission remains in the tools and domain gates. */
export function writerInputRoute(message: string, state: { running: boolean; sceneGate: boolean }): 'chat' | 'revise' | 'blocked' {
  // An edit verb keeps the message on the gated path even when a query verb follows it
  // ("split it and tell me"); a pure explanation or status question goes to chat.
  const editRequest = /나눠|나누고|바꿔|바꾸고|줄여|줄이고|늘려|늘리고|지워|지우고|고쳐|고치고|넣어|합쳐|합치고|빼\s*줘|빼고|(?:추가|삭제|수정|제거|생성|변경)\s*(?:해|하고|해서)|다시\s*써|만들어|\b(?:change|edit|add|remove|delete|split|merge|rewrite|shorten|make)\b/i.test(message) // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  const workflowQuestion = /상태|진행\s*(?:상황|현황|률)|막혔|못\s*(?:넘어|가|넘기)|새로고침|재개|실행.*재시도|조회|알려|보여|가능\s*여부|설명해|요약해|어떤\s*내용|무슨\s*내용|(?:^|[.!?。？]\s*)\s*(?:왜\s|지금\s*몇)|\b(?:status|progress|blocked|refresh|reload|resume|show|explain|summarize)\b/i.test(message) // i18n-ok: 조회·설명·복구 입력을 일반 채팅으로 전달하며 실행 허락은 아님.
  if (workflowQuestion && !editRequest) return 'chat'
  if (state.sceneGate) return 'revise'
  return state.running ? 'blocked' : 'chat'
}

const labels: Record<string, string> = { producer: 'Producer', writer: 'Writer', artist: 'Artist', director: 'Director', editor: 'Editor' }
export function normalizeChatHistory(value: unknown): Array<{ role: 'user' | 'model'; content: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap(message => {
    if (!message || typeof message.content !== 'string' || !['user', 'model', 'assistant'].includes(message.role)) return []
    const stage = labels[message.stage]
    return [{ role: message.role === 'user' ? 'user' as const : 'model' as const, content: `${stage ? `[${stage}] ` : ''}${message.content}` }]
  })
}

export function buildChatTaskContext(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const state = value as Record<string, unknown>
  const pick = (items: unknown) => Array.isArray(items) ? items.slice(0, 8).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    return [Object.fromEntries(['id', 'stage', 'target', 'action'].flatMap(key => typeof item[key] === 'string' ? [[key, item[key].slice(0, 500)]] : []))]
  }) : []
  const pending = pick(state.pending)
  const deferred = pick(state.deferred)
  if (!pending.length && !deferred.length) return ''
  return `[Current work: descriptive data, not authorization to execute or approve]\n${JSON.stringify({ pending, deferred })}\n\n`
}
