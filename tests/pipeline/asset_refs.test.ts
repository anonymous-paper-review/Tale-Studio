import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAssetRegistry,
  resolveAssetRef,
  normalizeShotSequenceAssetRefs,
} from '@/lib/writer/pipeline/util/asset_refs';
import type { L2Design, S2Block, S3Block, ShotSequence } from '@/lib/writer/types/pipeline';

// 실제 파이프라인 로그(깨진 reference 포함)로 결정론적 정규화기를 검증.
const LOG = path.resolve(__dirname, '../../logs/5ba68003-3922-4d91-a87b-1b1ca7f5dd2f');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(LOG, f), 'utf8'));

describe('asset_refs normalization (real logged data)', () => {
  const s2 = read('04_S2.json') as S2Block;
  const l2 = read('09_L2.json') as L2Design;
  const s3 = read('05_S3.json') as S3Block;
  const reg = buildAssetRegistry(s2, l2);

  it('builds canonical registry from S2 + L2', () => {
    expect(reg.characterIds.has('young_hero')).toBe(true);
    expect(reg.characterIds.has('demon_king')).toBe(true);
    expect(reg.locationIds.length).toBe(2);
  });

  it('recovers version-suffixed character refs (the _v1/_v2 bug)', () => {
    expect(resolveAssetRef('young_hero_v1', reg)).toMatchObject({
      id: 'young_hero',
      kind: 'character',
      strippedVersion: 'v1',
    });
    expect(resolveAssetRef('demon_king_v2', reg)).toMatchObject({ id: 'demon_king', kind: 'character' });
    expect(resolveAssetRef('young_hero', reg)).toMatchObject({ id: 'young_hero', kind: 'character' });
  });

  it('drops invented refs that match no real asset', () => {
    for (const bad of [
      'cliff_edge', 'cliff_path', 'cliffside', 'castle_gate', 'castle_gate_v1',
      'demon_king_castle', 'throne_room', 'crumbling_throne_room', 'obsidian_throne_v1',
      'minions', 'minions_v1',
    ]) {
      expect(resolveAssetRef(bad, reg)).toBeNull();
    }
  });

  it('resolves canonical (Korean) location ids exactly', () => {
    for (const id of reg.locationIds) {
      expect(resolveAssetRef(id, reg)).toMatchObject({ id, kind: 'location' });
    }
  });

  it('normalizes the real shot sequence: only canonical refs survive + locations recovered via scene fallback', () => {
    const seq = read('13_shot_sequence.json') as ShotSequence;
    const sceneLocById = new Map<string, string>(s3.scenes.map((sc) => [sc.scene_id, sc.location]));

    const { shots, droppedCount } = normalizeShotSequenceAssetRefs(seq.shots, reg, sceneLocById);

    // 실제 로그엔 깨진 ref가 많으므로 drop이 반드시 발생해야 함
    expect(droppedCount).toBeGreaterThan(0);

    for (const shot of shots) {
      // 살아남은 character ref는 전부 canonical
      for (const c of shot.assets.characters ?? []) {
        expect(reg.characterIds.has(c.id)).toBe(true);
      }
      // 살아남은 location ref는 전부 canonical
      for (const l of shot.assets.locations ?? []) {
        expect(reg.locationIds).toContain(l.id);
      }
      // base_assets도 전부 canonical (char ∪ location)
      for (const b of shot.first_frame_generation.base_assets ?? []) {
        expect(reg.characterIds.has(b) || reg.locationIds.includes(b)).toBe(true);
      }
      // 모든 샷이 자기 scene의 canonical location을 가짐 (fallback이 복구)
      const expectedLoc = sceneLocById.get(shot.S.scene_id);
      if (expectedLoc) {
        expect(shot.assets.locations.some((l) => l.id === expectedLoc)).toBe(true);
      }
    }
  });
});
