// 영상 길이에 따라 알맞은 이야기 깊이 단계를 정해 일관되게 보여준다
import { describe, expect, it } from 'vitest';
import { depthLevelFromRuntime } from '@/lib/depth';

// 옛 s0_genre.ts의 runtimeSeconds → depth_level 매핑표를 코드화한 순수 함수.
// 경계값(상한 포함)을 고정한다 — 게이트 캐스트 요구치/Compact 판정이 이 경계에 의존.
describe('depthLevelFromRuntime', () => {
  it('영상 길이의 경계마다 약속된 이야기 깊이 단계로 정한다', () => {
    expect(depthLevelFromRuntime(5)).toBe('D1');
    expect(depthLevelFromRuntime(15)).toBe('D1');
    expect(depthLevelFromRuntime(16)).toBe('D2');
    expect(depthLevelFromRuntime(60)).toBe('D2');
    expect(depthLevelFromRuntime(61)).toBe('D3');
    expect(depthLevelFromRuntime(300)).toBe('D3');
    expect(depthLevelFromRuntime(301)).toBe('D4');
    expect(depthLevelFromRuntime(600)).toBe('D4');
    expect(depthLevelFromRuntime(601)).toBe('D5');
    expect(depthLevelFromRuntime(1200)).toBe('D5');
    expect(depthLevelFromRuntime(1201)).toBe('D6');
    expect(depthLevelFromRuntime(1800)).toBe('D6');
    expect(depthLevelFromRuntime(1801)).toBe('D7');
  });

  it('너무 짧거나 긴 영상도 정해진 범위 안의 깊이 단계로 정한다', () => {
    expect(depthLevelFromRuntime(0)).toBe('D1');
    expect(depthLevelFromRuntime(3600)).toBe('D7');
  });
});
