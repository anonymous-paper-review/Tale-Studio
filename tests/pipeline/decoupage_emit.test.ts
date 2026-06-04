// 드라이버: 데쿠파주 구동 L4(서브에이전트 출력) → 실제 Layer-1 정규화 → L5 추출 → 14_final_prompts emit.
// "수정된 파이프라인의 필요 부분만" 실행. LLM 단계는 서브에이전트가 이미 수행(_decoupage_l4.json).
// 영상/이미지 생성(L6/L7)은 제외.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildAssetRegistry, normalizeShotSequenceAssetRefs } from '@/lib/svc/pipeline/util/asset_refs';
import type { L2Design, S2Block, S3Block, ShotSequenceItem } from '@/lib/svc/types/pipeline';

const LOG = path.resolve(__dirname, '../../logs/5ba68003-3922-4d91-a87b-1b1ca7f5dd2f');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(LOG, f), 'utf8'));

interface L4Out {
  shot_id: string;
  scene_id: string;
  duration_seconds: number;
  shot_size: string;
  camera_intent: string;
  first_frame_prompt: string;
  motion_prompt: string;
  camera_movement: string;
  assets: { characters: string[]; locations: string[] };
  base_assets: string[];
}

describe('découpage → final_prompts emit (fixed pipeline, no L6/L7)', () => {
  it('normalizes refs (real Layer-1) and emits I2I + TI2V prompts for all 26 shots', () => {
    const s2 = read('04_S2.json') as S2Block;
    const l2 = read('09_L2.json') as L2Design;
    const s3 = read('05_S3.json') as S3Block;
    const L0 = read('08_L0_L1.json').L0 as { aspect_ratio: string; fps: number; resolution: { width: number; height: number } };
    const l4 = (read('_decoupage_l4.json').shots ?? []) as L4Out[];

    expect(l4.length).toBe(26);

    // L4 출력 → ShotSequenceItem 형태로 래핑 (정규화기가 읽는 필드만 채우면 됨)
    const wrapped = l4.map((s) => ({
      shot_id: s.shot_id,
      duration_seconds: s.duration_seconds,
      S: { scene_id: s.scene_id },
      assets: {
        characters: (s.assets?.characters ?? []).map((id) => ({ id, asset_version: 'v1' })),
        locations: (s.assets?.locations ?? []).map((id) => ({ id, asset_version: 'a' })),
      },
      first_frame_generation: { base_assets: s.base_assets ?? [], composition_prompt: s.first_frame_prompt },
      video_generation: { motion_prompt: s.motion_prompt },
    })) as unknown as ShotSequenceItem[];

    // ── 실제 Layer-1 정규화 실행 ──
    const reg = buildAssetRegistry(s2, l2);
    const sceneLocById = new Map<string, string>(s3.scenes.map((sc) => [sc.scene_id, sc.location]));
    const { shots: normShots, issues, droppedCount } = normalizeShotSequenceAssetRefs(wrapped, reg, sceneLocById);

    // ── L5 추출: t2i + ti2v ──
    const byId = new Map(l4.map((s) => [s.shot_id, s]));
    const finalShots = normShots.map((shot) => {
      const src = byId.get(shot.shot_id)!;
      const refs = Array.from(
        new Set([
          ...shot.assets.characters.map((c) => c.id),
          ...shot.assets.locations.map((l) => l.id),
          ...(shot.first_frame_generation.base_assets ?? []),
        ]),
      );
      return {
        shot_id: shot.shot_id,
        scene_id: src.scene_id,
        duration_seconds: src.duration_seconds,
        t2i: {
          prompt: shot.first_frame_generation.composition_prompt,
          aspect_ratio: L0.aspect_ratio,
          width: L0.resolution.width,
          height: L0.resolution.height,
          reference_assets: refs,
        },
        ti2v: {
          motion_prompt: shot.video_generation.motion_prompt,
          duration_seconds: src.duration_seconds,
          fps: L0.fps,
          camera_movement: src.camera_movement,
        },
      };
    });

    const output = {
      total_shots: finalShots.length,
      shots: finalShots,
      l0_meta: { aspect_ratio: L0.aspect_ratio, fps: L0.fps, resolution: L0.resolution },
      source: 'decoupage-driven (L4 via sub-agent) + Layer-1 normalize',
      asset_refs_dropped: droppedCount,
    };
    fs.writeFileSync(path.join(LOG, '14_final_prompts.decoupage.json'), JSON.stringify(output, null, 2));

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
