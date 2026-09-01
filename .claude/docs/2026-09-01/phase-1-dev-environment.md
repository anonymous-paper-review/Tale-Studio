# 1단계 — 개발환경 분리 (local / dev / main)

상태: **진행 중 (2026-09-01)** · 예상 규모: 반나절~1일 · 기획 의존: 없음 (Supabase 유료 플랜 비용 승인만)

지금은 main 직푸시 → Vercel 즉시 배포, live Supabase가 유일한 DB다.
결제가 붙으면 배포 실수가 남의 돈 문제가 되므로, 이후 모든 작업이 live 밖에서 돌게 하는 안전판을 먼저 깐다.

## 확정된 구조

- `dev`·`main`은 git 브랜치. Vercel이 브랜치를 환경으로 매핑:
  `main` push → Production, `dev` push → Preview(브랜치 고정 도메인 할당).
- DB는 2개: **개발 Supabase 프로젝트 1개를 local과 dev가 공유**, live는 main 전용.
  개발 DB를 더 쪼개는 건 1인 개발엔 관습이지 법칙 아님. live를 dev가 같이 쓰는 것만 금지.
- 결제 키 매핑: 샌드박스 키 = Development·Preview 스코프에만, 라이브 키 = Production 스코프에만.
- 웹훅 매핑: MoR 샌드박스 웹훅 → dev 도메인, 라이브 웹훅 → production 도메인.
  local에서 웹훅까지 받으려면 터널이 필요하니 웹훅 검증은 dev에서 하는 걸 기본으로.

## 작업 목록

| # | 항목 | 상태 | 내용 |
|---|---|---|---|
| 1-1 | dev 브랜치 + Vercel 매핑 | 🟡 절반 | ✅ `origin/dev`를 main(`853d849`)으로 fast-forward (기존 dev는 main의 조상이라 유실 없음). 오너: Vercel에서 dev Preview 고정 도메인 확인 |
| 1-2 | 개발 Supabase 프로젝트 | ✅ 완료 | **tale-dev** (`pbiumddivadgbzxuymak` · 싱가포르 · PG 17.6). 관리 토큰은 브라우저로 발급(gjc-tale-dev-setup · 90일 · `.env.local`의 `SUPABASE_ACCESS_TOKEN`). 마이그레이션 파일은 대시보드 시대 기반 위 증분이라 from-scratch 재생 불가(실측: 2번째 파일에서 실패) → **live 스키마 전체를 pg_dump/psql로 복제** (supabase.md 규칙 "live schema 우선"과 정합). 패리티 검증: 테이블 27·정책 41·RLS 27·함수 19·knowledge 30행·이력 21행 — live와 동일. 테스트 계정 3개 시드(`.env.local`에 기록). 접속정보는 `.env.local`의 `SUPABASE_DEV_*` |
| 1-3 | Vercel env 스코프 재정리 | ✅ 완료 | 토큰 브라우저 발급(tale 프로젝트 스코프 · ~11/30 · `VERCEL_TOKEN` 교체). 전수 감사 실측: **Preview 스코프에 Supabase 변수 0개**(dev Preview는 DB 없이 뜸) + development 스코프는 live를 바라봄. 조치: preview/development에 tale-dev 3종(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) + FAL_KEY(기존 키) 배선, production 무변경. 남음: `WEBHOOK_BASE_URL` preview 값(dev 도메인 확정 후) |
| 1-4 | live 백업 | 🟡 결정 대기 | 실측(2026-09-01, 관리 API): PITR 꺼져 있음 · **일일 백업 7개 보유 중**(Pro) · PITR 가격 7일 $100/월 · 14일 $200 · 28일 $400. 권고: 지금은 일일 백업으로 충분(최악 하루치 유실 수용), **PITR은 결제 라이브 전환 직전에 pitr_7 켜기** — 승인만 주면 에이전트가 API로 즉시 적용. 복원 리허설은 tale-dev에 복원해보는 것으로 대체 가능 |
| 1-5 | CI | 🟡 절반 | ✅ `.github/workflows/ci.yml` 생성 (typecheck+test, main·dev push+PR). 로컬 검증: 1702 passed · 시크릿 불필요(vitest.setup.ts 스텁). ⚠ 이 워크플로는 신호등이지 방팭이 아님 — 아래 메모 |
| 1-6 | 롤백 연습 | 🔴 오너 | Vercel instant rollback 1회 실행, 소요 시간 기록 |
| 1-7 | FAL 계정 정리 (I1 흡수) | 🟡 거의 완료 | ✅ 새 키($2000) 발급 · ✅ Vercel Production `FAL_KEY` 교체(2026-09-01, 다음 배포부터 적용) · ✅ 할당 확정: **Production 40+40**(둘 다 production 풀, 개발 전용 계정 없음 — 밤 루프 중단) — [fal-key-pool.md](fal-key-pool.md). 남음: 새 계정 대시보드 동시 한도 표기 확인 + 두 계정 지출 알림 설정(오너) |
| 1-8 | fal 키 풀 단계 0 | ⚪ 대기 | `generation_jobs.fal_key_id` + 키 레지스트리 추상화 — 키 1개인 지금 넣으면 나중 마이그레이션이 공짜. 설계는 [fal-key-pool.md](fal-key-pool.md) |

## 메모

- 마이그레이션 규율은 이 시점부터: 대시보드 직접 스키마 수정 금지, 파일로만. 개발 DB 먼저 → live 순서.
- 개발 DB 공유의 대가는 local·dev 테스트 데이터 섞임 — `seed:test-accounts` 규율로 충분.
- **CI가 main 직푸시를 물리적으로 막지는 못한다**: Vercel은 Actions 결과를 기다리지 않고 push 즉시 배포한다.
  진짜 차단은 둘 중 하나 (오너 결정): (a) GitHub branch protection으로 main 직푸시 금지 + dev→main PR에
  required check — 결제 코드 경로만이라도 이 규율 권장. (b) 현재 직푸시 관습 유지 + CI는 사후 신호등.
  1인 개발이라 (b)로 시작해도 되지만, phase-3 라이브 전환 전엔 (a)로 올리는 걸 권장.

## 완료 증거

- dev push → Preview 배포가 개발 DB를 바라본다 (스모크로 확인)
- Production 스코프에 샌드박스 키 0개, Preview·Development 스코프에 라이브 키 0개
- PITR 켜짐 + 복원 리허설 완료 기록
- CI 빨간불이 main 배포를 실제로 막는 것 확인 (일부러 깨서 1회)
- FAL 계정 등급·동시 한도·지출 알림 임계값 기록
