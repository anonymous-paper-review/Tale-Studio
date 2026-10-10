/**
 * 프로젝트 하나를 지우는 서버 함수 — 데이터베이스 행과 보관함 파일을 함께 지운다.
 *
 * 왜 여기로 모았는가: 개인정보 처리방침 §1 이 "프로젝트를 지우면 그 자료를 지운다"고 약속하는데,
 * 종전에는 DELETE /api/project/[id] 가 `delete_project_deep` 으로 DB 만 지우고 파일은 버킷에
 * 남겼다. 계정 삭제(약관 §9)도 같은 삭제를 사용자의 모든 프로젝트에 반복해야 하므로, 두 입구가
 * 같은 규칙을 쓰도록 한 곳에 둔다.
 *
 * 순서가 중요하다:
 *   ① 소유권 확인 → ② 보관함 파일 삭제 → ③ `delete_project_deep`(DB 단일 트랜잭션).
 * 파일을 먼저 지우는 이유는 DB 행이 사라지면 파일 경로를 되찾을 길이 없기 때문이다.
 * 소유권을 ① 에서 먼저 보는 이유는 파일 삭제가 되돌릴 수 없어서다 — RPC 의 자체 확인만 믿고
 * 파일부터 지우면 잘못된 id 한 번이 남의 결과물을 날린다.
 *
 * 파일 일부가 안 지워져도 ③ 은 진행한다. 개인정보 처리방침이 결과물 삭제를 "progressively"
 * 라고 적었고, DB 를 남겨 두면 사용자 화면에 깨진 프로젝트가 남는다. 못 지운 경로는
 * `server_errors` 에 적어 나중에 치울 수 있게 한다.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { mediaList, mediaRemove } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'

export type DeleteProjectResult =
  | { status: 'ok'; removedPaths: string[]; leftoverPaths: string[] }
  | { status: 'not_found' }
  | { status: 'forbidden' }

/** 한 번에 받아오는 목록 크기. Supabase 보관함 list 의 기본 상한이 100 이라 명시해서 올린다. */
const LIST_PAGE = 1000

/** 한 번에 지우는 경로 수. 요청이 너무 커지면 보관함이 전체를 거절한다. */
const REMOVE_CHUNK = 100

/**
 * 이 프로젝트의 파일이 쌓이는 보관함 접두사 전부.
 *
 * 두 규칙이 공존한다 — 대부분의 경로는 `{작업공간 id}/{프로젝트 id}/…` 이고(러프·샷·인물·업로드),
 * Editor 타이틀 이미지만 `storageKeySegment` 로 감싼 해시 칸을 쓴다
 * (src/app/api/editor/title-image/route.ts). 둘 다 프로젝트 전용이라 통째로 지워도 안전하다.
 */
export function projectStoragePrefixes(workspaceId: string, projectId: string): string[] {
  return [
    `${workspaceId}/${projectId}`,
    `${storageKeySegment(workspaceId)}/${storageKeySegment(projectId)}`,
  ]
}

/** 접두사 아래의 모든 객체 경로(하위 폴더 포함). 목록 자체가 실패하면 던진다. */
async function listObjectsUnder(prefix: string): Promise<string[]> {
  const paths: string[] = []
  const folders: string[] = []

  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await mediaList(prefix, { limit: LIST_PAGE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const entry of data) {
      // 보관함 목록은 폴더를 id 없는 항목으로 돌려준다(scripts/backfill-thumbnails.mjs 와 같은 판정).
      if (entry.id == null) folders.push(`${prefix}/${entry.name}`)
      else paths.push(`${prefix}/${entry.name}`)
    }
    if (data.length < LIST_PAGE) break
  }

  for (const folder of folders) paths.push(...(await listObjectsUnder(folder)))
  return paths
}

/** 못 지운 경로를 서버 오류 기록에 남긴다(진단 실패가 삭제를 막지 않게 best-effort). */
async function recordLeftover(projectId: string, leftoverPaths: string[]): Promise<void> {
  if (leftoverPaths.length === 0) return
  try {
    await supabaseAdmin.from('server_errors').insert({
      path: `storage-leftover/project/${projectId}`,
      method: 'DELETE',
      message: `project delete left ${leftoverPaths.length} storage object(s) behind`.slice(0, 500),
      stack: leftoverPaths.join('\n').slice(0, 1000),
    })
  } catch (err) {
    console.warn('[project/delete] leftover record failed:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * 프로젝트를 지운다. 반환값은 라우트가 그대로 HTTP 로 옮길 수 있는 상태다.
 * DB 삭제 실패는 던진다 — 호출부가 500 으로 올려야 하고, 성공으로 위장하면 안 된다.
 */
export async function deleteProjectDeep(input: {
  projectId: string
  userId: string
}): Promise<DeleteProjectResult> {
  const { projectId, userId } = input

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) return { status: 'not_found' }

  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', project.workspace_id)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  if (workspace?.owner_id !== userId) return { status: 'forbidden' }

  const removedPaths: string[] = []
  const leftoverPaths: string[] = []

  for (const prefix of projectStoragePrefixes(project.workspace_id as string, projectId)) {
    let objects: string[]
    try {
      objects = await listObjectsUnder(prefix)
    } catch (err) {
      // 목록을 못 읽으면 무엇이 남는지도 모른다 — 접두사를 그대로 적어 사람이 훑을 수 있게 한다.
      console.warn('[project/delete] storage list failed:', prefix, err instanceof Error ? err.message : String(err))
      leftoverPaths.push(`${prefix}/*`)
      continue
    }

    for (let i = 0; i < objects.length; i += REMOVE_CHUNK) {
      const chunk = objects.slice(i, i + REMOVE_CHUNK)
      try {
        const { error } = await mediaRemove(chunk)
        if (error) throw error
        removedPaths.push(...chunk)
      } catch (err) {
        console.warn('[project/delete] storage remove failed:', err instanceof Error ? err.message : String(err))
        leftoverPaths.push(...chunk)
      }
    }
  }

  await recordLeftover(projectId, leftoverPaths)

  // projects 외래키 cascade 가 없는 표(운영 DB 2026-10-11 조회). delete_project_deep 이 안 지우므로 여기서 지운다.
  //   llm_calls 는 글 AI 에 보낸 이야기 원문과 응답이라 남기면 개인정보 §1 약속을 어긴다.
  for (const table of ['llm_calls', 'scene_character_appearance_overrides'] as const) {
    const { error } = await supabaseAdmin.from(table).delete().eq('project_id', projectId)
    if (error) throw new Error(`${table} delete failed: ${error.message}`)
  }

  // 삭제 전체(소유권 재확인 + FK-safe 순서의 자식 14테이블 + 본체)를 DB 함수 하나로
  // (#project-lifecycle-rpc 2026-09-01). 함수가 단일 트랜잭션이라 중간 실패 시 부분 삭제가 없다.
  const { data: status, error } = await supabaseAdmin.rpc('delete_project_deep', {
    p_project_id: projectId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
  if (status === 'not_found') return { status: 'not_found' }
  if (status === 'forbidden') return { status: 'forbidden' }
  if (status !== 'ok') throw new Error(`Unexpected delete status: ${String(status)}`)

  return { status: 'ok', removedPaths, leftoverPaths }
}
