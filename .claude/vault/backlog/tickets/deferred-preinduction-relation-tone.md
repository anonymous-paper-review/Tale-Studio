```yaml
id: 사전유도-원장의-관계톤-축-고도화
source: .claude/vault/_DEFERRED.md D-019 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: waiting   # 원래 상태: 대기
priority: normal
```

# 사전유도 원장의 관계·톤 축 고도화


- **무엇을**: `deriveLedger`가 관계 상태를 `emotion_beat.end` 한 단어로만 뽑는 것을 고친다
  (실측 대조: 같은 씬에서 순차 메모리는 "연관성을 의심하기 시작함", 원장은 `suspicion`).
  `scene_actions`·`dialogue_summary`에서 관계 변화와 톤 전이를 문장으로 유도하는 방향.
  **사실 축은 이미 순차와 대등**하므로(오히려 씬 저작이 확정한 사실이라 더 직접적) 건드리지 않는다.
- **왜 미뤘나**: 속도 전환을 먼저 태우기로 함(오너 결정). 빈약함은 알려져 있으나 결정론 지표에서 손상이 안 났다.
- **언제 꺼내나**: D-018 심판에서 B가 A에 밀리면 즉시 — 그때 이게 1순위 처방이다. 밀리지 않으면 저순위.
- **되살릴 좌표**: `src/lib/writer/pipeline/stages/dialogue.ts`의 `deriveLedger`,
  대조표는 `research/experiments/dialogue-parallel-ledger/HYPOTHESIS.md` 부록.
- 기록: 2026-08-11

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `ready` 로 올린다. 조건이 사람만 알 수 있는 것이면 `needs-owner` 로 바꾼다.
