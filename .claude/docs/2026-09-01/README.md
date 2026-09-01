# 2026-09-01 결제 도입 워크스트림 인덱스

MoR(해외 결제 대행) 방식으로 결제를 붙이기 위한 3단계 워크스트림.
전체 지도는 `specs/payments-readiness.md`, 기획 논의 안건은 `specs/payments-planner-agenda.html`,
가격·정책 정본은 `~/Downloads/ref/tale_pricing_usd_v4.xlsx` (v4.0 · 2026-08-24).

## 단계 목록 (순서 고정: 환경 → 권한 → 결제)

| 순서 | 문서 | 단계 | 성격 | 기획 의존 |
|---|---|---|---|---|
| 1 | [phase-1-dev-environment.md](phase-1-dev-environment.md) | 개발환경 분리 (local/dev/main) | 인프라 | 없음 (PITR 비용 승인만) |
| 2 | [phase-2-entitlements.md](phase-2-entitlements.md) | 유저별 권한 + Take 원장 | 스키마·게이트 | 숫자 3개 (안건 ③) |
| 3 | [phase-3-payments-mor.md](phase-3-payments-mor.md) | MoR 체크아웃 + 웹훅 | 외부 연동 | 통로 이원화 + 문서 4종 |
| 별첨 | [fal-key-pool.md](fal-key-pool.md) | fal 다중 키 풀 — ✅ 구현·배포 완료(40+40, 실효 62) | 가동 중 | 새 계정 한도 표기 확인만 남음 |

순서 근거: 결제는 권한 시스템의 스위치일 뿐이다. 2단계가 끝나 있으면 웹훅이 할 일은
"플랜 세팅 + Take 적립" 두 줄로 줄어들고, 2단계의 관리자 수동 플랜 부여 경로는
그대로 국내 B2B 수동 계약 경로(기획 안건 ①)로 재사용된다.

## 진행 상태

- [~] **1 — 환경 분리**: ✅ dev 브랜치 · ✅ CI(GitHub 런 초록) · ✅ tale-dev DB(live 스키마 복제·패리티 검증·시드) · ✅ Vercel env 재배치(Preview/Development→tale-dev) · 🔴 남음: PITR(오너) · 롤백 연습 · FAL 새 키 Production 교체(값 대기) · WEBHOOK_BASE_URL preview
- [ ] **2 — 권한**: v4 과금 축 4개 + Account 게이트 · Take 원장 · 생성 전 소모량 표시
- [ ] **3 — 결제**: 벤더 선정 · 샌드박스 전 구간 · 심사 · 라이브 전환
- [ ] **기획 안건**: `specs/payments-planner-agenda.html` 다섯 안건 논의 (병렬 진행)

## 연결

- `2026-08-26/group-i-ops.md` I1(FAL 계정·결제수단) — phase-1에 흡수. 원가 지출 계정 정리가
  결제 매출 붙이기의 전제다.
- `workspaces.plan`·`src/lib/plan-limits.ts`·`src/lib/generation-quota.ts` — phase-2가 얹을 기존 뼈대.
