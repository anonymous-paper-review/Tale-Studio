// LLM 산출 스키마 게이트 (#p4-json-guard 2026-08-11) — webSearch 4스테이지부터 적용.
//
// 두 모드의 역할 구분 (dispatch.DispatchOptions 참조):
//  - validate (schema만): 파싱 성공 ≠ 내용 보전 — repairJson 절단 복구가 아이템을 조용히 버린
//    실사고(flash-ab 8샷→2샷, Q6) 계열의 방어. 파싱 직후 구조를 코드로 단언하고, 실패는 throw 로
//    표면화한다(무신호 금지). 단언만 한다 — 산출물은 원본 그대로 반환(키 스트립/변형 없음)이고,
//    enum "값" 제약은 넣지 않는다(실분포의 enum 밖 값 982건 실측 — 처방은 Q16 오너 미결).
//  - enforce (enforceSchema:true): claude 경로에서 output_config.format 으로 생성 자체를 스키마에
//    강제 — gemini responseMimeType 의 등가물. ⚠ enforce 스키마는 프롬프트가 요구하는 필드의
//    "전집합"이어야 한다: 부분 스키마로 강제하면 스키마 밖 필드가 생성에서 억압돼 하류 데이터가
//    소실된다. 전집합 확신이 없는 스테이지는 validate 만 건다.
//    s3/merged 는 2026-08-12 StorySceneLooseSchema 전집합화로 이 조건을 충족해 최초 생성 호출에
//    enforce 를 켰다(s3_scenes.ts/s1s3_merged.ts 참조) — 교정 재요청 4곳은 validate 만(이유는 그 파일 참조).
//
// 스키마는 z.object(비-strict) 기본 — zod 는 알 수 없는 키를 "거부"하지 않으므로(strip 시멘틱)
// 모델이 여분 필드를 내도 검증은 통과하고, 원본 반환 원칙 덕에 여분 필드도 하류에 그대로 산다.
import { z } from 'zod';
import type { StoryScene } from '@/lib/writer/types/pipeline';

// ── s0.5 드라마투르그 (enforce 가능 — 프롬프트 산출 스키마 전집합, 실산출 픽스처와 합치 확인) ──
export const DramaturgySchema = z.object({
  core_engine: z.string(),
  mechanism_notes: z.array(z.string()),
  world_inventory: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      derived_from: z.string(),
      scene_potential: z.array(z.string()),
    }),
  ),
  dramatic_diagnosis: z.object({
    stakes: z.string(),
    weak_beats: z.array(z.string()),
    cdq_candidates: z.array(z.string()),
    ending_check: z.string(),
  }),
});

// ── s1 서사 구조 (enforce 가능 — NarrativeStructure 타입/픽스처와 전집합 합치) ──
export const NarrativeStructureSchema = z.object({
  structure_type: z.string(),
  acts: z
    .array(z.object({ act_id: z.string(), purpose: z.string(), proportion: z.number() }))
    .min(1),
  pov: z.string(),
  theme: z.string(),
  central_dramatic_question: z.string(),
  turning_point_position: z.number(),
});

// ── s3 씬 (validate + enforce 가능 — StoryScene 타입 전 필드로 확장 2026-08-12, #p4-json-guard 후속) ──
//   3필드(scene_id/location/scene_actions)만 강제하던 구멍으로 key_dialouge 오타 → key_dialogue
//   통째 유실(2026-08-04) · characters_id 오타 → characters_in_scene 유실(2026-07-27)이 무신호로
//   통과했다. StoryScene(pipeline.ts) 전 13필드를 옮겨와 결손·오타 필드명을 여기서 거부한다.
//   필수/optional 은 StoryScene 타입 그대로(옮기며 승격 금지 — 실패율만 올린다). optional: weather, key_dialogue.
//   ⚠️ key_dialogue 는 optional 이라 "필드 자체가 없음"과 "오타 이름으로 대신 있음"을 스키마가
//     구분하지 못한다(둘 다 정본 key_dialogue 부재로 보여 통과) — optional 을 required 로 올리지
//     않는 한 못 잡는 사각지대. 아래 파일 하단 컴파일타임 대조 참조.
//   되돌리는 법: 이 스키마를 옛 3필드로 되돌리고, s3_scenes.ts/s1s3_merged.ts 최초 생성 호출의
//   enforceSchema: true 를 지우면(스키마 인자는 남겨도 무방) 종전(관대한 validate)으로 복귀한다.
export const StorySceneLooseSchema = z.looseObject({
  scene_id: z.string(),
  act_ref: z.string(),
  location: z.string(),
  time_of_day: z.string(),
  weather: z.string().optional(),
  characters_in_scene: z.array(z.string()),
  purpose: z.string(),
  emotion_beat: z.looseObject({ start: z.string(), end: z.string() }),
  dialogue_summary: z.string(),
  key_dialogue: z
    .array(
      z.looseObject({
        character_id: z.string(),
        line: z.string(),
        delivery: z.string(),
      }),
    )
    .optional(),
  info_asymmetry: z.string(),
  estimated_seconds: z.number(),
  scene_actions: z.array(z.string()).min(1),
});

// 컴파일타임 대조 — StorySceneLooseSchema 가 StoryScene(pipeline.ts) 과 어긋나면 빌드가 깨진다.
//   z.infer<typeof StorySceneLooseSchema> 를 직접 쓰면 안 된다: z.looseObject 의 최상위 인덱스
//   시그니처([x:string]: unknown)가 끼어들면 "구체 interface extends 인덱스시그니처있는타입"
//   방향이 필드 일치 여부와 무관하게 무조건 거짓이 된다(실측 — 최상위에 인덱스 시그니처가 있으면
//   내용이 완전히 같아도 실패, 한 겹 안쪽엔 있어도 안 깨짐 — TS 어사인성 체커의 위치 의존 동작).
//   같은 필드 정의(.shape, 인스턴스 공유라 드리프트 불가)를 최상위만 z.object 로 다시 감싸
//   인덱스 시그니처를 제거한 뒤 대조한다 — 런타임 StorySceneLooseSchema 자체는 그대로 loose 유지.
//   상호 assignability 두 방향으로 "필수 필드 결손"과 "optional 의 무단 승격"을 각각 잡는다
//   (양방향 다 대조 스키마를 일부러 깨뜨려 검증 완료 — schemas.ts 커밋 참조).
//   ① StoryScene extends 스키마추론타입: 스키마가 실제 StoryScene 값보다 더 많은 걸 요구하면(=
//      optional 필드를 required 로 잘못 올렸으면) 여기서 실패한다.
//   ② 스키마추론타입 extends StoryScene: 스키마가 StoryScene 의 required 필드를 빠뜨렸거나
//      타입이 어긋나면 여기서 실패한다.
const _sceneSchemaShapeForTypeCheck = z.object(StorySceneLooseSchema.shape);
void _sceneSchemaShapeForTypeCheck; // z.infer 의 typeof 대상 — 값으로도 참조해 lint no-unused-vars 회피
type _StorySceneSchemaShape = z.infer<typeof _sceneSchemaShapeForTypeCheck>;
type _SceneSchemaNotOverRequired = StoryScene extends _StorySceneSchemaShape
  ? true
  : ['스키마가 StoryScene 보다 과하게 요구함 — optional 필드를 required 로 올렸을 가능성'];
type _SceneSchemaCoversType = _StorySceneSchemaShape extends StoryScene
  ? true
  : ['스키마가 StoryScene 필드를 못 채움 — schemas.ts 를 pipeline.ts:StoryScene 에 맞춰 갱신하라'];
const _sceneSchemaNotOverRequired: _SceneSchemaNotOverRequired = true;
const _sceneSchemaCoversType: _SceneSchemaCoversType = true;
void _sceneSchemaNotOverRequired;
void _sceneSchemaCoversType;

export const ScenesSchema = z.looseObject({
  scenes: z.array(StorySceneLooseSchema).min(1),
  // total_estimated_seconds 는 소비처에 폴백이 있어 필수로 안 조인다.
  total_estimated_seconds: z.number().optional(),
});

// ── s1s3 병합 1콜 (최초 생성은 enforce 가능, 교정 재요청은 validate 전용 — s1s3_merged.ts 참조) ──
export const MergedRawSchema = z.looseObject({
  narrative_structure: NarrativeStructureSchema,
  scenes: z.array(StorySceneLooseSchema).min(1),
  total_estimated_seconds: z.number().optional(),
});
