// producer-complete.ts — 스모크용 "프로듀서 완료" 상태를 테스트 계정 프로젝트에 써넣는다.
//
// 왜 저장된 JSON 픽스처가 아니라 코드인가 (2026-08-17 결정):
//   writer 아키텍처가 매일 바뀌는 프로젝트다. 산출물 모양을 JSON 으로 떠두면 스키마가 바뀌어도
//   **조용히** 낡아서 "옛날 모양"을 테스트하게 된다 — 가장 나쁜 실패다.
//   그래서 두 겹으로 시끄럽게 만든다:
//     1. 타입 — 이 파일은 제품 타입(CastMember/BackgroundSource/ProjectSettings)을 직접 쓴다.
//        모양이 바뀌면 `pnpm typecheck` 가 즉시 깨진다.
//        ⚠ 그래서 이 파일은 반드시 `tests/` 아래 있어야 한다. tsconfig 의 `**/*.ts` 는
//          dot 디렉토리(.claude/ 등)를 건너뛰어 거기 두면 타입체크가 조용히 안 돈다(실측 확인).
//     2. 게이트 — 아래에서 **실제 제품 함수** evaluateProducerGate 를 호출해 통과할 때만 DB 에 쓴다.
//        프로듀서 완료 조건이 바뀌면 이 스크립트가 그 자리에서 실패한다.
//
// 무엇을 하지 않는가:
//   - 모델을 호출하지 않는다(돈 0, 결과 결정적). 상태를 DB 에 직접 써넣을 뿐이다.
//   - writer 산출물은 만들지 않는다. writer 화면의 **빈 상태**까지가 이 픽스처의 범위다.
//     (writer 출력은 매일 바뀌는 쪽이라 여기 담으면 매일 썩는다.)
//
// 실행:
//   node tests/fixtures/producer-complete.ts            # TALE_SMOKE_EMAIL 계정의 첫 프로젝트
//   node tests/fixtures/producer-complete.ts <projectId>
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { evaluateProducerGate, type BackgroundSource, type CastMember } from '../../src/lib/producer-gate.ts'
import type { ProjectSettings, StageId } from '../../src/types/project.ts'

/**
 * 잠금 해제할 최고 스테이지. 사이드바는 `projects.current_stage` 를 reachedStage 로 복원해
 *   거기까지만 진입을 허용한다(`canNavigateTo`). 원래는 핸드오프가 이 값을 전진시키지만,
 *   핸드오프를 실제로 태우면 모델이 돌아 돈이 나가고 결과도 매번 달라진다.
 *   그래서 "핸드오프가 수락된 상태"를 값으로 주입한다.
 *   ⚠ 그러므로 이 픽스처는 핸드오프 **동작**을 검증하지 않는다 — 그건 vitest 담당이다
 *     (lifecycle / producer-gate / producer-handoff-gate / handoff-intent / artist-lock-gate).
 *     여기서 얻는 건 "그 화면이 열리고 그려지는가"뿐이다.
 */
const STAGES: readonly StageId[] = ['producer', 'writer', 'artist', 'director', 'editor']

dotenv.config({ path: '.env.local', quiet: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const SMOKE_EMAIL = process.env.TALE_SMOKE_EMAIL

/** 프로듀서 완료 상태의 내용. 스모크가 화면을 열 수 있으면 되므로 최소한으로 채운다. */
const STORY_TEXT =
  '비 오는 밤, 기억을 잃은 배달원이 자신이 배달한 상자 안에서 자기 이름이 적힌 서류를 발견한다.'

const SETTINGS: ProjectSettings = {
  playtime: 120,
  genre: 'thriller',
  format: 'horizontal_16:9',
  tone: ['dark'],
  dialogueLanguage: 'ko',
}

const CAST: CastMember[] = [
  {
    localId: 'smoke-p1',
    name: '도윤',
    entityType: 'person',
    appearance: '30대 남성, 젖은 우비와 낡은 배달 가방',
    arc: { start_state: '기억 없음', end_state: '진실 대면', arc_type: '각성' },
    motivation: { want: '상자의 출처를 밝히기' },
  },
]

const BACKGROUNDS: BackgroundSource[] = [
  {
    localId: 'smoke-b1',
    name: '빗속 골목',
    visualDescription: '젖은 아스팔트에 간판 불빛이 번지는 좁은 뒷골목',
    purpose: '주인공이 상자를 열어보는 최초의 장소',
    origin: 'producer',
  },
]

function must<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null || v === '') {
    console.error(`[불가] ${name} 가 없다. .env.local 을 확인할 것.`)
    process.exit(2)
  }
  return v
}

async function main() {
  const url = must(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const key = must(SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // --- 쓰기 전에 제품 로직으로 검증한다. 여기서 막히면 프로듀서 완료 조건이 바뀐 것이다 ---
  //   styleAnchorKey 는 아래에서 카탈로그를 읽어 채우므로 검사도 그때 한 번 더 한다.
  const dryGate = evaluateProducerGate({
    settings: SETTINGS,
    storyReady: true,
    cast: CAST,
    backgrounds: BACKGROUNDS,
    styleAnchorKey: 'placeholder',
  })
  if (!dryGate.canHandoff) {
    console.error('[불가] 이 픽스처가 더 이상 프로듀서 완료 조건을 만족하지 않는다:')
    for (const m of dryGate.hardMissing) console.error(`  - ${m.label ?? m.field}: ${m.detail ?? ''}`)
    console.error('픽스처 내용을 현재 조건에 맞게 고칠 것 (이 실패가 곧 "픽스처가 썩었다"는 신호다).')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const stageArgIdx = args.indexOf('--stage')
  const stage = (stageArgIdx >= 0 ? args[stageArgIdx + 1] : 'writer') as StageId
  if (!STAGES.includes(stage)) {
    console.error(`[불가] --stage 는 ${STAGES.join('|')} 중 하나여야 한다 (받은 값: ${stage}).`)
    process.exit(2)
  }

  // --- 대상 프로젝트 찾기: 테스트 계정 → workspace → project ---
  let projectId = args.find((a) => !a.startsWith('--') && a !== stage)
  if (!projectId) {
    const email = must(SMOKE_EMAIL, 'TALE_SMOKE_EMAIL')
    const { data: users, error: ue } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (ue) throw ue
    const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      console.error(`[불가] ${email} 계정을 찾을 수 없다.`)
      process.exit(1)
    }
    const { data: ws } = await db.from('workspaces').select('id').eq('owner_id', user.id)
    const wsIds = (ws ?? []).map((w) => w.id as string)
    if (!wsIds.length) {
      console.error('[불가] 그 계정이 소유한 workspace 가 없다. 앱에 한 번 로그인해 프로젝트를 만들 것.')
      process.exit(1)
    }
    const { data: projects } = await db
      .from('projects')
      .select('id, title')
      .in('workspace_id', wsIds)
      .order('created_at', { ascending: true })
      .limit(1)
    if (!projects?.length) {
      console.error('[불가] 그 계정에 프로젝트가 없다. /studio/producer 를 한 번 열면 자동 생성된다.')
      process.exit(1)
    }
    projectId = projects[0].id as string
  }

  // --- 스타일 앵커는 카탈로그에서 실제 키를 가져온다(하드코딩하면 카탈로그가 바뀔 때 썩는다) ---
  const { data: anchors } = await db.from('style_anchors').select('key').limit(1)
  const styleAnchorKey = anchors?.[0]?.key as string | undefined
  if (!styleAnchorKey) {
    console.error('[불가] style_anchors 카탈로그가 비어 있다 — 스타일 게이트를 통과시킬 수 없다.')
    process.exit(1)
  }

  const gate = evaluateProducerGate({
    settings: SETTINGS,
    storyReady: true,
    cast: CAST,
    backgrounds: BACKGROUNDS,
    styleAnchorKey,
  })
  if (!gate.canHandoff) {
    console.error('[불가] 실제 스타일 앵커까지 넣어도 게이트를 통과하지 못했다.')
    for (const m of gate.hardMissing) console.error(`  - ${m.label ?? m.field}`)
    process.exit(1)
  }

  const { error } = await db
    .from('projects')
    .update({
      story_text: STORY_TEXT,
      settings: SETTINGS,
      style_anchor_key: styleAnchorKey,
      current_stage: stage,
      producer_draft: {
        savedAt: Date.now(),
        storyText: STORY_TEXT,
        storyReady: true,
        settings: SETTINGS,
        cast: CAST,
        backgrounds: BACKGROUNDS,
      },
    })
    .eq('id', projectId)
  if (error) throw error

  console.log('프로듀서 완료 상태를 써넣었다.')
  console.log(`  projectId      : ${projectId}`)
  console.log(`  styleAnchorKey : ${styleAnchorKey}`)
  console.log(`  게이트         : canHandoff=${gate.canHandoff} (soft ${gate.softMissing.length}건 남음)`)
  console.log(`  잠금 해제      : ${stage} 까지 (projects.current_stage)`)
  console.log(`  확인           : pnpm smoke /studio/${stage} --auth --tree`)
}

main().catch((err) => {
  console.error(`[오류] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
})
