// 실사 4샷 일괄 생성(#real-grid 2026-08-06) — 러프 보드의 그리드 방식 이식(이원화의 일괄 축).
//   같은 씬 + 같은 캐릭터 레퍼런스 세트의 러프 완비 샷을 4개씩 묶어 grid4 시트 1콜 리페인트,
//   finalize(storyboard_real_grid)가 크롭 분배. 빈칸 채우기 전용(storyboard 미생성 샷만 —
//   architecture §5: 차 있는 것 교체는 사람의 개별 재생성=단일 스트립). 검증: 실험 시트 통과(011fd4bd).
import { NextResponse } from 'next/server'
import { existingStoryboardJobId } from '@/lib/director/storyboard-active-job'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { capacityReservationRejection, quotaRejectionResponse } from '@/lib/api/quota'
import {
  confirmGenerationJobReceipt,
  reserveGenerationJob,
  rejectGenerationJobReservation,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { resolveImageEndpoint, resolveSheetImageModel } from '@/lib/image-models'
import {
  composeRoughReferenceGrid,
  buildRealGridPrompt,
  realSheetCanvas,
  type CharacterRefLabel,
} from '@/lib/director/storyboard-strip'
import { applyDirectorRefs, directorRefsExcludeWorld, loadSceneWorldRefs, parseDirectorRefs, readCharacterBlocking, readOffFrame } from '@/lib/director/shot-references'
import { parseProjectFormat } from '@/types/project'
import { mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'
import { STALE_QUEUED_MS } from '@/lib/generation-job-timing'

export const runtime = 'nodejs'
// 시트 2장(러프 12장씩 합성 · 업로드 · 예약 · 제출)이 60초를 넘겨 끊겼다 — 10/9 · 10/10 운영 6번 중 4번 504,
//   끊기면 클라 러너가 판 전체를 멈췄다(오너 제보 2026-10-10). 다른 긴 라우트와 같은 5분.
export const maxDuration = 300

const MAX_GRID_JOBS_PER_CALL = 2 // 러프 보드와 동일 관행 — 잔여는 응답 remaining 으로 반복 호출
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 작업이 맡은 샷 — 그리드(writerShotIds)와 단건(writerShotId) 모두. 모양이 어긋난 행은 빈 목록. */
function shotsOfTarget(target: unknown): string[] {
  const t = (target && typeof target === 'object' ? target : {}) as { writerShotId?: unknown; writerShotIds?: unknown }
  const many = Array.isArray(t.writerShotIds) ? t.writerShotIds.filter((id): id is string => typeof id === 'string') : []
  return typeof t.writerShotId === 'string' && t.writerShotId ? [...many, t.writerShotId] : many
}

function runIdOfTarget(target: unknown): string | null {
  const runId = (target && typeof target === 'object' ? target : {}) as { batchRunId?: unknown }
  return typeof runId.batchRunId === 'string' ? runId.batchRunId : null
}

interface EligibleShot {
  shot_id: string
  scene_id: string
  characters: string[]
  characterAppearanceKeys: Record<string, string>
  frames: { start: string; direction: string; end: string }
  /** #ref-gate: 러프의 character_blocking — 칸 안에서 어느 인형이 누구인지. */
  blocking: Map<string, { position: string | null; pose: string | null }>
  /** 약속 F3: Director 에서 배경 참조 선을 지운 샷 — 시트 전체가 뺐을 때만 배경을 안 붙인다. */
  excludeWorld: boolean
  /** 약속 I4: 참조한 러프의 generatedAt. */
  roughGeneratedAt: number | null
}

class CharacterAppearanceContractError extends Error {}

function requireCharacterAppearanceKeys(value: unknown, shotId: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${shotId} has no character_appearance_keys snapshot`)
  }
  const entries = Object.entries(value)
  if (entries.some(([characterId, appearanceKey]) => !characterId || typeof appearanceKey !== 'string' || !appearanceKey.trim())) {
    throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${shotId} has a malformed character_appearance_keys snapshot`)
  }
  return Object.fromEntries(entries.map(([characterId, appearanceKey]) => [characterId, appearanceKey.trim()]))
}

export async function POST(req: NextRequest) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    // force: 이미 생성된 샷도 다시 만든다(#c3 2026-08-27 오너 — "전체 재생성"). 기본은 빈칸만.
    // runId: 한 판(클라 러너 한 번)의 표시(2026-10-10). 이 판의 시트 작업은 target.batchRunId 에 남고, 같은 판의 요청은
    //   그 작업들이 맡은 샷을 끝났든 실패했든 다시 내지 않는다 — 앞 요청의 답을 잃어도(시간 초과 · 통신 끊김) DB 가 기억한다.
    //   실패한 샷이 요청마다 다시 나갔고(운영 9/1 3e0169eb 같은 시트 10번), force 는 요청마다 맨 앞 샷들을 다시 골랐다.
    const { projectId, force, traceId, runId } = (await req.json()) as {
      projectId?: string
      force?: boolean
      traceId?: string
      runId?: unknown
    }
    if (!projectId) return NextResponse.json({ error: 'Invalid request: projectId required' }, { status: 400 })

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    if (traceId !== undefined && !isChatTraceId(traceId)) {
      return NextResponse.json({ error: 'Invalid request: traceId must be a UUID' }, { status: 400 })
    }
    if (traceId && !(await chatTraceBelongsToProject(projectId, traceId))) {
      return NextResponse.json({ error: 'Invalid request: traceId does not belong to project' }, { status: 409 })
    }
    if (runId !== undefined && (typeof runId !== 'string' || !RUN_ID_RE.test(runId))) {
      return NextResponse.json({ error: 'Invalid request: runId must be a UUID' }, { status: 400 })
    }
    const batchRunId = typeof runId === 'string' ? runId : null

    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'storyboard_real_grid', userId: access.userId })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, style_anchor_key, custom_style_anchor, settings')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    // #fal-canvas(2026-08-17): 프로듀서 포맷 → 시트 캔버스. 캔버스 방향이 곧 셀 방향이라
    //   이 한 줄이 "화면비를 fal 에 전달"의 본체다 (vertical 실측: 4×3 유지 + 세로 패널 재구도).
    const projectFormat = parseProjectFormat(
      (project.settings as { format?: unknown } | null)?.format,
    )
    const sheetCanvas = realSheetCanvas(projectFormat, 'grid4')

    const { data: rows } = await supabaseAdmin
      .from('shots')
      .select('shot_id, scene_id, characters, character_appearance_keys, rough_storyboard, storyboard_image, static_spec, director_refs')
      .eq('project_id', projectId)
      .order('sort_order')

    // 이미 그리는 중인 샷(오너 제보 2026-10-10 "중간에 끊김"): 같은 샷은 한 작업만 받으므로(DB 트리거) 앞쪽 샷이 아직
    //   그려지는 중이면 그 시트 예약이 막혀 판 전체가 그 자리에서 끝났다 — 시간 초과 뒤 다시 누를 때 · 다른 탭 · 오래 걸리는 그림.
    //   그 샷은 건너뛰고 다음 샷을 낸다. 막 시작한 작업(STALE_QUEUED_MS 안)은 클라가 끝나기를 기다리게 inProgress 로 알려 주고,
    //   그보다 오래된 작업(접수 확인이 끝내 안 된 예약 등)은 기다려도 끝나지 않을 수 있어 건너뛰기만 한다.
    const { data: queuedJobs, error: queuedError } = await supabaseAdmin
      .from('generation_jobs')
      .select('id, target, created_at')
      .eq('project_id', projectId)
      .eq('status', 'queued')
      .in('kind', ['shot_storyboard', 'storyboard_real_grid'])
    if (queuedError) throw queuedError
    const busyJobByShot = new Map<string, { jobId: string; fresh: boolean; sameRun: boolean }>()
    for (const j of queuedJobs ?? []) {
      const fresh = Date.now() - new Date(j.created_at as string).getTime() < STALE_QUEUED_MS
      const sameRun = !!batchRunId && runIdOfTarget(j.target) === batchRunId
      for (const id of shotsOfTarget(j.target)) {
        if (!busyJobByShot.has(id)) busyJobByShot.set(id, { jobId: j.id as string, fresh, sameRun })
      }
    }
    // 같은 판이 이미 낸 샷 — 끝났든 실패했든 이 판에서는 다시 내지 않는다(실패한 샷은 버튼을 다시 누르면 = 새 판에서 다시 그린다).
    const { data: runJobs, error: runJobsError } = batchRunId
      ? await supabaseAdmin
          .from('generation_jobs')
          .select('id, target')
          .eq('project_id', projectId)
          .eq('kind', 'storyboard_real_grid')
          .eq('target->>batchRunId', batchRunId)
      : { data: [] as Array<{ id: string; target: unknown }>, error: null }
    if (runJobsError) throw runJobsError
    const doneThisRun = new Set((runJobs ?? []).flatMap((j) => shotsOfTarget(j.target)))
    /** 클라가 끝나기를 기다릴 작업 → 그 작업이 그리는 (이번 요청 대상) 샷 · 이 판이 낸 작업인지 */
    const inProgress = new Map<string, { shotIds: string[]; sameRun: boolean }>()
    const waitFor = (jobId: string, shotIds: string[], sameRun: boolean) => {
      const entry = inProgress.get(jobId) ?? { shotIds: [], sameRun }
      entry.shotIds.push(...shotIds)
      inProgress.set(jobId, entry)
    }
    const inProgressList = () =>
      [...inProgress].map(([jobId, e]) => ({ jobId, shotIds: e.shotIds, ...(e.sameRun ? { sameRun: true } : {}) }))

    const eligible: EligibleShot[] = []
    // #ref-gate(2026-09-02): 건너뛴 샷은 이유와 함께 돌려준다 — 클라가 선행 산출물을 기다렸다가 자동 재개한다.
    const skipped: Array<{
      shotId: string
      reason: 'missing_rough_storyboard' | 'missing_character_sheets'
      missing?: Array<{ characterId: string; appearanceKey: string; name: string }>
    }> = []
    for (const s of rows ?? []) {
      // 기본은 빈칸만(교체는 개별 재생성 소관). force 면 이미 있는 것도 다시 만든다 —
      //   오너가 "하나씩 하는 거 짜쳐서" 전체 재생성을 원한 경로(#c3).
      if (!force && s.storyboard_image) continue
      const busy = busyJobByShot.get(s.shot_id as string)
      if (busy) {
        if (busy.fresh) waitFor(busy.jobId, [s.shot_id as string], busy.sameRun)
        continue
      }
      if (doneThisRun.has(s.shot_id as string)) continue
      const f = (s.rough_storyboard as { frames?: Record<string, string> } | null)?.frames
      if (!f?.start || !f?.direction || !f?.end) {
        skipped.push({ shotId: s.shot_id as string, reason: 'missing_rough_storyboard' })
        continue
      }
      const characterAppearanceKeys = requireCharacterAppearanceKeys(s.character_appearance_keys, s.shot_id as string)
      const characters = ((s.characters as string[]) ?? []).slice().sort()
      if (
        characters.some((characterId) => !characterAppearanceKeys[characterId]) ||
        Object.keys(characterAppearanceKeys).some((characterId) => !characters.includes(characterId))
      ) {
        throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${s.shot_id} character_appearance_keys does not match its characters`)
      }
      // 약속 F3: 사람이 지운 참조는 붙이지 않는다(계약 검사는 Writer 원본으로, 참조는 override 로).
      const directorRefs = parseDirectorRefs((s as { director_refs?: unknown }).director_refs)
      // 프레임 밖 봉인(2026-09-05): 무대가 프레임 밖으로 판정한 인물의 시트는 붙이지 않는다.
      const offFrame = new Set(readOffFrame(s.static_spec))
      eligible.push({
        shot_id: s.shot_id as string,
        scene_id: s.scene_id as string,
        characters: applyDirectorRefs(characters, directorRefs).filter((id) => !offFrame.has(id)),
        characterAppearanceKeys,
        excludeWorld: directorRefsExcludeWorld(directorRefs),
        roughGeneratedAt: (s.rough_storyboard as { generatedAt?: number } | null)?.generatedAt ?? null,
        frames: { start: f.start, direction: f.direction, end: f.end },
        blocking: readCharacterBlocking(s.static_spec),
      })
    }

    // 인물 조회는 호출 전체 1회(쿼리 절약)로 두되 맵으로 보관 — 레퍼런스는 **시트별로** 꺼낸다
    //   (#real-grid-identity 2026-08-12): 옛 코드는 호출 전체(최대 2시트)의 합집합을 익명 URL
    //   배열로 모든 시트에 실었다. 그 시트에 안 나오는 인물의 레퍼런스가 오염원으로 첨부되고,
    //   어느 URL 이 누구인지도 잃어버려 프롬프트가 대응을 지시할 수 없었다 — 실측 a5cb2cae
    //   sh_04_18: 추적자 단독 칸이 소녀로 바꿔치기된 시트가 그대로 저장됐다.
    const appearancePairs = [...new Map(
      eligible
        .flatMap((s) => s.characters.map((characterId) => ({
          characterId,
          appearanceKey: s.characterAppearanceKeys[characterId],
        })))
        .map(({ characterId, appearanceKey }) => [`${characterId}\u0000${appearanceKey}`, { characterId, appearanceKey }]),
    ).values()].sort((a, b) =>
      a.characterId.localeCompare(b.characterId) || a.appearanceKey.localeCompare(b.appearanceKey),
    )
    const allCharIds = [...new Set(appearancePairs.map(({ characterId }) => characterId))]
    const { data: chars } = allCharIds.length
      ? await supabaseAdmin
          .from('characters')
          .select('character_id, name')
          .eq('project_id', projectId)
          .in('character_id', allCharIds)
      : { data: [] as Array<Record<string, unknown>> }
    const charById = new Map((chars ?? []).map((c) => [c.character_id as string, c]))
    const { data: appearanceRows } = appearancePairs.length
      ? await supabaseAdmin
          .from('character_appearances')
          .select('character_id, appearance_key, sheet_url')
          .eq('project_id', projectId)
          .in('character_id', allCharIds)
          .in('appearance_key', [...new Set(appearancePairs.map(({ appearanceKey }) => appearanceKey))])
      : { data: [] as Array<Record<string, unknown>> }
    const appearanceByPair = new Map(
      (appearanceRows ?? []).map((appearance) => [
        `${appearance.character_id as string}\u0000${appearance.appearance_key as string}`,
        appearance,
      ]),
    )
    // #ref-gate: 시트 없는 인물이 있는 샷은 이번 배치에서 빼고 이유(이름)와 함께 돌려준다 — 전체를 409 로
    //   죽이던 종전 동작 대신 준비된 샷은 진행하고, 클라가 시트 완성을 기다렸다가 자동 재개한다.
    //   묶기 전에 모든 대상 샷을 본다(2026-10-10): 묶은 뒤 앞 두 장만 보면 앞쪽 샷들에 시트 없는 인물이 있을 때
    //   준비된 뒤쪽 샷을 두고 "낼 것 없음"으로 판이 멈췄다. 없는 인물은 아래 계약 검사가 종전대로 409 로 알린다.
    const sheetMissingByShot = new Map<string, Array<{ characterId: string; appearanceKey: string; name: string }>>()
    for (const s of eligible) {
      const missing = s.characters
        .filter((characterId) => charById.has(characterId))
        .map((characterId) => ({ characterId, appearanceKey: s.characterAppearanceKeys[characterId] }))
        .filter(({ characterId, appearanceKey }) => {
          const sheetUrl = appearanceByPair.get(`${characterId}\u0000${appearanceKey}`)?.sheet_url
          return typeof sheetUrl !== 'string' || !sheetUrl.trim()
        })
        .map(({ characterId, appearanceKey }) => ({
          characterId,
          appearanceKey,
          name: (((charById.get(characterId)?.name as string) || characterId).trim()) || characterId,
        }))
      if (missing.length) sheetMissingByShot.set(s.shot_id, missing)
    }
    for (const [shotId, missing] of sheetMissingByShot) skipped.push({ shotId, reason: 'missing_character_sheets', missing })
    const ready = eligible.filter((s) => !sheetMissingByShot.has(s.shot_id))

    // 그룹핑: 같은 씬(#grid-shift 교훈)만 키 — 캐릭터 세트는 시트 내 혼재 허용(#real-grid-fix):
    //   세트를 키에 넣으면 시트가 잘게 쪼개져 배칭 이득이 반감(실측 8시트/12샷). 레퍼런스는
    //   합집합으로 전달되고 프롬프트가 칸별 대응("corresponding character")을 지시하므로 안전.
    const groups: EligibleShot[][] = []
    for (const s of ready) {
      const last = groups[groups.length - 1]
      if (!last || last.length >= 4 || last[0].scene_id !== s.scene_id) groups.push([s])
      else last.push(s)
    }
    const planned = groups.slice(0, MAX_GRID_JOBS_PER_CALL)
    const plannedShots = planned.reduce((n, g) => n + g.length, 0)
    if (!planned.length) {
      return NextResponse.json({ ok: true, data: { submitted: [], remaining: 0, skipped, inProgress: inProgressList() } })
    }
    if (planned.some((g) => g.some((s) => s.characters.some((characterId) => !charById.has(characterId))))) {
      throw new CharacterAppearanceContractError('Character appearance contract error: a shot snapshot references a missing character identity')
    }

    const anchor = await resolveStyleAnchor(project)
    // #F-006(2026-08-13): 시트 프롬프트에 씬 정보가 전무해 시트마다 시간대를 지어냈다(실측 1e166e55
    //   sc_04 Night — 21~24/25~27 시트가 서로 다른 시간대로 갈라짐). scenes.time_of_day 를 시트 전역
    //   조명 한 줄로 배선한다. 그룹은 씬 경계에서 끊기므로(위 그룹핑) 시트당 씬은 정확히 1개.
    const sceneIds = [...new Set(planned.map((g) => g[0].scene_id))]
    const { data: sceneRows } = await supabaseAdmin
      .from('scenes')
      .select('scene_id, time_of_day')
      .eq('project_id', projectId)
      .in('scene_id', sceneIds)
    const todByScene = new Map(
      (sceneRows ?? []).map((s) => [s.scene_id as string, ((s.time_of_day as string) ?? '').trim()]),
    )
    // #asset-authority(2026-09-02 오너 실측 bd5da55f: 떨어져 있던 바위가 샷 사이에서 합쳐짐): 그리드는
    //   지금까지 배경 레퍼런스를 아예 안 실었다(감사 W1). 씬 로케이션의 wide_shot 을 시트마다 첨부해
    //   지형·구조물의 권위를 artist 산출물에 둔다. 없으면(로케이션 미생성) 종전대로.
    //   #ref-gate 수정: 씬→로케이션은 scenes.location(location_id) 이 진실 — locations.scene_id 만 보던 첫 배선은
    //   실측 전 프로젝트에서 null 이라 배경을 한 번도 못 붙였다. 공용 헬퍼(scenes.location 우선, scene_id 폴백).
    const worldRefByScene = await loadSceneWorldRefs(projectId, sceneIds)

    const webhookUrl = resolveWebhookUrl()
    const submitted: Array<{ jobId: string; shotIds: string[] }> = []
    // #generation-capacity-trigger(2026-09-14): 자리가 없어 이번에 못 낸 시트의 샷 수 — 잔량(remaining)으로
    //   되돌려 다음 라운드가 다시 잡게 한다. 이미 낸 시트는 그대로 진행한다.
    let capacitySkippedShots = 0
    for (let groupIndex = 0; groupIndex < planned.length; groupIndex++) {
      const group = planned[groupIndex]
      // #sheet-formats: 레퍼런스 시트는 프레임 AR 매칭(왜곡 방지 — 레거시 프레임이면 레거시 시트),
      //   출력 캔버스·크롭은 포맷 스펙 — 가로 레퍼런스+세로 캔버스는 T2 실측 검증 경로.
      const refGrid = await composeRoughReferenceGrid(
        group.map((s) => s.frames),
        projectFormat,
      )
      // 결정적 경로 — 같은 시트를 다시 만들면 덮어쓴다.
      //   옛 키에는 `Date.now()` 가 박혀 있어 upsert 가 무의미했다: 호출마다 새 객체가 생기고
      //   아무도 지우지 않아 295개 625MB 가 쌓였다(2026-08-19 실측, 버킷의 17.3%). 그중 한 시트는
      //   38번 재생성돼 38벌이 남아 있었다. 이건 결과물이 아니라 외부 생성 서버에 넘기는
      //   주문서 첨부물이므로 최신 한 벌만 있으면 된다.
      //   식별자는 다른 경로와 같은 규약(해시 세그먼트)을 쓴다 — 원시 shot_id 를 그대로 키에
      //   넣으면 안전한 식별자가 다른 식별자의 이스케이프 형태와 같아질 수 있다.
      const refPath = `${project.workspace_id}/${projectId}/shots/real_grid_ref_${storageKeySegment(group[0].shot_id)}.png`
      const { error: upErr } = await mediaUpload(refPath, refGrid, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      // 캐시버스트는 **경로가 아니라 쿼리로** — 경로에 넣으면 객체가 늘고, 안 넣으면 덮어쓴
      //   시트를 중계망이 옛 내용으로 돌려줘 외부 생성 서버가 지난 배치를 그린다.
      //   단건 스토리보드 라우트가 쓰는 방식과 같다.
      const refUrl = `${mediaPublicUrl(refPath)}?v=${Date.now()}`

      // #real-grid-identity: 이 시트에 실제로 나오는 인물만, 결정적 순서(sort)로 —
      //   "reference image N = 이름" 규약이 성립하려면 순서가 흔들리면 안 된다
      //   (.in() 쿼리는 행 순서를 보장하지 않는다).
      const groupRefs = [...new Map(
        group
          .flatMap((s) => s.characters.map((characterId) => ({
            characterId,
            appearanceKey: s.characterAppearanceKeys[characterId],
          })))
          .map(({ characterId, appearanceKey }) => [`${characterId}\u0000${appearanceKey}`, { characterId, appearanceKey }]),
      ).values()]
        .sort((a, b) => a.characterId.localeCompare(b.characterId) || a.appearanceKey.localeCompare(b.appearanceKey))
        .map(({ characterId, appearanceKey }) => {
          const character = charById.get(characterId)!
          const appearance = appearanceByPair.get(`${characterId}\u0000${appearanceKey}`)!
          return {
            characterId,
            appearanceKey,
            name: ((character.name as string) || characterId).trim() || characterId,
            url: appearance.sheet_url as string,
          }
        })
      const nameById = new Map(groupRefs.map((r) => [r.characterId, r.name]))
      // #ref-gate: 이름에 러프 위치·포즈를 붙여 칸 안의 인형↔인물 대응까지 준다.
      const columnCharacters: CharacterRefLabel[][] = group.map((s) =>
        s.characters
          .map((id): CharacterRefLabel | null => {
            const name = nameById.get(id)
            if (!name) return null
            const b = s.blocking.get(id)
            return { name, position: b?.position ?? null, pose: b?.pose ?? null }
          })
          .filter((c): c is CharacterRefLabel => c !== null),
      )

      const sceneLighting = todByScene.get(group[0].scene_id) || null
      // #anchor-wiring(2026-08-14 오너 확정): 앵커별 검증 절 + 서브룩 그레이드 권위 + watercolor
      //   A안(preview 2번 스타일 레퍼런스). 전부 DB(style_anchors)가 진실.
      const anchorTwoRef = !!(anchor?.usePreviewRef && anchor.previewUrl)
      const worldRef = group.every((s) => s.excludeWorld) ? null : (worldRefByScene.get(group[0].scene_id) ?? null)
      const prompt = buildRealGridPrompt(group.length, {
        characterRefCount: groupRefs.length,
        worldRefCount: worldRef ? 1 : 0,
        hasStyleRef: !!anchor,
        characterRefs: groupRefs.map((r) => ({ name: r.name })),
        columnCharacters,
        sceneLighting,
        styleClause: anchor?.styleClause ?? null,
        anchorKeepsGrade: anchor?.anchorKind === 'sublook',
        styleRefCount: anchorTwoRef ? 2 : 1,
      })
      const referenceImageUrls = [
        refUrl,
        ...groupRefs.map((r) => r.url),
        ...(worldRef ? [worldRef] : []),
        ...(anchor ? [anchor.imageUrl] : []),
        ...(anchorTwoRef ? [anchor!.previewUrl as string] : []),
      ]

      // 이 배치 경로는 모델 선택 UI 가 없다 — 기본 모델의 edit 갈래로 고정(#owner-default 2026-08-31).
      // #sheet-model-guard: 그리드는 시트 계약 경로 — 기본 모델이 무엇이든 시트 가능 모델로 강제.
      const gridModel = resolveImageEndpoint(resolveSheetImageModel(null), true).endpoint

      // #generation-capacity-trigger(2026-09-14): 제출마다 자리를 먼저 예약한다 — fal 에 먼저 내면
      //   트리거가 자리 넘는 기록을 거절해도 돈은 이미 나간 뒤다(감사 2026-09-11). 자동 재시도 없음.
      let job: GenerationJob
      try {
        job = await reserveGenerationJob({
          projectId,
          model: gridModel,
          kind: 'storyboard_real_grid',
          userId: access.userId!,
          workspaceId: project.workspace_id as string,
          provider: 'fal',
          chatTraceId: traceId ?? null,
          // #B9(2026-08-12): 이 경로가 최종 프레임 전량을 만드는데도 프롬프트가 어디에도 안 남아
          //   사고 역추적이 코드 재구성에 의존했다(실측: sh_04_18 조사). prompt/refs/칸 배정을
          //   스냅샷에 남긴다 — 디버그 프롬프트 트레이스(PROMPT_TRACE_KINDS)도 이제 표시 가능.
          inputSnapshot: {
            shotIds: group.map((s) => s.shot_id),
            ref_grid_url: refUrl,
            style_anchor_key: anchor?.key ?? null,
            prompt,
            reference_image_urls: referenceImageUrls,
            column_characters: columnCharacters.map((col) => col.map((c) => c.name)),
            scene_time_of_day: sceneLighting,
            image_size: sheetCanvas, // finalize 방향 가드 + 사고 역추적용 (#fal-canvas)
            sheet_format: projectFormat, // finalize 크롭이 포맷 시트 좌표를 복원 (#sheet-formats)
          },
          target: {
            workspaceId: project.workspace_id as string,
            writerShotIds: group.map((s) => s.shot_id),
            gridVariant: 'grid4',
            ...(batchRunId ? { batchRunId } : {}),
            roughGeneratedAtByShot: Object.fromEntries(
              group.filter((s) => typeof s.roughGeneratedAt === 'number').map((s) => [s.shot_id, s.roughGeneratedAt as number]),
            ),
          },
        })
      } catch (err) {
        const existingJobId = existingStoryboardJobId(err)
        if (existingJobId) {
          // 다른 탭의 개별/일괄 작업이 먼저 예약했다. 남은 장은 보존하고 새 제출 없이 멈춘다.
          //   그 작업은 클라가 끝나기를 기다린 뒤 다음 차례를 묻게 알려 준다 — 그 작업이 맡은 샷만(2026-10-10).
          const { data: existing } = await supabaseAdmin
            .from('generation_jobs')
            .select('target')
            .eq('id', existingJobId)
            .maybeSingle()
          const covered = new Set(shotsOfTarget(existing?.target))
          waitFor(
            existingJobId,
            group.map((s) => s.shot_id).filter((id) => covered.has(id)),
            !!batchRunId && runIdOfTarget(existing?.target) === batchRunId,
          )
          capacitySkippedShots = planned.slice(groupIndex).reduce((n, g) => n + g.length, 0)
          break
        }
        const rejected = capacityReservationRejection(err, { projectId, kind: 'storyboard_real_grid', userId: access.userId })
        if (!rejected) throw err
        // 첫 장부터 자리가 없으면 아무것도 접수하지 않았으니 종전대로 자리 없음(429)으로 답한다.
        if (!submitted.length) return rejected
        // 이미 낸 시트는 그대로 진행시키고 남은 장만 건너뛴다 — 그 수를 잔량에 담아 돌려준다.
        capacitySkippedShots = planned.slice(groupIndex).reduce((n, g) => n + g.length, 0)
        break
      }

      try {
        // 외부 접수는 한 번뿐이다. 응답을 잃은 호출을 SDK 재시도로 복제하지 않는다(러프와 같은 이유 —
        //   예약이 이미 자리를 잡고 있으니 재시도는 이중 발주다).
        const receipt = await falImageSubmit(
          {
            model: gridModel,
            prompt,
            reference_image_urls: referenceImageUrls,
            // 포맷 파생 캔버스 — finalize 방향 가드가 snapshot.image_size 로 같은 계약을 검사한다.
            //   (ed5bd4a 전까지 이 필드는 타입에 없어 버려지고 'auto'가 전송되고 있었다 — #fal-canvas)
            image_size: sheetCanvas,
            webhookUrl,
          },
          // 트리거가 여유 있는 계정으로 바꿔 넣었을 수 있어 반드시 예약 행의 키로 제출한다.
          { retry: false, falKeyId: job.fal_key_id },
        )
        try {
          await confirmGenerationJobReceipt(job.id, projectId, receipt)
        } catch (err) {
          // 이미 접수됐다 — 새 번호로 다시 내지 않는다. 기록 실패는 로그로만 남긴다.
          console.error(
            '[director/generate-storyboard-batch] accepted receipt could not be saved:',
            job.id,
            err instanceof Error ? err.message : String(err),
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (isDefiniteSubmitRejection(err)) {
          // 확정 거절(4xx) — 자리를 물고 있을 이유가 없다. 닫기 실패는 원래 실패 이유를 가리지 않게 로그만.
          try {
            await rejectGenerationJobReservation(job.id, projectId, message)
          } catch (closeError) {
            console.error(
              '[director/generate-storyboard-batch] rejected reservation could not be closed:',
              job.id,
              closeError instanceof Error ? closeError.message : String(closeError),
            )
          }
          throw err
        }
        // 접수 여부 불명(통신 오류·5xx·408/425/429): 예약(queued)을 남기고 예약 id 로 돌려준다 —
        //   이미 접수됐을 수 있어 같은 시트를 새 번호로 다시 내지 않는다.
        console.error('[director/generate-storyboard-batch] submit outcome unknown, reservation kept:', job.id, message)
      }
      submitted.push({ jobId: job.id, shotIds: group.map((s) => s.shot_id) })
    }

    return NextResponse.json({
      ok: true,
      data: { submitted, remaining: ready.length - plannedShots + capacitySkippedShots, skipped, inProgress: inProgressList() },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-storyboard-batch]', msg)
    return NextResponse.json({ error: msg }, { status: e instanceof CharacterAppearanceContractError ? 409 : 500 })
  }
}
