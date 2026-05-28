# specs/archive

완료 + 검증된 change 보관. **Archive 의식 = 검증 게이트**.

## 어떻게 archive 하는가

1. `specs/changes/<name>/tasks.md`의 모든 `[ ]`가 `[x]` 됨
2. 사용자 검증 통과 (브라우저, e2e, 또는 합의된 검증 절차)
3. 변경된 source-of-truth spec (`specs/layers/L0_concept_canvas.md`, `specs/layers/director_canvas.md` 등) 본문 실제 업데이트 완료
4. `mv specs/changes/<name> specs/archive/YYYY-MM-DD-<name>/`
5. `specs/decisions.md`에 archive 사실 1줄 append (entry 번호 + archive 폴더 링크)

## 어떻게 timeline 뷰를 보는가

- `ls -t specs/archive/` — 최신순 정렬
- `git log specs/archive/` — git 히스토리
- 향후 log4brains 도입 시 정적 사이트 뷰

## 트리거 — Option Y 이행 시점

- `decisions.md` > 500줄
- Dev A/B가 같은 entry 동시 편집으로 merge conflict 발생
- 결정 cross-reference 많아져 grep으로 항해 어려움

위 트리거 도달 시 별도 세션에서 `decisions.md` → `docs/adr/0001..NNNN.md` 분해 검토. `specs/changes/`, `specs/archive/` 구조 자체는 그대로 유지.

## 레거시 archive

- `specs/archive/decisions_legacy_2026-03-03.md` (예정) — 코드베이스 리셋 전 결정 로그가 있다면 여기 보관.
