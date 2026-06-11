// 핸드오프 파이프라인 중 대표 이미지를 서버에서 미리 생성한다 (webhook 기반).
//   - 캐릭터 → characters.view_main  (정면 풀바디 대표 포트레이트, T2I)
//   - 로케이션 → locations.wide_shot  (와이드 establishing, T2I)
//
// 왜: 텍스트 파이프라인이 샷 단계(sceneCinematography~renderPrompts)를 도는 "동안" 대표 이미지를
//   fal 큐에 미리 던져두면, fal webhook(/api/fal/webhook → finalize*Job)이 해당 컬럼을 비동기로
//   채운다. 그러면 artist 는 mainReady(모든 view_main != null) 즉시 진입하고, World 탭도 진입
//   직후 wide_shot 가 차 있다 → "producer 버튼 → 대표 이미지 표시" 시간을 크게 단축한다.
//   (이전엔 텍스트 파이프라인 전체 완료 + 90s grace 를 기다린 뒤에야 client 가 생성했다.)
//
// submit-only — 여기서 폴링하지 않는다(서버리스 동결/step 시간예산 회피). 완료는 webhook 이 처리.
// webhook base URL(터널/도메인)이 없으면(=로컬 터널 미가동) webhook 이 안 와서 컬럼이 안 채워지고,
//   artist 가 기존 fallback(client autoGenerateBaseImages)으로 자연 degrade — 정합성은 유지된다.
//
// generate-sheet(캐릭터)·generate-world(월드) 라우트의 T2I 경로와 동일한 모델/job 형태를 쓴다
//   (진입 후 client 보강과 일관). 방향 뷰(back/left/right)·establishing_shot 은 client 가 보강.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { buildCharacterMainPrompt, type CharacterPromptInput } from '@/lib/artist/turnaround'
import { CHARACTER_VIEW_COLUMNS } from '@/types/asset'
import type {
  Characters,
  ArtDirection,
  ProductionDesign,
  RenderFormat,
} from '@/lib/writer/types/pipeline'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 로케이션 wide establishing 프롬프트 (assets_generate.ts buildLocationPrompt 와 동일 의도 — 와이드,
//   인물 없음, 환경만). 입력은 전부 productionDesign(step8) + artDirection(step7) 에서 온다.
function buildLocationWidePrompt(
  loc: ProductionDesign['locations'][number],
  artStyle: string,
  palette: string[],
): string {
  return [
    `Location establishing shot of ${loc.id}`,
    loc.style_description,
    loc.lighting_sources?.length ? `lighting: ${loc.lighting_sources.join(', ')}` : '',
    loc.props?.length ? `props: ${loc.props.join(', ')}` : '',
    artStyle ? `art style: ${artStyle}` : '',
    palette.length ? `palette: ${palette.join(', ')}` : '',
    'wide establishing shot, no characters, environment only, clean composition, no text, no logo',
  ]
    .filter(Boolean)
    .join('. ')
    .slice(0, 900)
}

/**
 * 캐릭터 대표 이미지(view_main) + 로케이션 대표 샷(wide_shot) T2I 작업을 fal 큐에 submit 하고
 * generation_jobs 행을 만든다.
 *   - 핸드오프 외 run(projectId 가 DB UUID 아님)은 skip.
 *   - 이미 컬럼이 채워진 캐릭터/로케이션은 skip(재진입/재시도 시 중복 submit·중복 과금 방지).
 *   - 개별 submit 실패는 비치명적 — 나머지는 계속 진행하고 artist client 가 보강한다.
 */
export async function submitHandoffAssetImages(
  projectId: string,
  characters: Characters,
  artDirection: ArtDirection,
  productionDesign: ProductionDesign,
  renderFormat: RenderFormat,
): Promise<{ characters: number; locations: number; skipped: number }> {
  if (!UUID_RE.test(projectId)) return { characters: 0, locations: 0, skipped: 0 } // 핸드오프 외 run

  // workspace + 이미 채워진 컬럼 동시 조회 (재시도 idempotency).
  const [{ data: project }, { data: dbChars }, { data: dbLocs }] = await Promise.all([
    supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).single(),
    supabaseAdmin.from('characters').select('character_id, view_main').eq('project_id', projectId),
    supabaseAdmin.from('locations').select('location_id, wide_shot').eq('project_id', projectId),
  ])
  const workspaceId = project?.workspace_id as string | undefined
  if (!workspaceId) return { characters: 0, locations: 0, skipped: 0 }
  const { data: workspace } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle()
  const ownerId = (workspace?.owner_id as string | undefined) ?? null

  const charFilled = new Set(
    (dbChars ?? []).filter((r) => r.view_main != null).map((r) => r.character_id as string),
  )
  const locFilled = new Set(
    (dbLocs ?? []).filter((r) => r.wide_shot != null).map((r) => r.location_id as string),
  )

  const palette = [
    productionDesign.global_palette?.primary,
    productionDesign.global_palette?.secondary,
    productionDesign.global_palette?.accent,
  ].filter((x): x is string => !!x)

  const webhookUrl = resolveWebhookUrl()

  let charCount = 0
  let locCount = 0
  let skipped = 0

  // ── 캐릭터 대표(view_main) — 정면 풀바디 T2I (1:1) ──
  for (const c of characters.characters) {
    if (charFilled.has(c.id)) {
      skipped++
      continue
    }
    const input: CharacterPromptInput = {
      name: c.name,
      appearance: c.appearance_description || c.name,
      age: c.age,
      role: c.role,
      costumes: productionDesign.costumes?.[c.id] ?? undefined,
      artStyle: artDirection.art_style,
      shapeLanguage: artDirection.shape_language,
      palette,
    }
    try {
      const prompt = buildCharacterMainPrompt(input)
      const { request_id, model } = await falImageSubmit({
        model: 'openai/gpt-image-2',
        prompt,
        aspect_ratio: '1:1',
        webhookUrl,
      })
      await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'character_view',
        actor: 'writer',
        userId: ownerId,
        workspaceId,
        provider: 'fal',
        inputSnapshot: {
          model: 'openai/gpt-image-2',
          prompt,
          aspect_ratio: '1:1',
        },
        target: { workspaceId, characterId: c.id, view: 'main', column: CHARACTER_VIEW_COLUMNS.main },
      })
      charCount++
    } catch (e) {
      console.warn(`[asset-images] character ${c.id} main submit failed:`, e instanceof Error ? e.message : e)
    }
  }

  // ── 로케이션 대표(wide_shot) — 와이드 establishing T2I (프로젝트 aspect) ──
  const aspect = renderFormat.aspect_ratio || '16:9'
  for (const loc of productionDesign.locations ?? []) {
    if (locFilled.has(loc.id)) {
      skipped++
      continue
    }
    try {
      const prompt = buildLocationWidePrompt(loc, artDirection.art_style, palette)
      const { request_id, model } = await falImageSubmit({
        prompt,
        aspect_ratio: aspect,
        webhookUrl,
      })
      await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'world_shot',
        actor: 'writer',
        userId: ownerId,
        workspaceId,
        provider: 'fal',
        inputSnapshot: {
          prompt,
          aspect_ratio: aspect,
        },
        target: { workspaceId, locationId: loc.id, column: 'wide_shot' },
      })
      locCount++
    } catch (e) {
      console.warn(`[asset-images] location ${loc.id} wide submit failed:`, e instanceof Error ? e.message : e)
    }
  }

  return { characters: charCount, locations: locCount, skipped }
}
