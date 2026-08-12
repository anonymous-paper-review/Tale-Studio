// previz 채널 ablation — 픽스처 동결기 (읽기 전용).
//   live DB 에서 사전 등록된 5샷의 러프/리얼 프레임 + 캐릭터/스타일 참조를 fixtures.json 으로 동결하고
//   프레임 실물을 내려받는다. 이후 모든 단계는 DB 를 다시 보지 않는다 (재현성 규칙 2: 입력 고정).
//
//   ★ 설계 스펙(static_spec/dynamic_spec)은 shots 만 보면 안 된다 (#collector-shotdesign 2026-08-12).
//     shots.dynamic_spec 을 채우는 persist 코드는 2026-08-07(d39c42f)에야 생겨서 그 이전 런은
//     전량 null 이다 (실측 2026-08-12: 1697샷 중 869건 null, 그중 구런 24프로젝트 815샷). 그런데
//     **원본은 writer_runs.state.shotDesign 에 100% 살아 있고 제품(러프보드·영상 라우트)은 그쪽을
//     읽는다** — 즉 제품은 정상인데 실험만 null 을 보고 "전 샷 정지(static hold)"를 측정하게 된다
//     (rough-storyboard-grid.ts 의 'static hold — no camera or figure movement' 폴백). 그래서 여기서
//     제품과 **같은 조인 함수**로 보완하고, 어느 필드가 폴백인지 specProvenance 에 남긴다.
//
//   재현성 규칙 1(복붙 금지): 조인 규칙은 제품 loadShotDesignByMainId / resolveShotDesign 을
//     import 해 그대로 쓴다(라우트 rough-storyboard/route.ts:198,314-324 와 동일 판정).
//   usage: pnpm dlx tsx research/experiments/previz-channel-ablation/collect.mts
import { config } from 'dotenv'
config({ path: process.env.TALE_ENV_FILE ?? '.env.local' })

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 제품 모듈은 **동적 import** 로만 (run.mts 와 같은 이유): src/lib/supabase/admin.ts 는 모듈
//   스코프에서 env 를 읽어 정적 import 가 호이스팅되면 dotenv 보다 먼저 평가된다.
type Product = {
  supabaseAdmin: typeof import('@/lib/supabase/admin')['supabaseAdmin']
  loadShotDesignByMainId: typeof import('@/lib/writer/shot-design-state')['loadShotDesignByMainId']
  resolveShotDesign: typeof import('@/lib/writer/shot-design-state')['resolveShotDesign']
}
const [admin, sds] = await Promise.all([
  import('@/lib/supabase/admin'),
  import('@/lib/writer/shot-design-state'),
])
const P: Product = {
  supabaseAdmin: admin.supabaseAdmin,
  loadShotDesignByMainId: sds.loadShotDesignByMainId,
  resolveShotDesign: sds.resolveShotDesign,
}
const db = P.supabaseAdmin

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const FRAMES = join(RUN, 'frames')

// ── 사전 등록 픽스처 (HYPOTHESIS 측정: 정지1·단일동작2·2동작1·카메라무빙1) ──
const PROJECT_ID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec' // Sample1
// 선정 근거는 러프 DIRECTION 패널 실물 판독(label_scan.json + 육안). 액션 텍스트가 아니라
// **러프 previz 가 실제로 무엇을 주문했는가**로 골랐다 — A1/A2 가 재는 것이 러프→리페인트,
// 리얼 START→END 이기 때문. 텍스트만 보고 고르면 previz 가 그 클래스를 아예 안 담은 샷이 섞인다
// (실제 탈락 사례: sh_07_57 은 액션이 "camera moves toward the bench" 인데 러프 라벨은 "STATIC HOLD",
//  sh_01_06 은 액션이 "hands tremble/drops documents" 인데 라벨은 "MUTTER (SMALL)" — 둘 다 기각).
const FIXTURES = [
  { shot_id: 'sh_02_10', klass: 'static', label: 'STATIC HOLD', why: '정지 대조군 — 인물 0, START≈END(팔 간 구분 불가가 정상)' },
  { shot_id: 'sh_01_02', klass: 'single', label: 'PULLS DRAWER', why: '단일 동작 + 강한 START→END 델타(서랍 닫힘→열림)' },
  { shot_id: 'sh_02_11', klass: 'single', label: 'BURSTS IN (LARGE) / TURNS', why: '단일 동작(문 박차고 진입) + 중간 델타' },
  { shot_id: 'sh_01_09', klass: 'double', label: 'TURNS', why: '2동작 순차("photographs ... then freezes") — shotCheck 분할 대상 형태' },
  { shot_id: 'sh_08_64', klass: 'camera', label: 'DOLLY IN (+SCROLLS, HEAD TURNS)', why: '카메라 무빙이 러프에 실제로 인코딩된 유일급 후보 — START→END 프레이밍이 실제로 좁혀진다' },
]

mkdirSync(FRAMES, { recursive: true })

const { data: project, error: pErr } = await db
  .from('projects')
  .select('id, title, workspace_id, style_anchor_key')
  .eq('id', PROJECT_ID)
  .single()
if (pErr) throw pErr

const { data: shots, error: sErr } = await db
  .from('shots')
  .select(
    'shot_id, scene_id, sort_order, shot_type, action_description, action_description_native, characters, location_ids, duration_seconds, generation_method, prompt, check_notes, dynamic_spec, static_spec, design_ref, camera_brand, focal_length, aperture, white_balance, movement_preset, camera_config, rough_storyboard, storyboard_image',
  )
  .eq('project_id', PROJECT_ID)
  .in('shot_id', FIXTURES.map((f) => f.shot_id))
if (sErr) throw sErr

// ── 설계 스펙 보완 소스: writer_runs.state.shotDesign (제품과 동일 조인) ──
//   projectUsesDesignRefs 판정은 라우트와 동일하게 **프로젝트 전 샷** 기준
//   (rough-storyboard/route.ts:314 `(shots ?? []).some(s => s.design_ref)`).
//   여기선 픽스처 5샷만 뽑았으므로 count 쿼리로 같은 술어를 만든다.
const designById = await P.loadShotDesignByMainId(PROJECT_ID)
const { count: refCount, error: rcErr } = await db
  .from('shots')
  .select('shot_id', { count: 'exact', head: true })
  .eq('project_id', PROJECT_ID)
  .not('design_ref', 'is', null)
if (rcErr) throw rcErr
const projectUsesDesignRefs = (refCount ?? 0) > 0

const { data: chars, error: cErr } = await db
  .from('characters')
  .select('character_id, name, view_main, portrait')
  .eq('project_id', PROJECT_ID)
if (cErr) throw cErr
const charByKey = Object.fromEntries((chars ?? []).map((c) => [c.character_id, c]))

const { data: anchor, error: aErr } = await db
  .from('style_anchors')
  .select('key, image_url, is_active')
  .eq('key', project.style_anchor_key)
  .maybeSingle()
if (aErr) throw aErr

// ── 이전 샷 pull (라우트의 continuityLine 과 동일한 진실을 동결) ──
const prevBySort: Record<string, unknown> = {}
for (const s of shots ?? []) {
  if (typeof s.sort_order !== 'number' || s.sort_order <= 0) continue
  const { data: prev } = await db
    .from('shots')
    .select('scene_id, prompt, action_description')
    .eq('project_id', PROJECT_ID)
    .eq('sort_order', s.sort_order - 1)
    .maybeSingle()
  prevBySort[s.shot_id as string] = prev ?? null
}

async function dl(url: string, dest: string) {
  if (existsSync(dest)) return 'cached'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return 'ok'
}

/** 출처 표시 — 다음 사람이 "이 값이 shots 에 있었나 폴백인가"를 픽스처만 보고 알 수 있게. */
type FieldSource = 'shots' | 'writer_runs.state.shotDesign' | 'missing'

const out: unknown[] = []
const fallbackCount = { dynamic_spec: 0, static_spec: 0 }
for (const fx of FIXTURES) {
  const s = (shots ?? []).find((x) => x.shot_id === fx.shot_id)
  if (!s) throw new Error(`fixture shot missing in DB: ${fx.shot_id}`)
  const rough = (s.rough_storyboard as { frames?: Record<string, string> } | null)?.frames
  const real = (s.storyboard_image as { frames?: Record<string, string> } | null)?.frames
  if (!rough?.start || !rough?.direction || !rough?.end)
    throw new Error(`rough frames incomplete: ${fx.shot_id}`)
  if (!real?.start || !real?.end) throw new Error(`real frames incomplete: ${fx.shot_id}`)

  for (const [k, u] of Object.entries({
    rough_start: rough.start,
    rough_direction: rough.direction,
    rough_end: rough.end,
    real_start: real.start,
    real_direction: real.direction,
    real_end: real.end,
  })) {
    if (!u) continue
    await dl(u, join(FRAMES, `${fx.shot_id}__${k}.png`))
  }

  // ── 설계 스펙 보완 (제품 규칙 그대로) ──
  //   shots 에 있으면 그대로, 없을 때만 writer_runs.state.shotDesign 에서 끌어온다.
  //   조인 키는 shots.design_ref — ref 체계 프로젝트에서 ref 없는 샷(분할 둘째 자식·수동 추가)은
  //   "의도적으로 스펙 없음"이라 main-id 폴백을 하지 않는다(shot-design-state.ts:12-25 의 이유).
  const designRef = typeof s.design_ref === 'string' ? s.design_ref : null
  const spec = P.resolveShotDesign(
    designById,
    { shotId: fx.shot_id, designRef },
    projectUsesDesignRefs,
  )
  const source: Record<string, FieldSource> = {
    dynamic_spec: s.dynamic_spec ? 'shots' : 'missing',
    static_spec: s.static_spec ? 'shots' : 'missing',
  }
  const shot: Record<string, unknown> = { ...s }
  if (!shot.dynamic_spec && spec?.dynamicSpec) {
    shot.dynamic_spec = spec.dynamicSpec
    source.dynamic_spec = 'writer_runs.state.shotDesign'
    fallbackCount.dynamic_spec += 1
  }
  if (!shot.static_spec && spec?.staticSpec) {
    shot.static_spec = spec.staticSpec
    source.static_spec = 'writer_runs.state.shotDesign'
    fallbackCount.static_spec += 1
  }

  // 제품과 동일한 캐릭터 참조 해석: characters[] → view_main ?? portrait (worlds 는 location_ids 없음 → 공집합)
  const charRefs = ((s.characters as string[] | null) ?? [])
    .map((id) => charByKey[id])
    .filter(Boolean)
    .map((c) => c.view_main ?? c.portrait)
    .filter(Boolean)

  out.push({
    ...fx,
    shot,
    // 출처 표시(#collector-shotdesign): 값이 어디서 왔는지 픽스처 자체에 박아둔다.
    //   prompt 는 **보완하지 않는다** — 제품의 effectivePrompt 도 `shot.prompt || action_description`
    //   이라 빈 prompt 를 static_spec.first_frame_prompt 로 메우면 실험이 제품보다 유리해진다
    //   (측정 왜곡). 대신 비어 있다는 사실만 남겨 다음 사람이 알아채게 한다.
    specProvenance: {
      ...source,
      prompt: (s.prompt as string | null)?.trim() ? 'shots' : 'empty',
      designJoin: {
        designRef,
        projectUsesDesignRefs,
        matched: !!spec,
        // ref 없는 샷은 제품도 스펙을 안 붙인다 — 폴백 실패가 아니라 설계상 공백.
        note: designRef
          ? null
          : projectUsesDesignRefs
            ? 'design_ref 없음 + ref 체계 프로젝트 → 제품도 스펙 미부착(분할 자식/수동 추가)'
            : 'design_ref 없음 + 레거시 프로젝트 → main-id 직조인',
      },
    },
    prevShot: prevBySort[fx.shot_id] ?? null,
    charRefs,
    charNames: ((s.characters as string[] | null) ?? []).map((id) => charByKey[id]?.name ?? `?${id}`),
    roughFrames: rough,
    realFrames: real,
  })
}

const fixtures = {
  collectedAt: new Date().toISOString(),
  project: { id: project.id, title: project.title, workspace_id: project.workspace_id, style_anchor_key: project.style_anchor_key },
  styleAnchor: anchor && anchor.is_active !== false ? { key: anchor.key, imageUrl: anchor.image_url } : null,
  // 좌표 기록(재현성 규칙 3): 스펙을 어디서 어떻게 조인했는지.
  specSources: {
    primary: 'shots',
    fallback: 'writer_runs.state.shotDesign (loadShotDesignByMainId — 제품과 동일 함수)',
    joinKey: 'shots.design_ref',
    projectUsesDesignRefs,
    designRefShotCount: refCount ?? 0,
    shotDesignKeysIndexed: designById.size,
    backfilled: fallbackCount,
    reason:
      'shots.dynamic_spec persist 는 2026-08-07(d39c42f) 이후 런에만 존재 — 그 이전 런은 전량 null 이고 원본은 writer_runs.state 에만 있다.',
  },
  fixtures: out,
}
writeFileSync(join(RUN, 'fixtures.json'), JSON.stringify(fixtures, null, 2))

console.log(
  JSON.stringify(
    {
      project: project.title,
      styleAnchor: fixtures.styleAnchor?.key ?? null,
      specSources: fixtures.specSources,
      fixtures: out.map((f: any) => ({
        shot: f.shot_id,
        klass: f.klass,
        dur: f.shot.duration_seconds,
        chars: f.charNames,
        charRefs: f.charRefs.length,
        checkNotes: (f.shot.check_notes ?? []).length,
        hasPrev: !!f.prevShot,
        src: f.specProvenance,
      })),
    },
    null,
    2,
  ),
)
