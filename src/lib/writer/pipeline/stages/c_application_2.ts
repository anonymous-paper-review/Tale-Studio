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
  ShotCheckNote,
  StoryScene,
  ValidationIssue,
  DecoupagePlan,
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
  // #p2-wiring 2026-08-04: 표시문(action_description) 소스 — 데쿠파주의 구체 액션(beat_summary).
  //   null 이면(구 state resume) 기존 폴백 사슬로 동작.
  decoupage: DecoupagePlan | null,
  sceneBudgetIssues: ValidationIssue[],
  logger: PipelineLogger,
  cAxisConfig: LlmAxisConfig,   // C축: 의미/액션 검증 (현재 Claude)
): Promise<{ shotSequence: ShotSequence; report: ShotCheckReport }> {
  await logger.markStage('shotCheck', 'started');

  // ===== Step 1: 결정론 조립 (L4 1개당 ShotSequenceItem 정확히 1개 — shot loss 원천 차단) =====
  if (shotDesigns.length === 0) {
    throw new Error('C2: shotDesigns 비어있음 — 조립할 샷 없음');
  }
  const beatByShotId = new Map<string, { en: string; native?: string }>();
  for (const sc of decoupage?.scenes ?? []) {
    for (const sh of sc.shots) {
      beatByShotId.set(sh.shot_id, { en: sh.beat_summary, native: sh.beat_summary_native });
    }
  }
  const assembledShots = assembleShotsFromDesigns(shotDesigns, scenes, beatByShotId);

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

CRITICAL/WARNING 이슈에는 constraint 필드를 반드시 포함하라 — 그 샷의 이미지/영상 생성 모델에
그대로 주입할 명령형 영어 한 문장으로, 샷이 지켜야 할 '시각적 사실'만 담는다
(예: "The blueprints are tucked inside her vest, not held in her hands.").
카메라 용어·연출 의도가 아니라 화면에 보여야 하는 상태를 서술한다. INFO 는 constraint 생략.

split 권장 시 new_shots 배열로 분할안 제시 (각각 1 주요 액션). 각 new_shot 에는 S 블록을
반드시 포함하고, S.character_action 에는 그 반쪽이 담는 구체 행동을 써라 (부모 문장 복사 금지).`;

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
      "suggestion": "string (optional)",
      "constraint": "string — imperative EN sentence of the visual fact this shot must keep (required for CRITICAL/WARNING)"
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
  let finalShots: WorkingShot[] = [...assembledShots];
  let splitCount = 0;
  for (const split of valResult.shots_to_split) {
    const idx = finalShots.findIndex((s) => s.shot_id === split.shot_id);
    if (idx === -1) continue;
    // (#long-writer-run 2026-07-15) Claude 분할안(new_shots)이 S/V 등 필수 블록을 빼먹는
    //   경우가 실측됨(47a62d1d: S 누락 4샷) → persistShotsToDb가 it.S.scene_id에서 죽는다.
    //   누락 블록은 원본 샷에서 결정론 상속해 스키마를 보장한다.
    const original = finalShots[idx];
    const patched = buildSplitChildren(original, split.shot_id, split.new_shots);
    finalShots.splice(idx, 1, ...patched);
    splitCount += patched.length - 1;
  }

  // #p2-wiring 채널1: CRITICAL/WARNING constraint 를 해당 샷에 부착 — 리넘버 *전* id 공간에서
  //   매칭해야 한다 (이슈 location = Claude 가 본 조립 시퀀스의 id).
  finalShots = attachCheckNotes(finalShots, valResult.semantic_issues);

  // 리넘버 + (분할 전 id → 분할 후 id) 매핑 — report 의 이슈 location 을 최종 id 로 재표기.
  const preToPost = new Map<string, string[]>();
  finalShots = finalShots.map((shot, i) => {
    const post = `shot_${i + 1}`;
    for (const pre of [shot.shot_id, shot._splitFrom]) {
      if (!pre) continue;
      preToPost.set(pre, [...(preToPost.get(pre) ?? []), post]);
    }
    const { _splitFrom: _stripped, ...rest } = shot;
    void _stripped;
    return { ...rest, shot_id: post };
  });
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

  // semantic_issues 의 location 은 분할 전 id 공간 — report 에는 최종 id 로 재표기한다.
  //   (sceneBudget/assetNorm 이슈는 각각 씬 id/최종 id 공간이라 재매핑 대상이 아님.)
  const semanticRemapped = valResult.semantic_issues.map((issue) => {
    const post = preToPost.get(issue.location);
    return post?.length ? { ...issue, location: post.join('+') } : issue;
  });
  // #p2-pacing T3: 사이즈 급전환 결정론 검출 — report 전용(constraint 없음 → check_notes 미부착,
  //   생성 프롬프트를 오염시키지 않는다). 사람 채널(Phase 3)과 후속 튜닝의 계측 소스.
  const ladderIssues = detectLadderJumpIssues(finalShots);
  const allIssues = [...sceneBudgetIssues, ...semanticRemapped, ...assetNorm.issues, ...ladderIssues];
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
// 분할 처리 중 임시 태그를 얹은 작업용 샷 (저장 전 리넘버에서 태그 제거).
type WorkingShot = ShotSequenceItem & { _splitFrom?: string };

/**
 * 분할안(new_shots) → 자식 샷 조립. (#p2-split-siblings 2026-08-05 — 실측: shot_3/4 러프 동일 그림)
 *   - S 누락 시 부모 복제 대신 자식 자신의 서술로 표시문 개별화 (T4).
 *   - design_ref/static_spec 은 **첫 자식만** 상속 — 부모의 첫 프레임 스펙은 통상 첫 자식의
 *     시작 순간이다. 나머지 자식이 같은 스펙을 공유하면 러프가 같은 그림을 두 번 그린다(F2).
 *     둘째부터는 자기 액션 텍스트 기반(db_fallback)으로 — 차별화를 구조로 보장.
 */
export function buildSplitChildren(
  original: WorkingShot,
  parentId: string,
  newShots: ShotSequenceItem[],
): WorkingShot[] {
  return newShots.map((ns, childIdx) => ({
    ...ns,
    S: ns.S ?? {
      ...original.S,
      character_action:
        ns.video_generation?.motion_prompt?.trim() ||
        ns.first_frame_generation?.composition_prompt?.trim() ||
        original.S.character_action,
    },
    C: ns.C ?? original.C,
    V: ns.V ?? original.V,
    assets: ns.assets ?? original.assets,
    first_frame_generation: ns.first_frame_generation ?? original.first_frame_generation,
    video_generation: ns.video_generation ?? original.video_generation,
    duration_seconds: ns.duration_seconds ?? original.duration_seconds,
    continuity: ns.continuity ?? original.continuity,
    action_budget: ns.action_budget ?? original.action_budget,
    // provenance 는 시스템 소유 필드 — 모델이 new_shots 에 부모 값을 복사해 와도 무시한다
    //   (실측 92948d6f: sol 이 design_ref 를 에코해 F2 를 우회 → 형제 중복 재발).
    design_ref: childIdx === 0 ? original.design_ref : undefined,
    static_spec: childIdx === 0 ? original.static_spec : undefined,
    // 이슈 location(분할 전 id) 매칭용 임시 태그 — 리넘버에서 제거.
    _splitFrom: parentId,
  }));
}

// 사이즈 사다리 — decoupage 프롬프트의 규칙과 같은 표. 비거리형(OTS/POV/2S)은 중간값 취급.
const SIZE_LADDER: Record<string, number> = {
  ECU: 0, BCU: 0, CU: 1, MCU: 2, OTS: 2, POV: 2, MS: 3, '2S': 3,
  MFS: 4, MLS: 4, FS: 4, WS: 5, LS: 5, EWS: 6, ELS: 6,
};

/**
 * 급전환 결정론 검출(#p2-pacing T3): 같은 씬 인접 샷의 사이즈 사다리 점프 ≥3 을 WARNING 으로.
 *   인서트 문법(급접근 CU/ECU 후 즉시 원 사이즈 복귀)은 면제 — 동기 있는 점프이기 때문.
 *   constraint 를 달지 않아 report 전용이다 (급전환은 설계 사실이라 생성 프롬프트로 못 고친다).
 */
export function detectLadderJumpIssues(shots: ShotSequenceItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rung = (s: ShotSequenceItem | undefined) =>
    s ? SIZE_LADDER[String(s.V?.camera?.type ?? '').toUpperCase()] : undefined;
  for (let i = 1; i < shots.length; i += 1) {
    const prev = shots[i - 1];
    const cur = shots[i];
    if (prev.S?.scene_id !== cur.S?.scene_id) continue; // 씬 경계 전환은 정상
    const a = rung(prev);
    const b = rung(cur);
    if (a === undefined || b === undefined) continue;
    const jump = Math.abs(a - b);
    if (jump < 3) continue;
    // 인서트 문법 면제 — 진입 다리(원 사이즈→CU/ECU, 다음 샷이 원 사이즈로 복귀)와
    //   복귀 다리(CU/ECU→원 사이즈, 직전-직전 샷이 그 원 사이즈) 둘 다.
    const next = shots[i + 1];
    const nb = next && next.S?.scene_id === cur.S?.scene_id ? rung(next) : undefined;
    const isInsertEntry = b <= 1 && nb !== undefined && Math.abs(a - nb) <= 1;
    const beforePrev = shots[i - 2];
    const pb =
      beforePrev && beforePrev.S?.scene_id === cur.S?.scene_id ? rung(beforePrev) : undefined;
    const isInsertReturn = a <= 1 && pb !== undefined && Math.abs(pb - b) <= 1;
    if (isInsertEntry || isInsertReturn) continue;
    issues.push({
      category: 'cinematography',
      severity: 'WARNING',
      location: `${prev.shot_id}→${cur.shot_id}`,
      message: `샷 사이즈 급전환 (${prev.V?.camera?.type}→${cur.V?.camera?.type}, ${jump}단계) — 동기 없는 점프는 공간 감각을 깬다.`,
      suggestion: '중간 사이즈 경유 또는 인서트/POV 동기 명시',
    });
  }
  return issues;
}

/**
 * shotCheck 채널1(#p2-wiring): CRITICAL/WARNING + constraint 이슈를 해당 샷에 check_notes 로 부착.
 *   매칭은 분할 전 id 공간 — 샷의 shot_id 또는 _splitFrom(분할 자식의 부모 id)과 location 일치.
 *   INFO/constraint 부재는 부착하지 않는다 (오탐 노이즈가 생성 프롬프트를 오염시키지 않게).
 */
export function attachCheckNotes<T extends ShotSequenceItem & { _splitFrom?: string }>(
  shots: T[],
  issues: ValidationIssue[],
): T[] {
  const notesByPreId = new Map<string, ShotCheckNote[]>();
  for (const issue of issues) {
    if (issue.severity === 'INFO') continue;
    const constraint = issue.constraint?.trim();
    if (!constraint) continue;
    const list = notesByPreId.get(issue.location) ?? [];
    list.push({ category: issue.category, severity: issue.severity, constraint });
    notesByPreId.set(issue.location, list);
  }
  if (notesByPreId.size === 0) return shots;
  return shots.map((shot) => {
    // F1(#p2-split-siblings): 분할 부모의 action_budget 이슈는 자식에게 상속하지 않는다 —
    //   분할 자체가 그 이슈의 수정이다. "either A or B" 제약이 두 자식 모두에 주입돼
    //   같은 그림을 두 번 그리게 하던 실측 결함(shot_3/4). continuity 등은 상속 유지.
    const inherited = shot._splitFrom
      ? (notesByPreId.get(shot._splitFrom) ?? []).filter((n) => n.category !== 'action_budget')
      : [];
    const notes = [...(notesByPreId.get(shot.shot_id) ?? []), ...inherited];
    if (!notes.length) return shot;
    return { ...shot, check_notes: [...(shot.check_notes ?? []), ...notes] };
  });
}

// L4 ShotDesign[] → ShotSequenceItem[] 결정론 조립. 입력 1개당 정확히 1개 보장 (shot loss 원천 차단).
// static_spec.first_frame_prompt / dynamic_spec.motion_prompt 는 이미 최종 렌더 프롬프트라 LLM 없이
// 렌더 입력을 온전히 확보한다 (E12b 실측: LLM 조립판과 렌더 필드 완전 동일, 변조 0).
export function assembleShotsFromDesigns(
  shotDesigns: ShotDesign[],
  scenes: Scenes,
  // #p2-wiring: shot_id → 데쿠파주 구체 액션 (표시문 소스). 미제공(구 resume)이면 폴백 사슬.
  beatByShotId: Map<string, { en: string; native?: string }> = new Map(),
): ShotSequenceItem[] {
  const sceneById = new Map(scenes.scenes.map((sc) => [sc.scene_id, sc]));
  return shotDesigns.map((d) =>
    buildShotSequenceItemFromDesign(d, sceneById.get(d.intent.scene_id), beatByShotId.get(d.intent.shot_id)),
  );
}

// L4 ShotDesign → ShotSequenceItem 결정론적 매퍼.
// static_spec.first_frame_prompt / dynamic_spec.motion_prompt 는 이미 최종 프롬프트라
// LLM 없이도 렌더 입력을 온전히 확보한다. S/C/V 메타는 L4 로부터 근사 채움.
function buildShotSequenceItemFromDesign(
  design: ShotDesign,
  scene: StoryScene | undefined,
  beat?: { en: string; native?: string },
): ShotSequenceItem {
  const st = design.static_spec;
  const dyn = design.dynamic_spec;

  // 표시문 소스 랭킹(#p2-wiring W3): 데쿠파주 구체 액션(유저 언어 → EN) → motion_prompt(EN 구체 동작)
  //   → dramatic_purpose(추상 의도 — 최후 폴백). 25샷 중 20샷이 "충격을 안긴다"류 의도문으로
  //   표시·생성되던 원인이 이 자리의 dramatic_purpose 직결이었다 (진단: lab/previz-quality).
  const characterAction =
    beat?.native?.trim() || beat?.en?.trim() || dyn.motion_prompt?.trim() || design.intent.dramatic_purpose;

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
    // #p2-wiring: 러프보드 rich spec 조인용 provenance + persist 가 운반할 static_spec 원본.
    design_ref: design.intent.shot_id,
    static_spec: st,
    S: {
      scene_id: design.intent.scene_id,
      scene_purpose: scene?.purpose ?? design.intent.dramatic_purpose,
      emotion_beat: scene?.emotion_beat ?? { start: '', end: '' },
      character_action: characterAction,
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
