```yaml
id: dynamic-spec-enum-검증기
source: .claude/vault/backlog/_MORNING.md Q16 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: (해당 없음 — 사람이 답할 것)
budget: { usd: 0, runs: 0, wall_min: 0 }
blockers: []
status: needs-owner
priority: normal
```

# dynamic_spec enum 검증기 — 위반 982건 실측, 설계 선택 필요 (8/11 밤 러너 신규)



- **원문** (t0-dynamic-spec-enum-audit 기각 조건 발동 절차): "≥1건이면 위반 원문을 첨부해 검증기 추가 안건으로 카드 추가" — 실측은 1건이 아니라 **672스펙에 982건, 7개 enum 필드 전부**.
- **분해** (증거: `research/experiments/t0-dynamic-spec-enum-audit/result.md`):
  1. **의미론적 공백형 (최대 볼륨)**: static 샷의 speed/magnitude를 모델이 `none`으로 채움(410·365건) — enum에 "해당 없음" 값이 없어 생기는 구조적 위반. 단순 검증기는 static 샷 대부분을 reject한다.
  2. **어휘 변형형**: transition의 fade 계열(fade_in/fade_to_black/fade_out — 97건, enum의 fade·dissolve는 미사용), camera type의 panning/shake(2건).
  3. **인접 enum 혼선형**: character_motion magnitude에 camera쪽 어휘(minimal/moderate) 유입 66건.
  4. **사문형**: environmental_change magnitude는 관측 5건 전부 enum 밖.
- **선택지**:
  - (a) enum을 실분포에 맞게 개정(none 추가·fade 계열 통합) + 검증기 — 계약을 현실에 정렬.
  - (b) 검증+repair(정규화 매핑: none→minimal, fade_in→fade 등) — 계약 유지, 하류 소비자가 안전.
  - (c) 보류 — 하류(compile/모션 프롬프트)가 이 값들을 실제로 어떻게 소비하는지 추적 후 결정 (스코프 추적 티켓 draft 가능).
- 관련: 하류 소비자가 enum 위반 값을 어떻게 처리하는지(무시? 오작동?)는 미측정 — (c) 선택 시 T0 티켓 1장.

---

> 옮겨온 문서다. **오너만 답할 수 있는 것**이라 밤 루프는 집지 않는다.
> 답이 나오면 그 답에서 나오는 실행 단위를 새 티켓으로 만들고 이건 `done` 로 닫는다.
