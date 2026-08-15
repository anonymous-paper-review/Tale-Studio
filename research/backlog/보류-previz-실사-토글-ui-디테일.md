```yaml
id: previz-실사-토글-ui-디테일
source: .claude/vault/_DEFERRED.md D-009 — 2026-08-15 한 원장으로 통합하며 옮겨옴
종류: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: 조건대기   # 원래 상태: blocked (오너 입력 대기)
priority: normal
```

# previz/실사 토글 UI 디테일


- **무엇을**: 스토리보드 뷰의 "Previz / Real" 전환 UI 세부를 정리한다. 기능(목각·실사 둘 다
  START+END 생성, 기본은 목각)은 구현됐고 버튼도 우상단에 있다.
- **왜 미뤘나**: "UI적인 내용은 디테일을 고민해보고 알려줄게 일단은 node 뷰는 건들지 말고"(2026-07-22).
- **언제 꺼내나**: 오너가 UI 디테일을 전달할 때. node 뷰는 건드리지 않는다는 제약이 함께 걸려 있다.
- **되살릴 좌표**: `src/features/director/canvas-views/StoryboardGridView.tsx`.
- 기록: 2026-08-11 (원 발화 2026-07-22)

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `실행대기` 로 올린다. 조건이 사람만 알 수 있는 것이면 `사람대기` 로 바꾼다.
