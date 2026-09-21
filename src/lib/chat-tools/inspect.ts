import type { ToolResult } from './protocol'

export type InspectionTarget = 'scene' | 'shot' | 'character' | 'background'
export interface InspectionRequest {
  target: InspectionTarget
  id: string
  appearanceKey?: string
  includeImage?: boolean
  expectedImageRevision?: string
}
export function parseInspection(value: unknown, stage: string): InspectionRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const targets = stage === 'writer' ? ['scene', 'shot'] : stage === 'artist' ? ['character', 'background'] : []
  const key = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v)
  if (!targets.includes(String(input.target)) || !key(input.id) ||
    Object.keys(input).some(k => !['target', 'id', 'appearanceKey', 'includeImage', 'expectedImageRevision'].includes(k)) ||
    (input.appearanceKey !== undefined && !key(input.appearanceKey)) ||
    (input.includeImage !== undefined && typeof input.includeImage !== 'boolean') ||
    (stage !== 'artist' && (input.appearanceKey !== undefined || input.includeImage !== undefined)) ||
    (input.expectedImageRevision !== undefined && (stage !== 'artist' || input.includeImage !== true || typeof input.expectedImageRevision !== 'string' || !/^(none|[a-f0-9]{8}-[0-9]+)$/.test(input.expectedImageRevision))) ||
    (input.includeImage === true && !input.appearanceKey)) return null
  return { ...input } as unknown as InspectionRequest
}

/** URL identity hint, not authorization or a hash of image bytes. */
export function inspectionImageRevision(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'none'
  let hash = 2166136261
  for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 16777619)
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${url.length}`
}

export async function executeProjectInspection(projectId: string, stage: string, input: unknown, signal: AbortSignal, selection?: { target: string; id: string; appearanceKey: string; imageRevision?: string } | null): Promise<ToolResult> {
  const request = parseInspection(input, stage)
  if (!request) return { status: 'invalid_input', message: 'Use an exact target ID and, for image inspection, an exact appearanceKey from the project context or appearance list.' }
  if (request.includeImage && selection?.target === request.target && selection.id === request.id && selection.appearanceKey === request.appearanceKey && selection.imageRevision) {
    request.expectedImageRevision = selection.imageRevision
  }
  try {
    const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/chat-inspect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ stage, ...request }),
    })
    const result = await response.json()
    return response.ok ? result : { status: response.status === 403 ? 'forbidden' : 'read_failed', message: result.error ?? 'Project evidence could not be read.' }
  } catch (error) {
    if (signal.aborted) throw error
    return { status: 'read_failed', message: 'Project evidence could not be read. Its absence has not been established.' }
  }
}

export const WRITER_DOMAIN_GUIDE = `
<writer-evidence>
Use inspect_project for questions about saved shot intent, composition, camera motion, scene stage/axis, continuity or recorded checks. read_project remains the small editable-data tool.
Separate: current saved facts, generation-time intent from the selected run, general filmmaking knowledge, and a new proposal. The loader searches only the latest five runs and prefers completed runs. It returns selectedRun provenance, but design_ref has no run ID: currentShotRunLink is unverified. Describe this as a saved design snapshot, not proven origin of this current shot. not_found applies only to this search scope. Different durations in an unverified run snapshot and the current row do not establish that an edit occurred. Do not infer edit chronology or claim edit history is absent: this tool does not query edit history. Report only the two values and the uncertain connection.
An unreturned field is not proof of no record. Report not_recorded/not_linked/not_found/read_failed accurately; read_failed means unknown, not absent.
For explanations, use the saved stage axis and screen layout; do not invent coordinates. Relate recorded camera movement to its motivation/target and compare saved emotional/narrative states when discussing continuity. These principles also guide Writer shot design; they are guidance, not proof of this project's intent.
Existing check notes are recorded observations, not a new quality verdict. Do not generate, edit or start a style interview from a request for explanation.
</writer-evidence>`

export const ARTIST_DOMAIN_GUIDE = `
<artist-evidence>
Use inspect_project to read a character/background's complete appearance list and exact saved description. To look at a picture, call it with includeImage:true and an exact appearanceKey. The server then supplies the corresponding existing image in the tool result. For an explicit image-inspection request, query even if the canvas summary says no sheet/no image: that summary may be stale and does not establish current absence.
The request may include the user's last explicit card/appearance/image selection. It is a target hint, not consent to edit or generate; a newly named target in the user's message takes precedence. It does not imply a dialog is still open. Ask if 'this image' remains ambiguous.
Distinguish saved source description, selected narrative-time appearance, the actual observed image, and proposed changes. Only claim visual observations when an image block was supplied. If stale_state, the selected image changed: do not describe a replacement as the clicked image; ask the user to select the current image again. If image_unavailable/read_failed, explain what remains unverified; do not infer pixels from the description or a has-image flag.
Use the selected character sheet or background image only. Do not substitute a portrait, default look, other appearance or candidate. A selected candidate whose URL differs from the displayed image is a mismatch, not the same image.
Description-only edits do not repaint existing images. Read-only inspection never approves a proposal, selects a candidate or generates media. Answer the requested comparison and end without an unrelated planning interview.
</artist-evidence>`
