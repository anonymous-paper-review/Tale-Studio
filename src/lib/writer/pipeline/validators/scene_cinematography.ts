// V3(sceneCinematography) 산출물 rule-base 자기 검증.
//   LLM 출력을 결정론적 규칙으로 확인한다 — enum 유효성·수치 범위·상류 정합
//   (v2 WorldVisual global_palette, S3 씬 등장인물). v3_scene_plan 이 생성 직후 호출해 CRITICAL
//   위반 시 1회 교정 재생성하고, 모든 이슈를 budget_issues 로 영속한다.
import type {
  SceneCinematography,
  WorldVisual,
  Scenes,
  ValidationIssue,
} from '@/lib/writer/types/pipeline';

// SceneCinematography 의 enum 도메인 (types/pipeline.ts 와 동기 유지)
const COVERAGE_PATTERNS = ['master_inserts', 'shot_reverse', 'developing', 'handheld_continuous', 'montage', 'single_take'];
const MOUNTINGS = ['tripod', 'handheld', 'gimbal', 'steadicam', 'mixed'];
const ENERGIES = ['static', 'breathing', 'kinetic'];
const QUALITIES = ['hard', 'soft', 'diffused'];
const RHYTHMS = ['accelerating', 'sustained', 'decaying', 'punctuated'];
const CUT_PACES = ['long_takes', 'medium', 'rapid'];

const LENS_MIN = 8;
const LENS_MAX = 300; // mm, 현실적 렌즈 범위
const KELVIN_MIN = 1000;
const KELVIN_MAX = 20000;

export interface SceneCinematographyValidation {
  issues: ValidationIssue[];
  valid: boolean; // CRITICAL 이슈 없음
}

/**
 * scene_plans 를 규칙으로 검증. 상류(scenes, worldVisual)와의 정합도 확인.
 */
export function validateSceneCinematography(
  scenePlans: SceneCinematography[],
  scenes: Scenes,
  worldVisual: WorldVisual,
): SceneCinematographyValidation {
  const issues: ValidationIssue[] = [];
  const sceneById = new Map(scenes.scenes.map((s) => [s.scene_id, s]));
  const planSceneIds = new Set<string>();

  // v2 WorldVisual global_palette 색 집합 — palette_emphasis 정합 검사용
  const gp = worldVisual.global_palette;
  const paletteColors = new Set<string>(
    [gp?.primary, gp?.secondary, gp?.accent]
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .map((c) => c.toLowerCase()),
  );

  const crit = (location: string, message: string, suggestion: string) =>
    issues.push({ category: 'cinematography', severity: 'CRITICAL', location, message, suggestion });
  const warn = (location: string, message: string, suggestion: string) =>
    issues.push({ category: 'cinematography', severity: 'WARNING', location, message, suggestion });
  const enumCheck = (val: string, allowed: string[], scene_id: string, field: string) => {
    if (!allowed.includes(val)) crit(scene_id, `${field}="${val}" 는 허용값이 아님`, `${allowed.join(' | ')} 중 하나`);
  };

  for (const plan of scenePlans) {
    const id = plan.scene_id;

    // 0) scene_id 정합 + 중복
    if (!sceneById.has(id)) crit(id, `scene_id "${id}" 가 S3 씬에 없음`, '존재하는 scene_id 사용');
    if (planSceneIds.has(id)) warn(id, `scene_id "${id}" 플랜 중복`, '씬당 1개 플랜');
    planSceneIds.add(id);

    // 1) enum 유효성
    enumCheck(plan.coverage_pattern, COVERAGE_PATTERNS, id, 'coverage_pattern');
    enumCheck(plan.camera_mounting, MOUNTINGS, id, 'camera_mounting');
    enumCheck(plan.camera_energy, ENERGIES, id, 'camera_energy');
    enumCheck(plan.rhythm_profile, RHYTHMS, id, 'rhythm_profile');
    enumCheck(plan.cut_pace, CUT_PACES, id, 'cut_pace');
    if (plan.lighting_arc) enumCheck(plan.lighting_arc.quality, QUALITIES, id, 'lighting_arc.quality');

    // 2) 수치 범위
    if (!(plan.shot_count_target >= 1)) crit(id, `shot_count_target=${plan.shot_count_target} (≥1 이어야)`, '최소 1');
    if (!(plan.avg_shot_seconds > 0)) warn(id, `avg_shot_seconds=${plan.avg_shot_seconds} (>0 이어야)`, '양수');
    if (!plan.lens_vocabulary?.length) {
      crit(id, 'lens_vocabulary 비어있음', '최소 1개 렌즈(mm)');
    } else {
      for (const mm of plan.lens_vocabulary)
        if (!(mm >= LENS_MIN && mm <= LENS_MAX)) warn(id, `lens ${mm}mm 비현실적(${LENS_MIN}~${LENS_MAX})`, '현실적 초점거리');
    }
    if (plan.lighting_arc) {
      for (const [k, label] of [
        [plan.lighting_arc.start_K, 'start_K'],
        [plan.lighting_arc.end_K, 'end_K'],
      ] as const)
        if (!(k >= KELVIN_MIN && k <= KELVIN_MAX)) warn(id, `lighting_arc.${label}=${k}K 비현실적(${KELVIN_MIN}~${KELVIN_MAX})`, '현실적 색온도');
    }

    // 3) 상류 정합: palette_emphasis ⊆ v2 global_palette
    if (paletteColors.size && plan.palette_emphasis?.length) {
      for (const c of plan.palette_emphasis)
        if (!paletteColors.has(String(c).toLowerCase()))
          warn(id, `palette_emphasis "${c}" 가 v2 global_palette 밖`, 'worldVisual.global_palette 색만 강조');
    }

    // 4) 상류 정합: dominant_pov / spatial_axis_180 가 씬 등장인물인가
    const scene = sceneById.get(id);
    if (scene) {
      const inScene = new Set(scene.characters_in_scene ?? []);
      if (plan.dominant_pov && plan.dominant_pov !== 'omniscient' && inScene.size && !inScene.has(plan.dominant_pov))
        warn(id, `dominant_pov "${plan.dominant_pov}" 가 씬 등장인물 아님`, `[${[...inScene].join(', ')}] 중 또는 omniscient`);
      if (plan.spatial_axis_180) {
        for (const [who, label] of [
          [plan.spatial_axis_180.from_char, 'from_char'],
          [plan.spatial_axis_180.to_char, 'to_char'],
        ] as const)
          if (who && inScene.size && !inScene.has(who))
            warn(id, `spatial_axis_180.${label} "${who}" 가 씬 등장인물 아님`, '씬 등장인물로 180° 축 설정');
      }
    }
  }

  // 5) 커버리지: 모든 S3 씬에 플랜이 있는가
  for (const s of scenes.scenes)
    if (!planSceneIds.has(s.scene_id)) warn(s.scene_id, `씬 "${s.scene_id}" 에 비주얼 플랜 없음`, '모든 씬에 플랜 생성');

  return { issues, valid: !issues.some((i) => i.severity === 'CRITICAL') };
}

/** CRITICAL 위반을 교정 재생성 프롬프트에 첨부할 텍스트로 변환. */
export function buildCorrectionNote(issues: ValidationIssue[]): string {
  const lines = issues
    .filter((i) => i.severity === 'CRITICAL')
    .map((i) => `- [${i.location}] ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ''}`);
  return lines.join('\n');
}
