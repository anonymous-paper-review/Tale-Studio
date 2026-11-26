// 실사 가운데(연출) 장 화살표 고치기 — 서버(오너 2026-11-27 N4b "실사 이미지에서 화살표 수정하면 뒤에 마지막 프레임 수정해줘. (이미지만)").
//   콘티(lib/writer/directing-edit.ts)와 같은 동작 이름을 받고, 대상은 shots.storyboard_image(실사 시트)다. 모양 규칙은 storyboard/real-arrow-edit.ts.
//   separate  : Grok 이 지금 실사 가운데 장에서 화살표 · 글씨만 지운 밑층(같은 가운데 장이면 다시 그리지 않는다)
//   save      : 편집기가 평탄화한 가운데 장을 새 파일에 올리고 새 판(arrows-…)을 지금 그림으로(리드 D1 A)
//   read      : 읽는 AI 실사판이 시작 장 + 지금 가운데 장을 한 줄로 읽어 실사 시트에 남긴다(리드 D2 A)
//   redraw    : 끝 장 작업(GPT Image 2, 시작 장 + 읽은 줄)을 실사 작업 종류(shot_storyboard)로 낸다 — 같은 샷 실사 작업은 하나만(DB 트리거),
//               카드 · 노드 기다림 · 끝난 뒤 다시 읽기 · [멈추기]가 지금 길 그대로 걸린다. 영상은 만들지 않는다(Take 0).
//   keep-line : 물음 창 [그대로] + 고친 줄 — 끝 장은 그리지 않고 고친 줄만 남긴다(영상이 쓴다)
//   finalize  : 끝 장 작업이 끝나면 그 판의 끝 장만 바꿔 끼운다(fal/finalize.ts finalizeShotStoryboardJob 첫머리가 부른다)
//   그 샷 실사를 그리는 중(끝 장 포함)이면 저장 · 끝 장 다시 그리기를 거절한다 — 끝 장이 엉뚱한 판에 끼지 않게(혼자 정한 것 g).
//   약속: tests/writer/real-arrow-server.test.ts
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateReservedImage } from '@/lib/fal/generate-image'
import { assertUserTextAllowed, moderatedSubmitInput } from '@/lib/moderation/creem'
import { recordModerationPass } from '@/lib/api/moderation'
import { mediaPathFromUrl, mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import type { StoryboardImage } from '@/types/director'
import { updateStoryboardImage } from '@/lib/director/storyboard-image-store'
import { currentStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { existingStoryboardJobId } from '@/lib/director/storyboard-active-job'
import { cancelledJobsById } from '@/lib/director/job-cancellations'
import {
  completeGenerationJob,
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { resolvePhotoLook } from '@/lib/style-facets/photo-look'
import { readDirectionMarks } from '@/lib/writer/direction-read-vlm'
import { freshDirectionRead, type DirectionRead } from '@/lib/writer/direction-read'
import {
  DirectionUnreadableError,
  ForeignMediaPathError,
  StaleDirectionError,
  assertProjectFolder,
  endFrameImageSize,
  fitFrameToSize,
  otherFramesSize,
  userDirectionRead,
  type EditedDirectionLine,
} from '@/lib/writer/directing-edit'
import { REAL_STRIP_ARROWS_PROMPT, realEndFramePlan } from '@/lib/storyboard/real-arrow-prompts'
import { realEditFrames, withArrowVersion, withRealCleanPlate, withRealDirectionRead, withRealEndFrame } from '@/lib/storyboard/real-arrow-edit'

// 밑층 그림 AI — 콘티 밑층과 같다(누를 때만, 장당 약 $0.02).
const REAL_CLEAN_MODEL = 'xai/grok-imagine-image/edit'
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'
const REAL_JOB_KINDS = ['shot_storyboard', 'storyboard_real_grid'] as const

/** 그 샷 실사를 그리는 중(끝 장 작업 포함) — 끝 장이 엉뚱한 판에 끼지 않게 저장 · 끝 장 다시 그리기를 받지 않는다(라우트 409 busy). */
export class RealShotBusyError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, 'This shot is being drawn. You can change it when it is done.'))
    this.name = 'RealShotBusyError'
  }
}

/** 지금 그림이 세 장 실사가 아니다(올린 한 장 · 아직 안 그림) — 고칠 가운데 장이 없다(라우트 409 no_real_frames). */
export class RealFramesMissingError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, 'This shot has no three-frame image to edit. Make the image first.'))
    this.name = 'RealFramesMissingError'
  }
}

type RealShotRow = { storyboard_image?: unknown; duration_seconds?: unknown; characters?: unknown }

async function loadRealShot(projectId: string, shotId: string): Promise<RealShotRow | null> {
  const { data, error } = await supabaseAdmin
    .from('shots')
    .select('storyboard_image, duration_seconds, characters')
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
    .maybeSingle()
  if (error) throw error
  return (data as RealShotRow | null) ?? null
}

async function loadProject(projectId: string): Promise<{ workspace_id?: string; style_anchor_key?: string | null; custom_style_anchor?: unknown } | null> {
  const { data, error } = await supabaseAdmin.from('projects').select('workspace_id, style_anchor_key, custom_style_anchor').eq('id', projectId).maybeSingle()
  if (error) throw error
  return (data as { workspace_id?: string; style_anchor_key?: string | null; custom_style_anchor?: unknown } | null) ?? null
}

function framesOrThrow(row: RealShotRow | null, locale: AppLocale) {
  const frames = realEditFrames(row?.storyboard_image)
  if (!frames) throw new RealFramesMissingError(locale)
  return frames
}

/** 그 샷 실사를 그리는 작업(화면에서 멈춘 것은 세지 않는다 — DB 트리거와 같은 기준). realEnd = 실사 끝 장 작업인가. */
async function runningRealJob(projectId: string, shotId: string): Promise<{ id: string; realEnd: boolean } | null> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, target')
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .in('kind', [...REAL_JOB_KINDS])
  if (error) throw error
  const rows = ((data ?? []) as Array<{ id: string; target?: { writerShotId?: string; writerShotIds?: string[]; realEnd?: unknown } | null }>)
    .filter((row) => row.target?.writerShotId === shotId || (row.target?.writerShotIds ?? []).includes(shotId))
  if (!rows.length) return null
  const stopped = await cancelledJobsById(rows.map((row) => row.id))
  const live = rows.find((row) => !stopped.has(row.id))
  return live ? { id: live.id, realEnd: !!live.target?.realEnd } : null
}

/** 우리 보관함 경로(이 프로젝트 폴더 안)만 — 실사 시트 주소는 브라우저가 고칠 수 있는 칸에서 온다(콘티 리뷰 M5 와 같다). */
async function projectPath(projectId: string, url: string, locale: AppLocale): Promise<string> {
  const path = mediaPathFromUrl(url)
  if (!path) throw new ForeignMediaPathError(locale)
  await assertProjectFolder(projectId, path, locale)
  return path
}

async function upload(path: string, buf: Buffer, contentType: string, thumb: boolean): Promise<string> {
  const { error } = await mediaUpload(path, buf, { contentType, upsert: true })
  if (error) throw error
  if (thumb) await uploadThumbnail(path, buf)
  return `${mediaPublicUrl(path)}?v=${Date.now()}`
}

/** 그림 한 장의 크기 — 못 읽으면 null(맞추지 않고 올린다). */
async function frameSize(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const { width, height } = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    return width && height ? { width, height } : null
  } catch {
    return null
  }
}

/**
 * 화살표 층 나누기 — 지금 실사 가운데 장에서 화살표 · 글씨만 지운 밑층(Grok). 같은 가운데 장의 밑층이 있으면 그것(그림 값 없음).
 *   밑층은 가운데 장 크기로 맞춰 올린다(편집기가 위층과 같은 자리에 깐다).
 */
export async function separateRealArrowLayer(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: { expectDirection?: string; userId?: string } = {},
): Promise<{ cleanUrl: string; cached: boolean }> {
  const row = await loadRealShot(projectId, shotId)
  const frames = framesOrThrow(row, locale)
  if (opts.expectDirection && opts.expectDirection !== frames.direction) throw new StaleDirectionError(locale)
  const cached = (row?.storyboard_image as { cleanDirection?: { url?: unknown; direction?: unknown } } | null)?.cleanDirection
  if (typeof cached?.url === 'string' && cached.url && cached.direction === frames.direction) return { cleanUrl: cached.url, cached: true }
  // 그리기 전에 본다 — 남의 파일 자리 때문에 그림 값을 쓰지 않는다.
  const dirPath = await projectPath(projectId, frames.direction, locale)
  // 우리 고정 문장만 싣는다 — 사용자 글이 없어 검사할 것이 없다(건너뜀 영수증).
  const moderation = await assertUserTextAllowed([], { projectId, kind: 'image_generation', ...(opts.userId ? { userId: opts.userId } : {}) })
  const result = await generateReservedImage(
    { model: REAL_CLEAN_MODEL, prompt: REAL_STRIP_ARROWS_PROMPT, reference_image_urls: [frames.direction], moderation },
    { projectId, ...(opts.userId ? { userId: opts.userId } : {}) },
  )
  const res = await fetch(result.url)
  if (!res.ok) throw new Error(translate(locale, 'Failed to download the clean plate: HTTP {status}', { status: res.status }))
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) throw new Error(translate(locale, 'The clean plate is abnormally small ({bytes}b)', { bytes: buf.length }))
  const size = await frameSize(frames.direction)
  const fitted = size ? await fitFrameToSize(buf, size.width, size.height) : buf
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const cleanUrl = await upload(`${dirPath.replace(/\.[a-z]+$/i, '')}_clean.${ext}`, fitted, contentType, false)
  // 그사이 가운데 장이 바뀌었으면(다른 판 · 저장) 낡은 밑층이라 남기지 않는다 — 이 화면은 돌려받은 밑층을 쓴다.
  await updateStoryboardImage(projectId, shotId, (current) => withRealCleanPlate(current, frames.direction, cleanUrl))
  return { cleanUrl, cached: false }
}

/** 편집기가 평탄화한 가운데 장(PNG data URL) 저장 — 새 파일에 올리고 고친 가운데 장을 가진 새 판(arrows-…)을 지금 그림으로 만든다. */
export async function saveRealDirectingFrame(
  projectId: string,
  shotId: string,
  imageDataUrl: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: { expectDirection?: string } = {},
): Promise<{ url: string; versionId: string; generatedAt: number }> {
  const row = await loadRealShot(projectId, shotId)
  const frames = framesOrThrow(row, locale)
  if (opts.expectDirection && opts.expectDirection !== frames.direction) throw new StaleDirectionError(locale)
  if (await runningRealJob(projectId, shotId)) throw new RealShotBusyError(locale)
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
  if (!m) throw new Error(translate(locale, "This isn't a PNG data URL"))
  const buf = Buffer.from(m[1]!, 'base64')
  if (buf.length < 10_000) throw new Error(translate(locale, 'The image to save is empty'))
  if (buf.length > 15_000_000) throw new Error(translate(locale, 'The image is too large (over 15MB)'))
  const project = await loadProject(projectId)
  if (!project?.workspace_id) throw new ForeignMediaPathError(locale)
  // 판마다 새 이름(_a{저장 id}) — 고치기 전 판이 가리키는 가운데 장 파일을 덮지 않는다(지난 판은 그대로 남아야 한다).
  const editId = randomUUID()
  const path = `${project.workspace_id}/${projectId}/shots/${storageKeySegment(shotId)}_a${editId}_storyboard_direction.png`
  const url = await upload(path, buf, 'image/png', true)
  const versionId = `arrows-${editId}`
  const at = Date.now()
  const written = await updateStoryboardImage(projectId, shotId, (current) => withArrowVersion(current, { id: versionId, direction: url, at, from: frames.direction }))
  if (!written) throw new StaleDirectionError(locale)
  return { url, versionId, generatedAt: at }
}

/** 읽은 줄을 실사 시트에 남긴다 — 그사이 가운데 장이 바뀌었으면 남기지 않는다. 남겼으면 true. */
async function storeRead(projectId: string, shotId: string, read: DirectionRead): Promise<boolean> {
  return !!(await updateStoryboardImage(projectId, shotId, (current) => withRealDirectionRead(current, read)))
}

/** 지금 실사 가운데 장을 읽은 줄 — 이미 있으면 다시 읽지 않고, 없으면 읽는 AI 실사판으로 읽어 남긴다. 못 읽으면 null(물음 창이 "직접 적어 주세요"). */
export async function readRealDirection(projectId: string, shotId: string): Promise<DirectionRead | null> {
  const row = await loadRealShot(projectId, shotId)
  const frames = realEditFrames(row?.storyboard_image)
  if (!frames) return null
  const fresh = freshDirectionRead(row?.storyboard_image)
  if (fresh) return fresh
  // 우리 보관함 그림만 읽는다 — 서버가 남의 주소를 받아 오지 않게.
  if (!mediaPathFromUrl(frames.start) || !mediaPathFromUrl(frames.direction)) return null
  const marks = await readDirectionMarks(frames.start, frames.direction, 'real')
  if (!marks) return null
  const read: DirectionRead = { en: marks.en, ko: marks.ko, source: 'ai', direction: frames.direction, at: Date.now(), endDrawn: null }
  return (await storeRead(projectId, shotId, read)) ? read : null
}

/** 물음 창 [그대로] + 고친 줄 — 끝 장은 그리지 않고 고친 줄만 남긴다(영상이 쓴다). 영어가 그 전 줄과 같으면 "그 줄로 그린 끝 장" 표시를 지킨다. */
export async function keepRealDirectionLine(
  projectId: string,
  shotId: string,
  line: EditedDirectionLine,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: { expectDirection?: string } = {},
): Promise<DirectionRead> {
  const row = await loadRealShot(projectId, shotId)
  const frames = realEditFrames(row?.storyboard_image)
  if (!frames || (opts.expectDirection && opts.expectDirection !== frames.direction)) throw new StaleDirectionError(locale)
  const read = await userDirectionRead(shotId, line, frames.direction, locale)
  const prev = freshDirectionRead(row?.storyboard_image)
  const kept: DirectionRead = prev && prev.en === read.en ? { ...read, endDrawn: prev.endDrawn } : read
  if (!(await storeRead(projectId, shotId, kept))) throw new StaleDirectionError(locale)
  return kept
}

/**
 * 실사 끝 장 다시 그리기 — 화살표를 저장하면 화면이 묻지 않고 부른다(N4b), 편집기 아래 [고쳐서 끝 장 다시 그리기]도 여기로 온다.
 *   줄: 사람이 고친 줄(다시 읽지 않음, 한국어면 영어로) → 지금 가운데 장을 읽은 줄 → 없으면 지금 읽는다. 못 읽으면 그리지 않는다.
 *   그 샷의 실사 끝 장 작업이 돌고 있으면 그 작업 번호를, 다른 실사 작업이 돌고 있으면 거절한다.
 */
export async function redrawRealEndFrame(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: { line?: EditedDirectionLine | null; userId?: string | null } = {},
): Promise<{ jobId: string; read: DirectionRead | null; replayed: boolean }> {
  const row = await loadRealShot(projectId, shotId)
  const frames = framesOrThrow(row, locale)
  const versionId = currentStoryboardVersion((row?.storyboard_image ?? null) as StoryboardImage | null)?.id
  if (!versionId) throw new RealFramesMissingError(locale)
  const running = await runningRealJob(projectId, shotId)
  if (running?.realEnd) return { jobId: running.id, read: freshDirectionRead(row?.storyboard_image), replayed: true }
  if (running) throw new RealShotBusyError(locale)
  // 그리기 전에 본다 — 끝 장은 이 프로젝트 폴더에 올린다.
  await projectPath(projectId, frames.start, locale)

  let read: DirectionRead | null
  if (opts.line?.text?.trim()) {
    read = await userDirectionRead(shotId, opts.line, frames.direction, locale)
    if (!(await storeRead(projectId, shotId, read))) throw new StaleDirectionError(locale)
  } else {
    read = freshDirectionRead(row?.storyboard_image) ?? (await readRealDirection(projectId, shotId))
  }
  if (!read) throw new DirectionUnreadableError(locale)

  const project = await loadProject(projectId)
  const workspaceId = project?.workspace_id ?? undefined
  const photoLook = await resolvePhotoLook(project)
  const seconds = typeof row?.duration_seconds === 'number' && Number.isFinite(row.duration_seconds) ? row.duration_seconds : null
  const noPeople = Array.isArray(row?.characters) && row.characters.length === 0
  const size = await otherFramesSize(frames, 'end')
  const image_size = endFrameImageSize(size?.width ?? 16, size?.height ?? 9)
  const plan = realEndFramePlan({ start: frames.start, line: read.en, seconds, photoLook: photoLook ? { clause: photoLook.clause } : null, noPeople })

  // 읽은 줄 · 고친 줄은 사람 손글씨가 옮겨진 글이다 — 자리 예약 전에 검사한다(10/11 약속).
  const moderation = await assertUserTextAllowed([plan.userText], { projectId, kind: 'shot_storyboard', ...(opts.userId ? { userId: opts.userId } : {}) })
  let job: GenerationJob
  try {
    job = await reserveGenerationJob({
      projectId,
      model: plan.model,
      kind: 'shot_storyboard',
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      provider: 'fal',
      inputSnapshot: { prompt: plan.prompt, image_urls: plan.refs, image_size, real_end: true },
      target: {
        ...(workspaceId ? { workspaceId } : {}),
        writerShotId: shotId,
        realEnd: { versionId, direction: frames.direction, line: read.en },
      },
    })
  } catch (err) {
    // 같은 샷 실사 작업은 하나만(DB 트리거) — 막 들어온 같은 끝 장 작업이면 그 번호를, 다른 실사 작업이면 거절한다.
    const existing = existingStoryboardJobId(err)
    if (!existing) throw err
    const again = await runningRealJob(projectId, shotId)
    if (again?.id === existing && again.realEnd) return { jobId: existing, read, replayed: true }
    throw new RealShotBusyError(locale)
  }
  recordModerationPass(moderation, { projectId, kind: 'shot_storyboard', userId: opts.userId ?? null, jobId: job.id })
  let receipt: Awaited<ReturnType<typeof falImageSubmit>>
  try {
    // 외부 접수는 한 번뿐이다 — 예약이 이미 자리를 잡고 있으니 SDK 재시도는 이중 발주다.
    receipt = await falImageSubmit(
      moderatedSubmitInput(
        { model: plan.model, prompt: plan.prompt, reference_image_urls: plan.refs, image_size, webhookUrl: resolveWebhookUrl(job.id) },
        moderation,
      ),
      { retry: false, falKeyId: job.fal_key_id ?? undefined },
    )
  } catch (err) {
    if (isDefiniteSubmitRejection(err)) {
      await rejectGenerationJobReservation(job.id, projectId, err instanceof Error ? err.message : String(err)).catch(() => undefined)
    }
    throw err
  }
  try {
    await confirmGenerationJobReceipt(job.id, projectId, receipt)
  } catch (err) {
    // 이미 접수됐다 — 새 번호로 다시 내지 않는다. 기록 실패는 로그로만.
    console.error('[real-directing-edit] end frame receipt could not be saved:', job.id, err instanceof Error ? err.message : String(err))
  }
  return { jobId: job.id, read, replayed: false }
}

/**
 * 실사 끝 장 작업 끼우기(완료 처리 갈래) — 그 판의 끝 장만 바꾼다(새 판을 만들지 않는다). 다른 두 장 크기로 맞추고 작업마다 새 파일에 올린다.
 *   [멈추기]로 멈췄거나(stopped) 그사이 그 판이 바뀌었으면 끼우지 않는다 — 작업은 실패로 끝나고 화면이 "그대로예요"를 알린다.
 */
export async function finalizeRealEndFrameJob(job: GenerationJob, falImageUrl: string, opts: { stopped: boolean }): Promise<string> {
  const shotId = job.target.writerShotId
  const realEnd = job.target.realEnd
  if (!shotId || !realEnd) throw new Error('real end job target is missing writerShotId/realEnd')
  if (opts.stopped) throw new Error('The end frame redraw was stopped, so it was not inserted')
  const changed = () => new Error('The image changed while the end frame was being drawn, so it was not inserted')
  const row = await loadRealShot(job.project_id, shotId)
  if (!withRealEndFrame(row?.storyboard_image, realEnd, falImageUrl)) throw changed()
  const project = await loadProject(job.project_id)
  if (!project?.workspace_id) throw changed()
  const res = await fetch(falImageUrl)
  if (!res.ok) throw new Error(`real end frame image fetch failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) throw new Error(`real end frame image is abnormally small (${buf.length}b)`)
  // 크기는 그 판의 다른 두 장(시작 · 가운데)에서 — 세 장 크기가 다르면 카드 순환 · 편집기 그림 크기가 어긋난다.
  const frames = (row?.storyboard_image as { versions?: Array<{ id: string; frames?: { start: string; direction: string; end: string } }> } | null)
    ?.versions?.find((version) => version.id === realEnd.versionId)?.frames
  const size = frames ? await otherFramesSize(frames, 'end') : null
  const fitted = size ? await fitFrameToSize(buf, size.width, size.height) : buf
  // 실사 세 장과 같은 PNG 로 — 파일 이름 끝말(_storyboard_end.png)도 다른 실사 장과 같다.
  const png = await sharp(fitted).png().toBuffer()
  const path = `${project.workspace_id}/${job.project_id}/shots/${storageKeySegment(shotId)}_g${job.id}_storyboard_end.png`
  const endUrl = await upload(path, png, 'image/png', true)
  const written = await updateStoryboardImage(job.project_id, shotId, (current) => withRealEndFrame(current, realEnd, endUrl))
  if (!written) throw changed()
  await completeGenerationJob(job.id, endUrl)
  return endUrl
}
