import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // dev/: 독립 실험 하네스 (자체 tsconfig, node strip-types 실행 — 앱 빌드와 무관)
    "dev/**",
    // .worktrees/: 링크된 git 워크트리 (같은 소스의 다른 브랜치 사본 — 중복 검사)
    ".worktrees/**",
    // .claude/: 에이전트 운영 상태 — worktrees/(중복 사본) · cache/(DB 스냅샷 스크립트).
    //   제품 코드가 아니고, worktrees 는 .worktrees/ 와 같은 이유로 중복 검사다
    //   (실측 2026-08-12: .claude/ 기여 70건, 전부 이 둘).
    ".claude/**",
    // research/: 실험 스크립트 — 일회성 관측 코드라 제품 타입 규율을 적용하지 않는다
    //   (실측 2026-08-12: research/ 기여 138~143건, 규칙은 no-explicit-any 하나로 수렴. src/ 기여는 0).
    "research/**",
  ]),
]);

export default eslintConfig;
