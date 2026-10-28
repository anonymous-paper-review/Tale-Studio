// 카드 기록에서 빠진 그림 파일 지우기(서버 전용, 2026-10-28 작품 스타일 기록) — 그림마다 새 파일이 생기므로 보관 한도(칸마다 5장)로
//   기록 줄이 빠지면 그 파일도 지운다. 지우지 않는 것: 버전 기록이 가리키는 그림 · 지금 그림 · 아직 남은 카드 기록 줄이 가리키는 그림 ·
//   버전 폴더 · 예전 고정 경로(image-files 규칙).
//   finalize 가 부른다 — 무거운 모듈(run-store 등)을 들이지 않으려고 style-versions-server 와 나눴다. 약속: tests/artist/image-files.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { thumbObjectPath } from '@/lib/storage-thumb'
import { mediaPathFromUrl, mediaRemove } from '@/lib/storage/media'
import { isEvictableGenerationPath, portraitPathForSheet } from '@/lib/artist/image-files'
import { parseVersionSnapshot } from '@/lib/artist/style-versions'

const rowsOf = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : [])

/** 지우면 안 되는 파일 — 버전 기록이 가리키는 그림, 지금 그림(시트 · 대표 얼굴 · 배경), 카드 기록 줄이 가리키는 그림.
 *  카드 기록 줄: 같은 작업이 웹훅과 확인 두 길로 함께 마무리되면 한 파일에 줄이 둘 생긴다 — 하나가 빠져도 남은 줄의 파일은 지우지 않는다. */
export async function protectedImagePaths(projectId: string): Promise<Set<string>> {
  const [versions, appearances, locations, locationAppearances, characterCandidates, locationCandidates] = await Promise.all([
    supabaseAdmin.from('artist_versions').select('snapshot').eq('project_id', projectId),
    supabaseAdmin.from('character_appearances').select('sheet_url, portrait_url').eq('project_id', projectId),
    supabaseAdmin.from('locations').select('wide_shot').eq('project_id', projectId),
    supabaseAdmin.from('location_appearances').select('wide_shot').eq('project_id', projectId),
    supabaseAdmin.from('character_image_candidates').select('url').eq('project_id', projectId),
    supabaseAdmin.from('location_image_candidates').select('url').eq('project_id', projectId),
  ])
  for (const result of [versions, appearances, locations, locationAppearances, characterCandidates, locationCandidates]) {
    if (result.error) throw new Error(`protected image read failed: ${result.error.message}`)
  }
  const urls: Array<string | null | undefined> = []
  for (const row of rowsOf<{ snapshot: unknown }>(versions.data)) {
    const snapshot = parseVersionSnapshot(row.snapshot)
    for (const entry of snapshot?.characters ?? []) urls.push(entry.sheet.url, entry.portraitUrl)
    for (const entry of snapshot?.locations ?? []) urls.push(entry.wideShot.url)
  }
  for (const row of rowsOf<{ sheet_url: string | null; portrait_url: string | null }>(appearances.data)) urls.push(row.sheet_url, row.portrait_url)
  for (const row of rowsOf<{ wide_shot: string | null }>(locations.data)) urls.push(row.wide_shot)
  for (const row of rowsOf<{ wide_shot: string | null }>(locationAppearances.data)) urls.push(row.wide_shot)
  for (const row of rowsOf<{ url: string | null }>([...rowsOf(characterCandidates.data), ...rowsOf(locationCandidates.data)])) urls.push(row.url)
  return new Set(urls.flatMap((url) => {
    const path = url ? mediaPathFromUrl(url) : null
    return path ? [path] : []
  }))
}

/**
 * 보관 한도로 카드 기록에서 빠진 그림의 파일을 지운다(최선 — 실패해도 그림 저장은 그대로).
 *   작업 번호로 만든 이 프로젝트 인물 · 배경 파일만, 버전 기록 · 지금 그림이 가리키지 않을 때만. 시트면 대표 얼굴 · 작은 미리보기도 함께.
 */
export async function removeEvictedImageFiles(projectId: string, workspaceId: string | undefined, urls: Array<string | null | undefined>): Promise<void> {
  if (!workspaceId) return
  try {
    const paths = urls.flatMap((url) => {
      const path = url ? mediaPathFromUrl(url) : null
      return path && isEvictableGenerationPath(path, workspaceId, projectId) ? [path] : []
    })
    if (paths.length === 0) return
    const keep = await protectedImagePaths(projectId)
    const remove = new Set<string>()
    for (const path of paths) {
      if (keep.has(path)) continue
      remove.add(path)
      remove.add(thumbObjectPath(path))
      if (path.includes('/characters/') && !path.endsWith('_portrait.png')) {
        const face = portraitPathForSheet(path)
        if (!keep.has(face)) {
          remove.add(face)
          remove.add(thumbObjectPath(face))
        }
      }
    }
    if (remove.size === 0) return
    const { error } = await mediaRemove([...remove])
    if (error) throw error
  } catch (e) {
    console.warn('[artist-versions] evicted image cleanup skipped:', e instanceof Error ? e.message : e)
  }
}
