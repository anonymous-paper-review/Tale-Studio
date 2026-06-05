// Compact Mode 사후 처리: L4 결과로부터 L3 (씬 비주얼 플랜) 역추론.
// 호출은 안 했지만 PipelineResult.L3 필드를 채우기 위함 (다운스트림 호환).
import type { L3SceneVisualPlan, L4Shot, S3Block, S3Scene } from '@/lib/writer/types/pipeline';

export function inferL3FromL4Shots(
  l4Shots: L4Shot[],
  s3: S3Block
): L3SceneVisualPlan[] {
  return s3.scenes.map((scene) => inferOneScenePlan(scene, l4Shots));
}

function inferOneScenePlan(scene: S3Scene, allShots: L4Shot[]): L3SceneVisualPlan {
  const shotsInScene = allShots.filter((s) => s.intent.scene_id === scene.scene_id);

  if (shotsInScene.length === 0) {
    return makeEmptyPlan(scene.scene_id);
  }

  // lens vocabulary
  const lensUnique = uniqueNumbers(shotsInScene.map((s) => s.static_spec.lens_mm).filter(Number.isFinite));

  // camera mounting + energy (motion type 분포로 역추론)
  const motionTypes = shotsInScene.map((s) => s.dynamic_spec.camera_motion?.type ?? 'static');
  const staticRatio = motionTypes.filter((t) => t === 'static').length / motionTypes.length;
  const handheldRatio = motionTypes.filter((t) => t === 'handheld_drift').length / motionTypes.length;
  const kineticRatio = motionTypes.filter((t) =>
    ['dolly_in', 'dolly_out', 'tracking', 'crane', 'pan', 'tilt'].includes(t)
  ).length / motionTypes.length;

  let camera_mounting: L3SceneVisualPlan['camera_mounting'] = 'tripod';
  if (handheldRatio > 0.5) camera_mounting = 'handheld';
  else if (kineticRatio > 0.5) camera_mounting = 'gimbal';
  else if (handheldRatio + kineticRatio > 0.4) camera_mounting = 'mixed';

  let camera_energy: L3SceneVisualPlan['camera_energy'] = 'static';
  if (kineticRatio > 0.3) camera_energy = 'kinetic';
  else if (staticRatio < 0.7) camera_energy = 'breathing';

  // lighting arc
  const colorTemps = shotsInScene
    .map((s) => s.static_spec.lighting?.color_temp_kelvin)
    .filter((n): n is number => Number.isFinite(n));
  const start_K = colorTemps[0] ?? 4000;
  const end_K = colorTemps[colorTemps.length - 1] ?? start_K;
  const dominant_ratio = mode(shotsInScene.map((s) => s.static_spec.lighting?.key_fill_ratio ?? '4:1'));
  const quality = mode(shotsInScene.map((s) => s.static_spec.lighting?.quality ?? 'soft')) as
    | 'hard' | 'soft' | 'diffused';

  // cut pace
  const durations = shotsInScene.map((s) => s.intent.duration_seconds).filter(Number.isFinite);
  const avg_shot_seconds = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 8;
  const cut_pace: L3SceneVisualPlan['cut_pace'] =
    avg_shot_seconds < 5 ? 'rapid' : avg_shot_seconds > 10 ? 'long_takes' : 'medium';

  // coverage pattern (shot_type 분포로 추론)
  const shotTypes = shotsInScene.map((s) => s.static_spec.shot_type ?? 'MS');
  const inserts = shotTypes.filter((t) => t === 'INSERT' || t === 'ECU').length;
  const twoshots = shotTypes.filter((t) => t === '2S' || t === 'OTS').length;
  let coverage_pattern: L3SceneVisualPlan['coverage_pattern'] = 'master_inserts';
  if (shotsInScene.length === 1) coverage_pattern = 'single_take';
  else if (twoshots >= shotsInScene.length * 0.5) coverage_pattern = 'shot_reverse';
  else if (camera_mounting === 'handheld' && cut_pace !== 'rapid') coverage_pattern = 'handheld_continuous';
  else if (cut_pace === 'rapid') coverage_pattern = 'montage';
  else if (inserts >= shotsInScene.length * 0.3) coverage_pattern = 'master_inserts';
  else coverage_pattern = 'developing';

  // dominant POV (등장 빈도 + position 기반)
  const charCount: Record<string, number> = {};
  for (const s of shotsInScene) {
    for (const b of s.static_spec.character_blocking ?? []) {
      charCount[b.character_id] = (charCount[b.character_id] ?? 0) + 1;
    }
  }
  const dominant_pov = Object.entries(charCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'omniscient';

  // palette emphasis (집계)
  const palette = uniqueStrings(shotsInScene.flatMap((s) => s.static_spec.palette_emphasis ?? []));

  return {
    scene_id: scene.scene_id,
    coverage_pattern,
    shot_count_target: shotsInScene.length,
    lens_vocabulary: lensUnique.length > 0 ? lensUnique : [50],
    camera_mounting,
    camera_energy,
    lighting_arc: {
      start_K,
      end_K,
      dominant_ratio,
      quality,
    },
    palette_emphasis: palette.slice(0, 5),
    dominant_pov,
    rhythm_profile: cut_pace === 'rapid' ? 'accelerating' : 'sustained',
    cut_pace,
    avg_shot_seconds: Math.round(avg_shot_seconds * 10) / 10,
    silence_intentional: shotsInScene.every((s) => !s.dynamic_spec.character_motion?.length),
    sound_motif_hints: [],
    visual_intent: '(inferred from Compact Mode L4 output)',
  };
}

function makeEmptyPlan(scene_id: string): L3SceneVisualPlan {
  return {
    scene_id,
    coverage_pattern: 'single_take',
    shot_count_target: 0,
    lens_vocabulary: [50],
    camera_mounting: 'tripod',
    camera_energy: 'static',
    lighting_arc: { start_K: 4000, end_K: 4000, dominant_ratio: '4:1', quality: 'soft' },
    palette_emphasis: [],
    dominant_pov: 'omniscient',
    rhythm_profile: 'sustained',
    cut_pace: 'medium',
    avg_shot_seconds: 0,
    silence_intentional: false,
    sound_motif_hints: [],
    visual_intent: '(no shots — empty inferred plan)',
  };
}

function uniqueNumbers(arr: number[]): number[] {
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function mode<T>(arr: T[]): T {
  if (arr.length === 0) return arr[0];
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}
