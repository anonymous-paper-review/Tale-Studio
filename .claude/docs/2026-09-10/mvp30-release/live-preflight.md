# 운영 배포 사전 확인

**운영 DB에는 러프 중복 접수 방지 함수가 아직 없습니다. 신규 앱 코드를 운영에 반영할 때 단일 마이그레이션 `20260910001500` 적용과 이력 기록이 필요합니다. 원래 제보 프로젝트는 현재 6개 씬·61개 샷이며, 저장된 대사 20개에서 일본어 가나는 발견되지 않았습니다.**

조회 시각: 2026-09-10 14:28 KST. 운영 ref `qnjnrihfpqkdhjuzvepy`와 `.env.local`의 LIVE URL 호스트가 일치함을 먼저 확인했습니다. 운영 DB·프로젝트·외부 배포 상태를 읽기만 했습니다. 마이그레이션·데이터 변경·단계 이동·외부 메시지·배포 실행은 0회입니다.

## 운영 DB

| 항목 | 결과 |
|---|---|
| `public.reserve_rough_storyboard_grid` | 존재하지 않음: 0개 |
| migration 이력표 | 존재함 |
| migration `20260910001500` | 기록 없음: 0건 |
| 함수 실행 권한 | 함수가 없어 권한 판정 대상 없음. 설치 후 `anon`·`authenticated` 실행 불가와 `service_role` 실행 가능을 확인해야 함 |

운영에 적용하지 않은 파일: `supabase/migrations/20260910001500_reserve_rough_storyboard_jobs.sql`. 이 사전 확인에서 함수를 설치하거나 migration 이력을 추가하지 않았습니다.

## 원래 제보 프로젝트의 현재 저장 상태

프로젝트: `7112d31e-70ce-4743-9562-057f7beac002`.

| 항목 | 결과 |
|---|---|
| 저장된 단계 | `artist` |
| 씬 / 샷 | 6 / 61 |
| 씬별 샷 | 9·10·11·9·8·14 |
| 저장된 대사 | 20개, 모두 비어 있지 않음 |
| 한글 포함·일본어 가나 없음 | 20개 |
| 일본어 가나 포함 | 0개 |
| 한글과 일본어 가나 혼재 | 0개 |
| 한자만 있거나 기타 언어로 별도 판정할 대사 | 0개 |
| 최신 Writer 실행 | `completed`, 15/15, 오류 없음 |
| Writer 시작 / 완료 기록 | 2026-09-09 22:02:40 / 22:13:05 KST |
| 쿄타로 / 코마츠 | 각각 등록 이름 있음, 기본 모습 1개, 전체 모습 2개, 기본 시트·portrait URL 있음 |
| 배경 | 등록된 6개 배경 모두 대표 이미지 URL 있음 |

최신 Writer 실행 ID는 `7ece6db5-b87d-4f40-be33-5d093d9c9eb6`입니다. 당시 채팅의 ‘6씬·47샷’은 현재 저장된 61샷과 일치하지 않습니다. 저장된 단계 역시 아직 Artist입니다.

대사 언어는 Unicode 문자 존재 여부로 집계했으며 번역의 자연스러움·정확성을 판정한 것은 아닙니다. 이미지 URL이 저장되어 있음을 확인했지만 이미지를 다운로드하거나 품질·접근 가능성을 검수하지 않았습니다. JSON의 `hasAppearanceDescription`은 구 `characters.appearance` 열 유무이며, 기본 모습의 정본 설명을 조회·판정한 값이 아닙니다.

## Vercel 연결 및 현재 운영 배포

- 프로젝트: `tale`, 프레임워크 `nextjs`.
- 연결 저장소: GitHub `anonymous-paper-review/Tale-Studio`.
- 운영 브랜치: `main`.
- 현재 운영 배포: `READY`.
- 현재 운영 커밋: `a5d8dc183339d4f5ab22fa40f4e2a3e735743363`.
- 배포 ID: `dpl_H3Xeu3nMC6uK3uZBH9Fz55rU8jFs`.

기존 GitHub→Vercel 연결의 운영 브랜치가 main임을 확인했습니다. 새 main 커밋을 push한 뒤 생성된 운영 배포의 커밋 SHA와 `READY`를 대조하는 경로를 사용할 수 있습니다. 이번 조회가 신규 MVP 배포 완료를 뜻하지는 않습니다.

## 사용한 연결 방법

자격 증명은 `.env.local`에서 메모리로만 읽었고 값은 출력·보고서에 저장하지 않았습니다. 재현 스크립트는 [live-preflight.mjs](live-preflight.mjs)입니다.

1. **관리 SQL 읽기:** `SUPABASE_ACCESS_TOKEN`을 Authorization Bearer로 사용해 `POST https://api.supabase.com/v1/projects/qnjnrihfpqkdhjuzvepy/database/query` 호출. 본문은 `{ query: SELECT문, read_only: true }`. 스크립트는 SELECT로 시작하고 변경 명령이 없는 질의만 허용합니다. `pg_proc`·`pg_namespace`의 함수 존재와 `has_function_privilege`, `supabase_migrations.schema_migrations`의 해당 버전만 조회했습니다. 함수 본문 자체는 저장하지 않고 존재할 경우 해시만 조회하도록 했습니다.
2. **프로젝트 저장본:** `SUPABASE_LIVE_URL`과 `SUPABASE_LIVE_SERVICE_ROLE_KEY`로 Supabase 클라이언트를 만들고 인증 세션 저장·갱신을 껐습니다. 모든 조회는 해당 project ID로 제한했습니다. 전체 개수를 함께 받아 응답 행 상한 때문에 일부만 읽힌 경우 성공으로 처리하지 않습니다. 대사 원문과 이미지 URL은 결과 파일에 보존하지 않았습니다.
3. **Vercel 프로젝트 상태:** `.vercel/project.json`의 project ID·org ID를 읽고 `VERCEL_TOKEN`을 Authorization Bearer로 사용했습니다. `GET https://api.vercel.com/v9/projects/{projectId}?teamId={orgId}`의 GitHub 연결·productionBranch·production target을 확인했습니다.
4. **Vercel 운영 배포 상태:** `GET https://api.vercel.com/v6/deployments?projectId={projectId}&teamId={orgId}&target=production&limit=3`으로 최근 운영 배포의 상태와 Git 커밋만 보존했습니다. 환경변수 목록이나 비밀값을 조회하지 않았습니다.

상세 값: [live-preflight.json](live-preflight.json). 인증된 앱의 새 handoff API 호출, 실제 Director 화면 도착, 신규 운영 마이그레이션 적용 및 새 배포 완료는 미검증입니다.
