// S0.5 (드라마투르그): 구조(s1) 전에 "재료"를 만든다 — 세계 개발(유도) + 극적 진단.
//
// 동기 (2026-08-10 실측): 씬 수는 러닝타임이 강제하는데(computeSceneBudget) 공간을 넓히는 압력은
//   어디에도 없다 — s3 오픈 로케이션 규칙은 보수적("가능하면 새 장소 금지")이라 세계는 스토리
//   텍스트가 명시한 만큼만 넓어진다. 결과: 17씬/6로케이션(무명 슬롯 3, ruined_city ×5) 무대 반복.
//   이 스테이지는 반대 방향의 압력이다: 전제의 작동 메커니즘에서 무대를 *유도*해 후보 인벤토리를
//   만들고, 하류(s1 컨텍스트 · s3 무대 후보)에 재료로 공급한다.
//
// 원칙:
//   - 발명 금지, 유도만 — "N분이면 무대 M개" 같은 쿼터 없음. 긴 러닝타임일수록 메커니즘을 깊이
//     파서 무대가 *자연히* 늘어난다 (짧은 이야기는 무대가 적은 게 맞다).
//   - 심화만: 모든 무대 후보는 핵심 엔진의 필요조건이어야 한다. 새 메커니즘을 여는 무대(확장) 금지.
//   - 스토리 원천 불변 (architecture.md §5): 산출물은 스토리를 고치지 않고 *옆*의 파생 재료로
//     하류에 합류한다. 무대 후보는 월드에 직접 삽입하지 않는다 — s3 프롬프트의 후보 블록으로만
//     주입하고, 씬이 실제로 채택한 무대만 mergeOpenWorld 를 타고 월드에 들어온다
//     (미채택 후보는 v2 디자인·배경 생성 비용을 태우지 않는다).
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { DramaturgySchema } from '@/lib/writer/pipeline/schemas';
import type {
  Genre,
  Characters,
  PipelineInput,
  Dramaturgy,
  DramaturgyStageCandidate,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runDramaturgy(
  input: PipelineInput,
  genre: Genre,
  characters: Characters,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<Dramaturgy> {
  await logger.markStage('dramaturgy', 'started');

  const systemInstruction = `당신은 작가실의 드라마투르그(dramaturg)이다.
구조를 잡기 전에, 주어진 스토리가 목표 러닝타임을 버틸 "재료"를 만든다. 작업은 두 가지다.

== 1. 세계 개발 — 유도만, 발명 금지 ==
- 먼저 이 스토리를 실제로 굴리는 **핵심 엔진**(중심 사건/장치/공방)을 한 문장으로 찾는다.
- 그 엔진이 현실에서 작동하는 방식을 조사한다(검색 활용): 절차·이해관계자·물리적 현장.
  예: "법정 공방 + 방산 비리"라면 — 방산 비리가 실제로 저질러지는 방식들(시험성적서 조작,
  원가 부풀리기, 로비...)을 나열하고, 각 방식이 **반드시 지나가는 물리적 장소**(시험장,
  부품 창고, 회계 사무실, 요정/골프장...)를 유도한다.
- 무대 후보는 전부 핵심 엔진의 필요조건이어야 한다. 엔진과 무관한 "재밌어 보이는 장소"
  (새 메커니즘을 여는 확장)는 금지. "이 무대를 지우면 엔진의 어느 단계가 화면에 못 나오는가"에
  답할 수 없는 무대는 버려라 (derived_from 에 그 답을 쓴다).
- 개수 쿼터 없음: 짧은 이야기는 무대가 적은 게 맞다. 러닝타임이 길수록 엔진의 메커니즘을
  더 깊이 파라 — 무대는 그 결과로 자연히 늘어난다.
- [기존 로케이션]에 이미 있는 장소는 다시 제안하지 않는다. 스토리에 이미 명시된 장소도
  world_inventory 가 아니라 mechanism_notes 에서만 언급한다.

== 2. 극적 진단 ==
- stakes: 주인공이 잃을 것이 화면에 서 있는가 — 없으면 무엇이 비어 있는지.
- weak_beats: 전개가 얇거나 편의적인 지점 (구체적으로, 스토리 문장을 인용해서).
- cdq_candidates: yes/no 로 답할 수 있는 중심 극적 질문 후보 2~3개.
- ending_check: 스토리의 결말이 그 질문에 실제로 답하는가.

진단은 제안이다 — 스토리를 고쳐 쓰지 마라. 원문은 불변이고, 판단 재료만 만든다.`;

  const userPrompt = `[스토리 — 원문 불변]
${input.story}

[목표 러닝타임]
${input.runtimeSeconds ?? '(미지정)'}초

[genre]
${JSON.stringify({ genre: genre.genre, tone: genre.tone, depth_level: genre.depth_level, targetEmotion: genre.targetEmotion })}

[기존 캐스트]
${
  characters.characters.length
    ? characters.characters.map((c) => `- ${c.id} (${c.name}, ${c.role})`).join('\n')
    : '(없음)'
}

[기존 로케이션 — 재제안 금지]
${
  input.background?.locations.length
    ? input.background.locations
        .map((l) => `- ${l.id}${l.name && l.name !== l.id ? ` (${l.name})` : ''}${l.description ? `: ${l.description}` : ''}`)
        .join('\n')
    : '(없음)'
}

[출력 형식 - JSON]
{
  "core_engine": "이 이야기를 굴리는 실제 사건/장치 한 문장",
  "mechanism_notes": ["엔진이 현실에서 작동하는 방식 — 절차/이해관계자/취약점 (조사 근거 포함)"],
  "world_inventory": [
    {
      "id": "snake_case_slug",
      "name": "표시명 (스토리와 같은 언어)",
      "description": "이 무대의 시각적/기능적 한 줄",
      "derived_from": "엔진의 어느 메커니즘/단계에서 유도됐나",
      "scene_potential": ["이 무대에서 가능한 씬 상황 1~3개"]
    }
  ],
  "dramatic_diagnosis": {
    "stakes": "string",
    "weak_beats": ["string"],
    "cdq_candidates": ["yes/no 질문", ...],
    "ending_check": "string"
  }
}`;

  const result = await generateJson<Dramaturgy>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.7,
    webSearch: true, // #p4-websearch: 메커니즘 조사 — 실존 절차/사례 접지
    // #p4-json-guard: 산출 스키마가 프롬프트 전집합이라 생성 강제까지 켠다(schemas.ts 참조).
    schema: DramaturgySchema,
    enforceSchema: true,
  });

  await logger.saveLlmCall('dramaturgy', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  // 모델은 제안, 검증은 제품 (§3): 기존 로케이션 중복 제거 + 자기 중복 제거 + 방어적 상한.
  const known = new Set<string>();
  for (const l of input.background?.locations ?? []) {
    known.add(l.id.toLowerCase().trim());
    if (l.name) known.add(l.name.toLowerCase().trim());
  }
  const inventory: DramaturgyStageCandidate[] = [];
  for (const c of result.world_inventory ?? []) {
    if (!c?.id || !c.name) continue;
    const keys = [c.id.toLowerCase().trim(), c.name.toLowerCase().trim()];
    if (keys.some((k) => known.has(k))) continue;
    keys.forEach((k) => known.add(k));
    inventory.push({
      id: c.id,
      name: c.name,
      description: c.description ?? '',
      derived_from: c.derived_from ?? '',
      scene_potential: Array.isArray(c.scene_potential) ? c.scene_potential.slice(0, 3) : [],
    });
    if (inventory.length >= 12) break; // 방어적 상한 — 유도가 폭주해도 하류 프롬프트를 넘치게 하지 않는다
  }
  const dramaturgy: Dramaturgy = {
    core_engine: result.core_engine ?? '',
    mechanism_notes: Array.isArray(result.mechanism_notes) ? result.mechanism_notes : [],
    world_inventory: inventory,
    dramatic_diagnosis: {
      stakes: result.dramatic_diagnosis?.stakes ?? '',
      weak_beats: Array.isArray(result.dramatic_diagnosis?.weak_beats) ? result.dramatic_diagnosis.weak_beats : [],
      cdq_candidates: Array.isArray(result.dramatic_diagnosis?.cdq_candidates)
        ? result.dramatic_diagnosis.cdq_candidates
        : [],
      ending_check: result.dramatic_diagnosis?.ending_check ?? '',
    },
  };

  await logger.saveStage('01_s0_dramaturgy.json', dramaturgy);
  await logger.markStage('dramaturgy', 'completed', {
    stage_candidates: dramaturgy.world_inventory.length,
    cdq_candidates: dramaturgy.dramatic_diagnosis.cdq_candidates.length,
  });
  return dramaturgy;
}

// 실패 흡수 래퍼 — 드라마투르그는 "재료"지 크리티컬 패스가 아니다 (dialogue 흡수 선례).
//   generateJson 내장 재시도 후에도 실패하면 run 을 죽이지 않고 null(재료 없음)로 진행한다.
//   실패는 배지로 남긴다 (architecture §5: 빈칸 자율 채움 + 실패는 배지). null 은 하류를 전부
//   침묵시킨다 — s1 진단 블록·s3 후보 블록·mergeOpenWorld candidates 모두 null-graceful.
//   state 에는 null 이 기록돼(JSON 에서 undefined 와 달리 생존) has()=true — 재시도 루프 없음.
export async function runDramaturgySafe(
  input: PipelineInput,
  genre: Genre,
  characters: Characters,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<Dramaturgy | null> {
  try {
    return await runDramaturgy(input, genre, characters, logger, axisConfig);
  } catch (e) {
    console.warn('[dramaturgy] 실패 흡수 — 재료 없이 진행:', e instanceof Error ? e.message : e);
    await logger.markStage('dramaturgy', 'failed', { absorbed: true });
    return null;
  }
}
