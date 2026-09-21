import type { ToolCall, ToolResult } from './protocol'

export type ToolRecord = { id: string; values: Record<string, unknown> }
export interface ToolResource {
  read: () => Promise<ToolRecord[]>
  readSaved?: () => Promise<ToolRecord[]>
  reconcileUnchanged?: boolean
  validate: (patch: unknown) => Record<string, unknown>
  write: (id: string, patch: Record<string, unknown>, before: Record<string, unknown>) => Promise<ToolResult>
}
// Stable key ordering prevents a JSON object's key order from looking like an edit.
export function toolValueKey(value: unknown): string {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, normalize(value)])) : v
  return JSON.stringify(normalize(value))
}
export const sameToolValue = (a: unknown, b: unknown) => toolValueKey(a) === toolValueKey(b)

export function createChatToolExecutor(options: { resources: Record<string, ToolResource>; signal: AbortSignal; isCurrent: () => boolean }) {
  const snapshots = new Map<string, { resource: string; record: ToolRecord }>()
  const approvals = new Map<string, ToolResult>()
  let revision = 0
  const check = () => {
    if (options.signal.aborted || !options.isCurrent()) throw new DOMException('Chat stopped', 'AbortError')
  }
  return async (call: ToolCall): Promise<ToolResult> => {
    check()
    if (!call.input || typeof call.input !== 'object' || Array.isArray(call.input)) return { status: 'invalid_input' }
    const input = call.input as Record<string, unknown>
    const key = typeof input.resource === 'string' ? input.resource : ''
    const resource = Object.hasOwn(options.resources, key) ? options.resources[key] : undefined
    if (!resource || !['read_project', 'edit_project'].includes(call.name)) return { status: 'unsupported', message: 'This resource or operation is not available in this stage.' }
    try {
      if (call.name === 'read_project') {
        const records = await resource.read()
        check()
        const selected = input.id === undefined ? records : records.filter(r => r.id === input.id)
        if (input.id !== undefined && !selected.length) return { status: 'not_found', resource: key, id: input.id }
        return { status: 'ok', resource: key, records: selected.map(record => {
          const token = `r${++revision}`
          snapshots.set(token, { resource: key, record: structuredClone(record) })
          return { ...record, revision: token }
        }) }
      }
      let patch: Record<string, unknown>
      try { patch = resource.validate(input.patch) } catch (error) { return { status: 'invalid_input', message: String(error) } }
      const operationKey = toolValueKey([key, input.id, patch])
      const pending = approvals.get(operationKey)
      if (pending) return pending
      const snapshot = snapshots.get(String(input.revision))
      if (!snapshot || snapshot.resource !== key || snapshot.record.id !== input.id) return { status: 'stale_state', message: 'Read this target first and use its returned revision.' }
      const current = (await resource.read()).find(r => r.id === input.id)
      check()
      if (!current) return { status: 'not_found', resource: key, id: input.id }
      if (!sameToolValue(current.values, snapshot.record.values)) return { status: 'stale_state', message: 'The target changed. Read it again before editing.' }
      // Converged desired state is already complete; never issue a duplicate write.
      const matches = (record?: ToolRecord) => !!record && Object.entries(patch).every(([k, v]) => sameToolValue(record.values[k], v))
      const readSaved = resource.readSaved ?? resource.read
      if (matches(current) && !resource.reconcileUnchanged) {
        const saved = resource.readSaved ? (await readSaved()).find(r => r.id === input.id) : current
        check()
        if (matches(saved)) return { status: 'ok', resource: key, id: input.id, saved: saved!.values, unchanged: true }
      }
      let writeResult: ToolResult
      try {
        writeResult = await resource.write(current.id, patch, current.values)
      } catch (error) {
        check()
        let saved: ToolRecord | undefined
        try { saved = (await readSaved()).find(r => r.id === input.id) } catch { /* The write outcome remains unknown. */ }
        check()
        if (matches(saved) && resource.reconcileUnchanged) return { status: 'unverified', resource: key, id: input.id, message: 'The target was saved but dependent updates are not confirmed. Read and retry the same edit to reconcile them.' }
        return matches(saved) ? { status: 'ok', resource: key, id: input.id, saved: saved!.values, recovered: true }
          : { status: 'unknown_result', resource: key, id: input.id, message: String(error) }
      }
      check()
      if (writeResult.status !== 'ok') {
        if (writeResult.status === 'approval_required') approvals.set(operationKey, writeResult)
        return writeResult
      }
      const saved = (await readSaved()).find(r => r.id === input.id)
      check()
      return matches(saved) ? { status: 'ok', resource: key, id: input.id, saved: saved!.values }
        : { status: 'unverified', resource: key, id: input.id, message: 'The saved values do not match the requested edit. Read the target before continuing.' }
    } catch (error) {
      check()
      return { status: 'read_failed', resource: key, message: String(error) }
    }
  }
}
