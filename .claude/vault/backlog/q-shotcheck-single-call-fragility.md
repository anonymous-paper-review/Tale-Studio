```yaml
id: shotcheck-단일-콜-취약성
source: .claude/vault/backlog/_MORNING.md Q11 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (해당 없음 — 사람이 답할 것)
budget: { usd: 0, runs: 0, wall_min: 0 }
blockers: []
status: needs-owner
priority: normal
```

# shotCheck 단일 콜 취약성 — 1회 실패 = 149샷 검증 소실



- **원문** (llm-quota-capacity §3 잔가지): "단일 콜이라 1회 실패 = 149샷 검증 전부 소실. fan-out을 못 켜는 상황에서 이 취약성을 어떻게 다룰지 미정."
- **분해**: ① fan-out은 기각 확정(씬-로컬성 ≠ 규모 불변성 — 코드도 삭제됨) ② 남은 선택지는 실패 시 재시도 정책 / 소실 수용+배지 ③ 다이어트 재도전은 "이슈 볼륨" 방향 + ±30% 가드·3런 설계로만 (D-a).

---

> 옮겨온 문서다. **오너만 답할 수 있는 것**이라 밤 루프는 집지 않는다.
> 답이 나오면 그 답에서 나오는 실행 단위를 새 티켓으로 만들고 이건 `done` 로 닫는다.
