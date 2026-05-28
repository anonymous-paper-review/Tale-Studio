# Harness 이행 실행 계획서

> **다음 세션용 step-by-step 실행 가이드**. 이 문서를 처음부터 끝까지 따라가면 [`claude-code-harness-design-for-tale-studio.md`](./claude-code-harness-design-for-tale-studio.md)에서 합의한 구조로 프로젝트가 변경됩니다.

> **세션 시작 시**: 사용자에게 "harness 이행 작업 시작할까요?" 묻고 동의 받으세요. 동의 시 Step 1부터.

> **세션 중간에 끊겨도** 각 Step은 독립적입니다. 마지막에 git status로 확인 후 어디까지 했는지 사용자에게 보고하고 이어서 시작.

---

## 사전 점검 (작업 시작 전 1분)

```bash
cd /home/devcat/projects/tale-studio
git status              # 깨끗한 상태인지 확인 (안 깨끗하면 사용자에게 보고 후 시작)
git branch              # main 또는 적절한 브랜치인지 확인
ls .claude/             # settings.local.json만 있는 게 정상
ls specs/               # decisions.md, open_questions.md, mvp_scope.md, ux_pages.md, api_features.md, layers/, data/ 있어야 정상
```

만약 위와 다르면 사용자에게 보고 후 진행 여부 확인.

---

## 작업 분기 — 한 번에 다 할까 vs 단계별

**전체 작업량**: 약 25개 파일 신규 생성, 2개 파일 편집. 1세션에 다 가능하지만 30~60분 소요 추정.

세션 시작 시 사용자에게 옵션 제시:
- (a) 한 번에 다 진행 — 끝까지
- (b) Phase 1 (specs/ 재정렬)만 — 이후 별도 세션
- (c) Phase 1 + Phase 2 (.claude/ 셋업)만 — Phase 3 (subdirectory CLAUDE.md) 보류
- (d) 사용자가 옆에서 보면서 step-by-step 진행

기본 권장: (a). 변경 자체는 *동작에 영향 없음* (CLAUDE.md/specs 추가, .claude/ 추가) — 안전.

---

# Phase 1 — specs/ 재정렬 (OpenSpec 패턴 도입)

## Step 1.1 — `specs/_constitution.md` 생성

**위치**: `specs/_constitution.md` (NEW)

**내용**: 메인 설계 문서 §5.3의 `_constitution.md` 템플릿 참조. 200줄 이내.

**작성 시 채워야 할 placeholder**:
- 현재 `specs/decisions.md`에서 *변경 적은 결정*만 추출하여 constitution으로 격상 (사용자와 함께)
- 단, `decisions.md` 원본은 그대로 둠 (Option X 결정)

**검증**: `wc -l specs/_constitution.md` < 200

---

## Step 1.2 — `specs/_TEMPLATE.md` 생성

**위치**: `specs/_TEMPLATE.md` (NEW)

**내용**: 메인 설계 문서 §5.3의 `_TEMPLATE.md` 그대로. proposal.md / delta spec.md / tasks.md 캐넌 헤더 3개.

**검증**: 파일 존재, OpenSpec 캐넌 형식 (Why / What Changes / Impact 헤더 + ADDED/MODIFIED/REMOVED Requirements 섹션 + tasks.md `[ ]/[x]/[~]` 마커)

---

## Step 1.3 — `specs/changes/` 폴더 + 두 진행 중 재설계 초기 셋업

```bash
mkdir -p specs/changes/redesign-l0-canvas/deltas
mkdir -p specs/changes/redesign-director-canvas/deltas
```

### 1.3a — `specs/changes/redesign-l0-canvas/proposal.md`

메인 설계 문서 §5.4 템플릿 참조.

**채워야 할 placeholder**:
- `created:` 실제 시작일 (decisions.md에서 L0 재설계 결정 entry의 날짜 — 사용자와 함께 확인)
- `decisions:` 실제 entry 번호들 (현재 decisions.md grep해서 L0 관련 항목 찾기)
- `## What Changes` 본문 — `specs/layers/L0_concept_canvas.md` 현재 내용에서 *재설계 핵심*만 5~7개 bullet으로 추출

### 1.3b — `specs/changes/redesign-l0-canvas/tasks.md`

**작성 방법**:
1. `PROGRESS.md`에서 P10 또는 L0 관련 항목 grep (`grep -nE 'L0|P10|Canvas|Concept' PROGRESS.md | head -40`)
2. 찾은 항목 중 *아직 진행 중인 것*만 추출하여 tasks.md에 옮김
3. **PROGRESS.md 원본은 건드리지 않음** — 이 단계에서는 mirror만 (완전 이전은 별도 세션)

**형식**:
```markdown
# Redesign L0 to Node Canvas — Tasks

## Active
- [c] P10-2: 노드 더블클릭 모달 (코드 ✓ / 검증 대기, 2026-05-17 React Flow zoomOnDoubleClick 이슈 해결)
- [ ] P10-7: ...

## Blocked
- (없으면 생략)

## Done (이 change 내)
- [x] P10-1: React Flow 셋업
```

### 1.3c — `specs/changes/redesign-l0-canvas/deltas/L0_concept_canvas.md` (선택)

본격 OpenSpec 패턴 적용 시 작성. 1차 셋업에서는 **빈 파일 또는 TODO 표시**로 두고, 실제 재설계 진행 시 채움.

```markdown
# Delta: layers/L0_concept_canvas.md

> 이 파일은 redesign-l0-canvas change가 source-of-truth spec(L0_concept_canvas.md)에 적용할 ADDED/MODIFIED/REMOVED Requirements를 명세합니다.
> 1차 셋업에서는 placeholder. 재설계 진행하며 채웁니다.

## ADDED Requirements
(TBD)

## MODIFIED Requirements
(TBD)

## REMOVED Requirements
(TBD)
```

### 1.3d — `specs/changes/redesign-director-canvas/proposal.md`

동일 패턴. `specs/layers/director_canvas.md` 본문에서 추출.

**채워야 할 placeholder**:
- `created: 2026-05-25` (메인 CLAUDE.md에 명시되어 있음)
- `decisions:` — decisions.md grep해서 Director 관련 entry 번호

### 1.3e — `specs/changes/redesign-director-canvas/tasks.md`

PROGRESS.md에서 Director 관련 항목 mirror.

### 1.3f — `specs/changes/redesign-director-canvas/deltas/director_canvas.md`

placeholder.

---

## Step 1.4 — `specs/archive/` 폴더 + README

```bash
mkdir -p specs/archive
```

`specs/archive/README.md` 작성 (메인 설계 문서 §5.3 그대로).

---

## Step 1.5 — `decisions.md` 헤더에 OpenSpec 패턴 안내 추가

**편집**: `specs/decisions.md` 최상단 (현재 헤더 위 또는 아래)

추가할 내용:
```markdown
> **이 파일은 cross-cutting 결정의 rolling 로그입니다.** Append-only.
>
> 새 변경 작업은 `specs/changes/<name>/proposal.md`에 작성하고, 끝나면 `specs/archive/YYYY-MM-DD-<name>/`로 이동. archive 시 이 파일에 entry 1줄 append (entry 번호 + archive 폴더 링크).
>
> Entry 번호는 monotonic. 기존 번호 mid-history 편집 금지.
```

**유의**: 원본 본문은 절대 건드리지 말 것. 헤더 추가만.

---

## Phase 1 검증

```bash
ls -la specs/
ls specs/changes/
ls specs/archive/
cat specs/_constitution.md | head -20
cat specs/_TEMPLATE.md | head -20
```

기대 결과:
- `specs/_constitution.md` 존재 (200줄 미만)
- `specs/_TEMPLATE.md` 존재
- `specs/changes/redesign-l0-canvas/` 존재 (proposal.md, tasks.md, deltas/)
- `specs/changes/redesign-director-canvas/` 존재 (proposal.md, tasks.md, deltas/)
- `specs/archive/README.md` 존재
- `specs/decisions.md` 헤더 추가됨, 본문 그대로

**사용자에게 1줄 보고**: "specs/ 재정렬 완료. Phase 2 (.claude/ 셋업) 진행할까요?"

---

# Phase 2 — `.claude/` 셋업

## Step 2.1 — `.claude/settings.json` (팀 공유 settings, hook wiring)

**위치**: `.claude/settings.json` (NEW — 기존 `settings.local.json`은 그대로 유지)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start-progress.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/inject-design.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/typecheck-gate.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**검증**: `cat .claude/settings.json | jq .` (JSON 파싱 OK 확인. jq 없으면 그냥 cat)

---

## Step 2.2 — `.claude/hooks/` 스크립트 3개

```bash
mkdir -p .claude/hooks
```

### 2.2a — `session-start-progress.sh`

메인 설계 문서 §4.1.1 그대로:

```bash
#!/usr/bin/env bash
# .claude/hooks/session-start-progress.sh
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

`chmod +x .claude/hooks/session-start-progress.sh`

### 2.2b — `inject-design.sh`

별도 문서 `design-system-data-requirements.md` §6 Layer B 본문 그대로:

```bash
#!/usr/bin/env bash
# UI 작업 키워드 매칭 시 design.md consult 강제 inject
PROMPT=$(jq -r '.prompt // ""' < /dev/stdin 2>/dev/null || cat)
KEYWORDS='component|page|screen|button|form|modal|sheet|popover|dialog|card|shadcn|tailwind|tsx|style|theme|token|color|spacing|layout|design|canvas|node|컴포넌트|페이지|디자인|스타일|버튼|폼|모달|레이아웃|색|토큰|캔버스|노드'

if echo "$PROMPT" | grep -iEq "$KEYWORDS"; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "UI 작업 감지됨. docs/design.md를 반드시 consult하세요 (아직 생성 안 됐다면 docs/research/design-system-data-requirements.md를 참조). Hard rules: dark-first with light parity; ONE accent for CTAs only; Geist Mono for camera-axis values; no shadows on canvas nodes; use canvas extension tokens (--canvas-*, --node-*, --edge-*); Higgsfield-style glassmorphism 금지."
  }
}
EOF
fi
exit 0
```

`chmod +x .claude/hooks/inject-design.sh`

### 2.2c — `typecheck-gate.sh`

메인 설계 문서 §4.1.3 그대로:

```bash
#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR}"
# pnpm typecheck 우선, 없으면 npx tsc로 fallback
if [ -f package.json ] && grep -q '"typecheck"' package.json; then
  OUT=$(pnpm typecheck 2>&1)
else
  OUT=$(npx tsc --noEmit 2>&1)
fi

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

`chmod +x .claude/hooks/typecheck-gate.sh`

---

## Step 2.3 — `.claude/rules/` × 7개

```bash
mkdir -p .claude/rules
```

각 파일 frontmatter는 `paths:` + 본문. **모두 80줄 이내 권장**. 본문 짧고 명확하게.

### 2.3a — `api-routes.md`

```yaml
---
paths:
  - "src/app/api/**/*.ts"
---
```

본문 룰:
- 입력 검증 zod schema 필수
- 응답: `{ ok: false, error: { code, message } }` / `{ ok: true, data }`
- Supabase 호출: `src/lib/supabase/*` 사용
- console.log 금지 (logger 도입 전이면 사용자 문의)
- export const POST/GET 시그니처: `(req: Request) => Promise<Response>` 또는 Next.js Route Handler 패턴

### 2.3b — `components-ui.md`

```yaml
---
paths:
  - "src/components/ui/**/*.{tsx,ts}"
  - "src/components/layout/**/*.{tsx,ts}"
---
```

본문 룰:
- shadcn `data-slot` 컨벤션 유지 (React 19+, forwardRef 대신)
- design.md 읽기 (없으면 design-system-data-requirements.md)
- 캔버스 확장 토큰 (`--canvas-*` 등)은 여기서 import 금지. 캔버스 노드에서만.
- raw hex / 임의 px 금지. 토큰 또는 Tailwind 유틸리티만.

### 2.3c — `stores.md`

```yaml
---
paths:
  - "src/stores/*.ts"
---
```

본문 룰:
- Zustand 패턴: slice + selector 분리
- persist 사용 시 직렬화 가능한 값만 (DOM 노드 / 함수 / Promise 금지)
- store 간 import 금지 (project-store는 예외 — 공유 컨테이너)
- canvas-store는 React Flow 인스턴스 *참조* 보관 금지 (직렬화 불가)

### 2.3d — `director-canvas.md`

```yaml
---
paths:
  - "src/features/director/**/*.{tsx,ts}"
---
```

본문 룰:
- Owner: Dev B
- React Flow `nodeTypes` / `edgeTypes`는 module-scope 상수 (인라인 객체 금지)
- 노드 ID: `nanoid(10)`
- 좌표 8px snap. 자유좌표 금지.
- 선택 halo: `ring-2 ring-node-selected ring-offset-2` (디자인 토큰)
- 노드 컴포넌트는 `@/components/ui` 직접 import 금지

### 2.3e — `artist-canvas.md`

```yaml
---
paths:
  - "src/features/artist/**/*.{tsx,ts}"
---
```

본문 룰:
- Owner: Dev A
- L0 Concept Canvas 재설계 진행 중 (`specs/changes/redesign-l0-canvas/`)
- 나머지 규칙은 director-canvas.md와 동일 (캔버스 공통)

### 2.3f — `supabase.md`

```yaml
---
paths:
  - "src/lib/supabase/**/*.ts"
  - "supabase/**"
---
```

본문 룰:
- RLS는 모든 테이블 default ON
- migration 네이밍: `YYYYMMDDHHMMSS_<verb>_<noun>.sql`
- secrets 누설 금지 (`.env.local`, anon vs service key 구분)
- branch DB 사용 권장 (production 직접 작업 금지)

### 2.3g — `design.md`

별도 문서 `design-system-data-requirements.md` §6 Layer A 본문 그대로 (`paths:` + 5 hard rules + "We are NOT" 리스트 inline).

```yaml
---
paths:
  - "src/components/**/*.{tsx,ts,css}"
  - "src/app/**/*.{tsx,ts,css}"
---
```

본문:
```markdown
# Design rules for UI work in tale-studio

UI 작업 전 반드시 `docs/design.md`와 `docs/design-references.md`를 읽으세요
(아직 이번 세션에 읽지 않았다면). docs/design.md가 아직 작성 전이라면
`docs/research/design-system-data-requirements.md`를 reference로.

특히:
- 토큰은 `src/app/globals.css` (shadcn CSS variables).
- 캔버스 확장 토큰 (`--canvas-*`, `--node-*`, `--edge-*`)은 design.md §canvas;
  새로 만들지 마세요.
- "We are NOT Higgsfield" — glassmorphism 금지, neon glow 금지, 캔버스 노드에 shadow 금지.
- Geist Mono는 camera-axis 값과 render ID에 필수.
- Dark-first with light parity. light-only로 만들지 마세요.
```

---

## Step 2.4 — `.claude/skills/` × 2개 (껍데기)

```bash
mkdir -p .claude/skills/{design-system,shadcn-component}
```

### 2.4a — `design-system/SKILL.md`

별도 문서 `design-system-data-requirements.md` §6 Layer C 본문 그대로.

### 2.4b — `shadcn-component/SKILL.md`

메인 설계 문서 §4.2.2 본문 그대로.

---

## Step 2.5 — `.claude/agents/` × 2개 (껍데기)

```bash
mkdir -p .claude/agents
```

### 2.5a — `frontend-designer.md`

메인 설계 문서 §4.3.1 본문 그대로 (Hard rules는 design.md 작성 후 충전).

### 2.5b — `api-route-writer.md`

메인 설계 문서 §4.3.2 본문 그대로.

---

## Phase 2 검증

```bash
ls .claude/
ls .claude/rules/
ls .claude/hooks/
ls .claude/skills/
ls .claude/agents/

# 실행 권한 확인
ls -l .claude/hooks/*.sh   # 모두 -rwx 권한이어야 함

# JSON 파싱 확인
cat .claude/settings.json | python3 -m json.tool >/dev/null && echo "settings.json OK"

# SessionStart hook dry-run
bash .claude/hooks/session-start-progress.sh  # JSON 출력되거나 nothing (둘 다 OK)
```

기대 결과:
- `.claude/settings.json` 존재 + 파싱 OK
- `.claude/hooks/` 3개 .sh 실행 권한
- `.claude/rules/` 7개 .md
- `.claude/skills/` 2개 디렉토리 + SKILL.md
- `.claude/agents/` 2개 .md

**사용자에게 1줄 보고**: ".claude/ 셋업 완료. Phase 3 (subdirectory CLAUDE.md) 진행할까요?"

---

# Phase 3 — Subdirectory CLAUDE.md × 5~6

각 파일은 메인 설계 문서 §2.6 스켈레톤 예시 참조 + 디렉토리별 특수성 추가.

## Step 3.1 — `src/features/director/CLAUDE.md`

메인 설계 문서 §2.6 그대로.

**검증**: 다른 디렉토리에 대한 룰이 없는지, 100줄 미만인지.

## Step 3.2 — `src/features/artist/CLAUDE.md`

director 패턴과 유사하되:
- Owner: Dev A
- 브랜치: `feature/producer-writer-artist`
- L0 Concept Canvas 재설계 진행 중 (`specs/changes/redesign-l0-canvas/`)
- 기존 `artist-store.ts`는 `canvas-store.ts`로 교체 예정 (decisions.md 참조)

## Step 3.3 — `src/features/writer/CLAUDE.md`, `editor/CLAUDE.md`, `producer/CLAUDE.md`

가벼움 (각 30~50줄):
- Owner (Dev A: writer/producer, Dev B: editor)
- 핵심 stack
- 자주 하는 작업 1~2개
- 진행 중 작업 없으면 생략

## Step 3.4 — `src/app/api/CLAUDE.md`

```markdown
# src/app/api — Server-side Next.js API Routes

이 디렉토리의 룰은 `.claude/rules/api-routes.md`에도 paths-scoped로 적용됩니다.

## 디렉토리 구조
src/app/api/
├── artist/        — Artist 관련 endpoints
├── director/      — Director Canvas 관련
├── editor/        — Editor 관련
├── write/         — Writer 관련 (story → scene)
├── produce/       — Producer 관련
├── generate/      — AI 생성 (Gemini, Imagen, Kling, Veo)
├── knowledge/     — Knowledge DB RAG
├── assets/        — Asset Storage
└── project/       — 프로젝트 메타

## 컨벤션
- Next.js Route Handler 패턴 (`export async function POST(req: Request)`)
- 입력 검증: zod
- 응답: `{ ok, data | error: { code, message } }`
- Supabase: `src/lib/supabase/*` 통해서만
- 외부 AI 호출: `src/lib/ai/*` (또는 적절한 wrapper)

## 보안
- service-key는 server only (`SUPABASE_SERVICE_ROLE_KEY`)
- 사용자 인증: middleware.ts에서 처리
- 비밀 누설 금지 (response에 토큰/키 포함 절대 금지)
```

## Step 3.5 — `src/components/ui/CLAUDE.md`

```markdown
# src/components/ui — shadcn primitives

## 추가 워크플로
`/shadcn-component` 스킬 사용. 또는 수동:
1. `npx shadcn@latest add <name>`
2. `components.json` `cssVariables` 변경 확인
3. design.md에 새 variant나 토큰 있으면 업데이트

## 컨벤션
- 이 디렉토리 파일은 shadcn CLI가 관리. 직접 편집 시 다음 `shadcn add`로 덮어쓸 수 있음 (주의)
- 커스텀 컴포넌트는 `src/components/<feature>/` 하위에 두기 (예: `src/components/canvas/`)
- React 19+ `data-slot` 컨벤션 유지
- forwardRef 의존 패턴 작성 금지 (shadcn 최신 컴포넌트는 미사용)

## 디자인 토큰
src/app/globals.css 참조. 자세한 룰은 docs/design.md.
```

## Step 3.6 — `src/stores/CLAUDE.md` (선택, 우선순위 낮음)

```markdown
# src/stores — Zustand stores

## 인벤토리
- `project-store.ts` — 공유 (Dev A & B PR to main)
- `producer-store.ts`, `writer-store.ts`, `artist-store.ts` — Dev A
- `director-store.ts`, `editor-store.ts`, `director-canvas-store.ts` — Dev B
- `global-chat-store.ts` — 공유

## 컨벤션
- slice 패턴: state + actions를 하나의 create()에 묶음
- selector는 컴포넌트에서 직접 `useStore(s => s.foo)`
- persist 미들웨어는 직렬화 가능한 값만 (DOM 노드, 함수, Promise 금지)
- 다른 store import 금지 (project-store만 예외)
- React Flow 인스턴스 참조 보관 금지 (직렬화 불가)

## 변경 예정
- L0 재설계 시 artist-store → canvas-store 교체 (specs/changes/redesign-l0-canvas/)
```

---

## Phase 3 검증

```bash
ls src/features/director/CLAUDE.md
ls src/features/artist/CLAUDE.md
ls src/features/{writer,editor,producer}/CLAUDE.md
ls src/app/api/CLAUDE.md
ls src/components/ui/CLAUDE.md
ls src/stores/CLAUDE.md  # 선택
```

각 파일 100줄 미만, 다른 디렉토리 룰 없음 확인.

---

# Phase 4 — 루트 CLAUDE.md 라우터 정리 + PROGRESS.md 마커

## Step 4.1 — 루트 CLAUDE.md 라우터 fall-through 정리

**편집**: `CLAUDE.md`

**변경 사항** (메인 설계 문서 §6.3 diff 참조):

라우터 표에서:
- `docs/design.md` 항목: " (예정)" 표시 추가 + 작성 가이드 reference
- `docs/design-references.md` 항목: " (예정)" 표시
- `docs/infrastructure.md` 항목: " (예정)" 표시
- 새 항목 4개 추가:
  - `harness 이행 작업` → `docs/research/harness-migration-plan.md`
  - `이번 프로젝트 원칙 (Constitution)` → `specs/_constitution.md`
  - `진행 중 변경 (in-flight specs)` → `specs/changes/`
  - `완료된 변경 (timeline + audit)` → `specs/archive/`

**유의**: 다른 섹션 (상태, 기술 스택, 실행, 작업 진행 규약, 도메인 특수성)은 *건드리지 말 것*.

---

## Step 4.2 — PROGRESS.md 상단 마커 추가

**편집**: `PROGRESS.md` 최상단 (현재 헤더 위)

```markdown
# Progress

> **harness 이행 작업 완료 (2026-MM-DD)**. 새 작업은 `specs/changes/<name>/tasks.md`에 작성 권장.
> 기존 [c] 항목은 점진 마이그레이션. PROGRESS.md 통째 이전은 별도 세션.
>
> 다음 세션 진입 시: (a) [c] 검증 (b) 신규 작업 (c) 잡힌 버그 중 선택.
> 진행 중 changes/: redesign-l0-canvas, redesign-director-canvas (specs/changes/ 참조)

(기존 헤더 그대로 유지)
```

**유의**: 기존 본문 692줄은 *절대* 건드리지 말 것. 상단 4~6줄만 추가.

---

# Phase 5 — 마무리 검증 + 보고

## Step 5.1 — 전체 변경 git diff 확인

```bash
git status
git diff --stat
```

**기대**:
- 신규 파일 약 25~28개
- 편집된 파일 2개 (CLAUDE.md, PROGRESS.md, specs/decisions.md 헤더)
- 삭제된 파일 0개

## Step 5.2 — 동작 영향 없음 확인

```bash
pnpm typecheck   # 또는 npx tsc --noEmit
pnpm lint        # 또는 npx eslint
```

**기대**: 변경 전과 동일한 결과. typecheck/lint는 markdown / .claude/ 파일에 영향받지 않음.

만약 *전에 통과하던 게 실패*하면 사용자에게 즉시 보고. 변경 자체로 코드 동작에 영향 없어야 함.

## Step 5.3 — 새 SessionStart hook dry-run

```bash
bash .claude/hooks/session-start-progress.sh
```

JSON 출력 또는 nothing. (현재 미검증 [c]가 56개라서 JSON 출력 예상.)

## Step 5.4 — 사용자에게 최종 보고

다음을 1줄씩 보고:
1. 신규 파일 N개, 편집된 파일 M개
2. typecheck/lint 영향 없음 확인
3. 진행 중 두 changes/ 폴더 셋업 완료
4. 다음에 해야 할 일:
   - design.md 본문 작성 (Phase 0~4, design-system-data-requirements.md 따라)
   - `docs/infrastructure.md` 채우거나 라우터에서 제거
   - PROGRESS.md 잔여 항목 점진 마이그레이션 (별도 세션)

git commit 여부는 사용자에게 묻고, 동의 시 `git add` + `git commit` (커밋 메시지는 사용자와 합의).

---

# 부록 A — 결정 분기 (다음 세션이 사용자에게 물을 것)

다음 항목은 이 세션에서 미리 결정 못 한 부분. 다음 세션이 작업 중 사용자에게 물어야 함:

1. **`specs/_constitution.md` 본문 채우기 시점**:
   - 메인 설계 문서 §5.3 템플릿은 *내용도* 어느 정도 작성되어 있지만, decisions.md에서 *어떤 항목*을 constitution으로 격상할지는 사용자 결정 필요.
   - **물을 것**: "decisions.md에서 constitution으로 격상할 항목 골라주세요. 또는 제가 후보 5~10개 추천할까요?"

2. **`specs/changes/redesign-l0-canvas/proposal.md`의 decisions: 번호**:
   - decisions.md grep해서 L0 관련 entry 번호를 찾아야 함. 사용자 검증 필요.
   - **물을 것**: "decisions.md에서 L0 재설계 관련 entry는 #N, #N, #N 같은데, 맞나요?"

3. **`specs/changes/*/tasks.md`에 PROGRESS.md에서 mirror 할 항목**:
   - PROGRESS.md 692줄 중 어느 [c]/[~] 항목을 changes/ 로 mirror 할지.
   - **권장 기본값**: P10-X (L0 관련), 그리고 director-canvas 관련 항목만 mirror. 나머지는 그대로 PROGRESS.md에 둠.
   - **물을 것**: "PROGRESS.md에서 어떤 [c] 항목을 changes/로 mirror할까요? 기본은 L0/director 관련만."

4. **commit 시점**:
   - Phase 1 끝나고 1번 / Phase 2 끝나고 1번 / Phase 5 끝나고 1번 → 총 3번 commit
   - 또는 마지막에 통합 1번
   - **물을 것**: "단계별 commit vs 마지막 통합 commit 어느 쪽?"

5. **PostToolUse 포맷터 추가 여부 (보류 항목 재검토)**:
   - 메인 설계 문서 §1.3에서 보류 결정. 사용자가 명시적으로 원하면 추가.
   - **묻지 말고 사용자가 요청할 때만 추가**.

---

# 부록 B — 중단 지점 복구

세션이 중간에 끊겼을 때 어디까지 했는지 확인하는 방법:

```bash
# Phase 1 완료 여부
ls specs/_constitution.md specs/_TEMPLATE.md specs/archive/README.md 2>/dev/null
ls specs/changes/redesign-l0-canvas/ specs/changes/redesign-director-canvas/ 2>/dev/null

# Phase 2 완료 여부
ls .claude/settings.json .claude/hooks/ .claude/rules/ .claude/skills/ .claude/agents/ 2>/dev/null

# Phase 3 완료 여부
ls src/features/director/CLAUDE.md src/features/artist/CLAUDE.md 2>/dev/null
ls src/app/api/CLAUDE.md src/components/ui/CLAUDE.md 2>/dev/null

# Phase 4 완료 여부
head -40 CLAUDE.md | grep 'harness 이행'
head -10 PROGRESS.md | grep 'harness 이행 작업 완료'
```

각 Phase는 독립적이므로 부분 완료 시 그 다음 Phase부터 이어가면 됨.

---

# 부록 C — 절대 안 할 것 (이번 세션에서)

- [ ] PROGRESS.md 본문 692줄 건드리기 (상단 4~6줄 마커만 추가)
- [ ] `specs/decisions.md` 본문 entry 편집 (헤더만 추가)
- [ ] `specs/layers/*.md`, `specs/data/*.md` 편집
- [ ] `docs/design.md` 실제 본문 작성 (별도 세션)
- [ ] `docs/adr/` 디렉토리 생성 (Option Y는 별도)
- [ ] `.specify/` CLI 인프라 설치
- [ ] MCP server 설치
- [ ] Supabase migration 폴더 (`supabase/`) 생성
- [ ] 코드 (src/**) 편집 — *마이그레이션 자체로는 코드 변경 없음*. 만약 typecheck/lint 통과 못 하면 즉시 중단 후 사용자 보고.
- [ ] `git push` (commit 동의는 받되, push는 명시적 요청 시에만)
- [ ] `git reset --hard`, `git clean -f` 같은 destructive

---

# 부록 D — 예상 시간

| Phase | 작업 | 예상 시간 |
|---|---|---|
| 1 | specs/ 재정렬 | 10~15분 |
| 2 | .claude/ 셋업 (hooks 3, rules 7, skills 2, agents 2) | 20~30분 |
| 3 | subdirectory CLAUDE.md × 5~6 | 10~15분 |
| 4 | 라우터 + PROGRESS 마커 | 3~5분 |
| 5 | 검증 + 보고 + commit | 5~10분 |
| **합계** | | **약 50~75분** |

세션 1번에 완료 가능. 사용자가 옆에서 보고 결정 분기에 답해주면 더 빠름.

---

# Done

이 plan을 끝까지 따라가면 메인 설계 문서에서 합의한 구조로 프로젝트가 변경됩니다. 변경 자체는 *코드 동작에 영향 없음* — markdown 추가, .claude/ 셋업, 라우터 fall-through 정리만. 안전.

이후 별도 세션에서:
1. `docs/design.md` 본문 작성 (design-system-data-requirements.md 따라)
2. `docs/infrastructure.md` 채우기 또는 라우터에서 제거
3. PROGRESS.md 잔여 항목 점진 마이그레이션
4. (트리거 도달 시) `decisions.md` → `docs/adr/` 분해
