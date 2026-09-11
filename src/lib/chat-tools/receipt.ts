import { translate } from '@/lib/i18n/translate'
import { withoutMediaGenerationProhibition } from '@/lib/handoff-intent'
import type { ToolOutcome } from './protocol'

/** Keep separate requested fields separate, even when they share a target. */
export function latestEdits(outcomes: ToolOutcome[]): ToolOutcome[] {
  const fields = new Map<string, ToolOutcome>()
  for (const outcome of outcomes) {
    if (outcome.call.name !== 'edit_project') continue
    const input = outcome.call.input as Record<string, unknown>
    const patch = input.patch && typeof input.patch === 'object' ? input.patch as Record<string, unknown> : {}
    for (const field of Object.keys(patch).length ? Object.keys(patch) : ['*']) {
      fields.set(JSON.stringify([input.resource, input.id, field]), outcome)
    }
  }
  return [...new Set(fields.values())]
}

function latestWorkflows(outcomes: ToolOutcome[]): ToolOutcome[] {
  const latest = new Map<string, ToolOutcome>()
  for (const outcome of outcomes) {
    if (outcome.call.name !== 'project_workflow') continue
    const input = outcome.call.input as Record<string, unknown>
    latest.set(JSON.stringify([input.action, input.targetStage]), outcome)
  }
  return [...latest.values()]
}

export function guardChatToolReply(reply: string, outcomes: ToolOutcome[], korean: boolean): string {
  const receipt = chatToolReceipt(outcomes, korean)
  // A model reply written before a successful fallback may still describe the earlier failure.
  const latest = latestEdits(outcomes)
  if (latestWorkflows(outcomes).some(o => o.result.status !== 'ok' || !['status', 'refresh'].includes(String((o.call.input as Record<string, unknown>).action)))) return receipt
  if (latest.some(({ result }) => result.status !== 'ok') ||
    (latest.some(({ result }) => result.source === 'json') && outcomes.some(({ result }) => result.status !== 'ok'))) return receipt
  return [reply, receipt].filter(Boolean).join('\n\n')
}

/** A narrow recovery hint for explicit edit requests; it never authorizes a write by itself. */
export function requestsSupportedChatEdit(stage: string, message: string): boolean {
  message = withoutMediaGenerationProhibition(message)
  if (!/(바꿔|바꾼|바꾸|변경(?:해|한|하고)|수정(?:해|한|하고)|고쳐|고치|번역(?:해|한|하고)|\b(change|update|edit|translate|rename)\b)/i.test(message)) return false // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  if (/(하지\s*마|말고|don't|do not)/i.test(message)) return false // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  if (stage === 'producer') return /(언어|설정|장르|톤|포맷|길이|상영|language|settings|genre|tone|format|runtime)/i.test(message) // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  if (stage === 'writer') return /(대사|내레이션|샷|씬|캐릭터|인물|배경|설명|dialogue|narration|shot|scene|character|background)/i.test(message) // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  if (stage === 'artist') return /(캐릭터|인물|배경|이름|설명|외형|character|background|appearance|description|name)/i.test(message) // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
  return false
}

/**
 * A narrow recovery hint for explicit Artist image-inspection requests. The canvas summary is a
 * screen snapshot, so a "no sheet" flag there never settles the request; this only asks the loop
 * to confirm a storage read happened. It does not cover every phrasing and never authorizes a write.
 */
export function requestsImageInspection(stage: string, message: string): boolean {
  if (stage !== 'artist') return false
  return message.split(/[.。!?\n]/).some(sentence =>
    !/(하지\s*마|말고|말아|필요\s*없|안\s*봐도|don't|do not|no need)/i.test(sentence) && // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
    !/(생성|만들|그려|generate|create|draw)/i.test(sentence) && // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
    /(이미지|그림|시트|사진|image|picture|sheet|photo)/i.test(sentence) && // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
    /(조회|확인|판독|비교|보고|봐|보여|살펴|\b(look|inspect|check|view|compare|see)\b)/i.test(sentence)) // i18n-ok: 한국어 사용자 입력을 인식하는 정규식.
}

export function chatToolReceipt(outcomes: ToolOutcome[], korean: boolean): string {
  const latest = latestEdits(outcomes)
  for (const outcome of latestWorkflows(outcomes)) {
    const input = outcome.call.input as Record<string, unknown>
    if (input.action === 'status' && outcome.result.status === 'ok') continue
    latest.push(outcome)
  }
  if (!latest.length) return ''
  const label = (text: string) => translate(korean ? 'ko' : 'en', text)
  const statuses: Record<string, string> = { ok: 'Saved and verified', approval_required: 'Awaiting approval', stale_state: 'Changed; read again', unknown_result: 'Save outcome unknown', unverified: 'Saved values differ', invalid_input: 'Invalid input', failed: 'Save failed', forbidden: 'No access', partial: 'Partially saved', limit: 'Recovery limit reached', blocked: 'Blocked', read_failed: 'Read failed' }
  return [label('Execution results'), ...latest.map(({ call, result }) => {
    const input = call.input as Record<string, unknown>
    const target = call.name === 'project_workflow' ? String(input.targetStage ?? 'Project') : input.id === 'settings' ? label('Settings') : String(input.id)
    const status = call.name === 'project_workflow' && result.status === 'ok' ? 'State refreshed' : result.status === 'navigation_requested' ? 'Screen navigation requested' : result.status === 'queued' ? 'Execution accepted' : statuses[result.status] ?? result.status
    return `- ${target}: ${label(status)}${!['ok', 'approval_required', 'navigation_requested', 'queued'].includes(result.status) && result.message ? ` (${result.message})` : ''}`
  })].join('\n')
}

/** A final text/JSON answer cannot replay or bypass an edit already handled by the tool executor. */
export function omitRepeatedToolEdits(data: Record<string, unknown>, outcomes: ToolOutcome[]): void {
  const edits = outcomes.filter(o => o.call.name === 'edit_project').map(o => o.call.input as Record<string, unknown>)
  if (edits.some(e => e.resource === 'settings') && data.extractedSettings && typeof data.extractedSettings === 'object') {
    const copy = { ...data.extractedSettings }
    for (const edit of edits.filter(e => e.resource === 'settings')) {
      for (const key of Object.keys((edit.patch as object) ?? {})) {
        if (['playtime', 'genre', 'subGenre', 'format', 'tone', 'dialogueLanguage'].includes(key)) delete (copy as Record<string, unknown>)[key]
      }
    }
    data.extractedSettings = Object.keys(copy).length ? copy : undefined
  }
  if (Array.isArray(data.updates)) data.updates = data.updates.flatMap(update => {
    if (!update || typeof update !== 'object') return []
    if (['updateScene', 'updateShot'].includes(update.type) && update.patch && typeof update.patch === 'object') {
      const patch = { ...update.patch }
      for (const edit of edits.filter(e => e.id === update.id && (update.type === 'updateScene' ? e.resource === 'scenes' : ['shots', 'dialogue'].includes(String(e.resource))))) {
        for (const key of Object.keys((edit.patch as object) ?? {})) delete patch[key]
      }
      return Object.keys(patch).length ? [{ ...update, patch }] : []
    }
    return edits.some(e =>
      (e.resource === 'characters' && ['updateCharacter', 'changeAppearance'].includes(update.type) && update.characterId === e.id) ||
      (e.resource === 'backgrounds' && update.type === 'updateWorldAsset' && update.locationId === e.id)) ? [] : [update]
  })
  if (Array.isArray(data.proposals)) data.proposals = data.proposals.filter(p => !edits.some(e => e.resource === 'characters' && p.characterId === e.id && Object.hasOwn((e.patch as object) ?? {}, 'appearance')))
  if (Array.isArray(data.locationProposals)) data.locationProposals = data.locationProposals.filter(p => !edits.some(e => e.resource === 'backgrounds' && p.locationId === e.id && Object.hasOwn((e.patch as object) ?? {}, 'visualDescription')))
}
