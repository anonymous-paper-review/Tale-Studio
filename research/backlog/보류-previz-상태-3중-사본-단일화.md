```yaml
id: previz-상태-3중-사본-단일화
source: .claude/vault/_DEFERRED.md D-017 — 2026-08-15 한 원장으로 통합하며 옮겨옴
종류: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: 조건대기   # 원래 상태: blocked
priority: normal
```

# previz 상태 3중 사본 단일화


- **무엇을**: writer-store.shots / director ShotNodeData / DB 세 벌로 나뉜 샷 상태를 합성 구조로 정리한다.
  진단 원문: "문제는 '수정 표면이 3곳'이 아니라 '진실 사본이 3벌'이고, 처방은 동기화가 아니라 합성이다".
- **왜 미뤘나**: 품질 대작업을 먼저 하려고 상태 구조를 동결했다 — "일단 현상태 유지할게"(2026-08-04).
- **언제 꺼내나**: 품질 작업이 일단락된 뒤. 다만 그 사이 sync 훅에 Pass 2.7(실사 일괄 자동채움)이
  추가돼 구조가 더 커졌으므로, 미루는 비용이 계속 오르고 있다.
- **되살릴 좌표**: `features/director/hooks/use-writer-director-sync.ts`, `stores/writer-store.ts`, `stores/director-store.ts`.
- 기록: 2026-08-11 (원 발화 2026-08-04)

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `실행대기` 로 올린다. 조건이 사람만 알 수 있는 것이면 `사람대기` 로 바꾼다.
