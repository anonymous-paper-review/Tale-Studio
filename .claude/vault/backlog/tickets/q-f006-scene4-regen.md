# 시트 간 시간대 표류 — Scene4 재생성 육안 (오너 행동)

```yaml
id: q-f006-scene4-regen
source: fixlog:F-006 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: (해당 없음 — 오너 육안 판정)
blockers: [human-labor:1e166e55 Scene4 시트 재생성 + 육안]
status: needs-owner
priority: normal
```

- **맥락 (사람 말로)**: 한 씬을 두 장의 시트로 나눠 그릴 때 각 시트가 시간대를 제멋대로 지어내
  같은 씬인데 낮/밤이 갈린 사고. 씬의 시간대를 시트 전역 조명 문장으로 주입하는 수리(`5492cc1`)가
  들어갔지만, 기존 산출물은 그대로다 — 재생성해야 통일된다.
- **할 것**: `1e166e55` Scene4 의 두 시트(`sh_04_21~24` / `sh_04_25~27`)를 재생성해 둘 다 같은
  Night 로 나오는지 육안. 프롬프트 확인은 `generation_jobs.input_snapshot` 의 `scene_time_of_day` 와
  "Scene lighting" 줄 — 코드 재구성 없이 바로 보인다.
- **닫히는 조건**: 두 시트 시간대 일치 육안 확인. 이것이 F-006 을 닫고, F-004 검증(anchor fal
  테스트)의 완결 조건이기도 하다 — 순서상 이걸 먼저 하는 게 싸다.
