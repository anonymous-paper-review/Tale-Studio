// 완료된 FAL 결과를 영속화 (webhook 핸들러 + poll reconcile 양쪽에서 공유).
//
// 캐릭터 뷰: FAL 이미지 URL → 바이트 회수 → Supabase storage 업로드 → characters 컬럼 갱신.
//            (옛 동기 generate-sheet 라우트의 3~4단계를 그대로 서버사이드로 이동)
// 샷 영상:   linked job은 clip/job별 immutable Storage 경로에 보관하고 RPC로 take를 완료한다.
//            연결되지 않은 legacy job만 shots.video_url을 직접 갱신한다.
//
// 멱등성: 호출부와 DB 상태 가드가 중복 webhook을 차단한다. linked 영상은 upsert 없이 같은
//         clip/job 키만 재사용하며, DB 완료 실패는 queued 상태로 남겨 다음 webhook/poll이 재시도한다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  completeGenerationJob,
  patchGenerationJobResponseSnapshotByRequestId,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { type CandidateView } from '@/lib/image-provenance'
import { cropTurnaroundPortrait } from '@/lib/artist/portrait'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { completeDirectorVideoAttempt } from '@/lib/director-video-takes'
import { buildFalResponseSnapshot } from '@/lib/fal/observability'
import {
  ImmutableObjectMismatchError,
  uploadImmutableObject,
} from '@/lib/storage/immutable-object'
import { storageKeySegment } from '@/lib/storage/key-segment'

// Natural IDs stay in the database; new storage objects use the shared versioned,
// collision-resistant segment so every writer resolves the same namespace.

// 결정적 경로 + upsert 는 재생성 후에도 public URL 이 영원히 같다 → 브라우저/CDN(max-age=3600)이
//   옛 이미지를 계속 서빙하고, src 문자열이 동일해 React 재렌더도 없어 "재생성했는데 그대로"로 보인다
//   (턴어라운드가 저장소엔 있는데 화면은 옛 정면샷이던 버그, 2026-07-12). 업로드 시각 버전 쿼리로
//   캐시 키만 갈아준다 — 저장 객체는 한 개 그대로(단일 이미지 정책 유지). webhook 재전송 시 ?v 값만
//   달라질 뿐 같은 객체를 가리켜 재실행 무해성도 유지된다.
function versionedUrl(publicUrl: string): string {
  return `${publicUrl}?v=${Date.now()}`
}

function submittedIgnoredFields(job: GenerationJob): string[] {
  const snapshot = job.input_snapshot as { ignored_fields?: unknown } | null | undefined
  return Array.isArray(snapshot?.ignored_fields)
    ? snapshot.ignored_fields.filter((field): field is string => typeof field === 'string')
    : []
}

export async function recordFalResponseSnapshot(
  job: GenerationJob,
  falPayload: unknown,
): Promise<void> {
  if (falPayload === undefined) return
  try {
    await patchGenerationJobResponseSnapshotByRequestId(
      job.request_id,
      buildFalResponseSnapshot(falPayload, job.model, submittedIgnoredFields(job)),
    )
  } catch (e) {
    console.warn('[finalize] response snapshot capture failed:', e instanceof Error ? e.message : e)
  }
}
export type DirectorVideoPersistenceCode =
  | 'provider_fetch_retryable'
  | 'provider_fetch_terminal'
  | 'invalid_provider_result'
  | 'storage_retryable'
  | 'storage_conflict'
  | 'storage_terminal'
  | 'database_retryable'
  | 'database_constraint'
  | 'database_state'
  | 'database_terminal'

type RetryableDirectorVideoPersistenceCode = Extract<
  DirectorVideoPersistenceCode,
  'provider_fetch_retryable' | 'storage_retryable' | 'database_retryable'
>

export class DirectorVideoCompletionPersistenceError extends Error {
  readonly code: RetryableDirectorVideoPersistenceCode
  readonly cause: unknown

  constructor(code: RetryableDirectorVideoPersistenceCode, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`director video persistence failed [${code}]: ${detail}`)
    this.name = 'DirectorVideoCompletionPersistenceError'
    this.code = code
    this.cause = cause
  }
}

export class DirectorVideoTerminalError extends Error {
  constructor(readonly code: Exclude<DirectorVideoPersistenceCode, RetryableDirectorVideoPersistenceCode>, message: string) {
    super(message)
    this.name = 'DirectorVideoTerminalError'
  }
}

function providerVideoFetchFailure(status: number): Error {
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return new DirectorVideoCompletionPersistenceError('provider_fetch_retryable', new Error(`provider video fetch failed: ${status}`))
  }
  return new DirectorVideoTerminalError('provider_fetch_terminal', `provider video fetch failed: ${status}`)
}

const MAX_VIDEO_BYTES = 128 * 1024 * 1024
const VIDEO_DOWNLOAD_TIMEOUT_MS = 45_000
const MAX_VIDEO_REDIRECTS = 3

function assertValidVideoResponse(response: Response, bytes: Buffer): void {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'video/mp4' || !hasPlayableMp4Structure(bytes)) {
    throw new DirectorVideoTerminalError('invalid_provider_result', 'provider returned invalid MP4 video bytes')
  }
}

type IsoBox = { type: string; start: number; headerSize: number; end: number }
type IsoParseBudget = {
  boxesRemaining: number
  tableEntriesRemaining: number
  sampleValidationsRemaining: number
}

function readIsoBoxes(
  bytes: Buffer,
  start: number,
  end: number,
  budget: IsoParseBudget,
): IsoBox[] | null {
  const boxes: IsoBox[] = []
  for (let offset = start; offset < end;) {
    if (budget.boxesRemaining-- <= 0 || end - offset < 8) return null
    let size = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    let headerSize = 8
    if (size === 1) {
      if (end - offset < 16) return null
      const largeSize = bytes.readBigUInt64BE(offset + 8)
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null
      size = Number(largeSize)
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < headerSize || size > end - offset) return null
    boxes.push({ type, start: offset, headerSize, end: offset + size })
    offset += size
  }
  return boxes
}

function boxPayload(box: IsoBox): number {
  return box.start + box.headerSize
}

// Bound parser work independently of file size. A 128 MiB video with one-byte samples
// could otherwise force tens of millions of table/sample iterations.
const MAX_MP4_TABLE_ENTRIES = 1_000_000
const MAX_MP4_BOXES = 10_000

type SampleSizes = { count: number; fixedSize?: number; sizes?: number[] }
type MdatRange = { start: number; end: number }

function hasPlayableMp4Structure(bytes: Buffer): boolean {
  const budget: IsoParseBudget = {
    boxesRemaining: MAX_MP4_BOXES,
    tableEntriesRemaining: MAX_MP4_TABLE_ENTRIES,
    sampleValidationsRemaining: MAX_MP4_TABLE_ENTRIES,
  }
  const boxes = readIsoBoxes(bytes, 0, bytes.length, budget)
  if (!boxes || boxes[0]?.type !== 'ftyp' || boxes[0].end - boxes[0].start < 16) return false
  const moov = boxes.find((box) => box.type === 'moov')
  const mdats = mergeMdatRanges(boxes)
  if (!moov || mdats.length === 0) return false

  const moovChildren = readIsoBoxes(bytes, boxPayload(moov), moov.end, budget)
  if (!moovChildren) return false
  return moovChildren.some((trak) => trak.type === 'trak' && hasPlayableTrack(bytes, trak, mdats, budget))
}

function hasPlayableTrack(bytes: Buffer, trak: IsoBox, mdats: MdatRange[], budget: IsoParseBudget): boolean {
  const trakChildren = readIsoBoxes(bytes, boxPayload(trak), trak.end, budget)
  const mdia = trakChildren?.find((box) => box.type === 'mdia')
  const mdiaChildren = mdia && readIsoBoxes(bytes, boxPayload(mdia), mdia.end, budget)
  const hdlr = mdiaChildren?.find((box) => box.type === 'hdlr')
  const minf = mdiaChildren?.find((box) => box.type === 'minf')
  const minfChildren = minf && readIsoBoxes(bytes, boxPayload(minf), minf.end, budget)
  const stbl = minfChildren?.find((box) => box.type === 'stbl')
  const boxes = stbl && readIsoBoxes(bytes, boxPayload(stbl), stbl.end, budget)
  if (!hdlr || !isVideoHandler(bytes, hdlr) || !boxes) return false

  const stsd = boxes.find((box) => box.type === 'stsd')
  const stts = boxes.find((box) => box.type === 'stts')
  const stsc = boxes.find((box) => box.type === 'stsc')
  const stsz = boxes.find((box) => box.type === 'stsz')
  const chunkOffsets = boxes.find((box) => box.type === 'stco' || box.type === 'co64')
  if (!stsd || !stts || !stsc || !stsz || !chunkOffsets) return false

  const sampleSizes = readSampleSizes(bytes, stsz, budget)
  const offsets = readChunkOffsets(bytes, chunkOffsets, budget)
  const stsdCount = readTableCount(bytes, stsd, 8, budget)
  const sttsCount = readTimeToSampleCount(bytes, stts, budget)
  const chunkSamples = readSampleToChunk(bytes, stsc, offsets?.length ?? 0, stsdCount ?? 0, budget)
  if (
    !sampleSizes
    || !offsets
    || !stsdCount
    || sttsCount !== sampleSizes.count
    || !chunkSamples
    || sampleSizes.count > budget.sampleValidationsRemaining
  ) return false
  budget.sampleValidationsRemaining -= sampleSizes.count

  let sampleIndex = 0
  for (let chunkIndex = 0; chunkIndex < offsets.length; chunkIndex += 1) {
    let position = offsets[chunkIndex]
    for (let index = 0; index < chunkSamples[chunkIndex]; index += 1) {
      if (sampleIndex >= sampleSizes.count) return false
      const sampleSize = sampleSizes.fixedSize ?? sampleSizes.sizes?.[sampleIndex]
      if (!sampleSize || !isWithinMdat(position, sampleSize, mdats)) return false
      position += sampleSize
      sampleIndex += 1
    }
  }
  return sampleIndex === sampleSizes.count
}

function isVideoHandler(bytes: Buffer, box: IsoBox): boolean {
  const payload = boxPayload(box)
  return box.end - payload >= 12 && bytes.subarray(payload + 8, payload + 12).toString('ascii') === 'vide'
}

function readTableCount(
  bytes: Buffer,
  box: IsoBox,
  entrySize: number,
  budget: IsoParseBudget,
): number | null {
  const payload = boxPayload(box)
  if (box.end - payload < 8) return null
  const count = bytes.readUInt32BE(payload + 4)
  if (
    count === 0
    || count > MAX_MP4_TABLE_ENTRIES
    || count > budget.tableEntriesRemaining
    || count > Math.floor((box.end - payload - 8) / entrySize)
  ) return null
  budget.tableEntriesRemaining -= count
  return count
}

function readTimeToSampleCount(bytes: Buffer, box: IsoBox, budget: IsoParseBudget): number | null {
  const count = readTableCount(bytes, box, 8, budget)
  if (!count) return null
  const payload = boxPayload(box)
  let samples = 0
  for (let index = 0; index < count; index += 1) {
    const entryCount = bytes.readUInt32BE(payload + 8 + index * 8)
    if (entryCount === 0 || samples > MAX_MP4_TABLE_ENTRIES - entryCount) return null
    samples += entryCount
  }
  return samples
}

function readSampleToChunk(
  bytes: Buffer,
  box: IsoBox,
  chunkCount: number,
  stsdCount: number,
  budget: IsoParseBudget,
): number[] | null {
  const count = readTableCount(bytes, box, 12, budget)
  if (!count || chunkCount === 0) return null
  const payload = boxPayload(box)
  const entries: Array<{ firstChunk: number; samplesPerChunk: number }> = []
  for (let index = 0; index < count; index += 1) {
    const offset = payload + 8 + index * 12
    const firstChunk = bytes.readUInt32BE(offset)
    const samplesPerChunk = bytes.readUInt32BE(offset + 4)
    const descriptionIndex = bytes.readUInt32BE(offset + 8)
    if (
      firstChunk === 0
      || samplesPerChunk === 0
      || descriptionIndex === 0
      || descriptionIndex > stsdCount
      || (index === 0 && firstChunk !== 1)
      || (index > 0 && firstChunk <= entries[index - 1].firstChunk)
      || firstChunk > chunkCount
    ) return null
    entries.push({ firstChunk, samplesPerChunk })
  }

  const chunks: number[] = []
  for (let chunk = 1, entryIndex = 0; chunk <= chunkCount; chunk += 1) {
    while (entryIndex + 1 < entries.length && entries[entryIndex + 1].firstChunk <= chunk) entryIndex += 1
    chunks.push(entries[entryIndex].samplesPerChunk)
  }
  return chunks
}

function readSampleSizes(bytes: Buffer, box: IsoBox, budget: IsoParseBudget): SampleSizes | null {
  const payload = boxPayload(box)
  if (box.end - payload < 12) return null
  const fixedSize = bytes.readUInt32BE(payload + 4)
  const count = bytes.readUInt32BE(payload + 8)
  if (count === 0 || count > MAX_MP4_TABLE_ENTRIES) return null
  if (fixedSize > 0) return { count, fixedSize }
  if (count > budget.tableEntriesRemaining || count > Math.floor((box.end - payload - 12) / 4)) return null
  budget.tableEntriesRemaining -= count
  const sizes: number[] = []
  for (let index = 0; index < count; index += 1) {
    const size = bytes.readUInt32BE(payload + 12 + index * 4)
    if (size === 0) return null
    sizes.push(size)
  }
  return { count, sizes }
}

function readChunkOffsets(bytes: Buffer, box: IsoBox, budget: IsoParseBudget): number[] | null {
  const payload = boxPayload(box)
  if (box.end - payload < 8) return null
  const count = bytes.readUInt32BE(payload + 4)
  const entrySize = box.type === 'co64' ? 8 : 4
  if (
    count === 0
    || count > MAX_MP4_TABLE_ENTRIES
    || count > budget.tableEntriesRemaining
    || count > Math.floor((box.end - payload - 8) / entrySize)
  ) return null
  budget.tableEntriesRemaining -= count
  const offsets: number[] = []
  for (let index = 0; index < count; index += 1) {
    const offset = box.type === 'co64'
      ? Number(bytes.readBigUInt64BE(payload + 8 + index * 8))
      : bytes.readUInt32BE(payload + 8 + index * 4)
    if (!Number.isSafeInteger(offset)) return null
    offsets.push(offset)
  }
  return offsets
}

function mergeMdatRanges(boxes: IsoBox[]): MdatRange[] {
  const ranges: MdatRange[] = []
  for (const box of boxes) {
    if (box.type !== 'mdat' || boxPayload(box) >= box.end) continue
    const range = { start: boxPayload(box), end: box.end }
    const previous = ranges[ranges.length - 1]
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else ranges.push(range)
  }
  return ranges
}

function isWithinMdat(start: number, size: number, ranges: MdatRange[]): boolean {
  const end = start + size
  if (!Number.isSafeInteger(end)) return false
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2)
    const range = ranges[middle]
    if (start < range.start) high = middle - 1
    else if (start >= range.end) low = middle + 1
    else return end <= range.end
  }
  return false
}

function errorCode(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  return typeof code === 'string' ? code : undefined
}

const TERMINAL_DATABASE_CODES = new Set(['23502', '23503', '23505', '23514', '3D000', '42P01', '42703', 'P0001', '28P01', '42501'])

function databaseTerminalPersistenceError(error: unknown): DirectorVideoTerminalError | null {
  const code = errorCode(error)
  if (code === '23502' || code === '23503' || code === '23505' || code === '23514') {
    return new DirectorVideoTerminalError('database_constraint', `director video persistence violated database constraint ${code}`)
  }
  if (code === 'P0001') return new DirectorVideoTerminalError('database_state', 'director video attempt is not eligible for completion')
  if (code && TERMINAL_DATABASE_CODES.has(code)) {
    return new DirectorVideoTerminalError('database_terminal', `director video persistence failed permanently [${code}]`)
  }
  return null
}
function storageTerminalPersistenceError(error: unknown): DirectorVideoTerminalError | null {
  const code = errorCode(error)?.toLowerCase()
  const statusValue = typeof error === 'object' && error !== null
    ? (error as { status?: unknown; statusCode?: unknown }).status
      ?? (error as { statusCode?: unknown }).statusCode
    : undefined
  const status = typeof statusValue === 'number'
    ? statusValue
    : typeof statusValue === 'string' ? Number(statusValue) : undefined
  if (
    (typeof status === 'number' && status >= 400 && status < 500 && ![408, 425, 429].includes(status))
    || ['400', '401', '403', '404', '422', 'accessdenied', 'unauthorized', 'forbidden', 'invalidrequest', 'invalidkey', 'nosuchbucket'].includes(code ?? '')
  ) {
    return new DirectorVideoTerminalError('storage_terminal', 'director video storage request failed permanently')
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (/(row-level security|storage policy|permission denied|authorization|malformed|invalid (?:key|request)|bucket .*not found)/.test(message)) {
    return new DirectorVideoTerminalError('storage_terminal', 'director video storage request failed permanently')
  }
  return null
}

function invalidProviderVideoUrl(): never {
  throw new DirectorVideoTerminalError('invalid_provider_result', 'invalid video url in provider result')
}

function allowedFalHosts(): Set<string> {
  const configured = process.env.FAL_MEDIA_ALLOWED_HOSTS?.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean) ?? []
  return new Set(['fal.media', 'v3.fal.media', ...configured])
}

function assertValidProviderVideoUrl(videoUrl: string, provider: GenerationJob['provider']): URL {
  let parsed: URL
  try {
    parsed = new URL(videoUrl)
  } catch {
    return invalidProviderVideoUrl()
  }
  if (parsed.username || parsed.password) return invalidProviderVideoUrl()

  if (provider === 'fal') {
    if (parsed.protocol !== 'https:' || parsed.port || !allowedFalHosts().has(parsed.hostname.toLowerCase())) {
      return invalidProviderVideoUrl()
    }
    return parsed
  }

  let configured: URL
  try {
    configured = new URL(process.env.TAILSCALE_VIDEO_API_URL ?? '')
  } catch {
    return invalidProviderVideoUrl()
  }
  if (
    configured.username
    || configured.password
    || (configured.protocol !== 'http:' && configured.protocol !== 'https:')
    || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.origin !== configured.origin
  ) {
    return invalidProviderVideoUrl()
  }
  return parsed
}

export async function readProviderVideoBytes(
  response: Response,
  maxBytes = MAX_VIDEO_BYTES,
  abort?: () => void,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!response.ok) throw providerVideoFetchFailure(response.status)

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    abort?.()
    throw new DirectorVideoTerminalError('invalid_provider_result', 'provider video exceeds maximum size')
  }
  if (!response.body) {
    throw new DirectorVideoCompletionPersistenceError(
      'provider_fetch_retryable',
      new Error('provider video response has no body'),
    )
  }

  const reader = response.body.getReader()
  const cancelBody = () => {
    void reader.cancel().catch(() => {
      // The timeout error remains authoritative after cancellation failure.
    })
  }
  signal?.addEventListener('abort', cancelBody, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        abort?.()
        cancelBody()
        throw new DirectorVideoTerminalError(
          'invalid_provider_result',
          'provider video exceeds maximum size',
        )
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof DirectorVideoTerminalError) throw error
    throw new DirectorVideoCompletionPersistenceError('provider_fetch_retryable', error)
  } finally {
    signal?.removeEventListener('abort', cancelBody)
    reader.releaseLock()
  }
  if (signal?.aborted) {
    throw new DirectorVideoCompletionPersistenceError(
      'provider_fetch_retryable',
      new Error('provider video download timed out'),
    )
  }
  return Buffer.concat(chunks, total)
}

async function downloadProviderVideo(videoUrl: string, provider: GenerationJob['provider']): Promise<{ response: Response; bytes: Buffer }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VIDEO_DOWNLOAD_TIMEOUT_MS)
  let currentUrl = assertValidProviderVideoUrl(videoUrl, provider)
  try {
    for (let redirects = 0; redirects <= MAX_VIDEO_REDIRECTS; redirects += 1) {
      let response: Response
      try {
        response = await fetch(currentUrl, { redirect: 'manual', signal: controller.signal })
      } catch (error) {
        throw new DirectorVideoCompletionPersistenceError('provider_fetch_retryable', error)
      }
      if (response.status < 300 || response.status >= 400) {
        try {
          return {
            response,
            bytes: await readProviderVideoBytes(
              response,
              MAX_VIDEO_BYTES,
              () => controller.abort(),
              controller.signal,
            ),
          }
        } finally {
          if (!response.ok) await response.body?.cancel().catch(() => {})
        }
      }
      const location = response.headers.get('location')
      if (!location || redirects === MAX_VIDEO_REDIRECTS) {
        await response.body?.cancel().catch(() => {})
        throw new DirectorVideoTerminalError('invalid_provider_result', 'provider video redirect is invalid')
      }
      await response.body?.cancel().catch(() => {})
      currentUrl = assertValidProviderVideoUrl(new URL(location, currentUrl).toString(), provider)
    }
    throw new DirectorVideoTerminalError('invalid_provider_result', 'provider video redirect is invalid')
  } finally {
    clearTimeout(timeout)
  }
}


/** 캐릭터 뷰 이미지 영속화 → 저장된 publicUrl 반환. */
export async function finalizeCharacterViewJob(
  job: GenerationJob,
  falImageUrl: string,
  falPayload?: unknown,
): Promise<string> {
  const { workspaceId, characterId, column, view } = job.target
  if (!workspaceId || !characterId || !column) {
    throw new Error('character_view job target missing workspaceId/characterId/column')
  }
  await recordFalResponseSnapshot(job, falPayload)

  const imgRes = await fetch(falImageUrl)
  if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())

  const path = `${workspaceId}/${job.project_id}/characters/${storageKeySegment(characterId)}_${column}.png`
  const { error: upErr } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  await uploadThumbnail(path, buf)
  const publicUrl = versionedUrl(
    supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl,
  )

  // 선택본 URL 은 기존대로 characters.view_* 에 미러(read 경로 무변경).
  const { error: updErr } = await supabaseAdmin
    .from('characters')
    .update({ [column]: publicUrl })
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
  if (updErr) throw updErr

  // provenance(#57): 그 위에 character_image_candidates 행을 얹는다 — best-effort.
  //   지문이 어긋나 착지해도(생성 중 외모 변경) 폐기하지 않고 그대로 선택본으로 기록 →
  //   stale 판정(순수 함수)이 알아서 낡음으로 표시한다(architecture §5 — 착지 + 배지).
  await recordCharacterImageCandidate(job, characterId, view, publicUrl).catch((e) => {
    console.warn('[finalize] candidate record failed (image landed):', e instanceof Error ? e.message : e)
  })

  // 대표 포트레이트(New UI 에셋 칩) — 사람 main 은 시트 좌상단 CHARACTER CONCEPT 크롭,
  //   사물/비-시트는 main 그대로. best-effort(실패해도 시트 착지는 유지).
  if (view === 'main') {
    await savePortraitFromMain(job, characterId, buf, publicUrl).catch((e) => {
      console.warn('[finalize] portrait crop failed (sheet landed):', e instanceof Error ? e.message : e)
    })
  }

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/**
 * main 착지분에서 대표 포트레이트를 파생해 characters.portrait 에 저장(028).
 *   사람(entity_type≠object) + 시트(landscape)면 좌상단 컨셉 박스 크롭 업로드, 아니면 main URL 그대로.
 */
async function savePortraitFromMain(
  job: GenerationJob,
  characterId: string,
  sheetBuf: Buffer,
  mainUrl: string,
): Promise<void> {
  const { data: ch } = await supabaseAdmin
    .from('characters')
    .select('entity_type')
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
    .maybeSingle()

  let portraitUrl = mainUrl // 사물 or 비-시트 폴백: main 자체가 이미 단일 포트레이트
  if (ch?.entity_type !== 'object') {
    const cropped = await cropTurnaroundPortrait(sheetBuf)
    if (cropped) {
      const path = `${job.target.workspaceId}/${job.project_id}/characters/${storageKeySegment(characterId)}_portrait.png`
      const { error: upErr } = await supabaseAdmin.storage
        .from('media')
        .upload(path, cropped, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      await uploadThumbnail(path, cropped)
      portraitUrl = versionedUrl(
        supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl,
      )
    }
  }

  const { error } = await supabaseAdmin
    .from('characters')
    .update({ portrait: portraitUrl })
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
  if (error) throw error
}

/**
 * 착지한 이미지를 character_image_candidates 의 새 "선택본"으로 기록한다(#57).
 *   1) 슬롯의 기존 선택본 해제(partial-unique: 슬롯당 is_selected 1개) → 2) 새 후보 insert(is_selected=true)
 *   → 3) 보관 정리(미선택 최근 N장만, 선택본 보존). source_hash 는 submit 시점 input_snapshot 에서.
 *   view 가 없는(레거시) job 은 skip — 기존 view_* 미러만으로 동작.
 */
async function recordCharacterImageCandidate(
  job: GenerationJob,
  characterId: string,
  viewKey: string | undefined,
  url: string,
): Promise<void> {
  // job.target.view = CharacterViewKey('main'|'back'|'sideLeft'|'sideRight'). object 단일 이미지는 'main'.
  const map: Record<string, CandidateView> = {
    main: 'main',
    back: 'back',
    sideLeft: 'side_left',
    sideRight: 'side_right',
  }
  const view = viewKey ? map[viewKey] : undefined
  if (!view) return

  const snapshot = job.input_snapshot as
    | { source_hash?: string; appearance_hash?: string }
    | null
    | undefined
  const sourceHash = snapshot?.source_hash ?? null
  const appearanceHash = snapshot?.appearance_hash ?? null

  // 1) 기존 선택본 해제.
  await supabaseAdmin
    .from('character_image_candidates')
    .update({ is_selected: false })
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
    .eq('view', view)
    .eq('is_selected', true)

  // 2) 새 후보 = 선택본.
  const { error: insErr } = await supabaseAdmin.from('character_image_candidates').insert({
    project_id: job.project_id,
    character_id: characterId,
    view,
    url,
    source_hash: sourceHash,
    appearance_hash: appearanceHash,
    job_id: job.id,
    is_selected: true,
  })
  if (insErr) throw insErr

  // 3) 단일 이미지 정책(#5, 2026-07-11): 이 슬롯의 비선택 후보를 전부 삭제 — 최신 선택본 1장만 유지(누적→교체).
  //    (예전 "최근 N장 보관 + 후보 히스토리 스트립" 폐기. 월드도 동일 정책, #6.)
  await supabaseAdmin
    .from('character_image_candidates')
    .delete()
    .eq('project_id', job.project_id)
    .eq('character_id', characterId)
    .eq('view', view)
    .eq('is_selected', false)
}

/** 공통: 원격 이미지 바이트 회수 → media 스토리지 업로드 → publicUrl. */
export async function uploadImageFromUrl(
  remoteUrl: string,
  path: string,
  opts?: { minBytes?: number },
): Promise<string> {
  const imgRes = await fetch(remoteUrl)
  if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  // 검은/빈 이미지 방어 — klein 등은 입력 모더레이션에 걸리면 에러가 아니라 검은 이미지(수 KB)를 반환한다.
  //   completed 로 저장하면 재생성해도 같은 검정(seed 무관) → throw 로 failed 처리해, 호출부(webhook)가
  //   job 을 실패로 기록하고 다음 재생성의 safeMode(서사·동사 제거) 재시도를 깨우게 한다. (2026-06-25)
  if (opts?.minBytes && buf.length < opts.minBytes) {
    throw new Error(
      `image too small (${buf.length}b < ${opts.minBytes}) — likely blank/moderated output`,
    )
  }
  const { error: upErr } = await supabaseAdmin.storage
    .from('media')
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  await uploadThumbnail(path, buf)
  return versionedUrl(supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl)
}

/**
 * 착지한 월드 이미지를 location_image_candidates 의 새 선택본으로 기록(#57, AC18 — 캐릭터 대칭).
 *   024 미적용 환경에선 update/insert 에러를 흡수(locations 컬럼 미러만으로 동작). best-effort.
 */
async function recordLocationImageCandidate(
  job: GenerationJob,
  locationId: string,
  view: string,
  url: string,
): Promise<void> {
  const snapshot = job.input_snapshot as
    | { source_hash?: string; appearance_hash?: string }
    | null
    | undefined
  const sourceHash = snapshot?.source_hash ?? null
  const appearanceHash = snapshot?.appearance_hash ?? null
  const slot = { project_id: job.project_id, location_id: locationId, view }
  const clear = await supabaseAdmin
    .from('location_image_candidates')
    .update({ is_selected: false })
    .match(slot)
    .eq('is_selected', true)
  if (clear.error) return // 024 미적용 → best-effort skip(locations 미러만 동작)
  const ins = await supabaseAdmin.from('location_image_candidates').insert({
    project_id: job.project_id,
    location_id: locationId,
    view,
    url,
    source_hash: sourceHash,
    appearance_hash: appearanceHash,
    job_id: job.id,
    is_selected: true,
  })
  if (ins.error) return
  // 단일 이미지 정책(#6, 2026-07-11): 이 슬롯의 비선택 후보 전부 삭제 — 최신 선택본 1장만 유지(누적→교체).
  await supabaseAdmin
    .from('location_image_candidates')
    .delete()
    .match(slot)
    .eq('is_selected', false)
}

/** 월드 샷(wide/establishing) 이미지 영속화 → locations[column] 갱신. */
export async function finalizeWorldShotJob(
  job: GenerationJob,
  falImageUrl: string,
  falPayload?: unknown,
): Promise<string> {
  const { workspaceId, locationId, column } = job.target
  if (!workspaceId || !locationId || !column) {
    throw new Error('world_shot job target missing workspaceId/locationId/column')
  }
  await recordFalResponseSnapshot(job, falPayload)
  const path = `${workspaceId}/${job.project_id}/locations/${storageKeySegment(locationId)}_${column}.png`
  const publicUrl = await uploadImageFromUrl(falImageUrl, path)

  const { error } = await supabaseAdmin
    .from('locations')
    .update({ [column]: publicUrl })
    .eq('project_id', job.project_id)
    .eq('location_id', locationId)
  if (error) throw error
  // world 후보 히스토리 기록(AC18, 캐릭터 019/023과 대칭). 024 미적용이면 best-effort skip.
  await recordLocationImageCandidate(job, locationId, column, publicUrl)

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 샷 스토리보드 이미지(I2I) 영속화 → shots.storyboard_image(JSONB) 갱신(writerShotId 있을 때). */
export async function finalizeShotStoryboardJob(
  job: GenerationJob,
  falImageUrl: string,
  falPayload?: unknown,
): Promise<string> {
  const { workspaceId, writerShotId } = job.target
  if (!workspaceId || !writerShotId) {
    throw new Error('shot_storyboard job target missing workspaceId/writerShotId')
  }
  await recordFalResponseSnapshot(job, falPayload)
  const path = `${workspaceId}/${job.project_id}/shots/${storageKeySegment(writerShotId)}_storyboard_image.png`
  const publicUrl = await uploadImageFromUrl(falImageUrl, path)

  // upload-image 라우트와 동일한 JSONB shape (ShotNode/StoryboardGridView가 소비).
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      storyboard_image: {
        url: publicUrl,
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    .eq('project_id', job.project_id)
    .eq('shot_id', writerShotId)
  if (error) throw error

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** 러프 스토리보드 패널(writer 탭, mannequin previz) 영속화 → shots.rough_storyboard(JSONB) 갱신. */
export async function finalizeShotRoughStoryboardJob(
  job: GenerationJob,
  falImageUrl: string,
  falPayload?: unknown,
): Promise<string> {
  const { workspaceId, writerShotId } = job.target
  if (!workspaceId || !writerShotId) {
    throw new Error('shot_rough_storyboard job target missing workspaceId/writerShotId')
  }
  await recordFalResponseSnapshot(job, falPayload)
  const path = `${workspaceId}/${job.project_id}/shots/${storageKeySegment(writerShotId)}_rough_storyboard.png`
  // klein 모더레이션 검은 이미지(~2KB) 방어 — 정상 러프 스케치는 수백 KB. 작으면 throw → failed →
  //   재생성 시 safeMode(폭력 동사·구도 레이어 제외)로 자동 우회. (shot_9 검은 화면 버그, 2026-06-25)
  const publicUrl = await uploadImageFromUrl(falImageUrl, path, { minBytes: 20_000 })

  // RoughStoryboardImage shape (src/types/shot.ts — writer 러프 보드가 소비).
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      rough_storyboard: {
        url: publicUrl,
        status: 'completed',
        errorMessage: null,
        generatedAt: Date.now(),
      },
    })
    .eq('project_id', job.project_id)
    .eq('shot_id', writerShotId)
  if (error) throw error

  await completeGenerationJob(job.id, publicUrl)
  return publicUrl
}

/** Persist a v2 take immutably; retain legacy shot_video behavior for unlinked jobs. */
export async function finalizeShotVideoJob(
  job: GenerationJob,
  videoUrl: string,
  falPayload?: unknown,
): Promise<string> {
  await recordFalResponseSnapshot(job, falPayload)
  if (job.video_clip_id) {
    const workspaceId = job.target.workspaceId
    if (!workspaceId) throw new DirectorVideoTerminalError('database_state', 'linked shot_video job target missing workspaceId')
    const { response, bytes } = await downloadProviderVideo(videoUrl, job.provider)
    assertValidVideoResponse(response, bytes)
    const path = `${workspaceId}/${job.project_id}/videos/${job.video_clip_id}/${job.id}.mp4`
    try {
      await uploadImmutableObject(path, bytes, 'video/mp4')
    } catch (error) {
      if (error instanceof ImmutableObjectMismatchError) {
        throw new DirectorVideoTerminalError('storage_conflict', error.message)
      }
      const terminalError = storageTerminalPersistenceError(error)
      if (terminalError) throw terminalError
      throw new DirectorVideoCompletionPersistenceError('storage_retryable', error)
    }
    const publicUrl = supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl
    if (!publicUrl) throw new DirectorVideoTerminalError('database_state', `video public URL derivation failed: ${path}`)
    try {
      await completeDirectorVideoAttempt(job.project_id, job.id, job.video_clip_id, publicUrl, path)
    } catch (error) {
      const terminalError = databaseTerminalPersistenceError(error)
      if (terminalError) throw terminalError
      throw new DirectorVideoCompletionPersistenceError('database_retryable', error)
    }
    return publicUrl
  }

  const { writerShotId } = job.target
  if (writerShotId) {
    const { error } = await supabaseAdmin
      .from('shots')
      .update({ video_url: videoUrl, updated_at: new Date().toISOString() })
      .eq('project_id', job.project_id)
      .eq('shot_id', writerShotId)
    if (error) throw error
  }
  await completeGenerationJob(job.id, videoUrl)
  return videoUrl
}
export type FinalizeProviderResult =
  | { media: 'image'; url: string; payload?: unknown }
  | { media: 'video'; url: string; payload?: unknown }

function assertNever(value: never): never {
  throw new Error(`unsupported generation job kind: ${String(value)}`)
}

export async function finalizeGenerationJob(job: GenerationJob, result: FinalizeProviderResult): Promise<string> {
  switch (job.kind) {
    case 'character_view':
      if (result.media !== 'image') throw new Error('character_view requires an image result')
      return finalizeCharacterViewJob(job, result.url, result.payload)
    case 'world_shot':
      if (result.media !== 'image') throw new Error('world_shot requires an image result')
      return finalizeWorldShotJob(job, result.url, result.payload)
    case 'shot_storyboard':
      if (result.media !== 'image') throw new Error('shot_storyboard requires an image result')
      return finalizeShotStoryboardJob(job, result.url, result.payload)
    case 'shot_rough_storyboard':
      if (result.media !== 'image') throw new Error('shot_rough_storyboard requires an image result')
      return finalizeShotRoughStoryboardJob(job, result.url, result.payload)
    case 'shot_video':
      if (result.media !== 'video') throw new Error('shot_video requires a video result')
      return finalizeShotVideoJob(job, result.url, result.payload)
    default:
      return assertNever(job.kind)
  }
}
