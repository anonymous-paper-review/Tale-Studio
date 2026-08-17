# t0-loose-schema-unguarded-fields — 검사 안 하는 필드를 하류가 무방비로 만지는 곳이 몇 개인가

```yaml
id: t0-loose-schema-unguarded-fields
source: sweep:gjc:019fef52 (2/2)   # 형제: t0-scene-schema-typo-prevalence
kind: audit
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 가설 유지(무방비 접근 7건 / 4자리 / 3파일 > 기각선 2). 기각 조건 미발동. 시드 사고 지점(v3_scene_plan.ts:123)이 자동 분류에 그대로 잡혀 분류기 검증됨. 형제 대조 문단 포함. 결과: research/experiments/t0-loose-schema-unguarded-fields/
priority: high
```

- **맥락 (사람 언어)**: 형제 티켓이 "이 사고가 몇 번 일어났나"를 센다면, 이건 **"앞으로 몇 군데서 더 터질 수 있나"**를 센다. 어제 나온 제안은 "모든 곳에 필수 항목을 강제하지 말고, **데이터의 주인이 되는 자리 한 곳에서 한 번 세게 검사하자**"였다. 그 제안을 받아들일지 말지는 사람이 정할 일이지만, 정하려면 숫자가 하나 필요하다 — 지금 검사망을 안 거치는 항목 중에서, 다음 단계가 "당연히 있겠지"하고 그냥 꺼내 쓰는 게 몇 개인지. 그게 1~2개면 그 자리만 막으면 되고, 열 개가 넘으면 구조를 바꾸는 게 맞다.
- **가설**: 느슨한 스키마가 검사하지 않는 씬 필드 중, 하류 단계가 존재를 가정하고 접근하는(널 가드 없이 `.join()`·`.map()`·인덱싱) 필드가 3개 이상이다.
- **전제**: 검증 공백은 어제 코드로 확인됨 — 느슨한 스키마는 3개 필드만 보고, Act/예산 교정 호출에는 스키마 자체가 없으며, 재개 경로는 런타임 검증 없이 타입만 신뢰한다. **공백의 크기만 미측정.**
- **예측**: 참이면 무방비 접근 지점이 3개 이상 나오고, 각각이 잠재 크래시 지점이다. 거짓이면 0~2개 — 그러면 소유 경계 재설계보다 그 지점 국소 수리가 싸다.
- **측정**: ① 씬 타입 정본에서 전체 필드 집합을 뽑고 ② 느슨한 스키마가 실제 검사하는 필드 집합을 뽑아 **차집합(= 무검사 필드)**을 만든다 ③ 그 각 필드에 대해 하류 스테이지에서 널 가드 없이 접근하는 지점을 grep으로 찾아 파일·라인과 함께 열거한다. 코드 추적만, LLM 판정 없음. 산출: 무검사 필드 목록 / 필드별 무방비 접근 지점(파일:라인) / 총계.
- **기각 조건** (사전 등록): 무방비 접근 지점이 **2개 이하**면 가설 기각 — "국소 수리로 충분"이 결론이 된다. 판정이 애매한 접근(옵셔널 체이닝·기본값 있음)은 **NA로 분류하고 세지 않는다**(판정 3원칙: 불확실은 NA).

## 좌표 (동결)

- 스키마 정본: `src/lib/writer/pipeline/schemas.ts`
- 씬 타입 정본: `src/lib/writer/types/pipeline.ts`
- 하류 스테이지 디렉토리: `src/lib/writer/pipeline/stages/` (특히 `v3_scene_plan.ts`, `v4_shots.ts`, `decoupage.ts`)
- 알려진 무방비 지점(1건, 시드): `src/lib/writer/pipeline/stages/v3_scene_plan.ts:123` — `characters_in_scene.join()`
- 병합 경로: `s1s3_merged.ts` (같은 느슨한 스키마 사용)

## 산출 계약

- `research/experiments/t0-loose-schema-unguarded-fields/{result.md, results.json}`
- 이 티켓 status 갱신 + `.claude/vault/backlog/reports/2026-08-12.md`에 1줄
- **형제 티켓과 함께 읽히도록** result.md 말미에 `t0-scene-schema-typo-prevalence` 결과와의 대조 한 문단(빈도 × 노출면)을 남긴다
