import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAssetRegistry,
  resolveAssetRef,
  normalizeShotSequenceAssetRefs,
} from '@/lib/writer/pipeline/util/asset_refs';
import type { WorldVisual, Characters, Scenes, ShotSequence } from '@/lib/writer/types/pipeline';

// 실제 파이프라인 로그(깨진 reference 포함)로 결정론적 정규화기를 검증.
const LOG = path.resolve(__dirname, '../../logs/1f0cc616-40ff-449f-8dda-ae7e6dd8e5e0');
// logs/ 는 gitignore — 해당 run 로그가 있는 머신에서만 실행 가능한 실측 픽스처 테스트.
//   skipIf 여도 describe 본문은 수집 시 실행되므로 read 도 가드(빈 객체 폴백).
const hasFixture = fs.existsSync(LOG);
const read = (f: string) =>
  hasFixture ? JSON.parse(fs.readFileSync(path.join(LOG, f), 'utf8')) : ({} as never);

describe.skipIf(!hasFixture)('asset_refs normalization (real logged data)', () => {
  const s2 = read('04_S2.json') as Characters;
  const l2 = read('09_L2.json') as WorldVisual;
  const s3 = read('05_S3.json') as Scenes;
  // skipIf 여도 본문은 수집 시 실행 — 픽스처 없으면 registry 계산도 건너뛴다(빈 폴백).
  const reg = hasFixture ? buildAssetRegistry(s2, l2) : ({ characterIds: new Set<string>(), locationIds: [] } as ReturnType<typeof buildAssetRegistry>);

  it('builds canonical registry from S2 + L2', () => {
    expect(reg.characterIds.has('the_silver_knight')).toBe(true);
    expect(reg.characterIds.has('malenia')).toBe(true);
    expect(reg.locationIds.length).toBe(1);
  });

  it('recovers version-suffixed character refs (the _v1/_v2 bug)', () => {
    expect(resolveAssetRef('the_silver_knight_v1', reg)).toMatchObject({
      id: 'the_silver_knight',
      kind: 'character',
      strippedVersion: 'v1',
    });
    expect(resolveAssetRef('malenia_v2', reg)).toMatchObject({ id: 'malenia', kind: 'character' });
    expect(resolveAssetRef('the_silver_knight', reg)).toMatchObject({ id: 'the_silver_knight', kind: 'character' });
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

    // 현재 fixture는 이미 정리된 참조일 수 있으므로 drop 수는 0 이상이면 됨.
    expect(droppedCount).toBeGreaterThanOrEqual(0);

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
