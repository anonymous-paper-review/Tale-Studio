// C 적용 ①: S 완료 후 서사 검증
// 룰 기반 (인과 체인) + LLM 기반 (CDQ, 핍진성, 클리셰) 하이브리드
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import { analyzeCausalityChain } from '@/lib/svc/pipeline/validators/causality';
import type {
  CValidation1Report,
  S0Genre,
  S1Structure,
  S2Block,
  S3Block,
  ValidationIssue,
} from '@/lib/svc/types/pipeline';
import type { PipelineLogger } from '@/lib/svc/logger';

interface LlmValidationResponse {
  cdq_present: boolean;
  cdq_clarity_score: number;
  cliche_count: number;
  llm_issues: ValidationIssue[];
}

export async function runCValidation1(
  s0: S0Genre,
  s1: S1Structure,
  s2: S2Block,
  s3: S3Block,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  retryCount = 0,
): Promise<CValidation1Report> {
  await logger.markStage('C1_validation', 'started', { retry: retryCount });

  // ===== 룰 기반 검증 =====
  const causality = analyzeCausalityChain(s3);
  const ruleIssues: ValidationIssue[] = [...causality.issues];

  // ===== LLM 기반 검증 (Claude) =====
  const system = `당신은 영상 서사의 핍진성 검증자이다. 주어진 S0~S3를 보고
다음을 평가한다:

1. CDQ (Central Dramatic Question) 존재 여부와 명확도
   - S1.central_dramatic_question이 존재하는가?
   - 5가지 속성 충족: 명확성, 개인적 stakes, 불확실성, 보편성, 긴급성
   - 0~1 점수

2. 핍진성 (Verisimilitude)
   - 캐릭터 행동이 S2.personality와 일치하는가?
   - 인과 체인이 자연스러운가?
   - 우연이 곤경에서 캐릭터를 빼내는 데우스 엑스 마키나가 있는가?

3. 클리셰 감지
   - 장르 클리셰 (호러=점프스케어 남용, 로맨스=오해 기반 갈등 등)
   - 캐릭터 클리셰 (선택받은 자, 마법 흑인, MPDG 등)
   - 서사 클리셰 (악당이 계획 설명, 1초 전 해제 등)
   - 발견된 클리셰의 개수와 위치

4. 주제 관통
   - S1.theme이 S3 씬들에 일관되게 표현되는가?

CRITICAL: 핍진성 붕괴 (캐릭터 행동 불일치, 데우스 엑스 마키나)
WARNING: CDQ 약함, 인과 약함, 명백한 클리셰
INFO: 미세 개선 제안`;

  const user = `[S0]
${JSON.stringify(s0)}

[S1]
${JSON.stringify(s1)}

[S2]
${JSON.stringify(s2)}

[S3]
${JSON.stringify(s3)}

[출력 형식 - JSON]
{
  "cdq_present": boolean,
  "cdq_clarity_score": number (0~1),
  "cliche_count": number,
  "llm_issues": [
    {
      "category": "causality" | "cdq" | "verisimilitude" | "cliche" | "theme",
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

  await logger.saveLlmCall('C1_validation', {
    prompt: user,
    response: JSON.stringify(llmResult, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  const allIssues = [...ruleIssues, ...llmResult.llm_issues];
  const hasCritical = allIssues.some((i) => i.severity === 'CRITICAL');

  const report: CValidation1Report = {
    passed: !hasCritical,
    issues: allIssues,
    causality_chain: causality.chain,
    cdq_present: llmResult.cdq_present,
    cdq_clarity_score: llmResult.cdq_clarity_score,
    cliche_count: llmResult.cliche_count,
    retry_count: retryCount,
  };

  await logger.saveStage('06_C_validation_1.json', report);
  await logger.markStage('C1_validation', 'completed', {
    passed: report.passed,
    issue_count: report.issues.length,
  });

  return report;
}
