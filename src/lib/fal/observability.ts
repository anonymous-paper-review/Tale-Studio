import { computeIgnoredFields } from '@/lib/fal/model-schemas'
import type { Json } from '@/types/database'

export type JsonObject = { [key: string]: Json | undefined }
export type FalRequestBody = Record<string, unknown>

export interface FalRequestCapturePatch extends JsonObject {
  fal_request: JsonObject
  ignored_fields: string[]
}

function toJson(value: unknown): Json {
  try {
    const serialized = JSON.stringify(value ?? null)
    return JSON.parse(serialized ?? 'null') as Json
  } catch {
    return null
  }
}

function toJsonObject(value: unknown): JsonObject {
  const json = toJson(value)
  return json && typeof json === 'object' && !Array.isArray(json) ? json : {}
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function compactJsonObject(input: JsonObject): JsonObject {
  const out: JsonObject = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function hasKeys(input: JsonObject): boolean {
  return Object.keys(input).length > 0
}

function maybeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function maybeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function maybeBooleanArray(value: unknown): boolean[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
    ? value
    : undefined
}

function summarizeMedia(value: unknown): JsonObject {
  const media = asRecord(value)
  if (!media) return {}
  const url = maybeString(media.url)
  return compactJsonObject({
    has_url: url ? true : undefined,
    width: maybeNumber(media.width),
    height: maybeNumber(media.height),
    duration: maybeNumber(media.duration),
    content_type: maybeString(media.content_type) ?? maybeString(media.contentType),
    file_size: maybeNumber(media.file_size) ?? maybeNumber(media.fileSize),
  })
}

function summarizeFalResult(payload: unknown): JsonObject {
  const data = asRecord(payload)
  if (!data) return {}

  const images = Array.isArray(data.images)
    ? data.images.map(summarizeMedia).filter(hasKeys)
    : []
  const singleImage = summarizeMedia(data.image)
  const video = summarizeMedia(data.video)
  const timings = toJsonObject(data.timings)
  const hasImage = images.length > 0 || hasKeys(singleImage)
  const hasVideo = hasKeys(video)

  return compactJsonObject({
    kind: hasVideo ? 'video' : hasImage ? 'image' : 'unknown',
    payload_keys: Object.keys(data).sort(),
    image_count: images.length || (hasKeys(singleImage) ? 1 : undefined),
    images: images.length ? images : undefined,
    image: !images.length && hasKeys(singleImage) ? singleImage : undefined,
    video: hasVideo ? video : undefined,
    seed: maybeNumber(data.seed),
    timings: hasKeys(timings) ? timings : undefined,
    has_nsfw_concepts: maybeBooleanArray(data.has_nsfw_concepts),
  })
}

export function buildFalRequestCapturePatch(
  falRequest: FalRequestBody,
  modelKey: string | null | undefined,
): FalRequestCapturePatch {
  return {
    fal_request: toJsonObject(falRequest),
    ignored_fields: computeIgnoredFields(falRequest, modelKey),
  }
}

export function buildBestEffortFalRequestCapturePatch(
  falRequest: FalRequestBody,
  modelKey: string | null | undefined,
): FalRequestCapturePatch {
  try {
    return buildFalRequestCapturePatch(falRequest, modelKey)
  } catch {
    return { fal_request: toJsonObject(falRequest), ignored_fields: [] }
  }
}

export function buildFalResponseSnapshot(
  payload: unknown,
  modelKey: string | null | undefined,
  submittedIgnoredFields: readonly string[] = [],
): JsonObject {
  const data = asRecord(payload)
  const inputEcho = asRecord(data?.input)
  const inputEchoJson = inputEcho ? toJsonObject(inputEcho) : null
  const echoedIgnoredFields = inputEcho ? computeIgnoredFields(inputEcho, modelKey) : []
  const ignoredFields = compactJsonObject({
    submitted: [...submittedIgnoredFields],
    input_echo: inputEcho ? echoedIgnoredFields : undefined,
  })

  return compactJsonObject({
    input_echo: inputEchoJson && hasKeys(inputEchoJson) ? inputEchoJson : undefined,
    result_meta: summarizeFalResult(payload),
    ignored_fields: ignoredFields,
  })
}
