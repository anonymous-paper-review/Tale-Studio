---
description: tale-studio spec workflow lifecycle 관리 — 새 변경 작업 (specs/changes/<name>/) 생성, lint, archive, status. 사용자가 "/spec", "새 기능 추가", "변경 작업 시작", "proposal 작성", "archive", "스펙 작성" 등 멘션 시 사용.
when_to_use: 새 변경 작업 시작 / proposal+tasks scaffold / changes lint / archive 의식 / active changes 현황
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion
---

# tale-studio spec workflow skill

OpenSpec 패턴 (changes/+archive/) + rolling decisions log 관리 자동화.

## Anchor 파일 (작업 전 필요 시 로드)

- `specs/_constitution.md` — 워크플로우 룰 source-of-truth
- `specs/_TEMPLATE.md` — change 3종 파일 캐넌 템플릿
- `specs/decisions.md` — append-only cross-cutting 결정 로그
- `specs/archive/README.md` — archive 의식 절차
- `PROGRESS.md` — 검증 보드 (changes mirror)

## Sub-command 라우터

사용자 입력 패턴 → sub-command:

| 패턴 | 라우트 |
|---|---|
| `/spec new <name>` 또는 "새 변경", "scaffold" | **§new** |
| `/spec lint` 또는 "검증", "lint" | **§lint** |
| `/spec archive <name>` 또는 "archive" | **§archive** |
| `/spec status` 또는 "현황", "active changes" | **§status** |
| 의도 모호 ("스펙 작성") | 사용자에게 sub-command 확인 |

---

## §new — 새 change scaffold

### Inputs
- **`name`** (필수) — kebab-case (예: `director-preset-library`). 없으면 사용자에게 묻는다.

### Process

1. **사전 검증**
   - `name` 이 kebab-case 검증 (`^[a-z][a-z0-9-]*$`). 위반 시 abort + 안내.
   - `specs/changes/<name>/` 이미 존재하면 abort. 이어서 작업할지 사용자 확인.

2. **AskUserQuestion 인터뷰** (4 질문)
   - Q1. **Why** — 한 문단. "왜 이 변경이 필요한가? 기존 결정(decisions.md #N) 참조 가능"
   - Q2. **관련 decisions.md entry** (multi-select) — `specs/decisions.md` grep으로 후보 enumerate. "(없음)" 옵션 포함.
   - Q3. **영향 영역** (multi-select) — Affected specs / code / stores / types / DB / decisions
   - Q4. **tasks 섹션 개수** — 1~8개 예상. 각 섹션 이름은 placeholder로 두고 본인이 직접 채우게 안내.

3. **파일 생성**
   - `specs/changes/<name>/proposal.md`:
     ```markdown
     ---
     change: <name>
     status: active
     created: <today>
     decisions: [<from Q2>]
     ---

     # <Human-readable title from name>

     ## Why
     <from Q1>

     ## What Changes
     - <placeholder>

     ## Impact
     - Affected specs: <from Q3>
     - Affected code: <from Q3>
     - Affected stores: <from Q3>
     - Affected decisions: <Q2 echo>

     ## Verification gate (archive 조건)
     - tasks.md의 모든 [c] → [x]
     - <placeholder — 브라우저/e2e 검증 시나리오 채우기>
     - source-of-truth spec final state 반영
     ```
   - `specs/changes/<name>/tasks.md`:
     ```markdown
     # <name> — Tasks

     > PROGRESS.md mirror. 원본 PROGRESS.md는 그대로 유지.

     ## Active

     <Q4 만큼 섹션 placeholder>
     ### Section 1: <name>
     - [ ] task 1
     - [ ] task 2

     ## Blocked
     - (없음)

     ## Done
     - (없음)
     ```

4. **다음 단계 안내**
   - "What Changes 본문 / Verification gate 시나리오 채워주세요"
   - "decisions.md 새 entry 필요하면 별도 추가 (이 스킬은 entry append 안 함)"
   - "deltas/ 작성은 source-of-truth spec rewrite 직전에 (선택)"

### Safety
- 기존 폴더 덮어쓰기 금지 — Write 전 fs check.
- `decisions:` 배열에 *진짜 존재하는 번호*만 — Q2 후보 enumerate는 `grep '^### [0-9]' specs/decisions.md` 로.

---

## §lint — Active changes 검증

### Process

1. `specs/changes/*/` 모두 enumerate (`ls` 또는 Glob).
2. 각 change 폴더에 대해:
   - `proposal.md` 존재 + frontmatter parse
   - `tasks.md` 존재
   - frontmatter `decisions: [N, ...]` 각 N이 `specs/decisions.md`에 실제 존재 (grep `^### N\.`)
   - `internal_decisions: [N, ...]` 가 있으면 spec layer 파일에서 검증. **두 가지 형식 모두 fallback**:
     - heading 형식 — `grep '^### N\.' specs/layers/<name>.md`
     - **표 row 형식** — `grep -E '^\|\s*N\s*\|' specs/layers/<name>.md` (director_canvas.md §17 패턴)
     - 둘 중 하나라도 match면 존재 인정. 둘 다 없으면 WARN.
   - `tasks.md` 마커 일관성: `[ ]`, `[c]`, `[x]`, `[~]` 외 패턴 (`grep -E '^- \[[^ cx~]\]'`) 발견 시 경고
   - `status: archived` 인데 `specs/changes/` 에 있으면 경고 (archive/로 이동 필요)
3. **PROGRESS.md mirror 비교**:
   - PROGRESS.md `[c]` count vs `changes/*/tasks.md` `[c]` 합산
   - 차이 있으면 mirror gap 보고. 구체화:
     - PROGRESS.md `[c]` line을 dump → tasks.md 한 줄도 같은 task 키워드 (앞 30자) 매칭으로 추출
     - 매칭 안 되는 PROGRESS.md `[c]` 라인 = "PROGRESS only" 후보, 미러 누락
     - 매칭 안 되는 tasks.md `[c]` 라인 = "tasks only" (드뭄, 보통 PROGRESS가 superset)
   - heuristic이라 false positive 가능 — *후보*만 표시, 자동 수정 X

### Output

```
✓ redesign-l0-canvas — clean

✗ redesign-director-canvas
  - decisions [20, 26] 모두 존재
  - internal_decisions [10..18] 모두 §17 표 row 존재
  - tasks.md: [c] 31  [ ] 20  [x] 1  [~] 0
  - WARN: <구체 이슈가 있으면 한 줄씩>

PROGRESS.md mirror gap
  - PROGRESS.md [c]: 56
  - changes/*/tasks.md [c]: 51
  - Gap: 5 lines (PROGRESS only 후보)
    · "더블클릭 → Actor/World 선택 모달..."  (l0-canvas mirror 미반영)
    · "핀 → 빈 공간 = Status 자동 Branch"     (l0-canvas mirror 미반영)
    · ... (최대 5개 미리보기)
  → CLAUDE.md "잔여 마이그레이션: 새 작업 진입 시 그 영역만" 정책 — 즉시 액션 불필요

전체: 1 WARN, 0 ERROR
```

문제 없으면 단순 `✓` 줄. 자동 수정은 **하지 않음** (사용자가 직접 확인 후 수정).

---

## §archive — Archive 의식

### Inputs
- **`name`** (필수). 없으면 active changes 중에서 선택받기.

### Process

1. **사전 검증**
   - `specs/changes/<name>/` 존재 확인
   - `tasks.md` grep으로 미완료 마커 (`[ ]`, `[c]`, `[~]`) count
     - 0개면 진행 OK
     - 있으면 사용자에게 확인 ("X개 미완료. 정말 archive할까요?")
   - source-of-truth spec 본문 final state 반영 여부 사용자 확인 (이건 자동 검증 불가, 사용자 명시 답변)

2. **하네스 정합 체크** (specs만 게이트하면 rules/CLAUDE.md가 썩는다 — 2026-06 artist rule 사고 재발 방지)
   - proposal.md `Affected code`의 디렉토리들에 대해:
     - 그 paths에 걸리는 `.claude/rules/*.md` (frontmatter `paths:` grep으로 식별)
     - 해당 디렉토리(및 상위)의 `CLAUDE.md`
   - 위 파일들이 **변경 후 상태와 정합하는지 읽고 확인**. 폐기된 패턴/파일/모델명 언급 발견 시 archive 전에 수정 (또는 사용자에게 보고 후 함께 수정).
   - 아키텍처가 뒤집힌 change(롤백/재설계)면 rule **재작성**까지 이 단계에서.

3. **decisions.md entry 미리보기** (사용자 컨펌 후 commit)
   ```markdown
   ### <next-N>. <name> archived
   - **결정**: <name> 검증 완료, specs/archive/<date>-<name>/ 로 이동
   - **참고**: changes 시점 proposal + 최종 tasks 상태 archive 안에 보존
   - **일자**: <today>
   ```
   사용자가 entry 내용 조정 가능 — 단순 "archived" 이상의 결정/회고가 있으면 그것 반영.

4. **실행**
   - `git mv specs/changes/<name>/ specs/archive/<YYYY-MM-DD>-<name>/`
   - `specs/decisions.md` 가장 위 `## 확정` 아래 새 entry insert
   - tasks.md `## Active` 헤더를 `## Archived` 로 갱신 (timeline 가독성)

5. **출력**
   - 새 archive 경로 + decisions.md 갱신 위치
   - "git status 확인 후 commit하세요" 안내

### Safety
- `git mv` 사용 (history 보존). 일반 `mv`도 가능하지만 git이 인식하도록 stage.
- decisions.md mid-history 편집 금지 (append-only). 새 entry는 *맨 위* `## 확정` 바로 아래.
- 사용자 컨펌 없이 자동 archive 금지 — 미완료 마커 있을 때는 반드시 사용자 확인.

---

## §status — Active changes 현황

### Process

1. `specs/changes/*/` enumerate
2. 각각:
   - frontmatter parse (change, status, created, decisions)
   - `tasks.md` 에서 마커 count: `[ ]`, `[c]`, `[x]`, `[~]`
   - 가장 최근 수정 task line (heuristic: 파일 최근 작업) 1줄 표시

### Output

```
Active changes — 2026-MM-DD

1. redesign-l0-canvas (created 2026-05-17, decisions [29,30,31,32,33,34])
   [x] 24  [c] 8  [ ] 12  [~] 0
   → 우선순위: D-Followup 검증 (8 [c]) 또는 미착수 D-X 진입

2. redesign-director-canvas (created 2026-05-25, decisions [20,26])
   [x] 1  [c] 26  [ ] 18  [~] 0
   → 우선순위: D-1~D-3/D-7 브라우저 검증 (26 [c]) → D-4 진입

권장 다음 작업:
- 검증 우선 (가장 [c] 많은 director-canvas)
- 또는 신규 진입 (D-4 Writer↔Director sync)
```

### Safety
- read-only operation. 변경 없음.

---

## 자주 묻는 시나리오

| 사용자 의도 | sub-command |
|---|---|
| "D-6 작업 시작하려고" — D-6는 기존 director-canvas changes의 sub-task | sub-command 없음. tasks.md에 새 D-6 섹션만 추가 (직접 편집) |
| "완전 새 영역 변경, 이름 'editor-redesign'" | `/spec new editor-redesign` |
| "지금 어디까지 했는지 보고" | `/spec status` |
| "redesign-l0-canvas 끝났으니 archive" | `/spec archive redesign-l0-canvas` (모든 [x] 확인) |
| "active changes 검증" | `/spec lint` |
| "decisions #35 새로 추가하려고" | **본 스킬 범위 밖** — decisions.md 직접 편집 (append-only 룰만 유지) |

## 본 스킬이 *안 하는* 것

- `decisions.md` 새 entry 작성 — 사용자가 직접 (append-only 의식적 행위)
- `_constitution.md` 격상 — 사용자 결정 + 직접 편집
- source-of-truth spec (`specs/layers/*.md`) 본문 rewrite — 사용자 코드 작업의 결과로 자연스럽게
- PROGRESS.md mirror 자동 동기 — 현재 과도기, lint만 차이를 *보고*. 양방향 sync는 후속
- 코드 작성 / commit — `/spec`은 spec lifecycle만. 코드는 별도 작업

## 컨벤션

- frontmatter `decisions: [N]` 은 *실제 인용*한 entry만. grep trace 가능해야 함.
- kebab-case name. archive 경로는 `YYYY-MM-DD-<name>` (날짜 prefix로 timeline 정렬).
- 작업 진행 마커 (`[ ]` → `[c]` → `[x]`)는 constitution 룰. 동작 DoD는 브라우저 검증 후에만 `[x]`.
