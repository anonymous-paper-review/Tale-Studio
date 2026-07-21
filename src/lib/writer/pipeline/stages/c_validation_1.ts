// C 적용 ①: S 완료 후 서사 검증
// 룰 기반 (인과 체인) + LLM 기반 (인과·핍진성, 차별점 보존, CDQ) 하이브리드
// P5 재정의 (E5 2026-07-21): 클리셰는 감점하지 않는다 — 이 제품에서 관습 디폴트는 명세다(독트린 §0-5).
//   감점 대상은 (a) 인과·핍진성 붕괴 (b) 유저 차별점 실종뿐. 1차 측정에서 구판은 정상 산출물 4/4에
//   클리셰 WARNING을 내고 광고 장르 관습(제품 매직 모먼트)을 데우스 엑스 마키나 CRITICAL로 오판했다.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { analyzeCausalityChain } from '@/lib/writer/pipeline/validators/causality';
import type {
  StoryCheckReport,
  Genre,
  NarrativeStructure,
  Characters,
  Scenes,
  ValidationIssue,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

interface LlmValidationResponse {
  cdq_present: boolean;
  cdq_clarity_score: number;
  cliche_count: number;
  llm_issues: ValidationIssue[];
}

export async function runStoryCheck(
  genre: Genre,
  narrativeStructure: NarrativeStructure,
  characters: Characters,
  scenes: Scenes,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  retryCount = 0,
): Promise<StoryCheckReport> {
  await logger.markStage('storyCheck', 'started', { retry: retryCount });

  // ===== 룰 기반 검증 =====
  const causality = analyzeCausalityChain(scenes);
  const ruleIssues: ValidationIssue[] = [...causality.issues];

  // ===== LLM 기반 검증 (Claude) =====
  const system = `당신은 영상 서사의 검증자이다. 주어진 genre·내러티브 구조·캐릭터·씬에서 **진짜 결함만** 찾는다.

검사 원칙 (가장 중요):
- 관습적·전통적·클리셰적 선택은 결함이 아니다 — 이 제품에서 장르 관습 디폴트는 명세다.
  "전형적이다", "많이 본 연출이다", "예측 가능하다"는 이유로는 이슈를 만들지 마라.
- 장르 계약 안의 개입은 정상이다. 예: 광고에서 제품이 인물에게 힘을 주는 매직 모먼트는
  광고 장르의 핵심 관습이지 데우스 엑스 마키나가 아니다. 데우스 엑스 마키나 판정은
  **장르 계약과 무관한 외부 우연**(셋업 없이 등장해 곤경을 대신 해소하는 요소)에만 내린다.

검사 항목:

1. 인과·핍진성 — CRITICAL 후보
   - 감정·행동의 급변에 유발 사건이 있는가 (예: 절망→환희 전환에 매개 부재 = 인과 붕괴)
   - 캐릭터 행동이 주어진 설정(personality가 주어진 경우만)과 정면 모순되는가
   - 장르 계약 밖의 우연이 곤경을 해소하는가 (진짜 데우스 엑스 마키나)

2. 차별점 보존 (category: "differentiator") — CRITICAL 후보
   - narrativeStructure에 명시된 고유 요소(핵심 소품·설정·사건)가 씬에서 실종되거나
     무관한 다른 것으로 대체되었는가 (예: 제품이 할 역할을 외부 요소가 대신함)

3. CDQ — S1.central_dramatic_question 존재 여부와 명확도(0~1 점수). 약해도 WARNING까지만.

4. 주제 관통 — S1.theme이 씬들에 표현되는가. 단절이어도 WARNING까지만.

심각도:
CRITICAL: 인과·핍진성 붕괴, 차별점 실종 — 재생성이 필요한 수준만
WARNING: CDQ 약함, 인과 연결 약함, 주제 단절
INFO: 미세 개선 제안

cliche_count는 참고용 카운트로만 반환한다 — 클리셰를 이유로 llm_issues를 만들지 않는다.`;

  const user = `[genre]
${JSON.stringify(genre)}

[narrativeStructure]
${JSON.stringify(narrativeStructure)}

[characters]
${JSON.stringify(characters)}

[scenes]
${JSON.stringify(scenes)}

[출력 형식 - JSON]
{
  "cdq_present": boolean,
  "cdq_clarity_score": number (0~1),
  "cliche_count": number,
  "llm_issues": [
    {
      "category": "causality" | "cdq" | "verisimilitude" | "differentiator" | "theme",
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "location": "string (예: S2.character_id, S3.scene_id, S1)",
      "message": "string",
      "suggestion": "string (optional)"
    }
  ]
}`;

  const llmResult = await generateJson<LlmValidationResponse>(user, axisConfig, {
    systemInstruction: system,
    temperature: 0.3,
  });

  await logger.saveLlmCall('storyCheck', {
    prompt: user,
    response: JSON.stringify(llmResult, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const allIssues = [...ruleIssues, ...llmResult.llm_issues];
  const hasCritical = allIssues.some((i) => i.severity === 'CRITICAL');

  const report: StoryCheckReport = {
    passed: !hasCritical,
    issues: allIssues,
    causality_chain: causality.chain,
    cdq_present: llmResult.cdq_present,
    cdq_clarity_score: llmResult.cdq_clarity_score,
    cliche_count: llmResult.cliche_count,
    retry_count: retryCount,
  };

  await logger.saveStage('06_c1_storyCheck.json', report);
  await logger.markStage('storyCheck', 'completed', {
    passed: report.passed,
    issue_count: report.issues.length,
  });

  return report;
}
