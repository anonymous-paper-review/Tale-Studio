# 카메라·모션 A/B — 실제 백엔드 e2e 시나리오 (스크립트 재구현 금지)

> **원칙:** fal 제출을 스크립트로 재구현하지 않는다. 반드시 **실제 앱 라우트**(`/api/writer/start`, `/api/director/generate-storyboard`, `/api/director/generate-video`)를 그대로 태워, 실제 `buildVideoPrompt`·`cameraToText`·fal 제출 경로가 실행되게 한다. 스크립트는 (a) 세션 쿠키 굽기, (b) service-role DB 조회/시드, (c) 실 라우트 호출·폴링 **오케스트레이션만** 담당한다.
>
> 이유: 직접-fal 스크립트(`scripts/ab-camera-experiment.mjs`, **폐기**)는 백엔드 로직을 우회·재구현해 실제와 다르게 동작한다 — 에일리언 clone divergence와 같은 함정. 관측성의 목적은 "**실제 백엔드가 fal에 뭘 보내고, 무엇이 무시되는가**"를 잡는 것이므로 실 경로여야 유효하다.

## 전제
- `pnpm dev`(:3000) **정상 서빙**(현재 `/`·`/login` 500 → 선결: 서버 헬시). `.env.local`의 `E2E_EMAIL/E2E_PASSWORD`(또는 admin 계정), `SUPABASE_SERVICE_ROLE_KEY`, `FAL_KEY`, `NEXT_PUBLIC_APP_URL`(webhook base, ngrok).
- 관측성(P1) 배포됨: `generation_jobs.input_snapshot.fal_request` + `ignored_fields`, `response_snapshot`.
- **프로젝트 카피 금지.** admin 워크스페이스(`ce053575-…`)에 **새 프로젝트**를 판다.

## 시나리오 (실 백엔드 경로 그대로)

### S0. Fresh admin 프로젝트 (입력 프롬프트만)
1. admin 워크스페이스에 새 `projects` 행 생성: `story_text=<테스트 스토리>`, `settings={genre,playtime,tone,format,…}`, `current_stage='producer'`. **clone 아님** — 자식행 복사 없음.
2. 스토리 예시(카메라 모션이 드러나는 다이내믹한 것): "좁은 골목을 달려 도망치는 남자, 뒤를 흘깃 보고, 카메라가 그를 좇는다" 류 — 팬/트래킹/줌이 의미 있는 장면.

### S1. 실 producer → cast/genre/backgrounds
- 실 producer 경로로 story → cast(characters)·genre·backgrounds(locations) 생성. (producer 챗/게이트 또는 producer 핸드오프 라우트 그대로. 스크립트가 producer 출력을 조작하지 않는다.)
- 산출: `characters`·`locations` DB 행 + `settings.genre`.

### S2. 실 writer 파이프라인 (`POST /api/writer/start`)
- **실 라우트** 호출: payload = `{ projectId, story, runtimeSeconds, genre, cast, backgrounds }`(producer 핸드오프와 동일 shape — `_alien-writer-start.mjs`의 payload 조립 참고, 단 clone 아닌 새 프로젝트).
- `writer_runs` 폴링(`node e2e/harness.mjs runs <pid>`) → `status=completed`. 실 14단계 파이프라인이 shots(static_spec·motion_prompt·prompt)를 산출.

### S3. director 진입 + 실 storyboard
- `current_stage='director'` 확인. director 캔버스 sync가 shots→노드(`derivedPrompt`) 생성.
- 대상 샷 1개에 **실 `POST /api/director/generate-storyboard`** → storyboard_image(첫 프레임). 폴링 완료.

### S4. 카메라 A/B (실 `POST /api/director/generate-video`) — 핵심
동일 샷·동일 storyboard_image(첫 프레임)·동일 base prompt로, **camera config만 변인**:
- **baseline**: `camera = {horizontal:0,vertical:0,pan:0,tilt:0,roll:0,zoom:0}`
- **variant**: 단일 축 하나만 ±10 (예: `pan:+10`), 나머지 0
- 각 호출은 **실 라우트**가 `buildVideoPrompt`로 `cameraText` 조립 + fal 제출 → `generation_jobs`에 `input_snapshot.fal_request`(실제 전송 body)·`ignored_fields` 기록.
- 반복: 6축 각각 / gear(cameraPreset) / 모션(P3 배선 후 `motion_prompt`). 쌍당 N=1~3.

### S5. 모션 A/B (P3 후)
- `MOTION_PROMPT_IN_VIDEO` on: baseline(모션 없음) vs variant(같은 샷 `motion_prompt` 포함) → 실 라우트 조립·제출.

### S6. 관측성 판독 + 육안 verdict
- `generation_jobs` 조회: 쌍별 `input_snapshot.fal_request`(카메라 텍스트가 프롬프트에 들어갔나) + `ignored_fields`(fal이 무시한 필드) + `response_snapshot` + `video_url`.
- **마크다운 리포트**(`docs/camera-motion-ab-<ts>.md`): [변인 | fal_request 발췌 | ignored_fields | baseline video | variant video | effective/no-op(육안 기입)].
- **판정은 사람**: 두 영상을 눈으로 비교해 카메라 이동/모션이 실제로 반영됐는지 축별 기입. 이 verdict가 P3 수용기준·P4 접기 노출목록을 확정(G1).

## 구현 형태
- `e2e/scenarios/camera-motion-ab.mjs` — 위 오케스트레이션(세션 쿠키 + 실 라우트 호출 + 폴링 + 리포트). `harness.mjs` 헬퍼 재사용(newProject/cookies/runs/jobs). **fal 직접 호출 없음.**
- Playwright 미설치(프로젝트 정책: 에이전트 브라우저로 대체). UI 확인이 필요하면 에이전트 브라우저로 director 캔버스에서 직접 카메라 조절→생성.

## 비용
- S4 6축×2×N + gear + 모션 = 실 fal 영상. 먼저 **핵심 축 소수(pan·zoom·gear·motion)×1** 로 소액 검증 후 확대 권장.

## 폐기
- `scripts/ab-camera-experiment.mjs` (직접-fal 재구현) — **사용 금지.** 백엔드 발산 함정. 이 시나리오로 대체.
