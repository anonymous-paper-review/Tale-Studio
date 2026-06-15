// Asset reference 정규화 — LLM이 생성한 asset/base_assets 참조를 canonical ID로 강제.
//   문제: C2/L4의 LLM(Gemini)이 존재하지 않는 reference를 발명함
//     (예: 로케이션 ID를 'cliff_edge'로 지어내거나, 'young_hero_v1'처럼 id에 버전 접미사를 붙임).
//   canonical asset ID는 두 곳에서만 나옴:
//     - 캐릭터: S2.characters[].id
//     - 로케이션: v2 WorldVisual.locations[].id (= scene.location)
//   이 util은 LLM 신뢰 없이 코드로 모든 참조를 canonical로 해소(resolve)하거나 drop한다.
import type { WorldVisual, Characters, ShotSequenceItem, ValidationIssue } from '@/lib/writer/types/pipeline';

export interface AssetRegistry {
  characterIds: Set<string>;
  locationIds: string[];   // 순서 유지 (이름 부분매칭에 사용)
}

export function buildAssetRegistry(characters: Characters, worldVisual: WorldVisual): AssetRegistry {
  return {
    characterIds: new Set(characters.characters.map((c) => c.id)),
    locationIds: worldVisual.locations.map((l) => l.id),
  };
}

export interface ResolvedRef {
  id: string;
  kind: 'character' | 'location';
  strippedVersion?: string;  // raw가 'young_hero_v1'이었으면 'v1'
}

// raw 참조 ID를 canonical asset ID로 해소. 실패 시 null.
//   1) 캐릭터 정확 매칭
//   2) 버전 접미사 제거 후 캐릭터 매칭 (young_hero_v1 -> young_hero, 버전 분리)
//   3) 로케이션 정확 매칭
//   4) 로케이션 이름 부분 매칭 (양방향 substring)
export function resolveAssetRef(raw: string, reg: AssetRegistry): ResolvedRef | null {
  if (!raw || typeof raw !== 'string') return null;
  const r = raw.trim();
  if (!r) return null;

  if (reg.characterIds.has(r)) return { id: r, kind: 'character' };

  const base = r.replace(/_v\d+$/i, '');
  if (base !== r && reg.characterIds.has(base)) {
    const vm = r.match(/_v(\d+)$/i);
    return { id: base, kind: 'character', strippedVersion: vm ? `v${vm[1]}` : undefined };
  }

  if (reg.locationIds.includes(r)) return { id: r, kind: 'location' };

  const loc = reg.locationIds.find((id) => id === r || id.includes(r) || r.includes(id));
  if (loc) return { id: loc, kind: 'location' };

  return null;
}

export interface AssetRefIssue {
  shot_id: string;
  field: 'characters' | 'locations' | 'base_assets';
  dropped: string;
}

export interface NormalizeResult {
  shot: ShotSequenceItem;
  issues: AssetRefIssue[];
  allCharactersDropped: boolean;  // 원래 캐릭터가 있었는데 전부 미해결된 경우
}

// 한 샷의 asset 참조를 canonical로 정규화. 미해결은 drop + 이슈 수집.
// sceneLocationId: 이 샷이 속한 scene의 location (canonical). 로케이션이 전부 미해결이면 여기로 fallback.
export function normalizeShotAssetRefs(
  shot: ShotSequenceItem,
  reg: AssetRegistry,
  sceneLocationId: string | null,
): NormalizeResult {
  const issues: AssetRefIssue[] = [];

  // ── characters ──
  const origCharCount = shot.assets?.characters?.length ?? 0;
  const characters = (shot.assets?.characters ?? [])
    .map((c) => {
      const res = resolveAssetRef(c.id, reg);
      if (res && res.kind === 'character') {
        return { ...c, id: res.id, asset_version: c.asset_version ?? res.strippedVersion ?? 'v1' };
      }
      issues.push({ shot_id: shot.shot_id, field: 'characters', dropped: c.id });
      return null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // ── locations ──
  let locations = (shot.assets?.locations ?? [])
    .map((l) => {
      const res = resolveAssetRef(l.id, reg);
      if (res && res.kind === 'location') return { ...l, id: res.id };
      issues.push({ shot_id: shot.shot_id, field: 'locations', dropped: l.id });
      return null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // 로케이션이 하나도 안 남으면 scene의 canonical location으로 fallback
  if (locations.length === 0 && sceneLocationId && reg.locationIds.includes(sceneLocationId)) {
    locations = [{ id: sceneLocationId, asset_version: 'a' }];
  }

  // ── base_assets ──
  const base_assets = (shot.first_frame_generation?.base_assets ?? [])
    .map((a) => {
      const res = resolveAssetRef(a, reg);
      if (res) return res.id;
      issues.push({ shot_id: shot.shot_id, field: 'base_assets', dropped: a });
      return null;
    })
    .filter((a): a is string => a !== null);

  // 해소된 character/location id를 base_assets에 보장 + dedupe
  const baseSet = new Set<string>(base_assets);
  for (const c of characters) baseSet.add(c.id);
  for (const l of locations) baseSet.add(l.id);

  const normalized: ShotSequenceItem = {
    ...shot,
    assets: { ...shot.assets, characters, locations },
    first_frame_generation: {
      ...shot.first_frame_generation,
      base_assets: Array.from(baseSet),
    },
  };

  return {
    shot: normalized,
    issues,
    allCharactersDropped: origCharCount > 0 && characters.length === 0,
  };
}

// 샷 시퀀스 전체 정규화 + ValidationIssue 생성.
export function normalizeShotSequenceAssetRefs(
  shots: ShotSequenceItem[],
  reg: AssetRegistry,
  sceneLocationById: Map<string, string>,
): { shots: ShotSequenceItem[]; issues: ValidationIssue[]; droppedCount: number } {
  const issues: ValidationIssue[] = [];
  let droppedCount = 0;

  const out = shots.map((shot) => {
    const sceneId = shot.S?.scene_id ?? '';
    const sceneLoc = sceneLocationById.get(sceneId) ?? null;
    const { shot: norm, issues: refIssues, allCharactersDropped } = normalizeShotAssetRefs(shot, reg, sceneLoc);

    for (const ri of refIssues) {
      droppedCount++;
      issues.push({
        category: 'continuity',
        severity: 'INFO',
        location: ri.shot_id,
        message: `미해결 asset reference drop: "${ri.dropped}" (${ri.field})`,
        suggestion: 'assets/base_assets는 S2 character id 또는 L2 location id만 참조하세요 (발명·버전접미사 금지)',
      });
    }
    if (allCharactersDropped) {
      issues.push({
        category: 'continuity',
        severity: 'WARNING',
        location: shot.shot_id,
        message: '캐릭터 reference가 전부 미해결 → 이 샷은 캐릭터 에셋 없이 생성됨 (continuity 위험)',
        suggestion: 'C2 프롬프트의 유효 ID 목록을 확인하거나 L4b.character_blocking의 character_id를 점검',
      });
    }
    return norm;
  });

  return { shots: out, issues, droppedCount };
}
