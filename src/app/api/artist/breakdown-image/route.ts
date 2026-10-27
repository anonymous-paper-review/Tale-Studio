// POST /api/artist/breakdown-image — Artist 브레이크다운 레퍼런스 그림 올리기(2026-10-27 오너 "입력한 이미지는 그대로 artist에 사용하면 되").
//   multipart: projectId, file. 프로젝트 주인의 JPG · PNG · WebP 만 받아 `{작업 공간}/{프로젝트}/breakdown/<id>.<확장자>` 에 두고 주소를 돌려준다.
//   DB 행은 쓰지 않는다 — 주소는 Producer 카드(초안)에 실렸다가 [만들기] 때 writer/start 가 그 카드의 그림으로 적는다(우리 보관함 주소만 받는다).
//   채팅 첨부(produce/ingest)와 달리 판독용 조각을 만들지 않는다. 그림 내용 검사는 하지 않는다 — 화면이 그림 사용 권리 확인을 받는다.
//   약속: tests/artist/breakdown-reference-upload.test.ts
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireProjectAccess } from '@/lib/api/guard'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { DOWNSCALE_MAX_EDGE } from '@/lib/upload/downscale'
import { decodeImage } from '@/lib/upload/image'
import { IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS, IMAGE_TYPES, isImageMimeType } from '@/lib/upload/limits'

export const runtime = 'nodejs'

/** 보관함 경로 칸 — 작업 공간 번호가 이 꼴이 아니면 경로를 만들지 않는다(produce/ingest 와 같은 규칙). */
const CANONICAL_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
/** 가로 · 세로 중 긴 쪽이 짧은 쪽의 이 배수를 넘으면 받지 않는다 — 띠처럼 긴 그림은 시트 · 와이드샷 자리에 맞지 않는다(2026-10-27 검토). */
export const BREAKDOWN_IMAGE_MAX_RATIO = 4

/**
 * 그림을 끝까지 열어 다시 저장한다 — 깨진 파일은 여기서 걸린다. 사진의 회전 정보대로 세우고(그림 모델은 회전 정보를 읽지 않을 수 있다),
 *   다시 저장하면서 촬영 정보(위치 등)를 지운다 — 이 주소는 공개 주소다.
 *   긴 변은 DOWNSCALE_MAX_EDGE(2048)까지만 둔다 — 화면은 파일 크기로만 줄여, 용량은 작고 픽셀이 큰 그림이 그대로 올 수 있다(검토).
 */
async function normalize(data: Buffer, format: 'jpeg' | 'png' | 'webp'): Promise<{ data: Buffer } | { badShape: true } | null> {
  try {
    const input = { failOn: 'error' as const, limitInputPixels: IMAGE_MAX_PIXELS }
    // 세운 뒤의 가로 · 세로로 모양을 본다 — 다시 저장은 한 번에(세우기 · 줄이기 · 저장) 해 두 번 압축하지 않는다(검토).
    const meta = await sharp(data, input).metadata()
    const width = meta.autoOrient?.width ?? meta.width ?? 0
    const height = meta.autoOrient?.height ?? meta.height ?? 0
    if (!width || !height) return null
    if (Math.max(width, height) > BREAKDOWN_IMAGE_MAX_RATIO * Math.min(width, height)) return { badShape: true }
    const image = sharp(data, input).rotate().resize({ width: DOWNSCALE_MAX_EDGE, height: DOWNSCALE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    if (format === 'jpeg') return { data: await image.jpeg({ quality: 92 }).toBuffer() }
    if (format === 'webp') return { data: await image.webp({ quality: 92 }).toBuffer() }
    return { data: await image.png().toBuffer() }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const form = await req.formData().catch(() => null)
    const projectId = form?.get('projectId')
    const file = form?.get('file')
    const access = await requireProjectAccess(req, typeof projectId === 'string' ? projectId : null)
    if (!access.ok) return access.response
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Invalid request: file is required' }, { status: 400 })
    }
    const mimeType = file.type
    if (!isImageMimeType(mimeType)) {
      return NextResponse.json({ error: 'Only JPG, PNG or WebP pictures can be uploaded.', code: 'unsupported_type' }, { status: 415 })
    }
    if (file.size === 0 || file.size > IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: 'The picture is empty or too large.', code: 'too_large' }, { status: 413 })
    }
    const original = Buffer.from(await file.arrayBuffer())
    // 신고한 형식과 실제 내용 · 크기를 먼저 본다(decodeImage) — 그다음 끝까지 열어 다시 저장한다.
    const decoded = await decodeImage(original, mimeType)
    const normalized = decoded.ok ? await normalize(original, IMAGE_TYPES[mimeType].format) : null
    if (normalized && 'badShape' in normalized) {
      return NextResponse.json({ error: 'This picture is too long or too wide.', code: 'bad_shape' }, { status: 400 })
    }
    if (!normalized) {
      return NextResponse.json({ error: 'Could not read this picture.', code: 'invalid_image' }, { status: 400 })
    }
    const stored = normalized.data

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', access.projectId)
      .maybeSingle()
    if (error) throw error
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!CANONICAL_SEGMENT.test(project.workspace_id as string)) {
      return NextResponse.json({ error: 'Invalid project storage namespace' }, { status: 400 })
    }

    const path = `${project.workspace_id}/${access.projectId}/breakdown/${randomUUID()}.${IMAGE_TYPES[mimeType].extension}`
    const { error: uploadError } = await mediaUpload(path, stored, { contentType: mimeType })
    if (uploadError) throw uploadError
    // 카드 · 그리드가 읽는 작은 미리보기(_thumb.webp) — 실패해도 원본으로 보인다(ThumbImage 폴백).
    await uploadThumbnail(path, stored)
    return NextResponse.json({ ok: true, url: mediaPublicUrl(path) })
  } catch (e) {
    console.error('[artist/breakdown-image]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Upload failed', code: 'upload_failed' }, { status: 500 })
  }
}
