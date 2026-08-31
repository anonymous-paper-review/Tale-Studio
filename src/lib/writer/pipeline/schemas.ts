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
//    소실된다. 전집합 확신이 없는 스테이지는 validate 만 건다(s3/merged 가 현재 그 상태).
//
// 스키마는 z.object(비-strict) 기본 — zod 는 알 수 없는 키를 "거부"하지 않으므로(strip 시멘틱)
// 모델이 여분 필드를 내도 검증은 통과하고, 원본 반환 원칙 덕에 여분 필드도 하류에 그대로 산다.
import { z } from 'zod';

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

// ── s3 씬 (validate 전용 — StoryScene 전 필드를 강제할 확신 전까지 구조 단언만) ──
//   개수·핵심 필드 단언: 씬 배열 비어있지 않음, 씬마다 scene_id/location/scene_actions 실존.
export const StorySceneLooseSchema = z.looseObject({
  scene_id: z.string(),
  location: z.string(),
  narrative_time: z.enum(['present', 'past', 'future']),
  scene_actions: z.array(z.string()).min(1),
});

export const ScenesSchema = z.looseObject({
  scenes: z.array(StorySceneLooseSchema).min(1),
  // total_estimated_seconds 는 소비처에 폴백이 있어 필수로 안 조인다.
  total_estimated_seconds: z.number().optional(),
});

// ── s1s3 병합 1콜 (validate 전용) ──
export const MergedRawSchema = z.looseObject({
  narrative_structure: NarrativeStructureSchema,
  scenes: z.array(StorySceneLooseSchema).min(1),
  total_estimated_seconds: z.number().optional(),
});
