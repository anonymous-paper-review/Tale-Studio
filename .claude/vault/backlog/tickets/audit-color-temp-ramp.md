# 색온도 선형 램프 — writer 생성 아티팩트인가, sc_04 우연인가

```yaml
id: audit-color-temp-ramp
source: fixlog:F-006 부수 발견 2 (원문: .claude/vault/_archive/_FIXLOG.md)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: done   # 2026-08-16 밤 — 생성 아티팩트 확정(값 4개+ 씬 194개 중 등차 69개, 판정선 2개를 크게 넘음). 단 원인은 모델 버릇이 아니라 제품 프롬프트 지시(v4_shots.ts:396)였고, +300K는 반복되지 않는다. 밤인데 4000K 초과로 끝나는 씬 56개 중 19개.
priority: normal
```

- **맥락 (사람 말로)**: 밤 씬인데 샷이 진행될수록 조명 색온도가 정확히 샷당 +300K씩 계단처럼
  올라가 낮 색온도로 끝나는 모순이 한 씬에서 발견됐다. 글쓰기 모델이 그럴듯한 수열을 지어내는
  버릇(생성 아티팩트)인지, 그 씬만의 우연인지 가려야 한다. 이 값을 소비하는 하류 경로에 모순이
  그대로 전파되므로, 버릇이 맞다면 수리 대상이 된다.
- **알고 싶은 것**: `static_spec.lighting.color_temp_kelvin` 의 씬 내 등차수열 패턴이 sc_04 밖에서도
  재현되는가.
- **깔고 있는 전제**: `static_spec` 이 있는 샷이 충분히 존재한다 (F-002 분할 자식은 null — 제외하고 센다).
- **어떻게 재나**: 씬별로 샷 순서대로 `color_temp_kelvin` 을 뽑아, ① 인접 샷 간 차분이 상수(±0 허용)인
  씬의 비율 ② 그 상수가 +300 인 씬의 비율 ③ `scenes.time_of_day` 와 최종 색온도의 모순 여부
  (Night 인데 4000K 초과로 끝남)를 센다. 채점은 코드로 — 모델 판정 없음.
- **판정선 (미리)**: 값이 4개 이상인 씬 중 **등차수열 씬이 2개 이상**이면 "생성 아티팩트" 판정 →
  fix 후보로 아침 리포트에 올린다. 1개 이하(= sc_04 뿐)면 "우연" 판정 → done, 추가 조치 없음.
  등차 판정의 애매값: 차분 편차 ±50K 이내면 등차로 친다 `(제안)`.
- **잴 대상 실재 확인**:
  - 찾아본 것: F-006 조사에서 sc_04 실측 (2800→4500K, +300K/샷)
  - 나온 개수: 1건 (2026-08-13, .claude/vault/_archive/_FIXLOG.md F-006)
- **좌표**: `shots.static_spec` (jsonb, `lighting.color_temp_kelvin`), `shots.scene_id`,
  `scenes.time_of_day`. DB 는 읽기 전용.
- **남기면 끝**: `research/experiments/color-temp-ramp/` 결과 문서 + 기계 리포트 한 줄 + status 갱신.
