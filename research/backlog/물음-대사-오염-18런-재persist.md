```yaml
id: 대사-오염-18런-재persist
source: research/backlog/_MORNING.md Q7 — 2026-08-15 한 원장으로 통합하며 옮겨옴
종류: (해당 없음 — 사람이 답할 것)
budget: { usd: 0, runs: 0, wall_min: 0 }
blockers: []
status: 사람대기
priority: normal
```

# 대사 오염 18런 재persist — 실행 시점



- **원문** (writer-integrity-performance §3): "재persist 실행 시점 — 닫히는 조건: 오너 지시. (감사 스크립트 audit1~8이 스크래치에, 조인 시뮬레이션은 dialogue_join.ts와 동형)" — Sample1 최우선, LLM 0콜, design_ref 보존 복구.
- **분해**: 성분 하나 — 실행 시점만. 단 DB **write** 작업이라 밤 러너 관할 밖(불변 규칙 5) — 지시하면 낮 세션에서 실행.

---

> 옮겨온 문서다. **오너만 답할 수 있는 것**이라 밤 루프는 집지 않는다.
> 답이 나오면 그 답에서 나오는 실행 단위를 새 일감으로 만들고 이건 `완료` 로 닫는다.
