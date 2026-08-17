// writer-output.ts — writer 산출물(씬·샷·캐릭터·배경)의 **최소 유효 1세트**를 DB 에 써넣는다.
//   이걸로 artist / director / editor 화면이 데이터가 있는 상태로 열린다.
//
// 왜 DB 테이블에 직접 쓰나 (규칙 1: 픽스처는 변하는 것의 상류/안정면에 둔다):
//   writer 의 **내부 구조**(파이프라인 스테이지 출력, S2/S3/shot_sequence)는 매일 바뀐다.
//   반면 그 결과가 앉는 **테이블 계약**(scenes/shots/characters/locations)은 훨씬 덜 바뀌고,
//   하류 화면들이 실제로 읽는 것도 이 테이블이다. 그래서 파이프라인이 아니라 테이블에 쓴다.
//   persistAssetsToDb 를 재사용하지 않는 이유도 같다 — 그 입력이 바로 매일 바뀌는 그 구조다.
//
// 썩음 감지 (규칙 2):
//   - 내용은 제품 도메인 타입(Scene/Character/Location/CameraConfig/LightingConfig/DialogueLine)으로
//     묶는다 → 의미가 바뀌면 `pnpm typecheck` 가 깨진다.
//   - 컬럼이 바뀌면 insert 가 Supabase 에러로 그 자리에서 터진다(조용히 넘어가지 않는다).
//   - 반드시 `tests/` 아래일 것. tsconfig 의 `**/*.ts` 는 dot 디렉토리를 건너뛴다.
//
// 하지 않는 것: 모델 호출 없음(돈 0). writer **동작**을 검증하지 않는다 — 그건 vitest 담당이고,
//   여기서 얻는 건 "산출물이 있을 때 하류 화면이 열리고 그려지는가"뿐이다.
//
// 실행:
//   pnpm fixture:writer                     # editor 까지 잠금 해제(기본)
//   pnpm fixture:writer --stage artist
//   pnpm fixture:writer --clean             # 이 픽스처가 만든 행만 지우고 끝
import { makeDb, resolveProjectId, STAGES } from './_shared.ts'
import type { Character, Location, Scene } from '../../src/types/scene.ts'
import type { CameraConfig, DialogueLine, GenerationMethod, LightingConfig, ShotType } from '../../src/types/shot.ts'
import type { StageId } from '../../src/types/project.ts'

// --- 픽스처 식별자. 재실행 시 이 id 들만 지우므로 다른 데이터는 건드리지 않는다(멱등) ---
const SCENE_ID = 'sc_01'
const SHOT_IDS = ['sh_01_01', 'sh_01_02'] as const
const CHARACTER_ID = 'char_doyun'
const LOCATION_ID = 'loc_alley'

// producer-complete.ts 의 스토리·캐스트와 이어지는 내용이다(같은 인물·같은 장소).
const CHARACTER: Pick<Character, 'characterId' | 'name' | 'role' | 'description'> = {
  characterId: CHARACTER_ID,
  name: '도윤',
  role: 'protagonist',
  description: '30대 남성, 젖은 우비와 낡은 배달 가방',
}

const LOCATION: Pick<
  Location,
  'locationId' | 'name' | 'visualDescription' | 'timeOfDay' | 'lightingDirection' | 'purpose' | 'lightingSources' | 'props'
> = {
  locationId: LOCATION_ID,
  name: '빗속 골목',
  visualDescription: '젖은 아스팔트에 간판 불빛이 번지는 좁은 뒷골목',
  timeOfDay: 'night',
  lightingDirection: '간판에서 번지는 붉은 빛과 머리 위 가로등',
  purpose: '주인공이 상자를 열어보는 최초의 장소',
  lightingSources: ['붉은 네온 간판', '가로등'],
  props: ['버려진 우산', '젖은 종이상자'],
}

const SCENE: Scene = {
  sceneId: SCENE_ID,
  narrativeSummary: '도윤이 빗속 골목에서 배달 상자를 열고 자기 이름이 적힌 서류를 발견한다.',
  originalTextQuote: '도윤이 젖은 손으로 상자를 뜯는다. 서류 맨 위에 자기 이름이 적혀 있다.',
  location: LOCATION_ID,
  timeOfDay: 'night',
  mood: '불안 → 경악',
  charactersPresent: [CHARACTER_ID],
  estimatedDurationSeconds: 18,
  sortOrder: 0,
}

const CAMERA: CameraConfig = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const LIGHTING: LightingConfig = { position: 'left', brightness: 45, colorTemp: 4200 }

interface ShotSeed {
  shotId: string
  shotType: ShotType
  actionDescription: string
  prompt: string
  characters: string[]
  durationSeconds: number
  generationMethod: GenerationMethod
  dialogueLines: DialogueLine[]
  sortOrder: number
}

const SHOTS: ShotSeed[] = [
  {
    shotId: SHOT_IDS[0],
    shotType: 'WS',
    actionDescription: '비 내리는 좁은 골목, 도윤이 상자를 든 채 걸어 들어온다.',
    prompt: 'Wide shot of a narrow rain-soaked alley at night, a delivery man walking in holding a box.',
    characters: [CHARACTER_ID],
    durationSeconds: 8,
    generationMethod: 'I2V',
    dialogueLines: [],
    sortOrder: 0,
  },
  {
    shotId: SHOT_IDS[1],
    shotType: 'CU',
    actionDescription: '상자 안 서류 맨 위에 적힌 자기 이름을 발견하고 굳는다.',
    prompt: "Close-up of a wet document showing the man's own name, his hand freezing mid-air.",
    characters: [CHARACTER_ID],
    durationSeconds: 10,
    generationMethod: 'I2V',
    dialogueLines: [
      { characterId: CHARACTER_ID, text: '…이게 왜 내 이름이야.', emotion: '경악', delivery: '숨을 삼키며 낮게', durationHint: 2 },
    ],
    sortOrder: 1,
  },
]

async function main() {
  const argv = process.argv.slice(2)
  const clean = argv.includes('--clean')
  const stageIdx = argv.indexOf('--stage')
  const stage = (stageIdx >= 0 ? argv[stageIdx + 1] : 'editor') as StageId
  if (!(STAGES as readonly string[]).includes(stage)) {
    console.error(`[불가] --stage 는 ${STAGES.join('|')} 중 하나여야 한다 (받은 값: ${stage}).`)
    process.exit(2)
  }
  const explicit = argv.find((a) => !a.startsWith('--') && a !== stage)

  const db = makeDb()
  const projectId = await resolveProjectId(db, explicit)

  // --- 멱등: 이 픽스처가 만든 행만 지운다. 프로젝트의 다른 데이터는 건드리지 않는다 ---
  await db.from('shots').delete().eq('project_id', projectId).in('shot_id', [...SHOT_IDS])
  await db.from('scenes').delete().eq('project_id', projectId).eq('scene_id', SCENE_ID)
  await db.from('characters').delete().eq('project_id', projectId).eq('character_id', CHARACTER_ID)
  await db.from('locations').delete().eq('project_id', projectId).eq('location_id', LOCATION_ID)
  if (clean) {
    console.log(`픽스처 행을 지웠다 (project ${projectId}).`)
    return
  }

  const fail = (op: string, error: { message: string } | null) => {
    if (!error) return
    console.error(`[불가] ${op} 실패: ${error.message}`)
    console.error('컬럼 계약이 바뀐 것일 수 있다 — 이 실패가 곧 "픽스처가 썩었다"는 신호다.')
    process.exit(1)
  }

  fail(
    'characters insert',
    (
      await db.from('characters').insert({
        project_id: projectId,
        character_id: CHARACTER.characterId,
        name: CHARACTER.name,
        role: CHARACTER.role,
        description: CHARACTER.description,
        appearance: CHARACTER.description,
        entity_type: 'person',
        origin: 'producer',
        arc: { start_state: '기억 없음', end_state: '진실 대면', arc_type: '각성' },
        motivation: { want: '상자의 출처를 밝히기' },
      })
    ).error,
  )

  fail(
    'locations insert',
    (
      await db.from('locations').insert({
        project_id: projectId,
        location_id: LOCATION.locationId,
        name: LOCATION.name,
        visual_description: LOCATION.visualDescription,
        time_of_day: LOCATION.timeOfDay,
        lighting_direction: LOCATION.lightingDirection,
        purpose: LOCATION.purpose,
        origin: 'producer',
        lighting_sources: LOCATION.lightingSources,
        props: LOCATION.props,
      })
    ).error,
  )

  fail(
    'scenes insert',
    (
      await db.from('scenes').insert({
        project_id: projectId,
        scene_id: SCENE.sceneId,
        narrative_summary: SCENE.narrativeSummary,
        original_text_quote: SCENE.originalTextQuote,
        location: SCENE.location,
        time_of_day: SCENE.timeOfDay,
        mood: SCENE.mood,
        characters_present: SCENE.charactersPresent,
        estimated_duration_seconds: SCENE.estimatedDurationSeconds,
        sort_order: SCENE.sortOrder,
        source: 'manual',
      })
    ).error,
  )

  fail(
    'shots insert',
    (
      await db.from('shots').insert(
        SHOTS.map((s) => ({
          project_id: projectId,
          scene_id: SCENE_ID,
          shot_id: s.shotId,
          shot_type: s.shotType,
          action_description: s.actionDescription,
          prompt: s.prompt,
          characters: s.characters,
          duration_seconds: s.durationSeconds,
          generation_method: s.generationMethod,
          dialogue_lines: s.dialogueLines,
          camera_config: CAMERA,
          lighting_config: LIGHTING,
          sort_order: s.sortOrder,
          source: 'manual',
        })),
      )
    ).error,
  )

  fail('current_stage update', (await db.from('projects').update({ current_stage: stage }).eq('id', projectId)).error)

  console.log('writer 산출물 최소 1세트를 써넣었다.')
  console.log(`  projectId : ${projectId}`)
  console.log(`  씬 1 / 샷 ${SHOTS.length} / 인물 1 / 배경 1`)
  console.log(`  잠금 해제 : ${stage} 까지 (projects.current_stage)`)
  console.log(`  확인      : pnpm smoke /studio/${stage} --auth --tree`)
}

main().catch((err) => {
  console.error(`[오류] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
})
