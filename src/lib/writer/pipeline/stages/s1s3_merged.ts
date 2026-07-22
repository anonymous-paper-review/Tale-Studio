// S1+S3 병합 (E13b): 내러티브 구조 + 씬 브레이크다운을 한 번의 LLM 호출로 산출.
//
// 배경: S1(구조)과 S3(씬)은 항상 연속 실행되고 S3는 항상 방금 정한 S1 막을 참조한다 —
//   같은 저작 판단을 두 콜로 나눠 act_ref 정합 비용만 발생했다. E13 근사 실험에서
//   두 시스템프롬프트를 기계적으로 합쳐 1콜로 돌리면 접합부(막 커버리지) 위반이 구조적으로
//   사라지고 시간 약 25% 절감이 관측됐다(research/writer/experiments/results/E13-s1s3-merge.md).
//
// 이 파일은 그 근사 실험을 정식 스테이지로 승격한 것이다:
//   ① 프롬프트는 E13에서 실측된 "현행 S1/S3 시스템프롬프트의 기계적 결합"을 그대로 쓴다.
//   ② E13 근사판이 빠뜨렸던 S3 코드 후처리를 전부 이관한다 — 장소 정규화, 장소 표기 오염
//      복원, 막 커버리지 교정, 시간 예산 검증/교정, coverage_mode 설정.
//   ③ 프로덕션 기본 경로는 현행 2콜 그대로. 이 스테이지는 steps.ts 에서 env 게이트
//      (WRITER_MERGE_S1S3=1) 뒤에서만 호출된다.
//
// 정식 통합을 위한 최소 수정(E13 근사판 대비 — 결과 문서 E13b 에 전부 명시):
//   - 후처리 이관(위 ②). 특히 장소 정규화는 normalizeSceneLocations(현행 S3 로직) + 괄호 표기
//     오염 복원을 얹었다. 현행 normalizeSceneLocations 는 "id (표시명)" 통째 복사를 되돌리지
//     못하는 잠복 결함이 있어(E13 실측 오염이 이 경우), 여기서 한 겹 더 복원한다.
//   - 교정(repair) 콜은 narrative_structure 를 고정하고 scenes 만 재배분한다(구조 재결정 금지) —
//     현행 S3 repair 가 narrativeStructure 를 고정하는 것과 동형.
//   - 예산표는 막 수를 호출 전엔 모르므로 computeSceneBudget(genre, 1) — act 하한은 프롬프트의
//     막 커버리지 규칙으로 대체(E13 방법과 동일). 현행 S3 는 실제 막 수를 쓴다.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { computeSceneBudget, renderBudgetBlock, validateSceneBudget, type SceneBudget } from '@/lib/writer/pipeline/budget';
import { SHOT_PHYSICS } from '@/lib/writer/pipeline/physics';
import { normalizeSceneLocations, uncoveredActs } from '@/lib/writer/pipeline/stages/s3_scenes';
import type { Genre, NarrativeStructure, Characters, Scenes, PipelineInput, BackgroundContract, StoryScene, NewCharacter } from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

// 병합 1콜의 원시 출력 형태 — 구조와 씬이 한 응답에 같이 나온다(E13 win: 접합부가 구조적으로 소멸).
interface MergedRaw {
  narrative_structure: NarrativeStructure;
  scenes: StoryScene[];
  total_estimated_seconds: number;
  new_characters?: NewCharacter[];
}

// 장소 표기 오염 복원 (정식 통합 최소 수정): 모델이 로케이션 목록 표기 "id (표시명)" 를 통째
//   복사한 경우(E13 실측: "location (창가의 수면)"), 여는 괄호/콜론 앞 토큰이 기존 로케이션 id 면
//   그 id 로 되돌린다. normalizeSceneLocations(정확 일치)로 안 잡히는 잔여를 처리 — id 로 되돌아갈
//   때만 재작성하므로 정상 산출은 절대 손상하지 않는다(장소 이중 생성 방지, 아키텍처 §3).
function normalizeLocationParentheticals(scenes: Scenes, world: BackgroundContract | undefined): Scenes {
  if (!world?.locations.length) return scenes;
  const idByHead = new Map<string, string>();
  for (const l of world.locations) idByHead.set(l.id.toLowerCase().trim(), l.id);
  let changed = false;
  const fixed = scenes.scenes.map((sc) => {
    const raw = (sc.location ?? '').trim();
    if (!raw) return sc;
    const head = raw.split(/\s*[(:]/)[0].trim(); // "location (창가의 수면)" | "location: desc" → "location"
    const id = idByHead.get(head.toLowerCase());
    if (id && id !== sc.location) {
      changed = true;
      return { ...sc, location: id };
    }
    return sc;
  });
  return changed ? { ...scenes, scenes: fixed } : scenes;
}

// 후처리 파이프라인 진입용: 원시 응답 → 정규화된 Scenes(장소 정규화 + 괄호 오염 복원).
function toNormalizedScenes(raw: MergedRaw, fallbackTotal: number, world: BackgroundContract | undefined): Scenes {
  const s: Scenes = {
    scenes: raw.scenes ?? [],
    total_estimated_seconds: raw.total_estimated_seconds ?? fallbackTotal,
    new_characters: raw.new_characters,
  };
  return normalizeLocationParentheticals(normalizeSceneLocations(s, world), world);
}

// E13 실측 "기계적 결합" 시스템프롬프트 — S1/S3 현행 시스템프롬프트를 합친 것(재현성 위해 그대로).
function buildSystem(genre: Genre, budget: SceneBudget): string {
  return `당신은 영상 제작의 S1+S3(내러티브 구조 + 씬 브레이크다운) 통합 디자이너이다.
주어진 스토리·genre·캐스트/로케이션에서 (1) 구조 유형·POV·주제·CDQ를 결정하고, (2) 같은 판단 안에서 씬 단위 분해까지 한 번에 완성한다.

구조 유형 (우열이 아니라 서로 다른 형태다 — 스토리의 실제 형태에 맞는 것을 고른다):
- 3-act: 설정→대립→해소의 선형 인과. 목표를 향한 갈등이 세워지고 고조됐다 풀릴 때. (막 3개)
- kishōtenketsu (기승전결): 갈등·악당 없이 도입→전개→전환(예상 밖 국면)→여운. 정적·관조·일상·대비가 핵심일 때(동아시아 전통). (막 4개)
- hero's journey: 평범한 세계→모험의 부름→시련·조력자→최대 시험→변화한 채 귀환. 주인공의 성장·변신 여정이 중심일 때.
- non-linear: 시간순이 아닌 배열(회상·플래시포워드·교차 편집). 과거 사건이 현재의 의미를 결정하거나 시점이 뒤섞일 때.
- circular: 끝이 시작으로 돌아오거나 같은 국면이 반복되는 순환. 시간 루프·반복·데자뷔·수미상관이 핵심 장치일 때.

먼저 스토리의 형태를 판별하라: 선형 인과 / 갈등 없는 대비 / 성장 여정 / 시간 비선형 / 반복·순환. 그 형태에 가장 맞는 구조를 고르고, 억지로 3-act에 끼워 맞추지 마라. acts 수는 고른 구조를 따른다(3-act=3, 기승전결=4 등).

CDQ (Central Dramatic Question):
- yes/no로 답할 수 있는 하나의 질문. 1막 끝에 제기되고 클라이맥스에서 답해짐.

깊이 레벨 ${genre.depth_level} 권장:
- D1: 구조 없음 — 한 순간/한 비트. CDQ 생략 가능 / D2: 미니 구조 / D3: 단순 구조 (서브플롯 0)
- D4~D5: 표준 구조 + 서브플롯 1~2개 / D6~D7: 다층 구조 + 서브플롯 다수

씬 목적 분류: exposition / conflict / decision / revelation / transformation / transition / setup / payoff / climax / resolution

정보 비대칭 (Hitchcock): "audience=character" | "audience>character" | "character>audience"

${renderBudgetBlock(budget)}

act 커버리지 (필수):
- 네가 방금 정한 acts의 모든 act_id가 최소 1개 씬의 act_ref로 등장해야 한다 (빠지는 막 금지).
- 따라서 씬 수는 최소 acts 개수 이상. 권장 씬 수와 충돌하면 act 커버리지를 우선한다.
- 가능하면 각 act.proportion 비율로 씬을 분배한다.

scene_actions:
- 씬에서 일어나는 주요 액션을 텍스트로. 한 액션 = 한 샷(${SHOT_PHYSICS.shotSecondsMin}~${SHOT_PHYSICS.shotSecondsMax}초)에 들어가도록 분리해서 작성.
- 씬당 액션 수는 위 시간 예산을 따른다.

오픈 캐스트 규칙 (중요):
- [기존 캐스트]는 producer가 이미 확정한 인물이다. 등장시킬 때 **반드시 주어진 slug 그대로** characters_in_scene에 쓴다.
- 기존 캐스트만으로 전개 가능하면 새 인물을 만들지 말 것 — new_characters는 빈 배열.

오픈 로케이션 규칙 (중요):
- 씬이 [기존 로케이션] 중 한 곳이면 scene.location에 **반드시 그 id를 글자 그대로** 쓴다 (번역·의역·새 이름 금지).
- 기존 로케이션만으로 전개 가능하면 새 장소를 만들지 말 것.`;
}

// E13 실측 "기계적 결합" 유저프롬프트 — S1/S3 유저프롬프트를 합친 출력형식(narrative_structure + scenes).
function buildUser(input: PipelineInput, genre: Genre, characters: Characters, world: BackgroundContract | undefined): string {
  return `[스토리]
${input.story}

[genre]
${JSON.stringify(genre, null, 2)}

[기존 캐스트] (producer 확정 — slug 그대로 사용)
${characters.characters.length ? characters.characters.map((c) => `- ${c.id} (${c.name}, ${c.role})`).join('\n') : '(없음)'}

[기존 로케이션] (producer 확정 — scene.location에 id 그대로 사용)
${world?.locations.length ? world.locations.map((l) => `- ${l.id}${l.name && l.name !== l.id ? ` (${l.name})` : ''}`).join('\n') : '(없음)'}

[출력 형식 - JSON]
{
  "narrative_structure": {
    "structure_type": "string",
    "acts": [{"act_id": "string", "purpose": "string", "proportion": number}],
    "pov": "string", "theme": "string",
    "central_dramatic_question": "string",
    "turning_point_position": number
  },
  "scenes": [
    {"scene_id": "scene_1", "act_ref": "act_id", "location": "string", "time_of_day": "string",
     "characters_in_scene": ["char_id"], "purpose": "string", "emotion_beat": {"start": "string", "end": "string"},
     "dialogue_summary": "string", "key_dialogue": [], "info_asymmetry": "string",
     "estimated_seconds": number, "scene_actions": ["action 1", ...]}
  ],
  "total_estimated_seconds": number,
  "new_characters": []
}`;
}

export async function runStructureScenesMerged(
  input: PipelineInput,
  genre: Genre,
  characters: Characters,
  world: BackgroundContract | undefined,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<{ narrativeStructure: NarrativeStructure; scenes: Scenes }> {
  await logger.markStage('structureScenesMerged', 'started');

  // 예산표: 막 수 미정 → computeSceneBudget(genre, 1)(주입·검증 공통). act 하한은 커버리지 규칙 대체(E13 동일).
  const budget = computeSceneBudget(genre, 1);
  const system = buildSystem(genre, budget);
  const user = buildUser(input, genre, characters, world);

  // 병합 1콜 — 구조와 씬이 한 응답에 같이 나온다(접합부 위반이 구조적으로 소멸).
  const raw = await generateJson<MergedRaw>(user, axisConfig, { systemInstruction: system, temperature: 0.7 });
  await logger.saveLlmCall('structureScenesMerged', {
    prompt: user,
    response: JSON.stringify(raw, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const narrativeStructure: NarrativeStructure = raw.narrative_structure;
  let scenes = toNormalizedScenes(raw, raw.total_estimated_seconds ?? 0, world);

  // 막 커버리지 자기검증(이관): 누락 막이 있으면 구조를 고정한 채 scenes 만 재배분 1회 교정.
  //   커버리지가 더 나은 쪽만 채택(현행 S3 repair 패턴). E13 실측상 8회 전부 0이라 대개 미발동.
  let uncovered = uncoveredActs(scenes, narrativeStructure);
  if (uncovered.length) {
    const repairUser = `${user}

[규칙 위반 교정 — narrative_structure는 아래 [고정 구조] 값을 그대로 유지하고(구조 재결정 금지) scenes만 다시 배분하라.
 다음 막에 씬이 없다: ${uncovered.join(', ')}. 각 막에 최소 1개 씬(act_ref = 해당 act_id)을 포함하도록 동일 JSON 형식으로 다시 출력하라. 씬 수가 늘어도 된다.]
[고정 구조]
${JSON.stringify(narrativeStructure, null, 2)}`;
    const repaired = await generateJson<MergedRaw>(repairUser, axisConfig, { systemInstruction: system, temperature: 0.6 });
    await logger.saveLlmCall('structureScenesMerged_coverage_repair', {
      prompt: repairUser,
      response: JSON.stringify(repaired, null, 2),
      model: describeAxisConfig(axisConfig),
      provider: axisConfig.provider,
    });
    const repairedScenes = toNormalizedScenes(repaired, scenes.total_estimated_seconds, world);
    if (uncoveredActs(repairedScenes, narrativeStructure).length < uncovered.length) {
      scenes = repairedScenes;
      uncovered = uncoveredActs(scenes, narrativeStructure);
    }
  }

  // 시간 예산 자기검증(이관, E3b): honest 모드에서 총합·씬 수·씬 초↔액션 정합 위반 시 구조 고정 1회 교정.
  //   커버리지가 나빠지지 않고 위반이 줄어든 쪽만 채택. representative 모드는 검증 없음(의도된 초과).
  let budgetViolations = validateSceneBudget(scenes, budget);
  if (budgetViolations.length) {
    const budgetRepairUser = `${user}

[시간 예산 위반 교정 — narrative_structure는 아래 [고정 구조] 값을 그대로 유지하고 scenes만 고쳐 동일 JSON 형식으로 다시 출력하라.
${renderBudgetBlock(budget)}]
${budgetViolations.map((x) => `- ${x.scene_id ?? '(전체)'}: ${x.message}`).join('\n')}
[고정 구조]
${JSON.stringify(narrativeStructure, null, 2)}`;
    const budgetRepaired = await generateJson<MergedRaw>(budgetRepairUser, axisConfig, { systemInstruction: system, temperature: 0.5 });
    await logger.saveLlmCall('structureScenesMerged_budget_repair', {
      prompt: budgetRepairUser,
      response: JSON.stringify(budgetRepaired, null, 2),
      model: describeAxisConfig(axisConfig),
      provider: axisConfig.provider,
    });
    const repairedNorm = toNormalizedScenes(budgetRepaired, scenes.total_estimated_seconds, world);
    if (
      uncoveredActs(repairedNorm, narrativeStructure).length <= uncovered.length &&
      validateSceneBudget(repairedNorm, budget).length < budgetViolations.length
    ) {
      scenes = repairedNorm;
      uncovered = uncoveredActs(scenes, narrativeStructure);
      budgetViolations = validateSceneBudget(scenes, budget);
    }
  }

  // coverage_mode는 코드가 설정(LLM 출력 아님) — 하류가 대표 스토리보드 여부를 판별하는 근거.
  scenes = { ...scenes, coverage_mode: budget.mode };

  // 체크포인트 재설계: 병합 1콜 산출을 기존 구조/장면 저장 슬롯 양쪽에 기록 — 하류 스테이지와
  //   재실행 단위가 2콜 때와 동일하게 보인다.
  await logger.saveStage('03_s1_narrativeStructure.json', narrativeStructure);
  await logger.saveStage('05_s3_scenes.json', scenes);
  await logger.markStage('structureScenesMerged', 'completed', {
    scene_count: scenes.scenes.length,
    uncovered_acts: uncovered, // 비어있어야 정상
    budget_mode: budget.mode,
    budget_violations: budgetViolations.length, // honest에서 0이어야 정상(교정 후 잔존)
  });
  return { narrativeStructure, scenes };
}
