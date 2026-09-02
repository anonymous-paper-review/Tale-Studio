// 실사 4샷 일괄 생성(#real-grid 2026-08-06) — 러프 보드의 그리드 방식 이식(이원화의 일괄 축).
//   같은 씬 + 같은 캐릭터 레퍼런스 세트의 러프 완비 샷을 4개씩 묶어 grid4 시트 1콜 리페인트,
//   finalize(storyboard_real_grid)가 크롭 분배. 빈칸 채우기 전용(storyboard 미생성 샷만 —
//   architecture §5: 차 있는 것 교체는 사람의 개별 재생성=단일 스트립). 검증: 실험 시트 통과(011fd4bd).
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { quotaRejectionResponse } from '@/lib/api/quota'
import { createGenerationJob } from '@/lib/generation-jobs'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { resolveImageEndpoint, resolveSheetImageModel } from '@/lib/image-models'
import {
  composeRoughReferenceGrid,
  buildRealGridPrompt,
  realSheetCanvas,
} from '@/lib/director/storyboard-strip'
import { parseProjectFormat } from '@/types/project'
import { mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_GRID_JOBS_PER_CALL = 2 // 러프 보드와 동일 관행 — 잔여는 응답 remaining 으로 반복 호출

interface EligibleShot {
  shot_id: string
  scene_id: string
  characters: string[]
  characterAppearanceKeys: Record<string, string>
  frames: { start: string; direction: string; end: string }
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
    const { projectId, force, traceId } = (await req.json()) as {
      projectId?: string
      force?: boolean
      traceId?: string
    }
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    if (traceId !== undefined && !isChatTraceId(traceId)) {
      return NextResponse.json({ error: 'traceId must be a UUID' }, { status: 400 })
    }
    if (traceId && !(await chatTraceBelongsToProject(projectId, traceId))) {
      return NextResponse.json({ error: 'traceId does not belong to project' }, { status: 409 })
    }

    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'storyboard_real_grid', userId: access.userId })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, style_anchor_key, custom_style_anchor, settings')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    // #fal-canvas(2026-08-17): 프로듀서 포맷 → 시트 캔버스. 캔버스 방향이 곧 셀 방향이라
    //   이 한 줄이 "화면비를 fal 에 전달"의 본체다 (vertical 실측: 4×3 유지 + 세로 패널 재구도).
    const projectFormat = parseProjectFormat(
      (project.settings as { format?: unknown } | null)?.format,
    )
    const sheetCanvas = realSheetCanvas(projectFormat, 'grid4')

    const { data: rows } = await supabaseAdmin
      .from('shots')
      .select('shot_id, scene_id, characters, character_appearance_keys, rough_storyboard, storyboard_image')
      .eq('project_id', projectId)
      .order('sort_order')

    const eligible: EligibleShot[] = []
    for (const s of rows ?? []) {
      // 기본은 빈칸만(교체는 개별 재생성 소관). force 면 이미 있는 것도 다시 만든다 —
      //   오너가 "하나씩 하는 거 짜쳐서" 전체 재생성을 원한 경로(#c3).
      if (!force && s.storyboard_image) continue
      const f = (s.rough_storyboard as { frames?: Record<string, string> } | null)?.frames
      if (!f?.start || !f?.direction || !f?.end) continue
      const characterAppearanceKeys = requireCharacterAppearanceKeys(s.character_appearance_keys, s.shot_id as string)
      const characters = ((s.characters as string[]) ?? []).slice().sort()
      if (
        characters.some((characterId) => !characterAppearanceKeys[characterId]) ||
        Object.keys(characterAppearanceKeys).some((characterId) => !characters.includes(characterId))
      ) {
        throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${s.shot_id} character_appearance_keys does not match its characters`)
      }
      eligible.push({
        shot_id: s.shot_id as string,
        scene_id: s.scene_id as string,
        characters,
        characterAppearanceKeys,
        frames: { start: f.start, direction: f.direction, end: f.end },
      })
    }

    // 그룹핑: 같은 씬(#grid-shift 교훈)만 키 — 캐릭터 세트는 시트 내 혼재 허용(#real-grid-fix):
    //   세트를 키에 넣으면 시트가 잘게 쪼개져 배칭 이득이 반감(실측 8시트/12샷). 레퍼런스는
    //   합집합으로 전달되고 프롬프트가 칸별 대응("corresponding character")을 지시하므로 안전.
    const groups: EligibleShot[][] = []
    for (const s of eligible) {
      const last = groups[groups.length - 1]
      if (!last || last.length >= 4 || last[0].scene_id !== s.scene_id) groups.push([s])
      else last.push(s)
    }
    const planned = groups.slice(0, MAX_GRID_JOBS_PER_CALL)
    const plannedShots = planned.reduce((n, g) => n + g.length, 0)
    if (!planned.length) {
      return NextResponse.json({ ok: true, data: { submitted: [], remaining: 0 } })
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
    const { data: locRows } = await supabaseAdmin
      .from('locations')
      .select('scene_id, wide_shot')
      .eq('project_id', projectId)
      .in('scene_id', sceneIds)
    const worldRefByScene = new Map<string, string>()
    for (const l of locRows ?? []) {
      const url = typeof l.wide_shot === 'string' ? l.wide_shot.trim() : ''
      if (url && typeof l.scene_id === 'string' && !worldRefByScene.has(l.scene_id)) worldRefByScene.set(l.scene_id, url)
    }
    // 인물 조회는 호출 전체 1회(쿼리 절약)로 두되 맵으로 보관 — 레퍼런스는 **시트별로** 꺼낸다
    //   (#real-grid-identity 2026-08-12): 옛 코드는 호출 전체(최대 2시트)의 합집합을 익명 URL
    //   배열로 모든 시트에 실었다. 그 시트에 안 나오는 인물의 레퍼런스가 오염원으로 첨부되고,
    //   어느 URL 이 누구인지도 잃어버려 프롬프트가 대응을 지시할 수 없었다 — 실측 a5cb2cae
    //   sh_04_18: 추적자 단독 칸이 소녀로 바꿔치기된 시트가 그대로 저장됐다.
    const appearancePairs = [...new Map(
      planned
        .flatMap((g) => g.flatMap((s) => s.characters.map((characterId) => ({
          characterId,
          appearanceKey: s.characterAppearanceKeys[characterId],
        }))))
        .map(({ characterId, appearanceKey }) => [`${characterId}\u0000${appearanceKey}`, { characterId, appearanceKey }]),
    ).values()].sort((a, b) =>
      a.characterId.localeCompare(b.characterId) || a.appearanceKey.localeCompare(b.appearanceKey),
    )
    const allCharIds = appearancePairs.map(({ characterId }) => characterId)
    const { data: chars } = allCharIds.length
      ? await supabaseAdmin
          .from('characters')
          .select('character_id, name')
          .eq('project_id', projectId)
          .in('character_id', allCharIds)
      : { data: [] as Array<Record<string, unknown>> }
    const charById = new Map((chars ?? []).map((c) => [c.character_id as string, c]))
    if (appearancePairs.some(({ characterId }) => !charById.has(characterId))) {
      throw new CharacterAppearanceContractError('Character appearance contract error: a shot snapshot references a missing character identity')
    }
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
    for (const { characterId, appearanceKey } of appearancePairs) {
      const sheetUrl = appearanceByPair.get(`${characterId}\u0000${appearanceKey}`)?.sheet_url
      if (typeof sheetUrl !== 'string' || !sheetUrl.trim()) {
        throw new CharacterAppearanceContractError(`Character appearance contract error: ${characterId}/${appearanceKey} has no required sheet_url`)
      }
    }

    const webhookUrl = resolveWebhookUrl()
    const submitted: Array<{ jobId: string; shotIds: string[] }> = []
    for (const group of planned) {
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
      const columnCharacters = group.map((s) =>
        s.characters.map((id) => nameById.get(id)).filter((n): n is string => !!n),
      )

      const sceneLighting = todByScene.get(group[0].scene_id) || null
      // #anchor-wiring(2026-08-14 오너 확정): 앵커별 검증 절 + 서브룩 그레이드 권위 + watercolor
      //   A안(preview 2번 스타일 레퍼런스). 전부 DB(style_anchors)가 진실.
      const anchorTwoRef = !!(anchor?.usePreviewRef && anchor.previewUrl)
      const worldRef = worldRefByScene.get(group[0].scene_id) ?? null
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
      const { request_id, model, fal_key_id } = await falImageSubmit({
        // #sheet-model-guard: 그리드는 시트 계약 경로 — 기본 모델이 무엇이든 시트 가능 모델로 강제.
        model: resolveImageEndpoint(resolveSheetImageModel(null), true).endpoint,
        prompt,
        reference_image_urls: referenceImageUrls,
        // 포맷 파생 캔버스 — finalize 방향 가드가 snapshot.image_size 로 같은 계약을 검사한다.
        //   (ed5bd4a 전까지 이 필드는 타입에 없어 버려지고 'auto'가 전송되고 있었다 — #fal-canvas)
        image_size: sheetCanvas,
        webhookUrl,
      })

      const job = await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        falKeyId: fal_key_id,
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
          column_characters: columnCharacters,
          scene_time_of_day: sceneLighting,
          image_size: sheetCanvas, // finalize 방향 가드 + 사고 역추적용 (#fal-canvas)
          sheet_format: projectFormat, // finalize 크롭이 포맷 시트 좌표를 복원 (#sheet-formats)
        },
        target: {
          workspaceId: project.workspace_id as string,
          writerShotIds: group.map((s) => s.shot_id),
          gridVariant: 'grid4',
        },
      })
      submitted.push({ jobId: job.id, shotIds: group.map((s) => s.shot_id) })
    }

    return NextResponse.json({
      ok: true,
      data: { submitted, remaining: eligible.length - plannedShots },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-storyboard-batch]', msg)
    return NextResponse.json({ error: msg }, { status: e instanceof CharacterAppearanceContractError ? 409 : 500 })
  }
}
