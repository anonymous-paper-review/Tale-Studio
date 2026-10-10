import type { Genre } from '@/lib/writer/types/pipeline';
import { preservedRuntimeSeconds } from '@/lib/writer/script/preserve';
import { depthLevelFromRuntime } from '@/lib/depth';

// #script-preserve 2026-09-17: 시작 요청의 대본 보존 표시 읽기 — 명시적 true 만 인정한다(문자열·누락은 종전 경로).
//   라우트 본문에서 떼어 둔 순수 함수(tests/producer/preserve-script-gate.test.ts).
export function readPreserveScript(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { preserveScript?: unknown }).preserveScript === true;
}

/**
 * 그대로 쓰기의 길이(2026-10-09 오너 "그대로 영상화를 진행할 경우 영상 길이 제한을 없애줘") — 설정한 영상 길이(runtimeSeconds)는
 *   보내지 않고, 장르 시드의 길이 · 깊이는 대본 길이(씬마다 대사 3초 · 지문 4초)로 바꾼다. 각색하는 이야기는 그대로 둔다.
 *   tests/producer/preserve-runtime.test.ts
 */
export function preserveRuntime<G extends Genre | null | undefined>({
  preserveScript,
  story,
  runtimeSeconds,
  genre,
}: {
  preserveScript: boolean;
  story: string;
  runtimeSeconds?: number;
  genre?: G;
}): { runtimeSeconds?: number; genre?: G } {
  if (!preserveScript) return { runtimeSeconds, genre };
  const estimate = preservedRuntimeSeconds(story);
  if (!genre || estimate === null) return { runtimeSeconds: undefined, genre };
  return { runtimeSeconds: undefined, genre: { ...genre, runtime_seconds: estimate, depth_level: depthLevelFromRuntime(estimate) } };
}

