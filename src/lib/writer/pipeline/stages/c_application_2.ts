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
  ShotStaticSpec,
  ShotDynamicSpec,
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

type ShotSplitRequest = ClaudeC2ValidationResponse['shots_to_split'][number];

/** 모델 응답 shape 보정 (array 래핑/필드 누락 대응). */
function coerceValResponse(raw: unknown): ClaudeC2ValidationResponse {
  const v = (Array.isArray(raw) && raw.length === 1 ? raw[0] : raw) as Record<string, unknown> | null;
  return {
    shots_to_split: Array.isArray(v?.shots_to_split) ? (v!.shots_to_split as ShotSplitRequest[]) : [],
    semantic_issues: Array.isArray(v?.semantic_issues) ? (v!.semantic_issues as ValidationIssue[]) : [],
  };
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
   같은 씬 인접 샷에서 배경/공간 앵커(지형지물·구조물)가 이동 설명 없이 통째로 사라지는 것도 모순이다 —
   이 경우 사라진 앵커를 명시적으로 되살리는 constraint 를 달아라 (예: "The ruined cityscape remains visible around the pipes.").
4. 캐릭터 외형/의상 묘사가 asset_version 변화 없이 달라지지 않는가? (판단은 프롬프트 내용 기준)
5. 씬 디시플린: 같은 scene_id 샷들의 V.camera.type 다양성이 합리적인가?

주의 — 메타 부재는 이슈가 아니다: continuity.carry_forward_from / consistent_elements / changes,
C.hook_type / motif_active 같은 메타 필드는 결정론 조립이 채우지 않는다. 이 필드가 비어 있다는 사실
자체를 이슈로 만들지 마라. 연속성 판단은 항상 샷의 실제 프롬프트 내용끼리 대조해서만 한다.

[제약의 전달 위치 — checknote-previz A/B 결과 반영]
constraint는 이미지·영상 생성 모델이 직접 지켜야 하는 **화면에 보이는 사실**을 위한 필드다.
모든 이슈에 constraint_target을 반드시 정한다.
- visual: 한 프레임에서 보이는 상태·배치·행동이며, constraint에 명령형 영어 한 문장을 쓴다.
- text: 대사·내레이션·문장·문법·대명사·화자 표기처럼 글 단계에서만 의미가 있는 문제다.
  constraint는 생략하고 이슈의 message/suggestion에만 남긴다.
- report_only: 생성 프롬프트로 고칠 수 없는 판정·연출 보고 문제다. constraint는 생략한다.

text 또는 report_only 이슈를 시각적인 문장으로 위장하지 마라.
특히 he/his/him, 이름·성별 대명사, 대사 문구, 철자·문법, "누가 말하는가"는 절대로
이미지·영상 constraint가 아니다. 모델이 글 문제를 화면에 억지로 표현하게 만들지 말고 target=text로 둔다.
유효한 visual constraint는 판독기가 화면의 어느 물체·인물·상태를 가리켜 확인할 수 있어야 한다.

CRITICAL: 명백히 불가능한 샷 → split 권장
WARNING: 약한 일관성, 모호한 프롬프트
INFO: 미세 개선
CRITICAL/WARNING 이슈는 실제 결함이면 찾되, visual 이슈에만 constraint를 붙인다. INFO는 constraint를 생략한다.

split 권장 시 new_shots 배열로 분할안 제시 (각각 1 주요 액션). 각 new_shot 에는 S 블록을
반드시 포함하고, S.character_action 에는 그 반쪽이 담는 구체 행동을 써라 (부모 문장 복사 금지).`;
// #output-diet 2026-08-10 (기각): new_shots 를 델타 전용으로 좁히는 실험을 했으나 벽시계 -2.2%
//   (기준 ≥30%)로 기각했다. 근거 — 실측상 shots_to_split 은 출력의 23~24% 뿐이고(나머지 76%는
//   semantic_issues), 모델은 이미 C/V/assets/continuity 를 안 내고 있었다(사실상 델타 상태).
//   델타 스키마는 오히려 first_frame_generation 을 요구해 분할 페이로드를 +20% 키웠다.
//   출력을 더 줄이려면 대상은 분할안이 아니라 semantic_issues 쪽이다.
//   좌표: research/experiments/shotcheck-output-diet/results-{baseline,diet}.json

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
      "constraint_target": "visual" | "text" | "report_only",
      "constraint": "string — constraint_target=visual일 때만, 화면에 보이는 사실을 지키는 명령형 EN 한 문장"
    }
  ]
}`;

  // 단일 콜 (전 샷 한 번에). 씬 단위 fan-out 을 실험했다가 걷어냈다(#shotcheck-fanout 기각,
  //   2026-08-10): 프롬프트를 한 글자도 안 바꿔도 컨텍스트를 씬으로 자르면 모델의 판정 분포가
  //   바뀐다 — 벽시계 +70%(153.6→261.3s), 이슈 3배(57→170), 연속성 7.5배(13→97). 그 WARNING 이
  //   check_notes 로 생성 프롬프트에 주입되므로 품질까지 함께 나빠진다.
  //   "규칙이 씬 로컬이면 절단도 중립"은 규칙의 성질이지 모델 출력의 성질이 아니다.
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
    valResult = coerceValResponse(valRaw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await logger.saveLlmCall('shotCheck_validate_FAILED', {
      prompt: valUser,
      response: `ERROR: ${msg}`,
      model: describeAxisConfig(cAxisConfig),
      provider: cAxisConfig.provider,
    });
    console.error('[C2_validate] 검증 실패, 분할 없이 진행:', msg);
    // ★ 흡수 배지: 이 실패가 state 에 흔적을 남기게 한다. 감사 실측에서 이 경로의 실패가
    //   콘솔에만 남고 state 흔적 0 이었다 — fan-out 과 무관한 위생이라 롤백에서 보존한다.
    await logger.markStage('shotCheck', 'failed', { absorbed: true });
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
    const { _splitFrom: stripped, ...rest } = shot;
    // #dialogue-join: 리넘버 전 id 를 영속화한다 — 대사 트랙(데쿠파주 id 공간)과의 유일한 조인 키.
    //   분할 자식은 부모 id, 그 외는 분할 전 자기 id. (분할 자식의 shot_id 는 모델이 준 값이라
    //   신뢰할 수 없으므로 _splitFrom 을 우선한다.)
    return { ...rest, shot_id: post, source_shot_id: stripped ?? shot.shot_id };
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
  const lastIdx = newShots.length - 1;
  return newShots.map((ns, childIdx) => {
    const ownAction =
      ns.S?.character_action?.trim() ||
      ns.video_generation?.motion_prompt?.trim() ||
      ns.first_frame_generation?.composition_prompt?.trim() ||
      original.S.character_action;
    return {
      ...ns,
      // #output-diet 2026-08-10: new_shots 는 이제 *델타*다 (부모와 달라지는 필드만).
      //   블록 단위 치환(ns.X ?? original.X)이면 부분 S 가 와서 scene_id 가 사라진다 —
      //   델타 병합으로 받는다. 통짜 블록이 와도 스프레드가 전부 덮으므로 구 응답과 호환.
      S: {
        ...original.S,
        ...(ns.S ?? {}),
        character_action: ownAction,
      },
      C: ns.C ?? original.C,
      V: ns.V ?? original.V,
      assets: ns.assets ?? original.assets,
      // 산문 채널(#split-inherit S2 2026-08-12): 둘째부터는 부모 통짜 상속 금지 — 부모의
      //   composition_prompt 는 부모의 START(자식 시점엔 거짓), motion_prompt 는 샷 전체 모션
      //   (자식 몫은 절반)이다. 델타가 안 주면 비운다 — 틀린 산문보다 빈 산문이 낫다
      //   (하류 폴백 사슬이 자기 액션 텍스트로 내려간다). base_assets(정체성)는 상속 유지.
      first_frame_generation:
        childIdx === 0
          ? { ...original.first_frame_generation, ...(ns.first_frame_generation ?? {}) }
          : {
              base_assets:
                ns.first_frame_generation?.base_assets ?? original.first_frame_generation.base_assets,
              composition_prompt: ns.first_frame_generation?.composition_prompt?.trim() ?? '',
            },
      video_generation:
        childIdx === 0
          ? { ...original.video_generation, ...(ns.video_generation ?? {}) }
          : { motion_prompt: ns.video_generation?.motion_prompt?.trim() ?? '' },
      duration_seconds: ns.duration_seconds ?? original.duration_seconds,
      continuity: ns.continuity ?? original.continuity,
      action_budget: ns.action_budget ?? original.action_budget,
      // provenance 는 시스템 소유 필드 — 모델이 new_shots 에 부모 값을 복사해 와도 무시한다
      //   (실측 92948d6f: sol 이 design_ref 를 에코해 F2 를 우회 → 형제 중복 재발).
      design_ref: childIdx === 0 ? original.design_ref : undefined,
      // 구조화 스펙(#split-inherit S1/S3 2026-08-12): 옛 동작은 둘째부터 전면 기아(undefined)
      //   — "훔치지 않기"(#split-spec)의 과잉 처방이었다. 같은-그림 우려(F2)는 시간 의존 필드
      //   (first_frame_prompt·pose)에만 해당하고, 조명·렌즈·레이어·소품은 분할 경계를 넘어
      //   연속이다. 시간 의존만 걷어낸 부분 상속으로 "훔치지도 굶기지도 않는다".
      static_spec:
        childIdx === 0
          ? original.static_spec
          : inheritStaticSpecForSplitChild(original.static_spec, ownAction),
      dynamic_spec: adjustDynamicSpecForSplitChild(
        childIdx === 0
          ? original.dynamic_spec
          : reduceDynamicSpecForSplitChild(original.dynamic_spec, ns, ownAction),
        childIdx,
        lastIdx,
      ),
      // 이슈 location(분할 전 id) 매칭용 임시 태그 — 리넘버에서 제거.
      _splitFrom: parentId,
    };
  });
}

/**
 * 분할 둘째+ 자식의 static_spec 부분 상속 (#split-inherit S1).
 * 유지: 카메라 셋업(렌즈·앵글·DoF)·framing 레이어·조명·소품·팔레트 — 분할 경계를 넘어 연속인 것.
 * 걷음: first_frame_prompt(부모의 START 산문 — 자식 시점엔 거짓) · focal_point(액션 순간에 묶임 —
 *   비우면 러프 셀 빌더의 폴백 사슬이 받는다) · blocking pose(부모의 순간 자세 → 자식 자신의
 *   액션 텍스트로 대체 — db_fallback 이 쓰던 바로 그 텍스트를 rich 채널 안에 앉힌다).
 */
export function inheritStaticSpecForSplitChild(
  parent: ShotStaticSpec | undefined,
  ownAction: string,
): ShotStaticSpec | undefined {
  if (!parent) return undefined;
  return {
    ...parent,
    framing: { ...parent.framing, focal_point: '' },
    character_blocking: (parent.character_blocking ?? []).map((b) => ({
      ...b,
      pose: ownAction,
    })),
    first_frame_prompt: '',
  };
}

/**
 * 분할 둘째+ 자식의 dynamic_spec 축소 계약 (#split-inherit S3).
 * 유지: camera_motion(분할 경계를 넘는 연속 무빙) · environmental_change(환경은 샷 경계 무관).
 * 걷음: character_motion(부모의 동사 = 샷 전체 모션 — 자식 몫이 아님) · gaze_arc(시간 의존).
 * motion_prompt 는 델타가 주면 그것, 아니면 자식 자신의 액션 산문 — 부모 전체 모션 산문 금지.
 */
export function reduceDynamicSpecForSplitChild(
  parent: ShotDynamicSpec | undefined,
  ns: ShotSequenceItem,
  ownAction: string,
): ShotDynamicSpec | undefined {
  if (!parent) return undefined;
  return {
    ...parent,
    character_motion: [],
    gaze_arc: undefined,
    motion_prompt: ns.video_generation?.motion_prompt?.trim() || ownAction,
  };
}

/**
 * 분할 형제의 전환(transition) 재배치 (#split-inherit S3) — 부모의 transition_in 은 첫째의
 * 진입이고 transition_out 은 막내의 퇴장이다. 전면 상속(옛 동작)은 중간 형제에게 둘 다
 * 잘못 부여했다. 소비처 0(리프맵 실측 dead)이라 하류 위험 없는 정합화.
 */
export function adjustDynamicSpecForSplitChild(
  spec: ShotDynamicSpec | undefined,
  childIdx: number,
  lastIdx: number,
): ShotDynamicSpec | undefined {
  if (!spec) return undefined;
  return {
    ...spec,
    transition_in: childIdx === 0 ? spec.transition_in : undefined,
    transition_out: childIdx === lastIdx ? spec.transition_out : undefined,
  };
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
 * shotCheck 채널1(#p2-wiring): visual constraint 이슈만 해당 샷에 부착.
 *   매칭은 분할 전 id 공간 — 샷의 shot_id 또는 _splitFrom(분할 자식)과 location 일치.
 *   text/report_only 이슈와 constraint_target 누락은 판정 보고서에만 남기고 생성 프롬프트를 오염시키지 않는다.
 */
export function attachCheckNotes<T extends ShotSequenceItem & { _splitFrom?: string }>(
  shots: T[],
  issues: ValidationIssue[],
): T[] {
  const notesByPreId = new Map<string, ShotCheckNote[]>();
  for (const issue of issues) {
    if (issue.severity === 'INFO') continue;
    // 실험에서 글 전용 지시(대명사 등)가 이미지 프롬프트로 새어 나왔다.
    // 명시적으로 visual이라고 분류된 이슈만 생성 모델에 전달한다(fail closed).
    if (issue.constraint_target !== 'visual') continue;
    const constraint = issue.constraint?.trim();
    if (!constraint) continue;
    const list = notesByPreId.get(issue.location) ?? [];
    list.push({ constraint_target: 'visual', category: issue.category, severity: issue.severity, constraint });
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
    // #motion-contract: 영상 모션 계약 소스 — persist 가 shots.dynamic_spec 으로 운반.
    dynamic_spec: dyn,
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
