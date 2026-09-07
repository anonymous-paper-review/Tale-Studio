import { describe, expect, it } from 'vitest';
import { depthLevelFromRuntime } from '@/lib/depth';

// 옛 s0_genre.ts의 runtimeSeconds → depth_level 매핑표를 코드화한 순수 함수.
// 경계값(상한 포함)을 고정한다 — 게이트 캐스트 요구치/Compact 판정이 이 경계에 의존.
describe('depthLevelFromRuntime', () => {
  it('maps boundary seconds to the documented depth levels', () => {
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

  it('clamps below-range and very-long runtimes', () => {
    expect(depthLevelFromRuntime(0)).toBe('D1');
    expect(depthLevelFromRuntime(3600)).toBe('D7');
  });
});
