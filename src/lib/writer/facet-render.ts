import { isFlagOn } from '@/lib/flags'
import {
  DEFAULT_MODELS,
  generateJson,
  type DispatchOptions,
  type LlmAxisConfig,
} from '@/lib/writer/llm/dispatch'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

export type FacetRenderSpec = Partial<ShotStaticSpec>
export type FacetRenderLlm = (
  prompt: string,
  cfg: LlmAxisConfig,
  opts?: DispatchOptions,
) => Promise<unknown>

const FACET_RENDER_AXIS: LlmAxisConfig = DEFAULT_MODELS.V
const FACET_RENDER_TIMEOUT_MS = 5000

const SHOT_SIZE_WORDS: Record<string, string> = {
  ECU: 'extreme close-up',
  CU: 'close-up',
  MCU: 'medium close-up',
  MS: 'medium shot',
  WS: 'wide shot',
  EWS: 'extreme wide shot',
  OTS: 'over-the-shoulder shot',
  '2S': 'two-shot',
  INSERT: 'insert shot',
  POV: 'point-of-view shot',
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function normalizeJson(value: unknown): JsonValue | undefined {
  if (value === null) return null

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJson(item)
      return normalized === undefined ? null : normalized
    })
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : null
    case 'object': {
      const source = value as Record<string, unknown>
      const out: Record<string, JsonValue> = {}
      for (const key of Object.keys(source).sort()) {
        const normalized = normalizeJson(source[key])
        if (normalized !== undefined) out[key] = normalized
      }
      return out
    }
    default:
      return undefined
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJson(value)) ?? 'null'
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function words(value: unknown): string {
  return cleanText(value).replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

function joinPrompt(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => cleanText(part))
    .filter((part) => part.length > 0)
    .join(' ')
}

function list(values: string[]): string {
  return values.filter((value) => value.length > 0).join(', ')
}

function sentence(label: string, parts: string[]): string | null {
  const body = parts.filter((part) => part.length > 0).join('; ')
  return body ? `${label}: ${body}.` : null
}

function describeCamera(spec: FacetRenderSpec): string {
  const shotCode = cleanText(spec.shot_type).toUpperCase()
  const shotName = (SHOT_SIZE_WORDS[shotCode] ?? words(spec.shot_type)) || 'shot'
  const angle = words(spec.camera_angle) || 'unspecified angle'
  const lens = Number.isFinite(spec.lens_mm) ? `${spec.lens_mm}mm lens` : 'unspecified lens'
  const dof = words(spec.depth_of_field)

  return `${capitalize(shotName)}${shotCode ? ` (${shotCode})` : ''}, ${angle} camera angle, ${lens}${dof ? `, ${dof} depth of field` : ''}.`
}

function describeFraming(spec: FacetRenderSpec): string | null {
  const framing = spec.framing
  const layers = framing?.layers ?? {}
  return sentence('Framing', [
    framing?.rule ? `${words(framing.rule)} composition rule` : '',
    framing?.focal_point ? `focal point ${cleanText(framing.focal_point)}` : '',
    layers.foreground ? `foreground ${cleanText(layers.foreground)}` : '',
    layers.midground ? `midground ${cleanText(layers.midground)}` : '',
    layers.background ? `background ${cleanText(layers.background)}` : '',
  ])
}

function describeBlocking(spec: FacetRenderSpec): string {
  const blocking = (spec.character_blocking ?? []).map((b) => {
    const name = cleanText(b.character_id) || 'unnamed character'
    return list([
      name,
      words(b.position_in_frame) ? `at ${words(b.position_in_frame)}` : '',
      words(b.pose) ? `pose ${words(b.pose)}` : '',
      words(b.gaze) ? `gaze ${words(b.gaze)}` : '',
      cleanText(b.asset_version) ? `asset ${cleanText(b.asset_version)}` : '',
    ])
  })

  return blocking.length ? `Blocking: ${blocking.join('; ')}.` : 'Blocking: no characters specified.'
}

function describeLighting(spec: FacetRenderSpec): string | null {
  const lighting = spec.lighting
  if (!lighting) return null

  return sentence('Lighting', [
    lighting.quality ? `${lighting.quality} key quality` : '',
    lighting.key_direction ? `key from ${words(lighting.key_direction)}` : '',
    lighting.key_fill_ratio ? `key/fill ${cleanText(lighting.key_fill_ratio)}` : '',
    Number.isFinite(lighting.color_temp_kelvin) ? `${lighting.color_temp_kelvin}K color temperature` : '',
  ])
}

function describeProps(spec: FacetRenderSpec): string | null {
  const props = (spec.prop_placement ?? [])
    .map((prop) =>
      list([
        cleanText(prop.prop),
        words(prop.position_in_frame) ? `at ${words(prop.position_in_frame)}` : '',
        prop.significance ? `significance ${cleanText(prop.significance)}` : '',
      ]),
    )
    .filter(Boolean)

  return props.length ? `Props: ${props.join('; ')}.` : null
}

function describeColor(spec: FacetRenderSpec): string | null {
  return sentence('Palette and color grading', [
    spec.palette_emphasis?.length ? `palette ${spec.palette_emphasis.map(cleanText).filter(Boolean).join(', ')}` : '',
    spec.color_grading_intent ? `grade ${cleanText(spec.color_grading_intent)}` : '',
    spec.texture_notes ? `texture ${cleanText(spec.texture_notes)}` : '',
  ])
}

function buildLlmPrompt(spec: FacetRenderSpec, template: string): string {
  return `[static_spec facets — sorted-key JSON]\n${stableStringify(spec)}\n\n[deterministic fallback prompt]\n${template}\n\n[output JSON]\n{ "prompt": "one concise director-facing color first-frame prompt" }`
}

function extractPrompt(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const prompt = cleanText(raw)
    return prompt || null
  }
  if (!raw || typeof raw !== 'object') return null

  const record = raw as Record<string, unknown>
  for (const key of ['prompt', 'director_prompt', 'rendered_prompt']) {
    const prompt = cleanText(record[key])
    if (prompt) return prompt
  }
  return null
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('FACET_RENDER timed out')), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function facetsHash(spec: FacetRenderSpec): string {
  const payload = stableStringify(spec)
  return `fctv1_${fnv1a32(payload)}_${payload.length.toString(36)}`
}

export function renderDirectorPromptTemplate(spec: FacetRenderSpec): string {
  return joinPrompt([
    describeCamera(spec),
    describeFraming(spec),
    describeBlocking(spec),
    describeLighting(spec),
    describeProps(spec),
    describeColor(spec),
  ])
}

export async function renderDirectorPromptFromFacets(
  spec: FacetRenderSpec,
  opts: { llm?: FacetRenderLlm; flagOverride?: boolean } = {},
): Promise<string> {
  const fallback = renderDirectorPromptTemplate(spec)
  if (!isFlagOn('FACET_RENDER', { override: opts.flagOverride })) return fallback

  const llm: FacetRenderLlm =
    opts.llm ??
    ((prompt: string, cfg: LlmAxisConfig, dispatchOpts?: DispatchOptions) =>
      generateJson<unknown>(prompt, cfg, dispatchOpts))

  const systemInstruction = `You turn structured shot static_spec facets into one concise director-facing first-frame prompt. Preserve real character names or IDs, color words, camera specs, blocking, lighting, palette, and color grading. Do not apply storyboard mannequin rules. Do not invent events outside the facets. Return JSON only: {"prompt":"..."}.`

  try {
    const raw = await withTimeout(
      llm(buildLlmPrompt(spec, fallback), FACET_RENDER_AXIS, {
        systemInstruction,
        temperature: 0.2,
        maxTokens: 700,
      }),
      FACET_RENDER_TIMEOUT_MS,
    )
    return extractPrompt(raw) ?? fallback
  } catch {
    return fallback
  }
}
