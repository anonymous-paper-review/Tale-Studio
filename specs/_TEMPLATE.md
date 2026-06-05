# specs/changes/<name>/ — 캐넌 템플릿

> 새 변경 작업의 표준 구조. 본 파일은 *참조용*; 실제 새 change는 폴더 생성 후 아래 3개 파일을 복사·편집.

OpenSpec 패턴 (changes/+archive/) 도입. `decisions.md`는 rolling cross-cutting 로그로 유지 (decisions #로 entry 참조).

---

## proposal.md (필수)

```markdown
---
change: <kebab-case-name>
status: active                          # active | archived
created: YYYY-MM-DD
decisions: [N, N, N]                    # decisions.md entry 번호 (관련된 경우)
---

# <Human-readable title>

## Why
<왜 이 변경이 필요한가. 한 문단. 기존 결정(decisions.md #N)을 참조.>

## What Changes
- <변경 1>
- <변경 2>
- <변경 3>

## Impact
- Affected specs: <layers/director_canvas.md 같은 path 나열 (없으면 "없음 — 코드 source-of-truth")>
- Affected code: <src/features/artist/ 같은 영역 나열>
- Affected stores: <stores/artist-store.ts 같은 path>
- Affected decisions: <#N, #N>
```

---

## deltas/<spec-name>.md (선택)

source-of-truth spec에 적용할 ADDED/MODIFIED/REMOVED Requirements 명세. 1차 셋업에서는 placeholder도 OK.

```markdown
# Delta: <path-to-spec>

> 이 파일은 <change-name> change가 source-of-truth spec에 적용할 ADDED/MODIFIED/REMOVED Requirements를 명세합니다.

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
```

---

## tasks.md (필수)

작업 항목 체크리스트. 루트 `PROGRESS.md`와 동일한 상태 마커 사용.

```markdown
# <change-name> — Tasks

## Active
- [c] task 1 — 코드 ✓ / 검증 대기 (Y-M-D)
- [ ] task 2

## Blocked
- [~] task 3 — blocked by <reason>

## Done (이 change 내)
- [x] task 0 — DoD 충족 (Y-M-D)
```

---

## Archive 의식

`tasks.md`의 모든 `[ ]`가 `[x]` 되고 사용자 검증 통과 + source-of-truth spec 실제 업데이트 완료 → `mv specs/changes/<name> specs/archive/YYYY-MM-DD-<name>/` + `decisions.md`에 archive entry 1줄 append.
