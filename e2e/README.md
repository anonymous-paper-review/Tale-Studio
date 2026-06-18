# Artist 파이프라인 라이브 e2e

> Artist 이미지 파이프라인(C1~C5: 서버 초안 / provenance / 대화형 재생성 / 후보 일관성 / 시간축)을
> **실제 fal 생성 + 실제 webhook + 라이브 Supabase**로 검증하는 방법론과 시나리오 레지스트리.
> 단위테스트(vitest)가 못 잡는 **통합 경계 버그**(webhook→finalize→DB)를 잡는 것이 목적.
>
> 이건 CI 자동 테스트가 아니다 — 실 생성 비용·webhook 인프라가 필요한 **온디맨드 검증**이다.
> 시나리오는 아래 [레지스트리](#시나리오-레지스트리)에서 추가/삭제하며 업데이트한다.

## 범위

- **대상**: artist 이미지 파이프라인(캐릭터 뷰, 월드 샷, provenance/stale, 후보 링버퍼, 외형 변경).
- **제외**: writer 텍스트 파이프라인(genre~v7), director/editor **영상** 생성(고비용, 이번 변경 무관).
  영상까지 가지 않는 것이 비용 경계다(전체 1회 ≈ fal 이미지 5~20장, $1 이내).

## 사전조건 / 인프라

1. **dev 서버** `:3000` — `pnpm run dev` (백그라운드, `setsid` 권장).
2. **ngrok 터널** — fal webhook 콜백은 localhost 로 못 온다. `.env.local` 의
   `NEXT_PUBLIC_APP_URL`(= `WEBHOOK_BASE_URL` fallback)에 박힌 **고정 도메인**으로 터널을 연다:
   ```
   ngrok http --url=<NEXT_PUBLIC_APP_URL 도메인> 3000
   ```
   확인: `curl -X POST <도메인>/api/fal/webhook -d '{}'` → **HTTP 401 `invalid_signature`**
   (핸들러가 서명 검증까지 도달 = 진짜 콜백은 통과). 터널이 없으면 poll reconcile 로 동작(느림).
3. **e2e 계정** — `.env.local` 의 `E2E_EMAIL` / `E2E_PASSWORD`. 없으면
   `pnpm run seed:test-accounts -- 1` 로 생성 후 `.env.local` 에 기록. 확인: `node e2e/harness.mjs loginCheck`.

## 핵심 원칙 (방법론)

1. **격리 시드** — writer 텍스트 파이프라인을 돌리지 말고, `harness.mjs seedCast` 로 cast/location 을
   service-role 로 직접 시드한다. 그 위에서 **실제 artist 라우트**(`/api/artist/*`)를 구동한다.
   테스트 대상(artist 코드)을 무관한 파이프라인에서 분리한다.
2. **실제 핸드오프 1회 + 비용 캡** — C1 서버 초안은 핸드오프(`/api/writer/start`) `after()` 에서만
   트리거되므로, S1 은 진짜 핸드오프로 검증한다. 단 직후 `harness.mjs failRun` 으로 writer_run 을
   failed 처리 → 자가 체이닝 텍스트 파이프라인 비용을 끊는다(캐릭터/로케이션은 핸드오프 시 동기 upsert 됨).
3. **스테이지 게이트 우회** — artist UI 는 writer 산출물 게이트(`canNavigateTo`)로 잠겨 있다. 열기:
   - `harness.mjs setStage <pid> artist` (reachedStage 가 `current_stage` 에서 옴)
   - producer-origin location 1개 이상 존재(씬 없어도 artist 진입 유지 — `verifyWriterGate`)
   - **SPA 내비게이션**으로 진입(producer 로드 → 사이드바 artist 클릭). 전체 새로고침으로 `/studio/artist`
     직접 진입하면 store 가 기본값으로 리셋돼 producer 로 리다이렉트되는 레이스가 있다.
4. **give-up 게이트** — 자율 생성(`actor='auto'|'writer'`)은 같은 슬롯 실패 N회 후 정지(비용 방어).
   사람의 명시적 재생성(`actor='ui'|'chat'`)은 게이트를 통과한다(회복은 항상 명시적, architecture §5).
5. **검증 2층**:
   - **DB(결정적)** — `harness.mjs candidates/jobs` 로 source_hash·is_selected·후보 수·job 수·target 검증.
   - **UI** — artist 페이지에서 `낡음`(stale) 배지 수, 후보 히스토리 스트립 등 클라 배선 확인.

### #57 / architecture §5 불변식 체크리스트 (모든 stale 시나리오 공통)

상류 원천(룩/외형) 변경 시 하류 파생 이미지는:

- [ ] **stale 표시 O** — `낡음` 배지 출현 (`isImageStale` true).
- [ ] **자동 무효화·재생성 X** — 변경 후 새 `character_view` job 0건(job 수 불변), 후보 삭제 X.
- [ ] **후보 보존 O** — 기존 후보 행(id·source_hash·is_selected) 그대로 = 수습 가능.
- [ ] **명시적 재생성으로 수렴 O** — 사람이 재생성하면 새 후보 해시가 현재 입력과 일치 → stale 해소.

## 실행 절차

```
1. pnpm run dev (백그라운드)  +  ngrok http --url=<도메인> 3000 (백그라운드)
2. node e2e/harness.mjs loginCheck            # 계정 확인
3. 브라우저 로그인 → New Project → projectId 확보 (또는 harness 로 최신 project 조회)
4. node e2e/harness.mjs seedCast <pid>        # cast/location 시드
5. node e2e/harness.mjs setStage <pid> artist # 게이트 열기
6. 시나리오별 구동(라우트 fetch) + 검증(harness candidates/jobs + UI 낡음)
7. 정리: dev/ngrok 종료. 테스트 데이터는 테스트 계정에 격리되므로 보통 그대로 둔다.
```

**인증 라우트 구동·UI 확인 방법** (택1):

- **에이전트 브라우저**(권장, 이번에 사용): puppeteer 세션으로 로그인 → `page.evaluate(fetch('/api/artist/...'))`
  로 쿠키 실린 라우트 호출 + 사이드바 SPA 내비 + DOM 에서 `낡음` 카운트.
- **Playwright + 세션 쿠키**(레포 기존 패턴): `scripts/verify-session.mjs`(로컬, gitignored)가
  `@supabase/ssr` 형식 쿠키를 출력 → `ctx.addCookies(...)` 로 주입 후 라우트/페이지 구동.

## 하니스 명령 레퍼런스

| 명령 | 설명 |
|---|---|
| `seedCast <pid>` | char_hero(카이, view_main=null) + loc_castle 시드 |
| `chars <pid>` / `locs <pid>` | 캐릭터/로케이션 조회 |
| `candidates <pid>` | character/location 후보 (view, source_hash, is_selected) |
| `jobs <pid>` | generation_jobs (kind/actor/status/target/source_hash/look_present) |
| `setStage <pid> artist` | artist UI 게이트 열기 |
| `setLook <pid> '<json>'` | design_tokens 설정 = writer 룩 도착 시뮬 (stale 트리거) |
| `clearLook <pid>` | design_tokens=null 복원 |
| `failRun <pid>` | 최신 writer_run failed (비용 캡) |
| `runs <pid>` | writer_runs 상태 |
| `loginCheck` | E2E 계정 로그인 확인 |

룩 샘플: `'{"l1":{"art_style":"dark_fantasy","shape_language":"angular"},"palette":{"primary":"#8B0000","secondary":"#1a1a2e","accent":"#FFD700"}}'`

## 시나리오 레지스트리

> 추가/삭제는 이 표에 행을 더하거나 빼고, 필요하면 [실행 절차](#실행-절차)·하니스 명령을 함께 갱신한다.
> `상태` = 마지막 실행 결과.

| ID | 컴포넌트 | 무엇을 | 검증(관찰) | 상태 |
|---|---|---|---|---|
| **S1** | C1 | 핸드오프(`/api/writer/start`) → 서버(`actor:'writer'`) 자동 main 드래프트 → fal → ngrok webhook | `jobs`: character_view/main/actor=writer, `look_present:false`(AC6) · `candidates`: main 후보 생성 + view_main URL | ✅ 2026-06-18 |
| **S2** | C2 | main 재생성(`/api/artist/generate-sheet` actor=ui) | `candidates`: 2번째 main 후보, is_selected 플립(one_selected), **source_hash 채워짐** | ✅ 2026-06-18 |
| **S3** | C3 | artist 챗(`/api/artist/chat`) 원천 외형 변경 → 제안 → `/api/artist/appearance` 승인 | chat 응답 `proposals`에 changeAppearance + `updates:[]`(F6) · 커밋 후 자동재생성 0 · 파생 stale | ✅ 2026-06-18 |
| **S4** | C4 | 월드 후보 링버퍼 + 옛 후보 선택(`/api/artist/select-world-candidate`) | `candidates`: location 후보 누적(N=5 보호) · 선택 플립 후 selected=1(one_selected) · locations 컬럼 미러 | ✅ 2026-06-18 |
| **S5** | C2/§5 | **writer↔artist 왕복**: `setLook`(룩 도착) → artist 재진입 → stale → 명시적 재생성 수렴 | 룩 전 `낡음`=0 → 후 `낡음`>0(전파) · 후보 보존 · character_view job 0건(무자동재생성) · 재생성 후 `낡음` 감소(수렴) — [#57 체크리스트](#57--architecture-5-불변식-체크리스트-모든-stale-시나리오-공통) 전부 | ✅ 2026-06-18 |

## 시나리오 추가/삭제 방법

1. **추가**: 위 표에 행 추가(ID/컴포넌트/무엇을/검증/상태). 새 구동이 새 라우트나 새 시드를 요구하면
   `harness.mjs` 에 서브커맨드를 추가하고 명령 레퍼런스 표도 갱신. stale 류면 #57 체크리스트로 검증.
2. **삭제/보류**: 행을 지우거나 `상태`를 `보류(사유)` 로 바꾼다. 더 이상 안 쓰는 harness 커맨드도 정리.
3. **재실행 후**: 각 행의 `상태` 를 `✅ YYYY-MM-DD` 또는 `❌(요약)` 로 갱신. 새로 발견한 버그는
   수정 + 회귀 단위테스트(`tests/`)로 박제하고 여기 메모.

## 알려진 함정

- **fal webhook ≠ localhost** — 반드시 ngrok(또는 터널). 없으면 poll reconcile(느림).
- **target.workspaceId / input_snapshot 필수** — finalize 가 둘에 의존. 누락 시 후보 미생성 또는
  source_hash=null(stale 무력화). 회귀 가드: `tests/draft-trigger.test.ts`, `tests/generation-jobs-columns.test.ts`.
- **autoGenerateBaseImages 중복** — artist 진입마다 빈 슬롯 자율 생성이 돈다. world 슬롯이 진입마다
  중복 호출돼 후보가 여러 장 쌓일 수 있다(기능 무해, 멱등성 튜닝 여지).
- **supabase 클라는 untyped** — `.from('any_table')` 는 항상 컴파일된다. 진짜 게이트는 런타임 테이블 존재.
- **테스트 데이터** — 계정/프로젝트/생성 이미지는 라이브 DB 에 남는다(테스트 계정 격리, 무해). 정리는 선택.
