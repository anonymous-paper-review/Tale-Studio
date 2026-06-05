// C 적용 ②: L4 (3분할) → ShotSequenceItem composing + 의미 검증
// Step 1: Gemini로 L4a/b/c → ShotSequenceItem 조립 (S/C/V 메타 추가)
// Step 2: Claude로 액션 스코프 + 일관성 검증 (실패 시 split)
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import type {
  CValidation2Report,
  L0Visual,
  L1Style,
  L2Design,
  L3SceneVisualPlan,
  L4Shot,
  S0Genre,
  S1Structure,
  S2Block,
  S3Block,
  ShotSequence,
  ShotSequenceItem,
  ValidationIssue,
} from '@/lib/svc/types/pipeline';
import type { PipelineLogger } from '@/lib/svc/logger';
import { buildAssetRegistry, normalizeShotSequenceAssetRefs } from '@/lib/svc/pipeline/util/asset_refs';

interface ShotSequenceGenResponse {
  shots: ShotSequenceItem[];
}

interface ClaudeC2ValidationResponse {
  shots_to_split: Array<{ shot_id: string; reason: string; new_shots: ShotSequenceItem[] }>;
  semantic_issues: ValidationIssue[];
}

export async function runCApplication2(
  projectId: string,
  s0: S0Genre,
  s1: S1Structure,
  s2: S2Block,
  s3: S3Block,
  l0: L0Visual,
  l1: L1Style,
  l2: L2Design,
  l3ScenePlans: L3SceneVisualPlan[],
  l4Shots: L4Shot[],
  l3BudgetIssues: ValidationIssue[],
  logger: PipelineLogger,
  vAxisConfig: LlmAxisConfig,   // V축: 샷 시퀀스 조립 (현재 Gemini)
  cAxisConfig: LlmAxisConfig,   // C축: 의미/액션 검증 (현재 Claude)
): Promise<{ shotSequence: ShotSequence; report: CValidation2Report }> {
  await logger.markStage('C2_application', 'started');

  // ===== Step 1: Gemini로 L4 → ShotSequenceItem 조립 =====
  const genSystem = `당신은 S+V 변환의 마지막 단계 디자이너이다.
L4 (intent + static + dynamic) 3분할 샷을 받아 최종 ShotSequenceItem으로 조립한다.

핵심 원칙:
- L4b.first_frame_prompt는 이미 200~400자로 풍부 → 그대로 사용
- L4c.motion_prompt는 이미 50~80자로 압축 → 그대로 사용
- S/C/V 메타는 L4와 S3 씬 정보를 통해 추가
  · S.scene_id, scene_purpose, emotion_beat, character_action, dialogue
  · C.causal_link, hook_type, motif_active, info_disclosure
  · V.camera/lighting/composition/mood (요약본; 상세는 L4 사용)
- assets는 L4b.character_blocking + L4b.prop_placement에서 추출

asset_version은 L4b.character_blocking[].asset_version 활용.

C.causal_link.from/to: 이전/다음 shot_id (첫/마지막은 null).
C.hook_type (선택): "curiosity_gap" | "incomplete_action" | "interrupted_dialogue" | "unexplained_detail" | "micro_incongruence" | "visual_bait" | "time_pressure" | "promise" | "pattern_break" | "sensory_pull"

continuity.is_scene_transition: 새 씬 시작 샷이면 true (이전 샷과 scene_id 다름).
continuity.carry_forward_from: 이전 샷에서 가져온 시각 요소 (의상/소품/조명).

★ asset reference 규칙 (반드시 준수):
- assets.characters[].id, assets.locations[].id, first_frame_generation.base_assets는 **반드시 아래 [유효 asset ID] 목록의 ID만** 사용한다.
- 목록에 없는 ID를 발명하지 마라 (예: 'cliff_edge', 'demon_king_castle' 같은 임의 로케이션 ID 금지).
- id에 버전 접미사를 붙이지 마라 ('young_hero_v1' 금지). 버전은 asset_version 필드에만 ('v1', 'v2' / 로케이션은 'a').`;

  const genUser = `[S0]
${JSON.stringify(s0)}

[S1.theme]
${s1.theme}

[S2 characters]
${JSON.stringify(s2.characters)}

[S3 scenes (요약)]
${s3.scenes
  .map(
    (sc) =>
      `${sc.scene_id}: purpose="${sc.purpose}", emotion=${sc.emotion_beat.start}→${sc.emotion_beat.end}, dialogue="${sc.dialogue_summary}"`
  )
  .join('\n')}

[L0]
${JSON.stringify(l0)}

[L1]
${JSON.stringify(l1)}

[L2.global_palette]
${JSON.stringify(l2.global_palette)}

[L3 scene plans (요약)]
${l3ScenePlans
  .map(
    (p) =>
      `${p.scene_id}: ${p.coverage_pattern} / lens=${p.lens_vocabulary.join(',')}mm / ${p.camera_mounting}+${p.camera_energy}`
  )
  .join('\n')}

[L4 shots (3분할)]
${JSON.stringify(l4Shots)}

[액션 예산 사전 분석 issues]
${JSON.stringify(l3BudgetIssues)}

[유효 asset ID — assets와 base_assets는 이 ID만 사용 (발명·버전접미사 금지)]
characters: ${s2.characters.map((c) => c.id).join(', ')}
locations: ${l2.locations.map((l) => l.id).join(', ')}

[출력 형식 - JSON]
{
  "shots": [
    {
      "shot_id": "shot_1",
      "duration_seconds": 8,
      "S": {
        "scene_id": "scene_X",
        "scene_purpose": "...",
        "emotion_beat": {"start": "...", "end": "..."},
        "character_action": "L4a.dramatic_purpose 기반",
        "dialogue": "..." (선택)
      },
      "C": {
        "hook_type": "...",
        "causal_link": {"from": null | "shot_X", "to": "shot_Y" | null},
        "motif_active": "..." (선택),
        "info_disclosure": "..."
      },
      "V": {
        "camera": {"type": "MS", "angle": "eye_level", "movement": "static"},
        "lighting": {"key_fill_ratio": "4:1", "color_temp": "3200K"},
        "composition": "L4b.framing 요약",
        "mood": "..."
      },
      "assets": {
        "characters": [{"id": "...", "asset_version": "v1", "visible_parts": ["full"]}],
        "locations": [{"id": "...", "asset_version": "a"}],
        "props": [{"id": "...", "asset_version": "v1", "first_appearance": true}]
      },
      "first_frame_generation": {
        "base_assets": ["..."],
        "composition_prompt": "L4b.first_frame_prompt 그대로 (200~400자)"
      },
      "video_generation": {
        "motion_prompt": "L4c.motion_prompt 그대로 (50~80자)"
      },
      "action_budget": {
        "primary_action_count": 1,
        "secondary_action_count": 0,
        "camera_movement_complexity": "none" | "simple" | "complex",
        "environmental_changes": 0,
        "passed_validation": true
      },
      "continuity": {
        "carry_forward_from": null | "shot_X",
        "consistent_elements": ["lighting", "..."],
        "changes": ["camera_angle", "..."],
        "is_scene_transition": false
      }
    }
  ]
}`;

  const genRaw = await generateJson<unknown>(genUser, vAxisConfig, {
    systemInstruction: genSystem,
    temperature: 0.4,
  });

  await logger.saveLlmCall('C2_generate', {
    prompt: genUser,
    response: JSON.stringify(genRaw, null, 2),
    model: describeAxisConfig(vAxisConfig),
    provider: vAxisConfig.provider,
  });

  // 방어: 모델이 다양한 shape으로 응답
  //   ① { shots: [...] }                ← 기대 형식
  //   ② [{ shots: [...] }]              ← array 래핑
  //   ③ [ { shot_id, S, C, V, ... } ]   ← shots 배열 직접 반환
  //   ④ { shot_sequence: { shots: [...] } } 등 키 이름 변주
  function extractShots(r: unknown): ShotSequenceItem[] {
    if (Array.isArray(r)) {
      if (r.length === 1 && r[0] && typeof r[0] === 'object' && 'shots' in (r[0] as object)) {
        return (r[0] as { shots: ShotSequenceItem[] }).shots;
      }
      if (r.every((x) => x && typeof x === 'object' && ('shot_id' in (x as object) || 'S' in (x as object)))) {
        return r as ShotSequenceItem[];
      }
      throw new Error(`C2 generation unexpected array shape: ${JSON.stringify(r).slice(0, 200)}`);
    }
    if (r && typeof r === 'object') {
      const obj = r as Record<string, unknown>;
      if (Array.isArray(obj.shots)) return obj.shots as ShotSequenceItem[];
      if (obj.shot_sequence && typeof obj.shot_sequence === 'object') {
        const ss = obj.shot_sequence as Record<string, unknown>;
        if (Array.isArray(ss.shots)) return ss.shots as ShotSequenceItem[];
      }
      // 마지막 시도: top-level이 단일 샷이거나 키 변주
      for (const k of Object.keys(obj)) {
        if (Array.isArray(obj[k]) && (obj[k] as unknown[]).every((x) => x && typeof x === 'object' && 'shot_id' in (x as object))) {
          return obj[k] as ShotSequenceItem[];
        }
      }
    }
    throw new Error(`C2 generation unexpected shape: ${JSON.stringify(r).slice(0, 200)}`);
  }

  const genShots = extractShots(genRaw);
  if (!Array.isArray(genShots) || genShots.length === 0) {
    throw new Error('C2 generation produced empty shots');
  }
  const genResult: ShotSequenceGenResponse = { shots: genShots };

  // ===== Step 2: Claude로 샷별 액션 스코프 + 의미 검증 =====
  const valSystem = `당신은 샷 시퀀스의 액션 스코프와 의미적 정합성을 검증한다.

검증 항목:
1. 각 샷의 motion_prompt가 duration_seconds에 들어맞는가?
   - 동사 1~2개 이내
   - 순차 표현("그리고", "그 다음에") 없음
   - 1 주요 + 0~1 보조 액션
2. composition_prompt와 motion_prompt가 일관되는가?
3. 연속성: continuity.consistent_elements가 실제로 일관되는가?
4. 캐릭터 외형/의상이 asset_version 변화 없이 묘사가 달라지지 않는가?
5. 씬 디시플린: 같은 scene_id 샷들의 V.camera.type 다양성이 합리적인가?

CRITICAL: 명백히 불가능한 샷 → split 권장
WARNING: 약한 일관성, 모호한 프롬프트
INFO: 미세 개선

split 권장 시 new_shots 배열로 분할안 제시 (각각 1 주요 액션).`;

  const valUser = `[샷 시퀀스]
${JSON.stringify(genResult.shots, null, 2)}

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
    await logger.saveLlmCall('C2_validate', {
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
    await logger.saveLlmCall('C2_validate_FAILED', {
      prompt: valUser,
      response: `ERROR: ${msg}`,
      model: describeAxisConfig(cAxisConfig),
      provider: cAxisConfig.provider,
    });
    console.error('[C2_validate] 검증 실패, 분할 없이 진행:', msg);
    valResult = { shots_to_split: [], semantic_issues: [] };
  }

  // ===== Step 3: 분할 적용 + shot_id 재정렬 =====
  let finalShots = [...genResult.shots];
  let splitCount = 0;
  for (const split of valResult.shots_to_split) {
    const idx = finalShots.findIndex((s) => s.shot_id === split.shot_id);
    if (idx === -1) continue;
    finalShots.splice(idx, 1, ...split.new_shots);
    splitCount += split.new_shots.length - 1;
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
  const assetRegistry = buildAssetRegistry(s2, l2);
  const sceneLocationById = new Map<string, string>(s3.scenes.map((sc) => [sc.scene_id, sc.location]));
  const assetNorm = normalizeShotSequenceAssetRefs(finalShots, assetRegistry, sceneLocationById);
  finalShots = assetNorm.shots;

  const totalDuration = finalShots.reduce((sum, s) => sum + s.duration_seconds, 0);

  const shotSequence: ShotSequence = {
    project_id: projectId,
    total_shots: finalShots.length,
    total_duration_seconds: totalDuration,
    depth_level: s0.depth_level,
    shots: finalShots,
  };

  const allIssues = [...l3BudgetIssues, ...valResult.semantic_issues, ...assetNorm.issues];
  const hasCritical = allIssues.some((i) => i.severity === 'CRITICAL');

  const report: CValidation2Report = {
    passed: !hasCritical,
    issues: allIssues,
    shots_split_count: splitCount,
    total_action_violations_fixed: valResult.shots_to_split.length,
  };

  await logger.saveStage('12_C_application_2.json', report);
  await logger.saveStage('13_shot_sequence.json', shotSequence);
  await logger.markStage('C2_application', 'completed', {
    final_shot_count: finalShots.length,
    split_count: splitCount,
    asset_refs_dropped: assetNorm.droppedCount,
  });

  return { shotSequence, report };
}
