```yaml
id: end-프레임-명시-서술-이관
source: .claude/vault/_DEFERRED.md D-004 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: waiting   # 원래 상태: blocked
priority: normal
```

# END 프레임 명시 서술 이관


- **무엇을**: 러프 END 패널을 "완료된 프레임의 모습"으로 컴파일해 주입하는 강화를 프로덕트에 넣는다.
- **왜 미뤘나**: 하네스 비교에서 효과가 large 진폭 샷에만 국한됐다. 진폭 감사 결과 설계 자체가
  저진폭(19샷 중 large 26%)이라, 저진폭 샷의 END≈START는 설계에 충실한 것이지 결함이 아니었다.
- **언제 꺼내나**: v4가 `end_state`를 상류에서 산출하도록 확장한 뒤 — 그게 근본 처방이다.
  상류 확장 없이 END 지시만 강화하면 없는 변화를 지어내게 된다.
- **되살릴 좌표**: `src/lib/writer/rough-storyboard-grid.ts`의 END 파트,
  실험 기록 `research/experiments/2026-08-07_viz-gap-cineline/RESULT.md` §6c(진폭 감사).
- 기록: 2026-08-10

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `ready` 로 올린다. 조건이 사람만 알 수 있는 것이면 `needs-owner` 로 바꾼다.
