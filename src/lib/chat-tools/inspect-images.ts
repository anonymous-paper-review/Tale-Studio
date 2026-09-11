import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { ChatToolContext, ToolBlock } from './protocol'
import { parseInspection, type InspectionRequest } from './inspect'
import { loadProjectInspection } from './inspect-server'

function containsImage(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsImage)
  const object = value as Record<string, unknown>
  return object.type === 'image' || Object.values(object).some(containsImage)
}

/** Browser tool history is untrusted. Only project-owned DB references become images. */
export async function hydrateInspectionImages(context: ChatToolContext, projectId: string): Promise<void> {
  if (containsImage(context.messages)) throw new Error('Client-supplied image blocks are not allowed in Artist tool history')
  const ids = new Set<string>()
  const results = new Set<string>()
  let imageCalls = 0
  // Validate the complete batch before doing any DB reads.
  for (const message of context.messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content as unknown as ToolBlock[]) {
      if (block.type === 'tool_use') {
        const id = String(block.id)
        if (ids.has(id)) throw new Error('Duplicate tool call ID')
        ids.add(id)
        if (block.name === 'inspect_project' && parseInspection(block.input, 'artist')?.includeImage && ++imageCalls > 16) throw new Error('Too many image inspections')
      }
      if (block.type === 'tool_result') {
        const id = String(block.tool_use_id)
        if (results.has(id) || !ids.has(id)) throw new Error('Invalid tool result ID')
        results.add(id)
      }
    }
  }
  const calls = new Map<string, InspectionRequest>()
  const messages = structuredClone(context.messages)
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content as unknown as ToolBlock[]) {
      if (message.role === 'assistant' && block.type === 'tool_use' && block.name === 'inspect_project') {
        const input = parseInspection(block.input, 'artist')
        if (input?.includeImage) calls.set(String(block.id), input)
      }
      if (message.role !== 'user' || block.type !== 'tool_result') continue
      const input = calls.get(String(block.tool_use_id))
      if (!input) continue
      try {
        const { result, imageUrl } = await loadProjectInspection(projectId, input)
        let previous: { imageRevision?: string } = {}
        try { previous = JSON.parse(typeof block.content === 'string' ? block.content : '') } catch { /* Unverifiable prior result: never attach replacement pixels. */ }
        if (imageUrl && (!previous?.imageRevision || previous.imageRevision !== result.imageRevision)) {
          block.content = JSON.stringify({ status: 'stale_state', message: 'The inspected image reference changed or could not be verified. No replacement image was supplied. Read the current image again before discussing it.' })
          block.is_error = true
          continue
        }
        block.content = [{ type: 'text', text: JSON.stringify(result) }, ...(imageUrl ? [{ type: 'image', source: { type: 'url', url: imageUrl } }] : [])]
        block.is_error = result.status !== 'ok'
      } catch {
        block.content = JSON.stringify({ status: 'read_failed', message: 'The selected image could not be checked. No visual observation was made.' })
        block.is_error = true
      }
    }
  }
  context.messages = messages as BetaMessageParam[]
}
