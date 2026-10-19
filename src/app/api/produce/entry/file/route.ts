// POST /api/produce/entry/file — Producer 시작 화면에 파일 하나를 올린다 (리뉴얼 1차 2026-10-19).
//   글 파일(txt · md · docx · pdf · hwp · hwpx)은 글을 꺼내 초안에 둔다(100KB 상한). 글이 없으면 "글 없음"으로 표시해 둔다 —
//   화면이 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 한다. 이미지(png · jpg)는 예전 첨부(produce/ingest)와 같은 저장소 경로에
//   원본과 글자 읽기용 조각을 올린다. 글자 읽기는 추천 때 한다. 파일은 하나뿐이라 새로 올리면 앞의 파일을 바꾼다.
//   웹툰 · 캐릭터 시트 · 참조 사진 읽기는 다음 버전(프로토타입 EF).
//   약속: tests/producer/entry-routes.test.ts
import { NextResponse } from 'next/server'
import { checkEntryFile, entryFileKind, fileExtension } from '@/features/entry/options'
import { normalizeEntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { extractEntryText } from '@/lib/entry/extract-text'
import { mediaUpload } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { decodeImage, sliceForVision } from '@/lib/upload/image'
import { isImageMimeType } from '@/lib/upload/limits'
import { PROJECT_ID_RE, authorizeEntry, loadEntryProject, saveEntryDraft, serverError } from '../entry-access'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_NAME = 300

export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request: file is required' }, { status: 400 })
  }
  const projectId = form.get('projectId')
  const access = await authorizeEntry(req, projectId, { write: true })
  if (!access.ok) return access.response
  const id = projectId as string
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Invalid request: file is required' }, { status: 400 })

  try {
    const row = await loadEntryProject(id, 'workspace_id, current_stage, entry_draft')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = normalizeEntryDraft(row.entry_draft)
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })

    // 확장자 · 크기는 화면에서도 걸리지만 여기가 진짜 방어선이다.
    const problem = checkEntryFile(file.name, file.size)
    if (problem) return NextResponse.json({ error: problem.code }, { status: 400 })
    const kind = entryFileKind(file.name)!
    const base = { name: file.name.slice(0, MAX_NAME), ext: fileExtension(file.name), size: file.size, uploadedAt: new Date().toISOString() }
    const bytes = new Uint8Array(await file.arrayBuffer())

    let meta: EntryFileMeta
    if (kind === 'text') {
      const result = await extractEntryText(file.name, bytes)
      if (result.status === 'unreadable') {
        console.warn('[produce/entry/file] unreadable', result.reason)
        return NextResponse.json({ error: 'unreadable' }, { status: 400 })
      }
      meta = result.status === 'no_text'
        ? { ...base, kind: 'text', chars: 0, noText: true }
        : { ...base, kind: 'text', chars: Array.from(result.text).length, text: result.text, ...(result.truncated ? { truncated: true } : {}) }
    } else {
      const mimeType = isImageMimeType(file.type) ? file.type : base.ext === 'png' ? 'image/png' : 'image/jpeg'
      const buffer = Buffer.from(bytes)
      const decoded = await decodeImage(buffer, mimeType)
      if (!decoded.ok) {
        console.warn('[produce/entry/file] image rejected', decoded.reason)
        return NextResponse.json({ error: 'unreadable' }, { status: 400 })
      }
      if (!row.workspace_id || !PROJECT_ID_RE.test(row.workspace_id)) {
        return NextResponse.json({ error: 'Invalid project storage namespace' }, { status: 400 })
      }
      // 예전 첨부와 같은 자리: {워크스페이스}/{프로젝트}/uploads/{올림 id}/original.{확장자} + 조각 s000.jpg …
      const uploadId = storageKeySegment(`${id}:${file.name}:${Date.now()}`)
      const folder = `${row.workspace_id}/${id}/uploads/${uploadId}`
      const storagePath = `${folder}/original.${decoded.image.extension}`
      const { error: originalError } = await mediaUpload(storagePath, buffer, { contentType: mimeType, upsert: true })
      if (originalError) throw originalError
      const { slices } = await sliceForVision(buffer, decoded.image)
      const slicePaths: string[] = []
      for (const slice of slices) {
        const slicePath = `${folder}/s${String(slice.index).padStart(3, '0')}.jpg`
        const { error: sliceError } = await mediaUpload(slicePath, slice.buffer, { contentType: 'image/jpeg', upsert: true })
        if (sliceError) throw sliceError
        slicePaths.push(slicePath)
      }
      meta = { ...base, kind: 'image', chars: 0, storagePath, slicePaths }
    }

    const next = { ...draft, file: meta }
    await saveEntryDraft(id, next)
    return NextResponse.json({ draft: next })
  } catch (error) {
    return serverError('/file', error)
  }
}
