# 훅 deps 불안정 참조 — 재발 감지 장치 조사 (2026-08-25)

티켓: `.claude/vault/backlog/tickets/audit-unstable-hook-deps-detector-2026-08-24.md`
사고·수리: 커밋 `979b5a4` (`useT()` 가 렌더마다 새 함수를 반환 → `/studio/editor` 무한 리렌더,
React #185 프로덕션 4건)

## 질문

"매 렌더 새 참조를 반환하는 커스텀 훅의 결과를 `useEffect`/`useMemo`/`useCallback` 조건
목록에 넣는" 실수를, 코드를 실행하지 않고 자동으로 잡는 방법이 이 저장소에 이미 있는가.

## 결론

**있다 — 단, 이 저장소에 이미 설치된 어떤 eslint 규칙도 아니고, 새로 짠 소스 추적 테스트다.**
그 테스트는 사고를 되돌린 상태에서 5건을 잡고, 현재(수리된) 코드에서는 확정 오탐 0건을 낸다.
단 판단을 못 내리고 사람에게 넘기는 항목이 3건 남는다 — 이 3건은 "틀린 경보"가 아니라
"자동으로 안전을 증명할 수 없어 사람이 봐야 하는 항목"이다(아래 표·해석 참고).

## 1단계 — 지금 있는 검사가 이미 잡는가 (티켓 절차 그대로)

`eslint.config.mjs` 는 `eslint-config-next/core-web-vitals` 를 통해
`eslint-plugin-react-hooks` 의 `recommended` 규칙 묶음을 그대로 쓴다
(`node_modules/.../eslint-config-next/dist/index.js` 의
`_eslintpluginreacthooks.default.configs.recommended.rules` 스프레드 — 직접 의존 없음, 티켓 좌표란과 일치).
그 안에 `react-hooks/exhaustive-deps: "warn"` 이 켜져 있다.

**실수를 심어 확인**: `src/lib/i18n/index.ts` 를 커밋 `979b5a4` 이전 상태로 되돌리고
(`useT()` 가 `useCallback` 없이 매번 새 화살표 함수를 반환), 그 상태로 실제 사고 지점
(`src/app/studio/editor/page.tsx`, `src/app/studio/director/page.tsx`)에 지금 그대로의
`eslint.config.mjs` 로 검사를 돌렸다.

```
$ npx eslint src/lib/i18n/index.ts src/app/studio/editor/page.tsx src/app/studio/director/page.tsx
src/app/studio/director/page.tsx
  25:30  warning  'X' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```

**잡지 못한다.** 이유: `exhaustive-deps` 는 "조건 목록에서 빠진 것"만 본다. `t` 는 이미
`[projectId, loadData, loadPersisted, t]` 안에 들어 있으므로 이 규칙 기준으로는 "완전한" 목록이다.
`t` 가 매 렌더 새 참조라는 사실은 `exhaustive-deps` 의 분석 범위 밖이다(같은 파일에서 직접
`(x) => x+1` 같은 리터럴을 정의해 deps 에 넣으면 이 규칙이 잡는다 — 그건 확인함. 문제는
그 리터럴이 **다른 파일의 커스텀 훅 안**에 있을 때다).

복원 확인: 위 실험 후 `git diff --stat src/lib/i18n/index.ts` 로 되돌림 확인, 실측 자체는
worktree 밖으로 전파되지 않았다.

## 2단계 — 세 방식 계측

### (나) eslint 규칙을 추가로 켠다

`node_modules/eslint-plugin-react-hooks@7.0.1`(이 저장소에 `eslint-config-next@16.1.6` 이
끌고 온 버전, `pnpm-lock.yaml:2615` 확인 — 직접 의존 아님)를 열어보면 규칙 목록에
`memoized-effect-dependencies`(설명: "Validates that effect dependencies are memoized")가
**이름 그대로 이 문제를 위한 규칙으로 이미 존재**한다. 다만 프리셋이 `Off` 다
(`recommended`/`recommended-latest` 어느 프리셋에도 없음 — 소스:
`eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.development.js` 의
`ErrorCategory.EffectDependencies` 케이스, `preset: LintRulePreset.Off`).

강제로 켜서(`"react-hooks/memoized-effect-dependencies": "error"`) 같은 두 상태(현재/되돌린 상태)에
돌렸다.

```
결과 요약:
  현재 코드 전체(src/**)      : 0 건 (동일 규칙만 켠 상태에서도 위반 0)
  되돌린 상태(editor/director): 0 건  ← 실제 재발 사고를 못 잡는다
```

**탈락 — 티켓 판정선의 "실수 되돌린 상태에서 1건 잡는다" 조건을 아예 만족 못 한다.**
이 규칙은 React Compiler 의 자체 메모이제이션 추론(HIR) 이 실제로 컴파일을 수행할 때
"컴파일러가 넣은 메모와 실제 코드가 일치하는지" 검증하는 용도로 보인다 — 이 저장소는
`babel-plugin-react-compiler` 를 설치하지 않았으므로(아래 (다) 참고) 이 규칙이 참조할
컴파일러 추론 자체가 없다. 즉 규칙 이름만 보고 기대할 수 있는 동작과 실제 동작이 다르다.

같은 강제-on 상태에서 합성 재현(로컬 함수가 다른 커스텀 훅에서 화살표 함수를 그대로 받아
deps 에 넣는 최소 재현)도 시도했으나 역시 0건 — 얕은 실험이 아니라 재현 가능한 결과다.

### (다) React 최신 컴파일러/검사 도구 여부 (버전은 lockfile 로만 조회, 네트워크 조회 안 함)

- `package.json` / `pnpm-lock.yaml` 확인: `next@16.1.6`, `react@19.2.3`,
  `eslint-config-next@16.1.6` → 전이 의존으로 `eslint-plugin-react-hooks@7.0.1` 설치됨
  (이미 위 (나)에서 쓴 그 버전 — "React 최신 검사 도구"는 이미 여기 있고, 이미 테스트했다).
- `babel-plugin-react-compiler` 는 **설치돼 있지 않다.** `pnpm-lock.yaml` 에는
  `next@16.1.6` 의 **옵션 peerDependency 선언**(`babel-plugin-react-compiler: '*', optional: true`,
  `pnpm-lock.yaml:3693-3702`)만 있을 뿐, 실제 resolve 된 패키지 항목은 0건이다
  (`grep -c "^  babel-plugin-react-compiler@" pnpm-lock.yaml` → `0`).
- 즉 이 저장소는 React Compiler 자체(바벨 트랜스폼)를 켜지 않았다. 켜려면 devDependency 추가
  + `next.config` 에 `experimental.reactCompiler` 활성화가 필요한데, 이는 **런타임 변환이
  들어가는 실제 툴체인/빌드 변경**이라 이번 감사(제품 코드를 고치지 않는 조사) 범위 밖으로 판단해
  설치·활성화는 하지 않았다. (나)에서 이미 그 lint 표면(`memoized-effect-dependencies`)이 이
  특정 패턴을 못 잡는 것을 확인했으므로, 컴파일러를 실제로 켜도 이 규칙의 판정 자체가 개선된다는
  보장은 이 실험만으로는 없다 — **미확인**으로 남긴다.

### (가) 소스를 읽어 조건 목록 항목의 출처를 추적하는 테스트

`detector.mjs` (이 폴더) — 로직:
1. `src/**` 에서 `export function use*`/`export const use*` 훅 정의를 찾는다(zustand
   `create()` 스토어 제외).
2. 각 훅의 **자기 스코프** return 문만 본다(주의: 첫 시도는 이 구분이 없어서 실패했다 — 아래
   "삽질" 참고).
3. 반환 타입 주석이 원시값(`boolean`/`string`/`number`/`void`)이거나 `useCallback`/`useMemo`
   로만 감싸 반환하면 SAFE. 객체/배열/함수 리터럴을 메모 없이 직접 반환하면 UNSAFE(확정).
   다른 훅 호출을 그대로 반환하거나 식별자만 반환하면 UNKNOWN(재귀 추적 안 함).
4. UNSAFE/UNKNOWN 훅이 `const x = useHook(...)` 로 바인딩되고 그 `x` 가 어떤 훅 조건
   목록에 등장하면 finding.

**삽질(비용의 실체)**: 첫 버전은 함수 바디 전체에서 정규식으로 `return` 을 그냥 긁었다.
그 결과 `useEffect(() => { ...; return () => cleanup() }, [])` 안의 **정리 함수 return**을
훅 자신의 반환값으로 오인해, 실제로는 `void` 를 반환하는 `useEditorPlayback`·`useIdleTimeout`·
`useArtistLockPoll`·`useAltHeld` 4개 훅을 "위험"으로 오탐했다. `useDebugPrompts`(반환 타입
`boolean`) 도 반환 타입 주석 정규식의 사소한 버그(콜론을 이중으로 기대)로 오탐했다.
→ 중괄호 깊이 추적 + "이 중괄호가 함수 스코프를 여는지" 판정을 넣어서야 없어졌다. 즉
**"몇 줄 정규식"으로는 안 되고, 최소한의 스코프 인식 파서가 필요하다** — 이게 이 방식의 진짜 비용이다.

**결과**:

```
$ node research/experiments/unstable-hook-deps-detector/detector.mjs      # 현재(수리된) 코드
총 findings: 3 (unsafe 확정: 0, unknown: 3)

$ git show 979b5a4^:src/lib/i18n/index.ts > src/lib/i18n/index.ts          # 사고 되돌림
$ node research/experiments/unstable-hook-deps-detector/detector.mjs
총 findings: 8 (unsafe 확정: 5, unknown: 3)
$ git checkout -- src/lib/i18n/index.ts   # (실제로는 백업 파일로 복원, diff 0 확인)
```

되돌린 상태에서 `useT` 가 다시 "메모 없이 리터럴 직접 반환"으로 분류되고, `t` 를 deps 에 넣은
5곳(director 4곳 + editor 1곳)이 모두 `unsafe` 로 잡힌다. 커밋 메시지는 "editor 1곳 + director
2곳"이라 적었지만 실제 파일에는 `t` 가 deps 에 들어간 지점이 director 쪽에 4곳 있다 —
탐지기가 더 많이 찾은 것이지 과탐이 아니다(같은 변수 `t`, 같은 훅 `useT`, 같은 패턴).

## 세 방식 종합 표

| 방식 | 현재(수리된) 코드 확정 오탐 | 되돌린 상태에서 실제 잡음? | 비고 |
|---|---|---|---|
| 0. 지금 있는 그대로 (`exhaustive-deps` 등, 이미 켜짐) | 0건 | **아니오** | "빠진 dep"만 봄, "불안정한 dep"은 범위 밖 |
| (나) `react-hooks/memoized-effect-dependencies` 강제 on | 0건 | **아니오** | React Compiler 추론 없이는 무동작으로 보임(관찰, 원인 미확정) |
| (다) 실제 React Compiler 도입 | 미확인(미설치) | 미확인 | 툴체인/빌드 변경 필요 — 감사 범위 밖, 설치 안 함 |
| (가) 소스 추적 테스트(`detector.mjs`) | **0건**(unsafe 확정 기준) + 사람 판단 필요 3건(unknown) | **예 — 5건** | 유지비: 새 커스텀 훅이 생기면 unknown 목록이 늘어난다 |

## 판정 (티켓 판정선 적용)

티켓 판정선: "실수 되돌린 상태에서 1건 잡고, 현재 코드에서 거짓 경보 0건이면 그 방식이 답이다."
(가)가 이 조건을 만족한다 — **단, "거짓 경보 0건"은 UNSAFE(확정) 등급 기준이다.** UNKNOWN 등급
3건(`useContentLocale`, `useActiveGenerationJobs` 2곳)은 "잘못 울린 경보"가 아니라 "정적으로
안전을 증명하지 못해 사람이 봐야 하는 항목"이며, 이 셋은 티켓 본문의 사전 수동 감사에서 이미
안전으로 확인된 것들과 정확히 일치한다(`useContentLocale`→문자열 하나, `useActiveGenerationJobs`→
같은 배열 참조 재사용). 이 구분을 숨기지 않고 그대로 남긴다.

→ **`done`**. 방식 (가) 채택 제안, 아래.

## 도입 제안 (초안 — 적용 안 함, 이 감사는 조사만)

`research/experiments/unstable-hook-deps-detector/detector.mjs` 를 `tests/` 로 옮기고
2단 회귀 잠금으로 감싼다:

```ts
// tests/unstable-hook-deps.test.ts (초안)
import { describe, expect, it } from 'vitest'
import { runDetector } from '../research/experiments/unstable-hook-deps-detector/detector.mjs'

// 사람이 이미 안전을 확인한 UNKNOWN 목록 — 새 항목이 생기면 테스트가 실패해 사람이 보게 한다.
const REVIEWED_UNKNOWN = new Set([
  'src/app/studio/producer/page.tsx::useContentLocale::contentLoc',
  'src/features/director/canvas-views/StoryboardGridView.tsx::useActiveGenerationJobs::activeJobs',
  'src/features/director/hooks/use-queue-rehydrate.ts::useActiveGenerationJobs::activeJobs',
])

describe('훅 deps 불안정 참조 재발 감지', () => {
  it('확정 위험(UNSAFE) 통로가 조건 목록에 없다', () => {
    const { findings } = runDetector('src')
    const unsafe = findings.filter((f) => f.status === 'unsafe')
    expect(unsafe).toEqual([])
  })

  it('사람 판단이 필요한 통로는 이미 검토한 목록과 정확히 같다 (새 항목 = 검토 필요)', () => {
    const { findings } = runDetector('src')
    const unknown = findings.filter((f) => f.status === 'unknown')
      .map((f) => `${f.file}::${f.hookName}::${f.varName}`)
    expect(new Set(unknown)).toEqual(REVIEWED_UNKNOWN)
  })
})
```

`eslint.config.mjs` 변경은 제안하지 않는다 — (나)가 이 문제에 무력함을 확인했다.

채택 시 비용: 새 "직접 만든 함수형 통로" 훅이 추가될 때마다 UNKNOWN 목록이 늘어날 수 있고,
그때마다 사람이 한 번 봐서 REVIEWED_UNKNOWN 에 추가하거나(안전 확인) 코드를 고쳐야 한다
(위험 확인). 완전 자동화가 아니라 "새 위험 후보를 사람 앞에 반드시 세우는" 장치다.

## 산출물

- `detector.mjs` — 방식 (가) 구현(최종본, 스코프 인식 버전)
- `_HYPOTHESIS.md` — 가설 폼(티켓 본문에서 옮김)
- 이 파일

## 검증

- `pnpm typecheck` (tsc --noEmit): 통과 (0 오류) — 이 감사는 `src/` 를 수정하지 않았으므로
  이 결과는 "감사가 아무것도 깨지 않았다"는 확인일 뿐, 새 코드에 대한 검증이 아니다.
- `npx vitest run tests/editor-render-loop-guard.test.ts`: 3/3 통과 — 기존 잠금 시험 그대로 살아있음.
- `git status --short -- src/`: 빈 결과 — 이 조사 동안 `src/lib/i18n/index.ts` 를 두 번 임시로
  되돌렸다가 백업본으로 복원했고, 각 복원 후 diff 0 확인함.
