# gen-previz-angle-rotate — previz 이미지를 다른 각도로 돌려 찍은 것처럼 생성해보기 실측

```yaml
id: gen-previz-angle-rotate
source: _INBOX.md 형석 메모 "previz 이미지 다른 각도로 찍는 것처럼 돌려보기 (연출적 요소를 잘 만족할 경우 조금 consistency가 깨져도 사용할 수 있지 않을까)" + 오너 피드백 2026-08-18 답 7번 (실행 지시)
kind: generation
budget: { usd: 15, runs: 1, wall_min: 90 }   # 오너 실행 지시 인용, 금액은 세션 에이전트가 일일 한도 $50 내 배분해 2026-08-18 보고 — 초과 시 즉시 중단
blockers: [until:product-auth-session-for-project-3187bb25]
status: done
priority: high
```

## 오너 실행 지시 (원문, 2026-08-18)

> 3개 다 projectId=3187bb25-a117-4c62-b259-c20f4d856f5d 이 프로젝트로 테스트 진행해서
> 아티팩트로 결과 작성해줘.

## 알고 싶은 것

previz 이미지에 "다른 카메라 각도로" 요청을 걸어 생성하면 무엇이 유지되고 무엇이 깨지는가.
형석의 가설: viz(실사풍) 이미지는 일관성이 깨져 못 쓰지만, previz(목각 인형)는 연출 요소만
잘 맞으면 다소 깨져도 쓸 만할 수 있다.

## 어떻게 재나

1. 대상 프로젝트 `3187bb25-a117-4c62-b259-c20f4d856f5d` 에서 previz 이미지가 있는 샷을 고른다.
2. 같은 previz 원본에 각도 변경 요청 2~3종(예: 반대편에서, 위에서, 옆에서)을 발주한다.
   각 요청의 프롬프트 원문을 기록.
3. 원본과 각 산출을 나란히 배치하고, 사실만 기록: 인물 수·소품 존재 여부 등 세어지는 항목의
   유지/변화, 오류 유무, 비용. **연출적으로 쓸 만한가의 판정은 오너 몫.**
4. 기존 실험(`t2-bg-viewsheet-from-3d`, viewsheet 계열)과 겹치는 실측이 있으면 링크만 하고
   재실험하지 않는다.

## 판정선

원본 + 각도별 산출이 나란히 남고 각 산출에 프롬프트 원문·비용이 붙으면 done. 발주 실패도
오류 원문과 함께면 done.

## 무엇을 남기면 끝난 건가

- `research/experiments/gen-previz-angle-rotate/` 에 아티팩트.
- 이 파일 status 갱신 + 기계 리포트 한 줄 + 아침 리포트 결과 카드.

## 실행 확인

2026-08-18에 target project의 product director 화면 인증을 확인했지만, 사용할 오너 세션이
인증 세션 확보 뒤에만 원본과 다른 각도 산출을 발주한다.

## 2026-08-19 결과

- 원본과 반대편·높은 세 방향·낮은 옆 방향 산출물을 만들었다.
- Higgsfield 작업:
  - 반대편: `b88a7f44-259f-4bde-8dea-cae07af4551f`
  - 높은 방향: `4396fa45-4052-41f4-9e7b-1749746a2188`
  - 옆 방향: `b322b90b-7bac-4bcf-bd89-56b795935b0e`
- 산출물과 프롬프트 원문: `research/experiments/gen-previz-angle-rotate/`
- 대상 프로젝트 Supabase 조회는 HTTP 402로 막혀, 기존 Higgsfield 작업 기록에서 확보한 같은 장면의
  원본 이미지를 사용했다. 이 대체 사실은 결과 아티팩트에 명시했다.
