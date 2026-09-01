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
| 1-2 | 개발 Supabase 프로젝트 | 🔴 토큰 대기 | 오너: supabase.com/dashboard/account/tokens에서 개인 액세스 토큰(sbp_) 발급 → `.env.local`에 `SUPABASE_ACCESS_TOKEN=` 추가. 그 뒤는 에이전트가 CLI로 생성 → 마이그레이션 → `pnpm seed:test-accounts`까지 진행 (리전은 live와 동일하게) |
| 1-3 | Vercel env 스코프 재정리 | 🔴 토큰 대기 | ⚠ 2026-09-01 실측: `~/.vercel/auth.json` 로그인과 `.env.local`의 `VERCEL_TOKEN` 둘 다 죽음(API 404). 오너: vercel.com/account/tokens에서 새 토큰 발급 → `VERCEL_TOKEN` 교체. 그 뒤는 에이전트가 env 전수 점검·스코프 재배치 진행 (프로젝트 링크는 살아있음 — `.vercel/project.json` = `tale`) |
| 1-4 | live 백업 | 🔴 오너 | PITR(특정 시점 복원) 활성화 + 복원 리허설 1회 — 유료 플랜 비용 승인 포함 |
| 1-5 | CI | 🟡 절반 | ✅ `.github/workflows/ci.yml` 생성 (typecheck+test, main·dev push+PR). 로컬 검증: 1702 passed · 시크릿 불필요(vitest.setup.ts 스텁). ⚠ 이 워크플로는 신호등이지 방팭이 아님 — 아래 메모 |
| 1-6 | 롤백 연습 | 🔴 오너 | Vercel instant rollback 1회 실행, 소요 시간 기록 |
| 1-7 | FAL 계정 정리 (I1 흡수) | 🔴 오너 | 현재 fal 호출이 어느 계정/키로 나가는지 확인 → 계정·결제수단·등급 확정 → 지출 알림(billing alert) 설정. `2026-08-26/group-i-ops.md` 원장 닫기. 다중 키 정책은 [fal-key-pool.md](fal-key-pool.md) |
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
