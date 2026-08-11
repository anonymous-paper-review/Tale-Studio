# t0-r1-battery-restore — SHOT_PHYSICS R1 회귀 배터리 복원

- **날짜**: 2026-08-11 (밤 러너)
- **판정**: **가설 참 — 복원 완료.** 배터리는 git과 백업 tar 양쪽에 실존했고, 이 디렉토리로 복원됨. 실행은 하지 않음(티켓 규정 — 배터리에 LLM 콜 있음).
- **출처 티켓**: `research/backlog/t0-r1-battery-restore.md` ← prompt-contract-audit §3 (카탈로그 B2🕳)

## 복원물과 출처

| 파일 | 원 경로 | 출처 |
|---|---|---|
| `result-original.md` (152줄) | `research/experiments/foundation/2026-07-21_cleanup-regression/result.md` | git `622e44e^` (백업 tar에도 동일 실존 확인) |
| `campaign-2607-plan.md` (289줄) | `research/experiments/utils/campaign-2607/plan.md` | git `622e44e^` — 배터리가 참조하는 지표 M1~M6 정의(§5) |

배터리 좌표는 physics.ts:4 주석이 지목한 그대로였다: "값 변경 시 회귀 배터리(research/experiments/foundation/2026-07-21_cleanup-regression — R1) 재실행이 계약이다."

## 배터리의 실체 (실행 가능성 평가)

R1은 **단일 스크립트가 아니라 절차 문서형 배터리**다 (plan.md:42 계약 원문):
"4 프리셋(shorts/ad/kishoten/loop) × 지표 M1~M6 비교. 판정: 악화 지표 0개면 통과."

재실행에 필요한 것과 상태:
1. **입력 4종** — result-original.md §2에 이야기 원문 전문 보존(브랜드 필름 광고·카페의 비·물방울 루프·숏폼 광고) → **복원됨, 사용 가능**
2. **지표 정의 M1~M6** — campaign-2607-plan.md §5 → **복원됨**
3. **실행 방식** — 적용 전/후 각 1회 풀런(S축 4프리셋 + ad 풀체인, 비주얼 스텁) + 코드 지표 집계.
   당시는 서브에이전트 수동 실행이었음 — 자동화 스크립트는 원래부터 없었다(tools/ 부재가 원본 상태).
4. **원시 로그** — `logs/writer-stage-exp/*`는 소실(대청소). 단 배터리는 "재실행형"이라 원시 로그 없이 재실행 가능.
5. **비용** — 재실행 시 LLM 콜 필요(풀런 2회분, 텍스트 풀런 단가 $1.9~2.1 × 2 규모). **이번 밤은 복원만(티켓 규정) — 실행은 별도 티켓으로 아침 심사.**

주의: 당시 기본 모델은 `gemini-3-flash-preview`, 현행 기본은 3.6-flash(f6d8e58) — 재실행 시
before/after를 **같은 현행 모델**로 맞춰야 배터리가 성립한다(모델 브리지 문제, 좌표 기록 규칙).

## B2 계약에 주는 함의

B2("값 변경 시 배터리 재실행")는 이제 다시 이행 가능하다 — physics.ts 상수의 사실상 동결 상태 해제 가능.
계약 문구 개정(복원 불가 시의 대안)은 불필요해짐.
