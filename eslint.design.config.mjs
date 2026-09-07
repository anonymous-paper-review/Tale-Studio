import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 색상 게이트 — specs/design.md hard rule "globals.css 토큰 외 신규 색 금지"의 기계 강제.
//
// 왜 본 lint 와 분리하나: eslint.config.mjs 전체는 기존 부채(2026-09-02 실측 247건,
// 대부분 no-explicit-any 198건)가 있어 CI 에 넣으면 모든 push 가 깨진다. 이 게이트만
// 따로 떼어 CI 가 `pnpm lint:design` 으로 돌고, 부채 청산 후 본 config 로 흡수한다.
//
// nextVitals·nextTs 는 파서·플러그인 배선용으로만 쓴다 — 규칙은 전부 비운다.
// (@typescript-eslint/parser 는 pnpm 격리 탓에 여기서 직접 import 할 수 없고,
//  플러그인을 안 실으면 소스 안의 기존 eslint-disable 주석이 "rule not found" 에러가 된다.)

const HEX = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z])";
// \b 대신 lookbehind — Tailwind arbitrary 값은 공백을 _ 로 쓰는데(_rgba(...)),
// _ 는 단어 문자라 \b 가 성립하지 않아 전부 놓친다 (2026-09-02 실누락으로 발견).
const COLOR_FN = "(?<![A-Za-z0-9])(?:rgba?|hsla?|oklch|oklab)\\(";
const MESSAGE =
  "raw 색 금지 — globals.css 토큰(var(--…))을 쓴다. 의도적 예외는 eslint-disable-next-line + 사유. (specs/design.md hard rules)";

const eslintConfig = defineConfig([
  ...[...nextVitals, ...nextTs].map((c) => ({ ...c, rules: {} })),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dev/**",
    ".worktrees/**",
  ]),
  {
    // 본 config 용 disable 주석(react-hooks 등)이 여기선 "unused" 로 뜨는 것을 막는다 —
    // 이 게이트는 색 규칙 하나만 보므로 다른 규칙의 주석 상태를 판단할 자격이 없다.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/${HEX}/]`, message: MESSAGE },
        { selector: `TemplateElement[value.raw=/${HEX}/]`, message: MESSAGE },
        { selector: `Literal[value=/${COLOR_FN}/]`, message: MESSAGE },
        { selector: `TemplateElement[value.raw=/${COLOR_FN}/]`, message: MESSAGE },
      ],
    },
  },
]);

export default eslintConfig;
