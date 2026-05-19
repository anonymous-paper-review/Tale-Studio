// 룰 기반 인과 체인 검사
import type { S3Block, ValidationIssue } from '@/lib/types/pipeline';

export interface CausalityChainEntry {
  from: string;
  to: string;
  connector: 'therefore' | 'but' | 'and_then';
}

/**
 * S3 씬 시퀀스의 씬-to-씬 연결을 텍스트 휴리스틱으로 분석.
 * dialogue_summary, purpose, emotion_beat을 기반으로 인과 강도 추정.
 *
 * - therefore: 이전 씬의 결과가 다음 씬을 유발 (감정 비트 변화 + purpose 연결)
 * - but: 합병증/반전 (감정 반전)
 * - and_then: 단순 시간 순서 (의미 연결 약함) ← 핍진성 위험
 */
export function analyzeCausalityChain(s3: S3Block): {
  chain: CausalityChainEntry[];
  issues: ValidationIssue[];
} {
  const chain: CausalityChainEntry[] = [];
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < s3.scenes.length - 1; i++) {
    const cur = s3.scenes[i];
    const next = s3.scenes[i + 1];

    let connector: CausalityChainEntry['connector'] = 'and_then';

    // 휴리스틱:
    // - 감정 비트가 cur.end → next.start로 자연 이어지면 therefore
    // - cur.purpose가 setup/decision이고 next가 payoff/conflict면 therefore
    // - cur.purpose가 transformation이고 next가 새 감정으로 시작하면 therefore
    // - cur.end emotion과 next.start emotion이 정반대면 but
    if (cur.emotion_beat.end === next.emotion_beat.start) {
      connector = 'therefore';
    } else if (
      ['decision', 'revelation', 'transformation', 'setup', 'climax'].includes(cur.purpose) &&
      ['conflict', 'payoff', 'transformation', 'climax', 'resolution'].includes(next.purpose)
    ) {
      connector = 'therefore';
    } else if (cur.emotion_beat.end !== next.emotion_beat.start && cur.emotion_beat.end !== '') {
      // 감정 반전 ≠ 단순 변화. but 후보
      connector = 'but';
    } else {
      connector = 'and_then';
    }

    chain.push({ from: cur.scene_id, to: next.scene_id, connector });

    if (connector === 'and_then') {
      issues.push({
        category: 'causality',
        severity: 'WARNING',
        location: `S3.${cur.scene_id} -> ${next.scene_id}`,
        message: `씬 전환이 단순 시간 순서(and_then)로 보임. 인과 연결이 약함.`,
        suggestion: `${cur.scene_id}의 결과가 ${next.scene_id}을 유발하도록 dialogue_summary나 purpose 조정 권장.`,
      });
    }
  }

  return { chain, issues };
}
