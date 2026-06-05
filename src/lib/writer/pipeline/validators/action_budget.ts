// 액션 복잡도 예산 검사 + 자동 분할
// 1샷 = 5초, 1 주요 액션 + 0~1 보조 액션 + 0~1 환경 변화 + 0~1 카메라 무브
import type { StoryScene, ValidationIssue } from '@/lib/writer/types/pipeline';

const SHOT_DURATION = 5;

export interface ActionAnalysis {
  primary_action_count: number; // 추정
  needs_split: boolean;
  recommended_shots: string[]; // 분할 후 샷별 액션
  issues: ValidationIssue[];
}

/**
 * 씬의 scene_actions 배열을 분석해 5초 한 샷에 들어갈 수 있는지 검증.
 * 휴리스틱:
 *  - 액션 동사 개수가 1~2개면 1샷
 *  - 3개+ 면 분할 필요
 *  - 카메라 무브 + 큰 액션이 함께면 분할 우선
 */
export function analyzeSceneActionBudget(scene: StoryScene): ActionAnalysis {
  const issues: ValidationIssue[] = [];
  const actions = scene.scene_actions ?? [];

  // 액션 개수가 0이면 -- 씬에 활동이 없는 경우 (가능)
  if (actions.length === 0) {
    return {
      primary_action_count: 0,
      needs_split: false,
      recommended_shots: ['(앰비언트 샷, 캐릭터 정적)'],
      issues,
    };
  }

  // 액션 개수 = 추정 샷 수
  // 단, 매우 짧은 액션 두 개는 한 샷에 묶을 수 있음
  const recommendedShots: string[] = [];
  let i = 0;
  while (i < actions.length) {
    const cur = actions[i];
    const next = actions[i + 1];

    // 두 액션이 모두 짧고 자연스럽게 이어진다면 묶음 (휴리스틱: 텍스트 길이)
    const curShort = cur.length < 30;
    const nextShort = next ? next.length < 30 : false;
    const sameSubjectHint = next ? hasSharedSubject(cur, next) : false;

    if (curShort && nextShort && sameSubjectHint) {
      recommendedShots.push(`${cur} + ${next}`);
      i += 2;
    } else {
      recommendedShots.push(cur);
      i += 1;
    }
  }

  const needsSplit = recommendedShots.length > 1;

  if (actions.length >= 4) {
    issues.push({
      category: 'action_budget',
      severity: 'WARNING',
      location: scene.scene_id,
      message: `씬 액션이 ${actions.length}개. 5초 한 샷에 다 못 담음.`,
      suggestion: `${recommendedShots.length}개 샷으로 자동 분할.`,
    });
  }

  // 씬의 estimated_seconds가 액션 수 대비 너무 짧으면 경고
  const minSecondsExpected = recommendedShots.length * 4;
  if (scene.estimated_seconds < minSecondsExpected) {
    issues.push({
      category: 'action_budget',
      severity: 'WARNING',
      location: scene.scene_id,
      message: `estimated_seconds(${scene.estimated_seconds}s)가 액션 수(${recommendedShots.length})에 비해 짧음.`,
      suggestion: `씬 길이를 ${minSecondsExpected}s 이상으로 조정 또는 액션 수 줄이기.`,
    });
  }

  return {
    primary_action_count: recommendedShots.length,
    needs_split: needsSplit,
    recommended_shots: recommendedShots,
    issues,
  };
}

function hasSharedSubject(a: string, b: string): boolean {
  // 매우 단순한 휴리스틱: 첫 단어(주어 후보)가 같으면 같은 주체
  const wordA = a.trim().split(/\s+/)[0];
  const wordB = b.trim().split(/\s+/)[0];
  return wordA === wordB;
}
