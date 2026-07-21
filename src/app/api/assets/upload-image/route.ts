import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { uploadImmutableObject } from '@/lib/storage/immutable-object'
import { storageKeySegment } from '@/lib/storage/key-segment'
import sharp from 'sharp'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 10_000
const MAX_IMAGE_PIXELS = 40_000_000
const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', format: 'jpeg' },
  'image/png': { extension: 'png', format: 'png' },
  'image/webp': { extension: 'webp', format: 'webp' },
  'image/gif': { extension: 'gif', format: 'gif' },
} as const

type ImageTarget = {
  table: 'characters' | 'locations' | 'shots'
  idColumn: 'character_id' | 'location_id' | 'shot_id'
  fields: readonly string[]
}

const IMAGE_TARGETS: Record<string, ImageTarget> = {
  character: {
    table: 'characters',
    idColumn: 'character_id',
    fields: ['portrait', 'view_main', 'view_back', 'view_side_left', 'view_side_right'],
  },
  location: {
    table: 'locations',
    idColumn: 'location_id',
    fields: ['wide_shot', 'establishing_shot'],
  },
  shot: {
    table: 'shots',
    idColumn: 'shot_id',
    fields: ['storyboard_image'],
  },
}

const CANONICAL_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function isCanonicalSegment(value: string): boolean {
  return CANONICAL_SEGMENT.test(value)
}

function isValidEntityId(value: string): boolean {
  return value.length <= 256 && !value.includes('\0')
}
function decoderDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 200)
}

async function validImage(mimeType: string, data: Buffer): Promise<boolean> {
  const imageType = IMAGE_TYPES[mimeType as keyof typeof IMAGE_TYPES]
  if (!imageType || data.length === 0 || data.length > MAX_IMAGE_BYTES) return false

  try {
    const image = sharp(data, { animated: true, failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
    const metadata = await image.metadata()
    if (
      metadata.format !== imageType.format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) return false
    await image.toBuffer()
    return true
  } catch (error) {
    console.warn('[assets/upload-image] image decoder rejected input', decoderDiagnostic(error))
    return false
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const projectId = form.get('projectId') as string
    const type = form.get('type') as string
    const entityId = form.get('entityId') as string
    const field = form.get('field') as string
    const file = form.get('file')
    const generationJobId = form.get('generationJobId') as string | null
    if (!projectId || !type || !entityId || !field || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isCanonicalSegment(projectId)) {
      return NextResponse.json({ error: 'Invalid project identifier' }, { status: 400 })
    }
    if (type === 'video' && !isCanonicalSegment(entityId)) {
      return NextResponse.json({ error: 'Invalid video take identifier' }, { status: 400 })
    }
    if (type !== 'video' && !isValidEntityId(entityId)) {
      return NextResponse.json({ error: 'Invalid image target identifier' }, { status: 400 })
    }
    if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects').select('workspace_id').eq('id', projectId).maybeSingle()
    if (projectError) throw projectError
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!isCanonicalSegment(project.workspace_id)) {
      return NextResponse.json({ error: 'Invalid project storage namespace' }, { status: 400 })
    }

    if (type === 'video') {
      if (field !== 'thumbnail') {
        return NextResponse.json({ error: 'Only thumbnail uploads are allowed for video takes' }, { status: 400 })
      }
      if (!generationJobId || !isCanonicalSegment(generationJobId)) return NextResponse.json({ error: 'generationJobId is required for video thumbnails' }, { status: 400 })
      if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Video thumbnail must be an image no larger than 10 MB' }, { status: 400 })
      }

      const mimeType = file.type
      const buffer = Buffer.from(await file.arrayBuffer())
      if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || mimeType !== 'image/jpeg' || !(await validImage(mimeType, buffer))) {
        return NextResponse.json({ error: 'Video thumbnail must be a fully decoded JPEG no larger than 10 MB' }, { status: 400 })
      }
      const { data: job, error: jobError } = await supabaseAdmin
        .from('generation_jobs').select('id, video_clip_id, status')
        .eq('id', generationJobId).eq('project_id', projectId).eq('kind', 'shot_video').maybeSingle()
      if (jobError) throw jobError
      if (!job || job.video_clip_id !== entityId || job.status !== 'completed') {
        return NextResponse.json({ error: 'Generation job does not belong to this completed live video take' }, { status: 403 })
      }

      const expectedVideoPath = `${project.workspace_id}/${projectId}/videos/${entityId}/${job.id}.mp4`
      const { data: clip, error: clipError } = await supabaseAdmin
        .from('video_clips').select('id, storage_path').eq('id', entityId).eq('project_id', projectId).is('deleted_at', null).maybeSingle()
      if (clipError) throw clipError
      if (!clip) return NextResponse.json({ error: 'Video take not found' }, { status: 404 })
      if (clip.storage_path !== expectedVideoPath) {
        return NextResponse.json({ error: 'Generation job is no longer the current video take' }, { status: 409 })
      }

      const storagePath = `${project.workspace_id}/${projectId}/videos/${clip.id}/${job.id}.jpg`
      await uploadImmutableObject(storagePath, buffer, mimeType)
      const publicUrl = supabaseAdmin.storage.from('media').getPublicUrl(storagePath).data.publicUrl
      const { data: updatedClip, error: updateError } = await supabaseAdmin
        .from('video_clips')
        .update({ thumbnail_url: publicUrl, thumbnail_path: storagePath })
        .eq('id', entityId).eq('project_id', projectId).is('deleted_at', null)
        .eq('storage_path', expectedVideoPath)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!updatedClip) {
        return NextResponse.json({ error: 'Generation job is no longer the current video take' }, { status: 409 })
      }
      return NextResponse.json({ publicUrl })
    }

    const target = IMAGE_TARGETS[type as keyof typeof IMAGE_TARGETS]
    if (!target || !target.fields.includes(field)) {
      return NextResponse.json({ error: 'Unsupported image upload target' }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be no larger than 10 MB' }, { status: 400 })
    }

    const mimeType = file.type
    const buffer = Buffer.from(await file.arrayBuffer())
    const imageType = IMAGE_TYPES[mimeType as keyof typeof IMAGE_TYPES]
    if (
      buffer.length === 0 ||
      buffer.length > MAX_IMAGE_BYTES ||
      !imageType ||
      !(await validImage(mimeType, buffer))
    ) {
      return NextResponse.json({ error: 'Image MIME type does not match fully decoded supported image content' }, { status: 400 })
    }

    const { data: targetRow, error: targetError } = await supabaseAdmin
      .from(target.table).select(target.idColumn).eq('project_id', projectId).eq(target.idColumn, entityId).maybeSingle()
    if (targetError) throw targetError
    if (!targetRow) return NextResponse.json({ error: 'Image target not found' }, { status: 404 })

    const extension = imageType.extension
    const storagePath = `${project.workspace_id}/${projectId}/${type}s/${storageKeySegment(entityId)}_${field}.${extension}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('media').upload(storagePath, buffer, { contentType: mimeType, upsert: true })
    if (uploadError) throw uploadError
    await uploadThumbnail(storagePath, buffer)

    const rawPublicUrl = supabaseAdmin.storage.from('media').getPublicUrl(storagePath).data.publicUrl
    const publicUrl = `${rawPublicUrl}?v=${Date.now()}`
    const value = field === 'storyboard_image'
      ? { url: publicUrl, status: 'completed', errorMessage: null, generatedAt: Date.now() }
      : publicUrl
    const { data: updatedTarget, error: updateError } = await supabaseAdmin
      .from(target.table)
      .update({ [field]: value })
      .eq('project_id', projectId)
      .eq(target.idColumn, entityId)
      .select(target.idColumn)
      .maybeSingle()
    if (updateError) throw updateError
    if (!updatedTarget) return NextResponse.json({ error: 'Image target no longer exists' }, { status: 409 })
    return NextResponse.json({ publicUrl })
  } catch (err) {
    console.error('[assets/upload-image]', decoderDiagnostic(err))
    return NextResponse.json({ error: 'Unable to upload image' }, { status: 500 })
  }
}
