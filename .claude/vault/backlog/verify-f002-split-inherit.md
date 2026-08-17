# 분할 자식 부분 상속 검증 — 기아 수리가 실렸는가

```yaml
id: verify-f002-split-inherit
source: fixlog:F-002 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 20 }
blockers: [until:수리 커밋 b32c4b2 이후의 writer 런에서 분할 자식 샷이 생성됐을 것]
status: waiting   # 2026-08-16 밤 — 해제 조건 재확인: b32c4b2(2026-08-12T10:46Z) 이후 design_ref 가 빈 샷 0건. 아직 안 참 → 대기 유지
priority: normal
```

- **맥락 (사람 말로)**: 샷 하나를 둘로 쪼갤 때 둘째 자식이 설계 정보를 통째로 못 받던 결함을
  "부분 상속"으로 고쳤다(`b32c4b2`). 시간이 지나도 참인 정보(조명·렌즈·팔레트)는 물려받고,
  시간이 지나면 거짓이 되는 정보(첫 장면 묘사·시선)는 안 물려받는 게 맞는 동작이다.
- **알고 싶은 것**: 수리 이후 신규 런의 분할 자식이 부분 상속의 서명을 갖는가.
- **어떻게 재나**: 신규 런의 분할 자식(= `design_ref` 가 null 인 샷)의 DB 행을 읽는다.
- **판정선 (부분 상속의 서명 — 둘 다 성립해야 통과)**:
  1. `static_spec` 에 카메라·조명·팔레트가 **있고** `first_frame_prompt`/`focal_point` 는 **비어** 있다.
  2. `dynamic_spec` 에 `camera_motion` 은 **있고** `character_motion`/`gaze_arc` 는 **없다**.
  전부 비어 있으면 기아 재발(수리 미배송), 전부 차 있으면 과잉 상속(F-002 의 원 사고 재현) — 둘 다 실패.
- **데이터 축은 이미 닫혔다**: 기존 분할 자식의 소급은 불가로 확정(2026-08-12) — 이 티켓은 향후 생성 검증만.
- **남기면 끝**: 기계 리포트 한 줄 + 이 파일 status 갱신. 통과면 F-002 완전 종결.
