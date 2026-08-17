# t0-constraint-target-routing-effect — 글에서만 의미 있는 지적이 그림 주문서에서 실제로 빠졌는가

```yaml
id: t0-constraint-target-routing-effect
source: sweep:gjc:019fef12
kind: audit
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 가설 유지(커밋 이후 런 1건, 노트 12건 전부 visual·게이트 누출 0·프롬프트 누출 0). 기각 조건 미발동. 반쪽 확인: 그 런에 text/report_only 분류가 0건이라 "골라내는 동작" 자체는 미목격. 정직 보고: 1차 키워드 판별이 전건 오탐(시각 제약의 영어 대명사) → 분류 필드 대조로 교체. 결과: research/experiments/t0-constraint-target-routing-effect/
priority: normal
```

- **맥락 (사람 언어)**: 어제 108장을 생성한 실험이 끝났다. 결론은 반쪽 성공이었다 — 검수 지적을 그림 주문서에 넣으면 **그 지적을 지키는 비율은 27%에서 51%로 확실히 올랐는데**, "그래서 더 쓸 만한 그림이 나왔냐"는 27승 27패로 완전 무승부였다. 그래서 처방이 "다 넣자"가 아니라 **"골라 넣자"**로 바뀌었다: 화면으로 확인할 수 있는 지적("공책을 들고 계단을 뛴다")만 그림 쪽으로 보내고, 글에서만 의미 있는 지적("이 인물은 남자니까 he로 쓸 것")은 그림 주문서에서 빼기로 했다. 코드까지 고쳐 올렸다. **그런데 실제로 새 작업을 돌렸을 때 그림 주문서가 깨끗해졌는지는 안 봤다.**
- **가설**: 라우팅 커밋(`95c8af8`) 이후 생성된 런에서는 그림·영상 주문서에 텍스트 전용 지적(대명사·문법·대사 지시)이 실리지 않는다.
- **전제**: 분류 필드(`constraint_target`: visual / text / report_only) 추가와 visual만 통과시키는 게이트는 커밋됨(`95c8af8`, 테스트 15개 통과). 기존 저장 데이터의 분류 누락 노트도 안전상 차단하도록 fail-closed 처리됨. **실런 효과만 미확인.**
- **예측**: 참이면 커밋 이후 런의 그림 주문서에서 텍스트 전용 지적이 0건이다. 거짓이면 여전히 섞여 있다 — 게이트가 새고 있다는 뜻이다.
- **측정**: **Phase 0** — `95c8af8` 커밋 시각 이후 생성된 런이 DB에 존재하는지 먼저 확인한다. 없으면 "측정 불가·모집단 부재"로 즉시 종료하고 done 처리하지 않는다(대기 상태로 결과에 명시). 있으면: 그 런들의 `check_notes` 및 이미지·영상 프롬프트를 뽑아, 텍스트 전용 지적의 표지(대명사 지시·문법 교정·대사 문구)가 프롬프트 쪽에 등장하는지 **코드 패턴으로 집계**한다. 커밋 이전 런을 대조군으로 같은 방식으로 세어 나란히 놓는다.
- **기각 조건** (사전 등록): 커밋 이후 런의 그림 주문서에 텍스트 전용 지적이 **1건이라도** 있으면 가설 기각 — 해당 노트 원문과 런 ID를 남긴다. 패턴 매칭으로 분류가 애매한 노트는 **NA로 분류**하고 세지 않되, NA 건수를 결과에 명시한다.

## 좌표 (동결)

- 분류 필드 정의: `src/lib/writer/types/pipeline.ts` (`constraint_target`)
- 게이트 구현: `src/lib/writer/check-notes.ts`
- 생성 지점: `src/lib/writer/pipeline/stages/c_application_2.ts` (shotCheck — 지적과 제약을 만드는 단계)
- 커밋: `95c8af8 fix: route check constraints by target`
- 선행 실험(결론의 출처): `research/experiments/checknote-previz-ab/{result.md, review.html, results.json}`, 티켓 [t2-checknote-previz-ab](t2-checknote-previz-ab.md) (done)
- DB 접근 선례: `research/experiments/t0-dynamic-spec-enum-audit/collect.mjs`

## 산출 계약

- `research/experiments/t0-constraint-target-routing-effect/{result.md, results.json}`
- 이 티켓 status 갱신 + `.claude/vault/backlog/reports/2026-08-12.md`에 1줄
