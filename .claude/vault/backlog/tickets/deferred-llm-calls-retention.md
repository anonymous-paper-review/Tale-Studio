```yaml
id: llm-calls-보관-정책-결정-및-정리-장치-도입
source: .claude/vault/_DEFERRED.md D-002 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: waiting   # 원래 상태: 대기
priority: normal
```

# `llm_calls` 보관 정책 결정 및 정리 장치 도입


- **무엇을**: LLM 호출 전문 테이블의 정리 정책을 정하고 구현한다 (이관 확인 후 삭제 / 기간 보존 중 택1).
  현재는 아무것도 지우지 않아 무한 증가한다.
- **왜 미뤘나**: 개발 단계에서는 이중 보관(Supabase + 로컬 아카이브)이 더 안전하다는 판단.
  프로덕션 DB 행 삭제는 되돌릴 수 없어 서두를 이유가 없다.
- **언제 꺼내나**: 실사용 규모가 나와 `llm_calls`가 전체 DB 대비 부담이 될 때
  (판단 근거: `select count(*), pg_size_pretty(pg_total_relation_size('llm_calls')) from llm_calls`).
  런당 1~2MB 증가가 관측 기준.
- **되살릴 좌표**: 로컬 아카이버 `tools/archive/archive.mjs`(리포 밖, `.git/info/exclude`)가
  이미 읽어 보관 중 — 삭제를 붙인다면 여기에. 수집 쪽은 `src/lib/writer/llm/archive-calls.ts`.
- 기록: 2026-08-11

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `ready` 로 올린다. 조건이 사람만 알 수 있는 것이면 `needs-owner` 로 바꾼다.
