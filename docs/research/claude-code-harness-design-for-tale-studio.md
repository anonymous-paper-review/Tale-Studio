# Claude Code Harness 설계 — tale-studio 적용

> 4갈래 병렬 리서치(2026-05-27) 결과 + 사용자 결정 사항을 바탕으로, tale-studio 컨텍스트에 맞춘 harness 설계 문서. 실제 *수행 절차*는 별도 문서 [`harness-migration-plan.md`](./harness-migration-plan.md) 참조.

> 디자인 시스템 데이터 요구사항은 별도 문서 [`design-system-data-requirements.md`](./design-system-data-requirements.md) 참조. 본 문서는 그 데이터를 *어떻게 harness에 결합할지*만 다룬다.

---

## 목차

1. [전체 그림 — 무엇을 만들고 왜 만드는가](#1-전체-그림)
2. [CLAUDE.md 3-레이어 (글로벌 / 프로젝트 / 디렉토리별)](#2-claudemd-3-레이어)
3. [캐싱 5종 분류](#3-캐싱-5종-분류)
4. [Next.js + Supabase harness 구체 패턴](#4-nextjs--supabase-harness)
5. [specs/ → OpenSpec changes+archive 도입](#5-specs--openspec-changesarchive)
6. [현재 자산과의 충돌·이행 매핑](#6-현재-자산-이행-매핑)

---

## 1. 전체 그림

### 1.1 무엇이 문제였는가

- `CLAUDE.md` 라우터가 가리키는 `docs/design.md`, `docs/design-references.md`, `docs/infrastructure.md`가 **실제로 존재하지 않음** (라우터 fall-through).
- `.claude/` 디렉토리가 사실상 비어 있음 (`settings.local.json` 1개). rules/skills/hooks/agents 미사용.
- `PROGRESS.md`가 692줄, 미검증 `[c]` 56개 누적. 단일 파일에 cross-feature 작업이 다 들어 있어 grep으로만 항해 가능.
- 진행 중인 두 재설계(L0 Canvas P3, Director Canvas P4)가 *어디 기록되어 어떻게 진행되는지* 명세 없음. spec 파일 그냥 *덮어쓰기*가 기본 패턴.
- 디자인 작업이 작은 결정마다 매번 다른 결과를 냄 (시멘틱 토큰 부재).

### 1.2 무엇을 만드는가 (4개 축)

| 축 | 무엇 | 도입 효과 |
|---|---|---|
| **A. 컨텍스트 라우팅** | 3-레이어 CLAUDE.md + paths-scoped rules + subdirectory CLAUDE.md | 영역별로 필요한 룰만 자동 로드. 매 세션 컨텍스트 ~30~60% 절감 |
| **B. 결정성 확보** | hooks (SessionStart, UserPromptSubmit, Stop) | "반드시 일어나야 하는 것"을 강제 — 매번 PROGRESS 확인, UI 작업 design 가드, typecheck 게이트 |
| **C. 워크플로 캡슐화** | skills (.claude/skills/) + subagents (.claude/agents/) | 반복 작업을 1회 작성·N회 재사용. 컨텍스트 격리로 main thread 부담 ↓ |
| **D. spec 진화 추적** | OpenSpec `specs/changes/` + `specs/archive/` 패턴 | spec이 *어떤 결정에 의해* 어디까지 진행되었는지 timeline + audit trail |

### 1.3 무엇을 안 만드는가

- **PROGRESS.md 통째로 spec-kit으로 이전** — 너무 큰 변경. 이행은 점진. 새 작업만 `specs/changes/`에 들어가고, 기존 PROGRESS.md는 그대로 유지하다 자연히 줄어든 후 정리.
- **GitHub Issues로 진행 추적 이전 (CCPM 패턴)** — 사용자가 Issues 운영 의향 없음. 100% file-first 유지.
- **`.specify/` (GitHub spec-kit CLI 인프라)** — 우리는 OpenSpec *패턴*만 빌려옴. 도구 자체 도입 안 함 (도구 의존성 증가, CLI 학습 비용).
- **PreToolUse(Bash) 위험 명령 차단 hook** — 유용하지만 사용자가 명시적 케이스 (`rm -rf`, `git push --force`, `supabase migration up` 등) 골라야 함. 1차 셋업에서 보류.
- **`decisions.md` → `docs/adr/0001..0034.md` 분해** — Option Y. 1회성 분해 비용 큼. 트리거 조건 도달 후 (`decisions.md` > 500줄 또는 Dev A/B merge conflict 발생) 별도 세션에서 수행.
- **MCP server 도입 (Supabase, Notion 등)** — 컨텍스트 세금 67K. 실제 필요해질 때 1개씩 도입.

### 1.4 작업 순서 (요약)

```
Phase 1 (즉시 수행 — 다음 세션 1회분 작업)
  A1. specs/ 재정렬 (OpenSpec changes/+archive/ 셋업)
  A2. .claude/rules/ × 6~8 (paths-scoped)
  A3. .claude/hooks/ × 3 (SessionStart / UserPromptSubmit / Stop)
  A4. .claude/skills/ × 2~3 (껍데기)
  A5. .claude/agents/ × 1~2 (껍데기)
  A6. subdirectory CLAUDE.md × 5~6
  A7. 루트 CLAUDE.md 라우터 fall-through 정리

Phase 2 (사용자 능동 결정 후, 별도 세션)
  B1. docs/design.md 본문 작성 (Phase 0~4, design-system-data-requirements.md 따라)
  B2. design-system skill 본문 충전 (B1 후)
  B3. frontend-designer subagent 활성

Phase 3 (트리거 도달 시)
  C1. decisions.md > 500줄 또는 merge conflict → docs/adr/0001…NNNN.md 분해
  C2. PROGRESS.md 잔여 항목 → specs/changes/ 분산
```

---

## 2. CLAUDE.md 3-레이어

### 2.1 레이어 정의

| 레이어 | 위치 | 로드 시점 | 라이프타임 |
|---|---|---|---|
| **L1. 글로벌 (사용자)** | `~/.claude/CLAUDE.md` | 모든 프로젝트, 모든 세션 시작 시 | 사용자 라이프 |
| **L2. 프로젝트 (라우터)** | `<repo>/CLAUDE.md` | 이 repo 모든 세션 시작 시 | 프로젝트 라이프 |
| **L3. 디렉토리별 (lazy)** | `<repo>/src/.../CLAUDE.md` | 그 디렉토리 파일을 *읽을 때만* | 영역 라이프 |

### 2.2 L1 — 글로벌 (`~/.claude/CLAUDE.md`)

**책임**: 모든 프로젝트에 공통 적용되는 사용자 개인 행동·선호

**무엇을 쓰는가**
- 응답 언어 (한국어)
- 코딩 선호 (pnpm > npm, semicolons 사용 여부 등)
- 항상 적용되는 행동 룰 ("내부 학습 지식만으로 단언하지 말 것", "파일 추론 금지")
- OMC 활성화·라우팅

**무엇을 쓰지 말 것**
- 특정 프로젝트의 stack / 컨벤션
- 비밀, 토큰, 키
- 임시 작업 컨텍스트

**현재 tale-studio의 글로벌 상태**: 이미 OMC + 한국어 + 외부 검색 룰 + 파일 추론 금지 잘 설정됨. **변경 권장 없음**.

### 2.3 L2 — 프로젝트 라우터 (`tale-studio/CLAUDE.md`)

**책임**: "어디 보면 뭐가 있는가" + 이 프로젝트 *전역* 룰

**무엇을 쓰는가**
- 1~3줄 정체 ("Tale은 무엇인가")
- 현재 상태 / 진행 중 작업 큰 그림
- 기술 스택
- **라우터 표** (무엇 하려면 어디 보는가) ← 핵심
- 실행 명령 (`pnpm dev`, `pnpm typecheck`)
- 작업 진행 규약 (PROGRESS 절차, `[ ][c][x][~]` 마커, DoD 룰)
- 도메인 특수성 (3-Level Pipeline, 병렬 개발 소유권, URL→디렉토리)

**무엇을 쓰지 말 것**
- 컴포넌트 컨벤션 → `.claude/rules/`
- 디자인 토큰 값 → `docs/design.md` + `src/app/globals.css`
- 다단계 워크플로 → `.claude/skills/`
- 영역별 룰 (예: "Director는 React Flow 쓴다") → subdirectory CLAUDE.md
- 캐시 / 메모리 데이터 → `wiki/`, auto-memory

**길이 가이드**: **200줄 미만**. 200줄 넘으면 instruction adherence 측정 가능하게 떨어진다 (Anthropic 공식).

**현재 tale-studio CLAUDE.md 분석 (119줄)**
- 라우터 표 ✅ 깔끔
- 길이 ✅ 통과
- **fall-through ❌**: `docs/design.md`, `docs/design-references.md`, `docs/infrastructure.md` 실제 없음
- 작업 진행 규약 ✅ DoD 룰까지 명세

**개선 권장**:
1. fall-through 항목을 "(예정)" 표시로 변경하거나, 채우기 전까지는 라우터에서 임시 제거
2. 새 라우터 항목 1줄 추가: `harness 이행 작업 → docs/research/harness-migration-plan.md`
3. `specs/_constitution.md`, `specs/_TEMPLATE.md`, `specs/changes/`, `specs/archive/` 추가되면 라우터에도 반영

### 2.4 L3 — 디렉토리별 CLAUDE.md (lazy auto-load)

**핵심 메커니즘**: Claude Code는 cwd에서 위로 올라가며 CLAUDE.md를 launch 시 로드한다 (L1, L2). **subdirectory CLAUDE.md는 그 디렉토리의 파일을 *읽을 때만* 추가 로드**된다. 즉 컨텍스트 비용은 lazy.

**`/compact` 후 nested CLAUDE.md는 자동 재주입되지 않음** — 다음 read 시 다시 로드된다는 점 인지.

**무엇을 쓰는가**
- 이 디렉토리는 누구 소유 (Dev A/B)
- 어떤 stack을 쓰는지 (예: Director Canvas = React Flow + Zustand store + shadcn Sheet)
- 자주 하는 작업의 약식 가이드 (예: "새 노드 타입 추가 = `canvas-nodes/`에 .tsx + nodeTypes 맵 업데이트")
- 영역별 안 건드릴 곳 / contributor trap

**무엇을 쓰지 말 것**
- 다른 디렉토리에 대한 룰
- 전역 컨벤션 (→ L2)
- 다단계 워크플로 (→ skill)

**tale-studio에 둘 위치 6곳 (권장)**

| 위치 | 무엇 | 우선순위 |
|---|---|---|
| `src/features/director/CLAUDE.md` | Dev B 소유, Director Canvas 재설계 진행 중, React Flow + Three.js | 높음 |
| `src/features/artist/CLAUDE.md` | Dev A 소유, L0 Concept Canvas 재설계 진행 중, React Flow | 높음 |
| `src/features/{producer,writer,editor}/CLAUDE.md` | Dev 소유 + 가벼운 스택 안내 | 중간 |
| `src/app/api/CLAUDE.md` | server-side rule (zod, error shape, Supabase 호출) | 높음 |
| `src/components/ui/CLAUDE.md` | shadcn 컴포넌트 추가 룰 (`npx shadcn add`), data-slot 컨벤션 | 중간 |
| `src/stores/CLAUDE.md` | Zustand 패턴 (slice, selector, persist) | 낮음 |

### 2.5 안티패턴 7가지

| # | 안티패턴 | 왜 안 좋은가 | 어떻게 |
|---|---|---|---|
| 1 | **라우터 fall-through** (현 tale-studio) | Claude가 존재하지 않는 파일 fetch 시도 → 컨텍스트 낭비 + drift | 채우기 전까지 라우터에서 빼거나 "예정" 표시 |
| 2 | 루트 CLAUDE.md > 200줄 | Instruction adherence 측정 가능하게 떨어짐 | 영역별 룰을 paths-scoped rules로 분리 |
| 3 | `@imports`로 토큰 절약 기대 | `@imports`는 launch 시 *전부* 로드. 토큰 절약 효과 0 | 정리용으로만 사용 |
| 4 | AGENTS.md 단독 사용 | Claude Code는 AGENTS.md를 직접 안 읽음 | `@AGENTS.md` import 또는 symlink |
| 5 | 루트 CLAUDE.md에 design token 값 박기 | 모든 세션이 토큰 텍스트 부담 (UI 작업 아닌 세션도) | `docs/design.md` + `.claude/rules/design.md` (paths-scoped) |
| 6 | subdirectory CLAUDE.md를 launch 시 강제 로드 기대 | nested는 read 시점 로드. write에는 트리거 안 됨 | 중요한 룰은 paths-scoped rule로 보강 |
| 7 | 글로벌에 프로젝트별 컨벤션 | 다른 프로젝트 작업 시 noise | 프로젝트 CLAUDE.md 또는 paths-scoped rule |

### 2.6 디렉토리별 CLAUDE.md 스켈레톤 예시

**`src/features/director/CLAUDE.md`**

```markdown
# src/features/director — Director Canvas (Dev B)

## Owner & Status
- Owner: Dev B (브랜치 `feature/director-editor`)
- Status: Director Canvas 노드 그래프 재설계 진행 중 (2026-05-25~)
- Spec: `@../../../specs/layers/director.md`
- 진행 중 변경 폴더: `@../../../specs/changes/redesign-director/`

## Stack
- React Flow (xyflow) — 노드 그래프
- Three.js + React Three Fiber — 3D viewport (일부 노드)
- Zustand — `@../../../stores/director-store.ts`
- shadcn/ui — 인스펙터 패널 (Sheet), context menu (DropdownMenu)

## 디렉토리 anatomy
- `canvas-nodes/` — 1 file = 1 node type
- `canvas-edges/` — 1 file = 1 edge type
- `canvas-popups/` — 인스펙터·context menu·confirm
- `hooks/` — React hooks (캔버스 인터랙션, drag, snap 등)

## 자주 하는 작업
| 무엇 | 어디 |
|---|---|
| 새 노드 타입 추가 | `canvas-nodes/`에 .tsx + `nodeTypes` 맵 |
| 새 엣지 타입 추가 | `canvas-edges/`에 .tsx + `edgeTypes` 맵 |
| 인스펙터 추가 | `canvas-popups/`에 .tsx |
| 스토어 액션 추가 | `../../../stores/director-store.ts` |
| 데이터 모델 변경 | `../../../types/director.ts` + 스펙 업데이트 |

## 컨벤션
- 노드 ID는 `nanoid(10)`. URL slug 아님.
- 노드 좌표는 8px snap. 자유 좌표 금지.
- 선택 halo는 `ring-2 ring-node-selected ring-offset-2` (디자인 토큰)
- 노드 컴포넌트는 `@/components/ui` 직접 import 금지. 캔버스 확장 토큰만 사용.
- React Flow `nodeTypes` / `edgeTypes`는 module-scope 상수 (인라인 객체는 매 렌더마다 재생성됨 → 성능 저하)

## 안 건드릴 곳
- `../artist/canvas-*` — Dev A 소유. 패턴 참고는 OK, 직접 편집 금지.
- `../../stores/artist-store.ts` — Dev A 소유.
```

---

## 3. 캐싱 5종 분류

### 3.1 비교표

| 종류 | 위치 | 누가 씀 | 로딩 방식 | 적합 데이터 | 부적합 데이터 |
|---|---|---|---|---|---|
| **Auto-Memory** | `~/.claude/projects/<hash>/memory/MEMORY.md` + topic files | Claude (사용자가 가이드/제거) | MEMORY.md 200줄/25KB 매 세션 시작 시 auto-load; topic은 on-demand | 사용자 선호, 반복 패턴, "이 프로젝트는 X 안 쓴다" | 코드 컨벤션, 다단계 워크플로, 의사결정 |
| **Skills** | `.claude/skills/<name>/SKILL.md` | 사람이 작성, Claude가 호출 | description match auto / `/skill-name` manual / `paths:` glob | 다단계 워크플로 ("새 노드 추가", "Supabase migration") | 단순 단일 룰, 일회성 |
| **Knowledge Base (wiki)** | `wiki/` (Karpathy 패턴) | 사람 + Claude (post-commit hook) | CLAUDE.md/skill에 "wiki 봐라" reference | 도메인 사실 (6축 카메라 정의, cinematography 사전, Knowledge DB 자체) | 코드, spec |
| **Rules** | `.claude/rules/*.md` (paths frontmatter) | 사람 | paths glob match 시 auto | 영역별 컨벤션 ("API route는 zod") | 다단계 워크플로, 도메인 사실 |
| **specs/** | `specs/...` | 사람 + Claude | CLAUDE.md 라우터 + 명시 reference | 의사결정, 요구사항, plan, tasks | 코드 컨벤션, 토큰 |

### 3.2 캐시 결정 트리

```
정보가 ...
├── 내 머신 전용 사용자 선호인가?
│   └── → Auto-Memory or ~/.claude/CLAUDE.md (글로벌)
└── 팀과 공유되는가?
    ├── 영역별 컨벤션인가?
    │   └── → .claude/rules/<area>.md + paths:
    ├── 다단계 워크플로인가?
    │   └── → .claude/skills/<workflow>/SKILL.md
    ├── 도메인 사실 / 지식인가?
    │   └── → wiki/ + 짧은 reach reference (도입 시점은 별도 결정)
    ├── 의사결정 / 요구사항 / plan인가?
    │   └── → specs/ (changes/, decisions.md, layers/, data/)
    └── 디자인 정량 데이터인가?
        └── → docs/design.md + harness 3-layer (별도 문서 참조)
```

### 3.3 보조 캐시 (알면 좋은 것)

- **`docs/`** — 사람 친화 reference (design.md, research/, service-blueprint.md). Claude는 paths-scoped rule이나 skill로 reach.
- **`.omc/`** — OMC 사용 시 자동 관리 (notepad.md, project-memory.json, sessions/, state/). 손대지 말 것.
- **`@imports`** — CLAUDE.md에서 다른 markdown을 launch 시 inline. **토큰 절약 효과 없음** — 가독성·정리용만.

### 3.4 tale-studio에서 실제 어디에 무엇이 들어가는가

| 정보 종류 | 어디로 | 비고 |
|---|---|---|
| "노드 ID는 nanoid(10)" | `.claude/rules/director.md` (paths) + `src/features/director/CLAUDE.md` | 두 곳에 작성 안 하고, paths-scoped rule이 primary |
| "API route는 zod 입력 검증" | `.claude/rules/api-routes.md` (paths: `src/app/api/**/*.ts`) | |
| "shadcn 컴포넌트 추가 = `npx shadcn add ...`" | `.claude/skills/shadcn-component/SKILL.md` | 다단계 워크플로 |
| "6축 카메라는 -10~+10 정수" | `specs/api_features.md` (이미 있음) | 도메인 사실, spec의 일부 |
| "Knowledge DB cinematography 사전" | `databases/knowledge/*.yaml` (이미 있음) + 향후 `wiki/` 도입 시 | 도메인 사실 |
| "L0 Canvas를 노드 그래프로 재설계하기로 했다" | `specs/decisions.md` (이미 있음) + `specs/changes/redesign-l0-canvas/proposal.md` (NEW) | 의사결정 + 진행 중 변경 |
| "design.md 토큰 값" | `docs/design.md` (예정) + `src/app/globals.css` | source of truth는 globals.css |
| "사용자가 한국어 응답 선호" | `~/.claude/CLAUDE.md` (이미 있음) | 글로벌 |
| "tale-studio는 B2B B2B AI video 도구다" | 루트 `CLAUDE.md` (이미 있음) | 프로젝트 정체 |

---

## 4. Next.js + Supabase harness

### 4.1 Hooks (3개 — 1차 도입)

`PreToolUse(Bash)` 위험 명령 차단은 케이스 결정 필요해서 보류. `PostToolUse(Edit)` prettier/biome도 보류 (system-reminder 토큰 비용, ESLint 외 포맷터 미설정).

#### 4.1.1 SessionStart — PROGRESS 검증 보드 inject

CLAUDE.md가 "세션 진입 시 PROGRESS.md 읽기 → 미검증 항목 보고" 절차를 *사람-procedural*로 요구. hook으로 자동화하면 모든 세션이 동일하게 시작.

**스크립트** (`.claude/hooks/session-start-progress.sh`):
```bash
#!/usr/bin/env bash
# 미검증 [c] 카운트 + 영역 추출하여 SessionStart inject
COUNT=$(grep -c '^- \[c\]' "${CLAUDE_PROJECT_DIR}/PROGRESS.md" 2>/dev/null || echo 0)
ACTIVE_CHANGES=$(ls "${CLAUDE_PROJECT_DIR}/specs/changes/" 2>/dev/null | grep -v '^archive$' | head -5)

if [ "$COUNT" -gt 0 ] || [ -n "$ACTIVE_CHANGES" ]; then
  TOP=$(grep '^- \[c\]' "${CLAUDE_PROJECT_DIR}/PROGRESS.md" 2>/dev/null | head -5)
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "PROGRESS.md 미검증 [c]: ${COUNT}개\n\nTop 5:\n${TOP}\n\n진행 중 changes/:\n${ACTIVE_CHANGES}\n\n사용자에게 1줄 보고 + (a)검증 (b)신규 (c)버그 (d)changes/ 진행 선택지 제시하세요."
  }
}
EOF
fi
exit 0
```

#### 4.1.2 UserPromptSubmit — UI 키워드 design.md inject

별도 문서 [`design-system-data-requirements.md`](./design-system-data-requirements.md) §6 Layer B에서 정의. 본문은 거기서.

#### 4.1.3 Stop — typecheck 게이트

작업 종료 직전 TS 에러가 있으면 차단 (강한 deterministic 게이트). exit 2로 Claude에 피드백.

```bash
#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR}"
# pnpm typecheck가 없으면 npx tsc로 fallback. 출력은 30줄로 cap.
OUT=$(pnpm typecheck 2>&1 || npx tsc --noEmit 2>&1)
if echo "$OUT" | grep -qE 'error TS'; then
  HEAD=$(echo "$OUT" | head -30)
  cat >&2 <<EOF
TypeScript 에러가 있습니다:
$HEAD

작업 완료 전 해결하세요. 사용자가 "타입 에러는 별도"라고 명시했으면 무시하고 계속.
EOF
  exit 2
fi
exit 0
```

**알아둘 위험**: GitHub issue #24327 — 일부 Claude Code 버전에서 exit-2가 *피드백 전달*이 아닌 *완전 중단*으로 처리되는 회귀. 1주일 운영 후 동작 확인 → 문제 있으면 exit 0 + stderr 메시지로 약화.

### 4.2 Skills (2~3개 — 1차 도입)

#### 4.2.1 `design-system` (껍데기 먼저)

별도 문서 §6 Layer C 정의. 본문은 `docs/design.md` 작성 후 채움. 1차 셋업에서는 frontmatter + Hard Rules 5개 + "We are NOT" 리스트만.

#### 4.2.2 `shadcn-component`

shadcn 컴포넌트 추가 시 다단계 워크플로:
1. `npx shadcn add <component>` 실행
2. `components.json` 변경 확인
3. 새로 들어온 토큰·variant가 있으면 design.md 업데이트 알림
4. 사용 예시 1개 작성

`SKILL.md` 스켈레톤:
```yaml
---
description: shadcn/ui 컴포넌트를 tale-studio에 추가. components.json + design.md 업데이트 + 토큰 충돌 검사. 사용자가 "버튼 추가", "shadcn add", "새 컴포넌트" 등 멘션 시.
when_to_use: shadcn 컴포넌트 신규 도입
allowed-tools: Bash, Read, Edit, Glob
---

# shadcn-component skill

## Process
1. 컴포넌트 이름 확정 (사용자 prompt에서 추출)
2. `npx shadcn@latest add <name>` 실행
3. 생성된 파일 확인: src/components/ui/<name>.tsx
4. components.json `cssVariables` 항목 변경되었는지 확인
5. 새 variant나 토큰이 있으면 docs/design.md §components 섹션에 추가 권장
6. 사용 예시 1개를 적절한 곳에 작성 (사용자 컨텍스트에 따라)
```

#### 4.2.3 `supabase-migration` (Supabase 본격 도입 시)

현재 `supabase/` 디렉토리 없음. Supabase migration 인프라 셋업되면 그때 추가. 1차 셋업에서는 보류.

### 4.3 Subagents (1~2개 — 1차 도입)

#### 4.3.1 `frontend-designer` (껍데기 먼저)

design.md 작성 후 활성. 1차 셋업에서는 frontmatter + system prompt 골격만.

```yaml
---
name: frontend-designer
description: tale-studio UI 작업 — src/components/, src/app/ 하위 컴포넌트/페이지/스크린 빌드 또는 수정, 캔버스 노드 비주얼, Tailwind 스타일링, shadcn 컴포넌트 통합 시 사용. 백엔드·API·non-visual 로직엔 사용 안 함.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

당신은 tale-studio frontend designer subagent. 모든 UI 작업 전 반드시
docs/design.md와 docs/design-references.md를 읽으세요.

## 5 hard rules
(design.md 본문 작성 후 채움)

## "We are NOT" 리스트
- NOT Higgsfield (glassmorphism, neon glow 금지)
- NOT consumer-creator (light-mode-first, marketing gradient 금지)
- NOT n8n-style (saturated 카테고리 배너 금지)
- NOT Vercel-extreme (pure #000 금지 — warm near-black)

## Process
1. docs/design.md 읽기 (안 읽었다면)
2. 작업 영역의 src/features/.../CLAUDE.md 읽기
3. shadcn primitive로 구현. 캔버스 확장 외 custom CSS 금지.
4. 완료 시 사용 토큰과 적용한 design.md 섹션 요약
```

#### 4.3.2 `api-route-writer`

`src/app/api/**`에서 server action / route handler 작성. zod + error handling.

```yaml
---
name: api-route-writer
description: src/app/api/ 하위 Next.js route handler 또는 server action 작성. 사용자가 "API 추가", "엔드포인트", "server action" 멘션 시 사용.
tools: Read, Edit, Write, Grep, Glob
model: sonnet
---

당신은 tale-studio API route writer.

## 룰
- 입력 검증: zod schema 필수
- 에러 형식: `{ ok: false, error: { code, message } }`
- 성공 형식: `{ ok: true, data: T }`
- Supabase 호출은 src/lib/supabase/* 사용
- console.log 금지; 로깅은 정의된 logger 사용 (없으면 사용자 문의)

## Process
1. .claude/rules/api-routes.md 읽기
2. 인접 route 1~2개 읽어 패턴 확인
3. zod schema 먼저 작성 → handler 구현 → 에러 매핑
4. 작성 후 typecheck 결과 보고
```

### 4.4 Paths-scoped rules (6~8개)

`.claude/rules/` 안에 영역별 markdown. 각각 `paths:` frontmatter로 glob 명시. 1차 셋업 권장 6개 + 디자인 1개 = 7개:

| 파일 | paths | 핵심 룰 |
|---|---|---|
| `api-routes.md` | `src/app/api/**/*.ts` | zod 검증, error shape, Supabase 호출 패턴, console.log 금지 |
| `components-ui.md` | `src/components/ui/**`, `src/components/layout/**` | shadcn data-slot, 라이브러리 충돌 금지, design.md 참조 |
| `stores.md` | `src/stores/*.ts` | Zustand slice 패턴, selector, persist 룰, 직렬화 금지 항목 |
| `director.md` | `src/features/director/**` | React Flow `nodeTypes` module-scope, nanoid(10), 8px snap, 캔버스 토큰 |
| `artist-canvas.md` | `src/features/artist/**` | 동일 패턴 (Dev A 소유, L0 재설계 진행) |
| `supabase.md` | `src/lib/supabase/**`, `supabase/**` | RLS 룰, migration 네이밍, branch DB 사용, secret 누설 금지 |
| `design.md` | `src/components/**`, `src/app/**/*.tsx` | design.md harness Layer A. 별도 문서 §6 참조 |

선택:
- `progress-tracking.md` | `PROGRESS.md`, `specs/**/tasks.md` | `[c]` vs `[x]` 룰 (이미 루트 CLAUDE.md에 있어서 중복 위험)

### 4.5 MCP 권장 (1차에서 안 도입)

본격 도입 시점에 결정:

- **Supabase MCP** — 라이브 schema, RLS introspection. Supabase 도입 후.
- **GitHub MCP** — issues / PR / 코드 리뷰. 사용자가 Issues 안 쓰니 보류.
- **Notion / Linear MCP** — 외부 티켓 시스템 도입 시.
- **Figma MCP** — 디자이너 합류 + Figma 캐논 소스 생성 시.

피해야 할 것: **4개 이상 MCP server는 67K 컨텍스트 세금**. Tool Search default-on 유지. `alwaysLoad: true` 사용 금지.

---

## 5. specs/ → OpenSpec changes+archive

### 5.1 핵심 결정 (재확인)

사용자 결정: **Option X로 시작 + Y로 자연 이행**.

- **Option X (now)**: OpenSpec 패턴(`changes/` + `archive/`)을 채택, 기존 `decisions.md`는 rolling cross-cutting 로그로 유지.
- **Option Y (later)**: `decisions.md` > 500줄 또는 Dev A/B merge conflict 발생 시 → `docs/adr/0001..NNNN.md`로 분해. log4brains 정적 사이트 뷰어 고려.

### 5.2 새 구조

```
specs/
├── _constitution.md                   ← NEW: 짧은 변경 적은 원칙 (200줄 이내)
├── _TEMPLATE.md                       ← NEW: 새 change 작성 표준
├── decisions.md                       ← AS-IS: rolling 결정 로그
├── open_questions.md                  ← AS-IS
├── mvp_scope.md                       ← AS-IS: roadmap-level reference
├── ux_pages.md                        ← AS-IS: reference
├── api_features.md                    ← AS-IS: reference
├── layers/                            ← AS-IS: source-of-truth 스펙
│   ├── L0_concept_canvas.md
│   ├── L1_scene_architect.md
│   ├── L2_shot_composer.md
│   ├── L3_prompt_builder.md
│   └── director.md
├── data/                              ← AS-IS: 데이터 모델
│   ├── canvas_data_model.md
│   └── asset_storage.md
├── changes/                           ← NEW: 진행 중 변경
│   ├── redesign-l0-canvas/
│   │   ├── proposal.md
│   │   ├── design.md  (선택)
│   │   ├── tasks.md
│   │   └── deltas/
│   │       └── L0_concept_canvas.md
│   └── redesign-director/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── deltas/
│           └── director.md
└── archive/                           ← NEW: 완료 + 검증된 변경 (date-prefixed)
    └── README.md                      ← "archive 의식 = 검증 게이트" 설명
```

### 5.3 캐넌 파일 구조

#### `_constitution.md` (200줄 이내, 변경 적음)

OpenSpec 본가는 별도 constitution을 두지 않지만, spec-kit이 이 개념을 정착시킴. tale-studio도 *변경이 거의 없는 핵심 원칙*을 200줄 이내로 정리.

```markdown
# tale-studio constitution

> 변경 적은 원칙. 이걸 어기는 변경 제안은 proposal.md에서 명시적으로 정당화해야 함.

## Mission
B2B AI video 파이프라인. 차별화는 cinematography RAG.

## 3-Level Pipeline + L0
[L0 Concept Canvas] → Asset Storage
                            ↓
Story → [Pumpup] → [L1 Scene Architect] → [L2 Shot Composer] → [L3 Prompt Builder] → [Video API]

## 노드 = 개체 패러다임
- Higgsfield 노드 = 모델. 우리 노드 = 엔티티 (Character / World / Scene / Shot).
- 노드 시각화는 *모델 흐름*이 아니라 *콘텐츠 자산 관계*를 표현.

## 병렬 개발 소유권
- Dev A: producer, writer, artist, artist-store
- Dev B: director, editor, director-store, editor-store, editor-canvas
- 공유 영역(types, components/layout, stores/project-store): main PR + 상대 rebase

## 작업 진행 규약
- 상태 마커: `[ ] / [c] / [x] / [~]` (PROGRESS.md 또는 specs/changes/*/tasks.md)
- DoD가 *동작*이면 브라우저 검증 후에만 `[x]`. 코드만 완료면 `[c]`.
- 인프라 항목(파일 생성, 타입 정의)은 코드 자체로 검증되므로 `[x]` OK.

## change-driven 진화
- 기존 spec(layers/*, data/*)을 *수정*할 때는 `specs/changes/<change-name>/`에 proposal + delta 작성.
- 작업 끝나면 `specs/archive/YYYY-MM-DD-<name>/`로 이동 (archive = 검증 게이트).
- 단순 typo 수정 / 사실 업데이트는 changes/ 안 만들고 spec 직접 편집 OK.

## 기술 스택 (변경 적음)
- Frontend: Next.js 16 + Tailwind v4 + shadcn/ui + Zustand
- Canvas: React Flow (xyflow)
- 3D: Three.js + React Three Fiber (P4 일부)
- Backend: Next.js API Routes + Supabase
- AI: Gemini LLM, Imagen + H100 self-hosted (이미지), Kling + Veo + Pro6000 (비디오)

## 금지
- `docs/design.md` 안 만든 상태에서 추상 형용사로만 디자인 결정 진행 (별도 문서 참조)
- node 좌표 자유 (8px snap)
- decisions.md mid-history 편집 (append-only)
```

#### `_TEMPLATE.md`

```markdown
# specs/changes/<change-name>/proposal.md 표준

```yaml
---
change: <kebab-case-name>
status: active                        # active | archived
created: YYYY-MM-DD
decisions: [N, N, N]                  # decisions.md entry 번호 (관련된 경우)
---
```

## Why
<왜 이 변경이 필요한가. 한 문단. 기존 결정(decisions.md #N)을 참조.>

## What Changes
- <변경 1>
- <변경 2>
- <변경 3>

## Impact
- Affected specs: <layers/L0_concept_canvas.md 같은 path 나열>
- Affected code: <src/features/artist/ 같은 영역 나열>
- Affected stores: <stores/canvas-store.ts 같은 path>
- Affected decisions: <#N, #N>

---

# specs/changes/<change-name>/deltas/<spec-name>.md 표준 (선택)

## ADDED Requirements

### Requirement: <Name>
The system SHALL <statement>.

#### Scenario: <name>
- **WHEN** ...
- **THEN** ...

## MODIFIED Requirements

### Requirement: <Name>
<new statement>
(Previously: <old statement>)

## REMOVED Requirements

### Requirement: <Name>
(Deprecated because <reason>)

---

# specs/changes/<change-name>/tasks.md 표준

- [ ] task 1 — owner / DoD
- [x] task 2 — DoD 충족됨
- [~] task 3 — 보류 (사유: ...)

## Blocked
- task 4 — blocked by <reason>
```

#### `archive/README.md`

```markdown
# specs/archive

완료 + 검증된 change. archive 의식 = 검증 게이트.

## 어떻게 archive하는가
1. `specs/changes/<name>/tasks.md`의 모든 `[ ]`가 `[x]` 됨
2. 사용자 검증 통과 (브라우저, e2e, 또는 합의된 검증 절차)
3. 변경된 source-of-truth spec (layers/L0_concept_canvas.md 등) 실제 업데이트 완료
4. `mv specs/changes/<name> specs/archive/YYYY-MM-DD-<name>/`
5. `decisions.md`에 archive 사실 한 줄 append (entry 번호 + archive 폴더 링크)

## 어떻게 timeline 뷰를 보는가
- `ls -t specs/archive/` — 최신순 정렬
- `git log specs/archive/` — git 히스토리
- 향후 log4brains 도입 시 정적 사이트 뷰
```

### 5.4 진행 중 두 재설계 초기 셋업

#### `specs/changes/redesign-l0-canvas/proposal.md`

```markdown
---
change: redesign-l0-canvas
status: active
created: 2026-05-XX  (실제 시작일로 채움)
decisions: [29, 30, 31, 32, 33]  (실제 decisions.md 항목 번호로 채움)
---

# Redesign L0 to Node Canvas

## Why
기존 패널 UI (character-panel/world-panel)는 캐릭터·월드 간 관계 표현이 한계.
노드 그래프 패러다임으로 전환하여 다음 단계(Asset Storage)로의 데이터 흐름을 명시.

## What Changes
- React Flow (xyflow) 채택
- Actor / World / Status 3종 노드
- 5-View / 16-Angle은 노드 출력 모드로 흡수
- Meeting Room agent를 tool-use 패턴으로 전환

## Impact
- Affected specs: layers/L0_concept_canvas.md (rewrite)
- Affected code: src/features/artist/ → 노드 컴포넌트로 교체
- Affected stores: stores/artist-store.ts → stores/canvas-store.ts
- Affected decisions: #29, #30, #31, #32, #33 (실제 번호로 채움)
```

#### `specs/changes/redesign-director/proposal.md`

```markdown
---
change: redesign-director
status: active
created: 2026-05-25
decisions: []  (관련 decisions.md entry 번호 — 다음 세션에서 사용자와 함께 채움)
---

# Redesign Director to Node Canvas

## Why
기존 Director 패널 UI를 노드 그래프로 재설계. Scene/Shot 관계를 명시적으로 표현.

## What Changes
(specs/layers/director.md 본문에서 추출하여 채움)

## Impact
- Affected specs: layers/director.md
- Affected code: src/features/director/ (이미 canvas-nodes/, canvas-edges/, canvas-popups/ 신설 중)
- Affected stores: stores/director-store.ts (이미 존재)
- Affected decisions: TBD
```

### 5.5 결정 ↔ 스펙 ↔ Timeline 흐름

```
[decisions.md]                        [specs/changes/<name>/]                [specs/layers/<spec>.md]
- rolling, append-only log            - 진행 중 변경 (active)                 - source-of-truth (current state)
- cross-cutting 결정                  - proposal.md = WHY/WHAT/IMPACT
- 매 entry 번호 부여                  - tasks.md = checklist
                                      - deltas/ = ADDED/MODIFIED/REMOVED
        │                                       │                                       │
        │ entry #N에서 changes/<name>           │ archive 시 source-of-truth            │ archive 후
        │ 참조 (어디서 일어났는지)              │ spec 업데이트 + delta merge           │ 본문 업데이트됨
        ▼                                       ▼                                       ▼

                                      [specs/archive/YYYY-MM-DD-<name>/]
                                      - timeline view 자동 (date prefix)
                                      - immutable historical record
                                      - decisions.md에서 archive 사실 append
```

### 5.6 향후 Option Y 이행 시점

**트리거 조건**:
- `decisions.md` > 500줄
- Dev A/B가 같은 entry 동시 편집으로 merge conflict 발생
- 결정 cross-reference가 많아져 grep으로 항해 어려움
- log4brains 같은 timeline 뷰어 필요해짐

**이행 방법**:
1. 별도 세션에서 `decisions.md` 34개 (현재) → `docs/adr/0001..0034.md` 분해
2. 각 ADR을 MADR 4.0 포맷으로 (frontmatter + Context / Drivers / Options / Outcome / Consequences)
3. 기존 `specs/changes/` `specs/archive/` 구조는 *그대로 유지*. ADR과 change 폴더는 별도 축.
4. `specs/changes/*/proposal.md`의 `decisions:` frontmatter를 `adrs: [adr-0042, adr-0043]`로 마이그레이션
5. log4brains 도입 검토 (정적 timeline 사이트)

---

## 6. 현재 자산 이행 매핑

### 6.1 무엇이 어디로 가는가

| 현재 | 이행 후 | 이유 |
|---|---|---|
| `CLAUDE.md` (119줄) | **편집** — 라우터 fall-through 정리 + harness migration plan 한 줄 추가 + specs/changes/, specs/archive/ 라우터 항목 추가 | 라우터 fall-through 정리 |
| `PROGRESS.md` (692줄) | **그대로 유지**, 상단에 다음 세션 마커 1줄 추가. 새 작업은 PROGRESS가 아닌 `specs/changes/*/tasks.md`에 작성. 기존 [c]/[x]는 점진 마이그레이션 | 큰 변경 비용. 점진 이행. |
| `specs/decisions.md` (247줄) | **그대로 유지** — rolling 로그 계속. 새 change archive 시 entry 1줄 append. | Option X 결정 |
| `specs/open_questions.md` | 그대로 유지 | ADR이 아님 — 미해결 질문 |
| `specs/mvp_scope.md`, `ux_pages.md`, `api_features.md` | 그대로 유지 (reference) | spec-kit terminology로 constitution-level + reference |
| `specs/layers/L*.md`, `specs/layers/director.md` | **그대로 유지** — source-of-truth. 변경은 changes/ 거쳐서. | OpenSpec 패턴 |
| `specs/data/*.md` | 그대로 유지 — data model reference | |
| (없음) `specs/_constitution.md` | **NEW** — 200줄 이내 원칙 | OpenSpec 패턴 |
| (없음) `specs/_TEMPLATE.md` | **NEW** — change/delta/tasks 캐넌 | 표준 강제 |
| (없음) `specs/changes/` | **NEW** | 진행 중 변경의 audit trail |
| (없음) `specs/archive/` | **NEW** + README.md | 완료 변경의 timeline + 검증 게이트 |
| `.claude/settings.local.json` | 유지 + `.claude/settings.json` (팀 공유) 신설 | hooks wiring 필요 |
| (비어 있음) `.claude/rules/` | **NEW** × 6~7 | paths-scoped 영역별 룰 |
| (비어 있음) `.claude/hooks/` | **NEW** × 3 (스크립트) | deterministic 자동화 |
| (비어 있음) `.claude/skills/` | **NEW** × 2~3 (껍데기 위주) | 워크플로 캡슐화 |
| (비어 있음) `.claude/agents/` | **NEW** × 1~2 (껍데기) | 컨텍스트 격리 |
| (없음) `src/features/*/CLAUDE.md` | **NEW** × 5~6 | subdirectory lazy auto-load |
| `~/.claude/CLAUDE.md` (글로벌) | 유지 — 변경 권장 없음 | 이미 충분 |
| `docs/design.md` | **별도 작업** — Phase 0~4로 채움 (design-system-data-requirements.md 따라) | 사용자 능동 결정 필요 |
| `docs/design-references.md` | **별도 작업** — reference 선정 후 작성 | 사용자 능동 결정 필요 |
| `docs/infrastructure.md` | 라우터에서 "(예정)" 처리 또는 임시 제거 | 라우터 fall-through |

### 6.2 진행 중 두 재설계 매핑

**L0 Concept Canvas 재설계 (P3)**
- source-of-truth: `specs/layers/L0_concept_canvas.md` (변경 없음)
- 변경 폴더: `specs/changes/redesign-l0-canvas/` (NEW)
  - `proposal.md` — WHY/WHAT/IMPACT, decisions.md entry 번호 reference
  - `tasks.md` — 현재 PROGRESS.md의 P10-X 항목 (또는 다른 L0 관련 항목) 이전 가능
  - `deltas/L0_concept_canvas.md` — ADDED/MODIFIED/REMOVED Requirements
- 완료 시: `specs/archive/2026-MM-DD-redesign-l0-canvas/` 이동 + `decisions.md` append

**Director Canvas 재설계 (P4)**
- source-of-truth: `specs/layers/director.md`
- 변경 폴더: `specs/changes/redesign-director/` (NEW)
- 구조 동일

### 6.3 라우터 변경 (CLAUDE.md)

기존 라우터에서 fall-through 정리:

```diff
 | MVP 범위 / 우선순위 / 구현 순서 | `specs/mvp_scope.md` |
 | 페이지별 레이아웃·요소·인터랙션 | `specs/ux_pages.md` |
-| **시각·인터랙션 공통 컨벤션 (디자인 헌법)** | `docs/design.md` |
-| 페이지별 디자인 레퍼런스/벤치마크 | `docs/design-references.md` |
+| **시각·인터랙션 공통 컨벤션 (예정)** | `docs/design.md` (작성 가이드: `docs/research/design-system-data-requirements.md`) |
+| 페이지별 디자인 레퍼런스/벤치마크 (예정) | `docs/design-references.md` |
+| **harness 이행 작업** | `docs/research/harness-migration-plan.md` |
+| **이번 프로젝트 원칙 (Constitution)** | `specs/_constitution.md` |
+| **진행 중 변경 (in-flight specs)** | `specs/changes/` |
+| **완료된 변경 (timeline + audit)** | `specs/archive/` |
 | L0 Concept Canvas (노드 그래프, P3 재설계) | `specs/layers/L0_concept_canvas.md` |
 ...
 | 의사결정 로그 | `specs/decisions.md` |
 | 열린/닫힌 질문 | `specs/open_questions.md` |
-| 인프라 / 배포 / 비용 | `docs/infrastructure.md` |
+| 인프라 / 배포 / 비용 (예정) | `docs/infrastructure.md` |
```

### 6.4 PROGRESS.md 상단 마커

```markdown
# Progress

> **다음 세션 진입 시**: harness 이행 작업이 대기 중입니다.
> 우선순위: 사용자가 (a) harness 이행 (b) 기존 [c] 검증 (c) 신규 작업 중 선택받으세요.
> harness 이행 가이드: `docs/research/harness-migration-plan.md`

> **상태 범례** (모든 작업 항목에 적용):
> - `[ ]` 미착수
> ...
```

---

## 부록: 의사결정 로그 요약

이 문서의 핵심 결정 (다른 세션에서 *왜 이렇게 했지?* 묻지 않도록):

1. **harness 도입 범위**: hooks 3개 + rules 6~7 + skills 2~3 (껍데기) + subagents 1~2 (껍데기) + subdir CLAUDE.md 5~6. (사용자 답변: "문서 + 바로 .claude/에 적용")
2. **spec 패턴**: OpenSpec changes+archive 패턴, decisions.md rolling 유지. (사용자 답변: "Option X로 시작 + Y로 자연 이행")
3. **GitHub Issues 미사용**: 모든 추적은 file-first. (사용자 답변: "아니 / 원치 않음")
4. **PROGRESS.md 통째 이전 안 함**: 점진. 새 작업만 changes/. (사용자 답변에서 도출)
5. **design.md 본문은 별도 세션**: 이번 셋업은 harness 껍데기만. (사용자 답변: "design 제외하고 안한것도 해줄래?")
6. **`.specify/` CLI 도구 도입 안 함**: 패턴만 빌려옴. (본 문서 §1.3)
7. **PreToolUse(Bash) 위험 명령 차단 hook 보류**: 사용자가 명시적 케이스 결정 필요. (본 문서 §4.1)
8. **PostToolUse 포맷터 보류**: system-reminder 토큰 비용 + Prettier 미설치. (diet103 warning)
9. **MCP server 1차 도입 안 함**: 67K 컨텍스트 세금. (본 문서 §4.5)

---

## 다음 단계

실제 수행은 [`harness-migration-plan.md`](./harness-migration-plan.md). 그 문서는 다음 세션이 *기계적으로* 따라가서 위에서 설계한 구조로 프로젝트를 변경하기 위한 step-by-step.
