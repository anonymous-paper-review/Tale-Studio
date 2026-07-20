# Writer 코드베이스 리뷰 (2026-07-04)

> 대상: writer 단계 전체 — 백엔드 파이프라인(`src/lib/writer/`), API 라우트(`src/app/api/writer/`),
> 프론트(`src/stores/writer-store.ts`, `src/features/writer/`, `src/lib/writer/use-writer-status.ts`).
> 관점: Next.js 15 관례 준수 여부 + 설계 리스크. 심각도 순 정렬.
> 근거: 실제 코드 라인 확인 기반 (파일:라인 포인터 병기). 코드가 변경되면 이 문서보다 코드가 진실.

## 총평

서버리스 제약(Vercel Hobby)을 정면으로 인정하고 설계한 점은 수준이 높다 — `after()` 체이닝,
`writer_runs.state`(jsonb) 체크포인트, 경량 status 컬럼 분리(`getRunStatusLight`), 3중 복구 장치
(self-chain / 클라 keepalive / instrumentation keepalive / watchdog cron), "모델 출력 무검증 실행 금지"
원칙 등은 모두 올바른 방향. Next.js 15 관례(Promise params, `runtime`/`maxDuration` export, `after()`)도
제대로 따르고 있다. 아래는 그 위에서 실제로 문제가 될 부분.

---

## 🔴 Critical — 보안/정합성

### 1. `/api/writer/start`에 프로젝트 소유권 검증이 없다 (IDOR)

`src/app/api/writer/start/route.ts`는 `getUser()`로 인증만 확인하고 **projectId 소유권을 검증하지
않는다.** 이후 모든 쓰기가 `supabaseAdmin`(RLS 우회)이라, 인증된 아무 사용자나 남의 projectId로:

- `upsertProducerCast` → 남의 `characters` 테이블 덮어쓰기
- `upsertProducerBackgrounds` → 남의 `locations` 덮어쓰기
- `projects.locale` 변경 + LLM 파이프라인 발사 (비용까지 남의 프로젝트에 부과)

코드베이스에 이미 관례가 존재한다 — `src/app/api/director/presets/route.ts`의 `isProjectOwned()`
(workspace.owner_id 검증), `src/app/api/artist/select-candidate/route.ts`의 canonical 가드.
**writer/start·status·logs만 이 가드가 빠져 있다.**

**권장**: `isProjectOwned`를 공용 헬퍼로 추출하여 writer 라우트 전부에 적용.

### 2. `WRITER_STEP_SECRET` 설정 시 클라이언트 keepalive가 조용히 죽는다 (설계 모순)

- `src/app/api/writer/step/route.ts:18` — secret 설정 시 `x-writer-secret` 헤더 일치 요구
- `src/lib/writer/use-writer-status.ts:72-76` — 브라우저가 secret **없이** `/api/writer/step` POST (keepalive)

보안 옵션을 켜는 순간, 문서에서 "실시간 복구는 클라이언트 keepalive 담당"이라 명시한 그 복구 경로가
401로 전부 실패한다. 에러는 `.catch(() => {})`로 삼켜져 관측 불가.

**권장**: (a) keepalive를 서버 전용(instrumentation + watchdog)으로 일원화하고 클라 keepalive 제거,
또는 (b) step을 "재트리거 전용 + 소유권 검증" 경로로 분리.

### 3. 동시 step 실행에 대한 락이 없다 (중복 LLM 비용 + state 클로버)

`runWriterSteps`(`src/lib/writer/pipeline/steps.ts:426`)는 `getActiveRun` → 실행 → `saveRunState`
(전체 state blob **last-writer-wins**). 트리거 소스가 4개: self-chain `after()`, 클라 keepalive,
instrumentation keepalive, watchdog cron. 타이밍이 겹치면:

- 같은 stage를 두 인스턴스가 동시 실행 → **LLM 비용 2배**
- 늦게 끝난 쪽이 state 전체를 덮어씀 → 먼저 끝난 쪽의 산출물/`_timings` 소실 가능

`_attempt` 가드는 순차 재진입만 막고 동시 진입은 못 막는다. STALE_MS(180s)로 확률을 낮춘 것은
완화이지 해결이 아님.

**권장**: `saveRunState`에 낙관적 락 (예: `.eq('updated_at', 읽은값)` 또는 version 컬럼 + 불일치 시
조용히 drop).

---

## 🟠 High — 신뢰성/데이터

### 4. stage 예외 = 즉시 영구 실패 (`_attempt` 가드가 실제론 안 쓰이는 경로)

`steps.ts:467-473` — `step.run()`이 throw하면 곧바로 `markFailed`. `MAX_STAGE_ATTEMPTS=3`은
**maxDuration kill로 죽었다 재진입하는 경우에만** 작동한다. Gemini 일시 rate-limit이
`llm/retry.ts` 재시도를 소진하고 올라오면 run 전체가 복구 불가능하게 죽는다. 사용자 관점에선
"처음부터 다시 시작" 외 방법 없음.

**권장**: throw 시에도 `_attempt`를 남기고 `paused` 반환 → watchdog이 재시도, 3회 초과 시에만
`markFailed`로 일관화.

### 5. `regenerateScene`의 delete→insert가 비원자적

`src/stores/writer-store.ts:539-563` — `shots` 전체 DELETE 후 INSERT. 중간에 탭 닫힘/네트워크 실패
→ **씬의 샷이 전부 증발한 채로 남는다.** 롤백도 이전 shots를 DB에 되돌리지 않고 스토어만 갱신.

부가 냄새: 이 함수가 `/api/director/generate-shots`를 호출 — writer 스토어가 director API에 의존
(도메인 경계 위반).

**권장**: 서버 라우트에서 upsert-swap, 또는 최소한 insert 성공 후 delete로 순서 변경.

### 6. 디바운스 저장의 유실 창 + 레이스가 이미 UI로 새고 있다

`updateScene`/`updateShot`은 500ms 디바운스 후 fire-and-forget 저장:

- **flush 메커니즘이 없다** — 편집 직후 새로고침/탭 이동 시 마지막 편집 유실
- `src/features/writer/shot-detail-dialog.tsx:70-71`에 이미 `flushing` 대기 핵 존재 —
  "디바운스가 DB에 닿기 전에 재생성 라우트가 행을 읽는 레이스 방지".
  레이스 존재를 알고 개별 컴포넌트에서 각자 우회 중이라는 뜻
- `applyChatUpdates`도 update 계열은 디바운스라 "적용 완료" 시점 보장 불가

**권장**: 타이머 맵이 store 모듈 스코프에 있으므로 `flushPendingSaves()` 하나 노출하고
`beforeunload` + 다이얼로그 닫기 + regenerate 직전에 호출.

### 7. `/api/writer/start`의 중복 실행 체크가 TOCTOU

`getActiveRun` 확인 → `createRun` 사이에 갭. 더블클릭/재시도로 run 2개 생성 가능 → self-chain도
2개 (→ #3 증폭).

**권장**: `writer_runs(project_id) WHERE status='running'` partial unique index.

---

## 🟡 Medium — Next.js 관례 및 설계

### 8. `req.nextUrl.origin`으로 self-trigger

step/start/watchdog 모두 요청 origin으로 자기 자신을 호출. Vercel에선 대체로 동작하지만
프록시/커스텀 도메인/preview 배포에서 origin이 내부 도달 불가 주소가 될 수 있다.

**권장**: `process.env.NEXT_PUBLIC_SITE_URL ?? origin` fallback. HTTP 왕복 자체는 maxDuration을
새 인스턴스로 리셋하려는 의도로 보이므로 타당하나, 주석으로 이유 명시 권장.

### 9. 인증 없는 정보 노출 라우트

- `status/[projectId]`: 무인증. run 에러 메시지(`row.error` — LLM 에러 원문 포함 가능)까지 노출
- `logs/[projectId]`: 무인증 FS 읽기. 서버리스에선 빈 디렉토리라 실질 피해 없지만,
  **로컬/셀프호스트 배포에선 raw LLM 로그(스토리 원문 포함)가 통째로 노출**. `getUser()` + dev 가드 필요
- `watchdog`: `CRON_SECRET` 미설정 시 무인증 GET — 피해는 재트리거뿐이지만 #3과 결합 시 비용 증폭 벡터

### 10. `/api/writer/chat` 입력 크기 무제한

`message`/`history`/`writerContext` 길이 캡이 없다. 인증 사용자가 수백 KB history를 보내면 그대로
LLM 토큰 비용. `writerContext`는 클라이언트 생성 문자열이라 위조 자유(피해는 본인 프로젝트뿐이나
비용은 서비스 부담).

**권장**: 상한 + truncate.

### 11. 이중 검증 로직의 드리프트 리스크

- `pickSceneFields`/`pickShotFields` — chat route(서버 화이트리스트)와 writer-store(클라 타입 좁힘)에 각각 별도 구현
- `SHOT_TYPES` 셋 — chat route · persist_manifest · shot-detail-dialog 3곳 중복
- `DEFAULT_CAMERA`/`DEFAULT_LIGHTING` — writer-store와 persist_manifest 중복

필드 하나 추가 시 3~4곳을 기억해야 하는 구조.

**권장**: `src/lib/writer/shot-schema.ts` 같은 단일 소스로 통합.

### 12. 문서/주석 드리프트

- watchdog 헤더 주석 ">90s" vs 실제 `STALE_MS=180_000`
- `docs/writer-pipeline-structure.md`는 status 라우트가 `STAGE_FILES` 기반이라 기술하나 현재는
  `writer_runs` 기반 (`writer-progress.tsx` 주석도 동일하게 낡음)

---

## 🟢 Low — 위생

- **`writer-store.ts` 744줄**이 UI 상태 + DB repository + 낙관적 롤백을 한 파일에 —
  `scenes`/`shots` supabase 접근을 `lib/writer/client-repo.ts`로 추출하면 테스트 용이
  (현재 `tests/`에 store CRUD 직접 테스트 부재도 이것과 연관)
- `reorderScenes`: `Promise.all` N개 update 에러 무시 — 부분 실패 시 DB sort_order가 스토어와 어긋난 채 방치
- `addShot`의 `sort_order: shots.length` — 전역 카운트라 삭제 후 중복값 발생 가능 (정렬은 유지되나 의미 흐림)
- `loadProject` `select('*')` 5연발 — 동작엔 문제없으나 컬럼 명시가 안전
- `project-store.ts`의 `require()` 순환 import 우회 — reset 오케스트레이션을 이벤트/registry 패턴으로 전환 시 해소
- 편집 시 `narrative_summary`(EN 주 컬럼)에 native 덮어쓰기(S3b 주석)는 의도라지만, EN 재파생 트리거가
  없으면 이후 생성 품질이 native 의존으로 회귀 — 재파생 훅 계획 여부 확인 권장

---

## 종합 평가표

| 영역 | 평가 |
|---|---|
| Next.js 15 관례 (route handler, `after()`, params Promise, runtime export) | ✅ 모범적 |
| 서버리스 제약 대응 설계 (체크포인트, 복구, 경량 폴링) | ✅ 우수, 단 **락 부재(#3)** |
| 보안 | ⚠️ **관례는 있는데 writer만 미적용 (#1, #2, #9)** |
| 데이터 정합성 | ⚠️ 비원자 연산 + 디바운스 유실 (#5, #6, #7) |
| 코드 위생 | 🙂 양호, 중복 스키마 로직 정리 필요 |

## 우선순위 제안

1. **#1 소유권 가드** — `isProjectOwned` 헬퍼 추출 + writer 라우트 5개 적용 (반나절 이내)
2. **#2 secret↔keepalive 모순 해소** — keepalive 경로 일원화
3. **#3 낙관적 락** — `saveRunState` 조건부 update (1과 2에 묶어 진행 권장)
4. #4~#7 — 신뢰성 배치 (stage 재시도 일관화, regenerate 원자화, flush API, unique index)
5. #8~#12 — 여유 시 정리
