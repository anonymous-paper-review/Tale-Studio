// 드라이버: 데쿠파주 구동 L4(서브에이전트 출력) → 실제 Layer-1 정규화 → L5 추출 → 14_final_prompts emit.
// "수정된 파이프라인의 필요 부분만" 실행. LLM 단계는 서브에이전트가 이미 수행(_decoupage_l4.json).
// 영상/이미지 생성(L6/L7)은 제외.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildAssetRegistry, normalizeShotSequenceAssetRefs } from '@/lib/writer/pipeline/util/asset_refs';
import type { WorldVisual, Characters, Scenes, ShotSequenceItem } from '@/lib/writer/types/pipeline';

const LOG = path.resolve(__dirname, '../../logs/1f0cc616-40ff-449f-8dda-ae7e6dd8e5e0');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(LOG, f), 'utf8'));

type TestShot = ShotSequenceItem & {
  V?: { camera?: { movement?: string } }
}

describe('découpage → final_prompts emit (fixed pipeline, no L6/L7)', () => {
  it('normalizes refs (real Layer-1) and emits I2I + TI2V prompts for every fixture shot', () => {
    const s2 = read('04_S2.json') as Characters;
    const l2 = read('09_L2.json') as WorldVisual;
    const s3 = read('05_S3.json') as Scenes;
    const L0 = read('08_L0_L1.json').L0 as { aspect_ratio: string; fps: number; resolution: { width: number; height: number } };
    const seq = read('13_shot_sequence.json') as { shots: TestShot[] };

    expect(seq.shots.length).toBeGreaterThan(0);

    // ── 실제 Layer-1 정규화 실행 ──
    const reg = buildAssetRegistry(s2, l2);
    const sceneLocById = new Map<string, string>(s3.scenes.map((sc) => [sc.scene_id, sc.location]));
    const { shots: normShots, issues, droppedCount } = normalizeShotSequenceAssetRefs(seq.shots, reg, sceneLocById);

    // ── L5 추출: t2i + ti2v ──
    const finalShots = normShots.map((shot) => {
      const refs = Array.from(
        new Set([
          ...shot.assets.characters.map((c) => c.id),
          ...shot.assets.locations.map((l) => l.id),
          ...(shot.first_frame_generation.base_assets ?? []),
        ]),
      );
      return {
        shot_id: shot.shot_id,
        scene_id: shot.S.scene_id,
        duration_seconds: shot.duration_seconds,
        t2i: {
          prompt: shot.first_frame_generation.composition_prompt,
          aspect_ratio: L0.aspect_ratio,
          width: L0.resolution.width,
          height: L0.resolution.height,
          reference_assets: refs,
        },
        ti2v: {
          motion_prompt: shot.video_generation.motion_prompt,
          duration_seconds: shot.duration_seconds,
          fps: L0.fps,
          camera_movement: shot.V?.camera?.movement ?? 'static',
        },
      };
    });

    const output = {
      total_shots: finalShots.length,
      shots: finalShots,
      l0_meta: { aspect_ratio: L0.aspect_ratio, fps: L0.fps, resolution: L0.resolution },
      source: 'shot-sequence fixture + Layer-1 normalize',
      asset_refs_dropped: droppedCount,
    };
    expect(output.total_shots).toBe(seq.shots.length);

    // ── 검증 ──
    const canonical = new Set<string>([...reg.characterIds, ...reg.locationIds]);
    for (const s of finalShots) {
      expect(s.t2i.prompt.length).toBeGreaterThan(80);          // I2I 프롬프트 존재
      expect(s.ti2v.motion_prompt.length).toBeGreaterThan(5);   // TI2V 프롬프트 존재
      for (const r of s.t2i.reference_assets) expect(canonical.has(r)).toBe(true); // 전부 canonical
    }
    // 모든 샷이 자기 scene의 canonical location ref 보유
    for (const s of normShots) {
      const loc = sceneLocById.get(s.S.scene_id);
      if (loc) expect(s.assets.locations.some((l) => l.id === loc)).toBe(true);
    }

    console.log(`[emit] 14_final_prompts.decoupage.json: ${finalShots.length} shots, refs_dropped=${droppedCount}, issues=${issues.length}`);
    console.log(`[emit] sample shot_1 t2i.reference_assets:`, finalShots[0].t2i.reference_assets);
  });
});
