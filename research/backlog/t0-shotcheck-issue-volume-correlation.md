# t0-shotcheck-issue-volume-correlation — 검수가 오래 걸리는 이유가 지적 건수인가

```yaml
id: t0-shotcheck-issue-volume-correlation
source: sweep:claude:62428d65
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 50 }
blockers: []
status: 완료  # 2026-08-12 밤 러너 — 가설 유지(잠정). 유효 n=10, 피어슨 지적 0.946/0.918 > 샷수 0.561. 기각 조건 미발동. 흠: 강한 두 점이 씬별 팬아웃 실행(호출 수 교락), 제외 시 n=7로 하한 미달. 결과: research/experiments/t0-shotcheck-issue-volume-correlation/
priority: high
```

- **맥락 (사람 언어)**: 어제 하루 종일 작업 시간을 줄였다. 큰 병목 두 개는 잡았는데(**9분 → 4~5분 경로가 보임**), 오너가 마지막에 남긴 질문이 안 닫혔다 — "**샷 설계랑 검수가 여전히 너무 긴 거 아니냐**". 검수를 줄여보려 한 두 가지 시도가 **둘 다 실패**했다. 하나는 씬별로 쪼개기(오히려 지적이 6.8배로 폭증), 하나는 출력을 줄이기(2%밖에 안 줄어 폐기). 실패한 실험에서 값진 단서가 하나 나왔다: **검수 시간을 정하는 건 결과물의 크기가 아니라 "지적을 몇 건 하느냐"인 것 같다**는 것. 같은 입력으로 돌렸는데 87초와 112초로 갈렸다. 이게 맞으면 처방이 완전히 달라진다 — 검수를 손보는 게 아니라, **애초에 지적당할 일을 덜 만들도록 앞 단계를 손봐야** 한다.
- **가설**: shotCheck의 벽시계 시간은 입력 샷 수보다 산출된 지적 건수(`semantic_issues`)와 더 강하게 붙어 있다.
- **전제**: 두 처방(씬 단위 fan-out, 출력 다이어트)이 모두 기각된 것은 vault·어제 세션에 기록됨. 다이어트 실험에서 "분할안은 출력의 4분의 1뿐, 76%는 이슈 목록"이 실측됨. 같은 픽스처가 87.6~111.8초로 흔들린 것도 실측. **상관 자체는 미검정.**
- **예측**: 참이면 (지적 건수, 벽시계) 쌍의 상관이 (샷 수, 벽시계) 상관보다 뚜렷하게 높다. 거짓이면 샷 수 쪽이 더 높거나 둘 다 약하다 — 후자면 시간의 주범이 제3의 것(모델 지연 분산 등)이고, 앞 단계를 손보는 처방의 근거가 사라진다.
- **측정**: 기존 A/B·다이어트 실험과 풀런의 로그에서 shotCheck 실행마다 (입력 샷 수, 산출 `semantic_issues` 건수, 벽시계 초) 삼중쌍을 뽑아 **코드로 상관을 계산**한다(피어슨 + 산점도). 새 LLM 호출 없음 — 기존 기록 재분석만. 표본이 8개 미만이면 상관 대신 **원자료 표를 그대로 싣고 "표본 부족"으로 판정 보류**한다(고분산 지표를 적은 표본으로 단정하지 않는다).
- **기각 조건** (사전 등록): 지적 건수와의 상관이 샷 수와의 상관보다 **높지 않으면 가설 기각**. 유효 표본 8개 미만이면 "측정 불가·표본 부족"으로 종료(기각 아님).

## 좌표 (동결)

- shotCheck 구현: `src/lib/writer/pipeline/stages/c_application_2.ts` (`semantic_issues` 산출)
- 착수 게이트 주석(시간 예산 맥락): `src/lib/writer/pipeline/steps.ts:201-209` — `#shotcheck-gate 2026-08-11`
- 로그 원천: 프로젝트별 `logs/<projectId>/` 의 단계 산출 JSON, 그리고 Supabase `writer_runs.state.shotCheck`
- 기존 실험 폴더(재분석 대상): `research/experiments/writer-full-run/` (풀런 프로파일 — 오늘 미커밋 변경 있음, 읽기만 할 것)
- **주의**: 새 shotCheck 호출을 돌리지 마라 — 유료이고 이 티켓은 기존 기록만으로 죽는다.

## 산출 계약

- `research/experiments/t0-shotcheck-issue-volume-correlation/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄
