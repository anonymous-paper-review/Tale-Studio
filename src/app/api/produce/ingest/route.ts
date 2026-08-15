import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { storageKeySegment } from '@/lib/storage/key-segment'
import {
  IMAGE_TYPES,
  clampTextBytes,
  isImageMimeType,
  kindOf,
  rejectReason,
} from '@/lib/upload/limits'
import { decodeImage, sliceForVision } from '@/lib/upload/image'
import { extractDocxText, normalizeExtractedText } from '@/lib/upload/docx'

/**
 * 프로듀서 첨부 전처리 — 브라우저가 못 하는 일만 한다.
 *
 * 이 라우트는 판독하지 않는다. docx 를 텍스트로 풀고, 이미지를 스토리지에 올리고
 * 판독 가능한 크기로 잘라 URL 을 돌려줄 뿐이다. 실제 판독은 사용자의 의도(자연어)와
 * 함께 기존 produce/chat 이 한다 — 그래야 extractedSettings·choices·제안 배선이
 * 그대로 재사용되고, "화풍 레퍼런스로 써줘" 같은 요청도 같은 경로로 처리된다.
 *
 * 요청당 파일 하나. 여러 장은 클라이언트가 순차로 부른다(진행률 표시가 여기서 나온다).
 */

const CANONICAL_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function diagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 200)
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked

  // 실패 지점 표식 — 이미지 처리는 디코드·슬라이싱·스토리지 세 단계라, 한 덩어리로 500 을
  //   던지면 어디서 터졌는지 로그를 봐야만 안다(2026-08-13 실사용에서 실제로 막혔다).
  let stage = 'init'

  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const projectId = form.get('projectId')
    const file = form.get('file')

    if (typeof projectId !== 'string' || !CANONICAL_SEGMENT.test(projectId)) {
      return NextResponse.json({ error: 'Invalid project identifier' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 확장자·크기 정책은 클라이언트에서도 한 번 걸리지만, 그건 즉각 피드백용이고
    // 여기가 진짜 방어선이다(클라 검사는 우회 가능).
    const denied = rejectReason(file.name, file.size)
    if (denied) return NextResponse.json({ error: denied }, { status: 400 })

    const kind = kindOf(file.name)
    if (!kind) {
      return NextResponse.json({ error: '지원하지 않는 형식이에요.' }, { status: 400 })
    }

    if (kind === 'text') {
      const raw = await file.text()
      const { text, truncated } = clampTextBytes(normalizeExtractedText(raw))
      if (!text) {
        return NextResponse.json({ error: `${file.name} 에서 읽을 내용이 없어요.` }, { status: 400 })
      }
      return NextResponse.json({ kind: 'text', name: file.name, text, truncated })
    }

    if (kind === 'docx') {
      let extracted: string
      try {
        extracted = await extractDocxText(Buffer.from(await file.arrayBuffer()))
      } catch (error) {
        console.warn('[produce/ingest] docx parse failed', diagnostic(error))
        return NextResponse.json(
          { error: `${file.name} 을(를) 읽지 못했어요. 파일이 손상되었을 수 있어요.` },
          { status: 400 },
        )
      }
      const { text, truncated } = clampTextBytes(extracted)
      if (!text) {
        return NextResponse.json(
          { error: `${file.name} 에 본문 텍스트가 없어요. 이미지로만 된 문서는 이미지로 올려 주세요.` },
          { status: 400 },
        )
      }
      return NextResponse.json({ kind: 'text', name: file.name, text, truncated })
    }

    // ── 이미지 ──────────────────────────────────────────────────────────────
    const mimeType = file.type
    if (!isImageMimeType(mimeType)) {
      return NextResponse.json({ error: `${file.name} 의 형식을 확인할 수 없어요.` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const decoded = await decodeImage(buffer, mimeType)
    if (!decoded.ok) {
      // 사유를 그대로 보여준다 — "손상됐거나 형식이 다르다"로 뭉개면 사용자가 뭘 고쳐야
      //   하는지 알 수 없다(스크롤 웹툰이 세로 상한에 걸린 사례, 2026-08-13).
      return NextResponse.json({ error: `${file.name}: ${decoded.reason}` }, { status: 400 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!CANONICAL_SEGMENT.test(project.workspace_id)) {
      return NextResponse.json({ error: 'Invalid project storage namespace' }, { status: 400 })
    }

    // 원본을 남기는 이유: storyText 를 파생물로 만들어 재판독 여지를 남기고,
    // 화풍 레퍼런스(style anchor)가 이미지 URL 을 요구하기 때문. 저장은 지금 안 하면
    // 파일이 이미 사라져 소급이 불가능하다.
    const uploadId = storageKeySegment(`${projectId}:${file.name}:${Date.now()}`)
    const base = `${project.workspace_id}/${projectId}/uploads/${uploadId}`
    const originalExt = decoded.image.extension

    stage = 'upload-original'
    const originalPath = `${base}/original.${originalExt}`
    const { error: originalError } = await supabaseAdmin.storage
      .from('media')
      .upload(originalPath, buffer, { contentType: mimeType, upsert: true })
    if (originalError) throw originalError

    // 여기가 유일한 전체 디코드다 — 깨진 파일도 여기서 걸린다.
    stage = 'slice'
    const { slices, truncated } = await sliceForVision(buffer, decoded.image)

    stage = 'upload-slices'
    const sliceUrls: { url: string; width: number; height: number }[] = []
    for (const slice of slices) {
      const slicePath = `${base}/s${String(slice.index).padStart(3, '0')}.jpg`
      const { error: sliceError } = await supabaseAdmin.storage
        .from('media')
        .upload(slicePath, slice.buffer, { contentType: 'image/jpeg', upsert: true })
      if (sliceError) throw sliceError
      sliceUrls.push({
        url: supabaseAdmin.storage.from('media').getPublicUrl(slicePath).data.publicUrl,
        width: slice.width,
        height: slice.height,
      })
    }

    return NextResponse.json({
      kind: 'image',
      name: file.name,
      originalUrl: supabaseAdmin.storage.from('media').getPublicUrl(originalPath).data.publicUrl,
      width: decoded.image.width,
      height: decoded.image.height,
      slices: sliceUrls,
      truncated,
    })
  } catch (error) {
    const detail = diagnostic(error)
    console.error(`[produce/ingest] stage=${stage}`, detail)
    // 개발 중에는 실제 사유를 그대로 보여준다. 일반 문구만 주면 서버 로그를 뒤지기 전에는
    //   아무것도 알 수 없고, 그 사이 사용자는 "그냥 안 되는 기능"으로 받아들인다.
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'production'
            ? '파일을 처리하지 못했어요.'
            : `처리 실패 (${stage}): ${detail}`,
      },
      { status: 500 },
    )
  }
}
