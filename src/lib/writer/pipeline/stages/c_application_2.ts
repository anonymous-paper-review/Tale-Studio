// C 적용 ②: L4 (3분할) → ShotSequenceItem composing + 의미 검증
// Step 1: 결정론 조립 — L4 1개당 ShotSequenceItem 정확히 1개 (E12b 2026-07-21: LLM 조립 제거.
//   렌더 소비 필드(first_frame/motion 프롬프트·duration·assets)는 L4가 이미 최종본이라 LLM 조립은
//   같은 값을 복사할 뿐이었고(A/B 실측: 렌더 필드 변조 0), LLM만 채우던 메타(hook_type/motif/
//   continuity)는 소비처 0. 제거로 콜 1개·60~160s 절감. 근거: research/experiments/validators/2026-07-21_shotcheck-deterministic/result.md)
// Step 2: Claude로 액션 스코프 + 일관성 검증 (실패 시 split)
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  ShotCheckReport,
  WorldVisual,
  ShotDesign,
  Genre,
  Characters,
  Scenes,
  ShotSequence,
  ShotSequenceItem,
  StoryScene,
  ValidationIssue,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import { buildAssetRegistry, normalizeShotSequenceAssetRefs } from '@/lib/writer/pipeline/util/asset_refs';

interface ClaudeC2ValidationResponse {
  shots_to_split: Array<{ shot_id: string; reason: string; new_shots: ShotSequenceItem[] }>;
  semantic_issues: ValidationIssue[];
}

export async function runShotCheck(
  projectId: string,
  genre: Genre,
  characters: Characters,
  scenes: Scenes,
  worldVisual: WorldVisual,
  shotDesigns: ShotDesign[],
  sceneBudgetIssues: ValidationIssue[],
  logger: PipelineLogger,
  cAxisConfig: LlmAxisConfig,   // C축: 의미/액션 검증 (현재 Claude)
): Promise<{ shotSequence: ShotSequence; report: ShotCheckReport }> {
  await logger.markStage('shotCheck', 'started');

  // ===== Step 1: 결정론 조립 (L4 1개당 ShotSequenceItem 정확히 1개 — shot loss 원천 차단) =====
  if (shotDesigns.length === 0) {
    throw new Error('C2: shotDesigns 비어있음 — 조립할 샷 없음');
  }
  const assembledShots = assembleShotsFromDesigns(shotDesigns, scenes);

  // ===== Step 2: Claude로 샷별 액션 스코프 + 의미 검증 =====
  const valSystem = `당신은 샷 시퀀스의 액션 스코프와 의미적 정합성을 검증한다.

검증 항목:
1. 각 샷의 motion_prompt가 duration_seconds에 들어맞는가?
   - 동사 1~2개 이내
   - 순차 표현("그리고", "그 다음에") 없음
   - 1 주요 + 0~1 보조 액션
2. composition_prompt와 motion_prompt가 일관되는가?
3. 연속성: 인접 샷의 실제 내용(composition/motion 프롬프트 속 의상·소품·조명·공간 묘사)이 서로 모순되는가?
4. 캐릭터 외형/의상 묘사가 asset_version 변화 없이 달라지지 않는가? (판단은 프롬프트 내용 기준)
5. 씬 디시플린: 같은 scene_id 샷들의 V.camera.type 다양성이 합리적인가?

주의 — 메타 부재는 이슈가 아니다: continuity.carry_forward_from / consistent_elements / changes,
C.hook_type / motif_active 같은 메타 필드는 결정론 조립이 채우지 않는다. 이 필드가 비어 있다는 사실
자체를 이슈로 만들지 마라. 연속성 판단은 항상 샷의 실제 프롬프트 내용끼리 대조해서만 한다.

CRITICAL: 명백히 불가능한 샷 → split 권장
WARNING: 약한 일관성, 모호한 프롬프트
INFO: 미세 개선

split 권장 시 new_shots 배열로 분할안 제시 (각각 1 주요 액션).`;

  const valUser = `[샷 시퀀스]
${JSON.stringify(assembledShots, null, 2)}

[출력 형식 - JSON]
{
  "shots_to_split": [
    {
      "shot_id": "shot_X",
      "reason": "string",
      "new_shots": [ /* 분할된 ShotSequenceItem 배열 */ ]
    }
  ],
  "semantic_issues": [
    {
      "category": "action_budget" | "continuity" | "verisimilitude",
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "location": "shot_id",
      "message": "string",
      "suggestion": "string (optional)"
    }
  ]
}`;

  let valResult: ClaudeC2ValidationResponse;
  try {
    const valRaw = await generateJson<unknown>(valUser, cAxisConfig, {
      systemInstruction: valSystem,
      temperature: 0.3,
      maxTokens: 16000,
    });
    await logger.saveLlmCall('shotCheck_validate', {
      prompt: valUser,
      response: JSON.stringify(valRaw, null, 2),
      model: describeAxisConfig(cAxisConfig),
      provider: cAxisConfig.provider,
    });
    // 방어: shape 보정 (array 래핑/필드 누락 대응)
    const v = (Array.isArray(valRaw) && valRaw.length === 1 ? valRaw[0] : valRaw) as Record<string, unknown> | null;
    valResult = {
      shots_to_split: Array.isArray(v?.shots_to_split) ? (v!.shots_to_split as ClaudeC2ValidationResponse['shots_to_split']) : [],
      semantic_issues: Array.isArray(v?.semantic_issues) ? (v!.semantic_issues as ClaudeC2ValidationResponse['semantic_issues']) : [],
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await logger.saveLlmCall('shotCheck_validate_FAILED', {
      prompt: valUser,
      response: `ERROR: ${msg}`,
      model: describeAxisConfig(cAxisConfig),
      provider: cAxisConfig.provider,
    });
    console.error('[C2_validate] 검증 실패, 분할 없이 진행:', msg);
    valResult = { shots_to_split: [], semantic_issues: [] };
  }

  // ===== Step 3: 분할 적용 + shot_id 재정렬 =====
  let finalShots = [...assembledShots];
  let splitCount = 0;
  for (const split of valResult.shots_to_split) {
    const idx = finalShots.findIndex((s) => s.shot_id === split.shot_id);
    if (idx === -1) continue;
    // (#long-writer-run 2026-07-15) Claude 분할안(new_shots)이 S/V 등 필수 블록을 빼먹는
    //   경우가 실측됨(47a62d1d: S 누락 4샷) → persistShotsToDb가 it.S.scene_id에서 죽는다.
    //   누락 블록은 원본 샷에서 결정론 상속해 스키마를 보장한다.
    const original = finalShots[idx];
    const patched = split.new_shots.map((ns) => ({
      ...ns,
      S: ns.S ?? original.S,
      C: ns.C ?? original.C,
      V: ns.V ?? original.V,
      assets: ns.assets ?? original.assets,
      first_frame_generation: ns.first_frame_generation ?? original.first_frame_generation,
      video_generation: ns.video_generation ?? original.video_generation,
      duration_seconds: ns.duration_seconds ?? original.duration_seconds,
      continuity: ns.continuity ?? original.continuity,
      action_budget: ns.action_budget ?? original.action_budget,
    }));
    finalShots.splice(idx, 1, ...patched);
    splitCount += patched.length - 1;
  }

  finalShots = finalShots.map((shot, i) => ({
    ...shot,
    shot_id: `shot_${i + 1}`,
  }));
  finalShots = finalShots.map((shot, i) => ({
    ...shot,
    C: {
      ...shot.C,
      causal_link: {
        from: i === 0 ? null : finalShots[i - 1].shot_id,
        to: i === finalShots.length - 1 ? null : finalShots[i + 1]?.shot_id ?? null,
      },
    },
  }));

  // ===== Step 3.5: asset reference 정규화 (Layer 1 — 결정론적 안전망) =====
  // LLM이 발명한/버전접미사 붙은 reference를 canonical asset ID로 강제. 미해결은 drop + 이슈.
  // 모델이 무엇을 뱉든 L5/L6엔 실재하는 asset ID만 도달하게 보장한다.
  const assetRegistry = buildAssetRegistry(characters, worldVisual);
  const sceneLocationById = new Map<string, string>(scenes.scenes.map((sc) => [sc.scene_id, sc.location]));
  const assetNorm = normalizeShotSequenceAssetRefs(finalShots, assetRegistry, sceneLocationById);
  finalShots = assetNorm.shots;

  const totalDuration = finalShots.reduce((sum, s) => sum + s.duration_seconds, 0);

  const shotSequence: ShotSequence = {
    project_id: projectId,
    total_shots: finalShots.length,
    total_duration_seconds: totalDuration,
    depth_level: genre.depth_level,
    shots: finalShots,
  };

  const allIssues = [...sceneBudgetIssues, ...valResult.semantic_issues, ...assetNorm.issues];
  const hasCritical = allIssues.some((i) => i.severity === 'CRITICAL');

  const report: ShotCheckReport = {
    passed: !hasCritical,
    issues: allIssues,
    shots_split_count: splitCount,
    total_action_violations_fixed: valResult.shots_to_split.length,
  };

  await logger.saveStage('12_c2_shotCheck.json', report);
  await logger.saveStage('13_c2_shotSequence.json', shotSequence);
  await logger.markStage('shotCheck', 'completed', {
    final_shot_count: finalShots.length,
    split_count: splitCount,
    asset_refs_dropped: assetNorm.droppedCount,
  });

  return { shotSequence, report };
}
// L4 ShotDesign[] → ShotSequenceItem[] 결정론 조립. 입력 1개당 정확히 1개 보장 (shot loss 원천 차단).
// static_spec.first_frame_prompt / dynamic_spec.motion_prompt 는 이미 최종 렌더 프롬프트라 LLM 없이
// 렌더 입력을 온전히 확보한다 (E12b 실측: LLM 조립판과 렌더 필드 완전 동일, 변조 0).
export function assembleShotsFromDesigns(shotDesigns: ShotDesign[], scenes: Scenes): ShotSequenceItem[] {
  const sceneById = new Map(scenes.scenes.map((sc) => [sc.scene_id, sc]));
  return shotDesigns.map((d) => buildShotSequenceItemFromDesign(d, sceneById.get(d.intent.scene_id)));
}

// L4 ShotDesign → ShotSequenceItem 결정론적 매퍼.
// static_spec.first_frame_prompt / dynamic_spec.motion_prompt 는 이미 최종 프롬프트라
// LLM 없이도 렌더 입력을 온전히 확보한다. S/C/V 메타는 L4 로부터 근사 채움.
function buildShotSequenceItemFromDesign(
  design: ShotDesign,
  scene: StoryScene | undefined,
): ShotSequenceItem {
  const st = design.static_spec;
  const dyn = design.dynamic_spec;

  const characters = (st.character_blocking ?? []).map((b) => ({
    id: b.character_id,
    asset_version: b.asset_version || 'v1',
    visible_parts: ['full'],
  }));
  const locationId = scene?.location ?? '';
  const locations = locationId ? [{ id: locationId, asset_version: 'a' }] : [];
  const props = (st.prop_placement ?? []).map((p) => ({ id: p.prop, asset_version: 'v1' }));
  const motionCount = (dyn.character_motion ?? []).length;
  const cameraType = dyn.camera_motion?.type ?? 'static';

  return {
    shot_id: design.intent.shot_id,
    duration_seconds: design.intent.duration_seconds,
    S: {
      scene_id: design.intent.scene_id,
      scene_purpose: scene?.purpose ?? design.intent.dramatic_purpose,
      emotion_beat: scene?.emotion_beat ?? { start: '', end: '' },
      character_action: design.intent.dramatic_purpose,
      // #dialogue-v4: 옛 dialogue_summary 폴백 폐기 — 샷 대사는 dialogue 스테이지가 전담.
    },
    C: {
      // causal_link 는 호출부 Step 3 에서 순서 기반으로 재계산됨.
      causal_link: { from: null, to: null },
      info_disclosure: design.intent.dramatic_purpose,
    },
    V: {
      camera: { type: st.shot_type, angle: st.camera_angle, movement: cameraType },
      lighting: {
        key_fill_ratio: st.lighting?.key_fill_ratio ?? '',
        color_temp: st.lighting?.color_temp_kelvin ? `${st.lighting.color_temp_kelvin}K` : '',
      },
      composition: st.framing?.focal_point ?? '',
      mood: st.color_grading_intent ?? '',
    },
    assets: { characters, locations, props },
    first_frame_generation: {
      base_assets: [...characters.map((c) => c.id), ...locations.map((l) => l.id)],
      composition_prompt: st.first_frame_prompt,
    },
    video_generation: { motion_prompt: dyn.motion_prompt },
    action_budget: {
      primary_action_count: 1,
      secondary_action_count: motionCount > 1 ? 1 : 0,
      camera_movement_complexity:
        cameraType === 'static' ? 'none' : dyn.camera_motion?.magnitude === 'large' ? 'complex' : 'simple',
      environmental_changes: (dyn.environmental_change ?? []).length,
      passed_validation: true,
    },
    continuity: {
      carry_forward_from: null,
      consistent_elements: [],
      changes: [],
      is_scene_transition: design.intent.shot_position_in_scene === 'opening',
    },
  };
}
