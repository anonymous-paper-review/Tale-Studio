# 실 백엔드 e2e — Producer 핸드오프 → Writer/Artist 재생성 → Director 카메라 축 A/B (상세 설계)

> 사용자 지정 시나리오. **셋업은 시드로, 테스트 대상은 100% 실 UI로.**
> 목적: 실 파이프라인을 그대로 태우며 (a) 내 P2 변경 회귀 확인, (b) **director 카메라 6축을 fal이 조용히 무시하는지** 판정(P1 verdict).

## 0. 원칙 — 무엇이 "엄밀한 테스트"인가

금지의 진짜 기준은 **"스크립트냐 아니냐"가 아니라 "fal 요청(request)을 누가 조립하냐"**다.

| 방식 | 요청 조립 주체 | 발산 |
|---|---|---|
| API 재조립 스크립트 / 직접-fal (`ab-camera-experiment.mjs`, 폐기) | **스크립트**가 payload 재구성 | ❌ 발산 |
| **실 UI 클릭** (에이전트가 몰든 puppeteer든) | **실 프런트(store)**가 실 요청 조립 | ✅ 발산 0 |

- **허용:** 셋업/시드(producer 보드 채우기)는 순수 DB로 — *테스트 대상이 아니라 전제*.
- **테스트 대상**(핸드오프·재생성·카메라 축·영상생성)은 실 UI 클릭 → 실 store가 실 요청 조립.
- 특히 **카메라 축 판정은 실 UI 필수**: 재조립 스크립트가 만든 요청은 실 UI가 보내는 것과 다를 수 있어, "fal이 축을 무시하나"를 애초에 검증 불가.

## 0.5 실행 메커니즘 (결정)

- **지금(one-off verdict):** 에이전트(=나)가 **browser 툴로 실 크롬 탭을 직접 구동**. 실 Chromium + puppeteer + DB 조회(`fal_request`/`ignored_fields`) + 스크린샷 + 리포트를 한 곳에서. 별도 데스크톱앱/익스텐션 불필요(설치·비결정적·DB 못 읽음 = 손해).
- **나중(회귀 테스트로 굳힐 때):** 동일한 실 UI 클릭 시퀀스를 puppeteer 스크립트로 감싸 `e2e/`에 저장(여전히 실 UI = 발산 0).
- 근거: `e2e/TEST-MODES.md` — 판단자는 에이전트 브라우저, Playwright 미설치. `harness.mjs`는 DB 셋업/조회만.

## 1. 스코프

- **시작:** producer 핸드오프 버튼. **끝:** director에서 **카메라 축을 바꿔 영상 재생성 → fal 축 무시 여부 판정**.
- 이 범위가 (a) 내 P2(facets 렌더·sync contract)가 실 흐름에서 안 깨지나 + 원 진단(에일리언 abstract 프롬프트) 회귀 방지, (b) **카메라 6축 각각이 effective인가 no-op인가** 를 실제로 태운다.
- **범위 밖(지금 X, 인지만):** P4 parts-edit UX 노출목록.

## 2. 셋업 (시드 — 완료됨)

- 로그인: `ADMIN_EMAIL`/`ADMIN_PASSWORD` (admin@tale.studio). ✅ 설정·검증됨.
- fresh 프로젝트: **`bde0ef2d-4227-451a-8448-4f7497143f52`** (admin ws `ce053575…`, clone 아님, 순수 DB 시드). ✅ 생성됨.
- 시드: `settings{genre:sci-fi, playtime:45(D2), format:16:9, dialogueLanguage:ko, subGenre, tone:[스릴러]}` + `story_text`(골목 추격) + `producer_draft{cast:[도주자·풀필드], backgrounds:[뒷골목·완성]}`. characters/locations 테이블은 **실 핸드오프가 upsert**(진짜 동작).
- ✅ **실 UI 게이트 검증됨**: admin 로그인 → producer 진입 → "Writer로 핸드오프 · Artist도 열기" 활성(`logs/e2e-producer-gate-verify.png`).
- 스토리(카메라 모션 유의미): "좁은 골목을 전력 질주하는 남자. 뒤를 흘깃 보고 벽 짚어 꺾음. 카메라가 바짝 좇음." → 팬/트래킹/줌이 드러나게.

## 3. 실 UI 테스트 (에이전트 브라우저) + 재생성 매트릭스

**A/B 축 = 수정 경로: `프롬프트(채팅/텍스트)` vs `UI 컨트롤`.** 카테고리마다 2개 → 하나는 프롬프트로, 하나는 UI로 수정. **매 건 [무엇을·무엇으로 수정 → 무엇이 나왔나] 전후 스크린샷 + DB 기록.**

### T1. Producer 핸드오프
- producer 진입 → "Writer로 핸드오프 · Artist도 열기" 클릭 → 실 `handoffToStage('writer')` → `POST /api/writer/start` → 14단계 self-chaining.
- 관측: `writer_runs` 생성·완료 폴링, characters/locations upsert, `current_stage` 전이.

### T2. Writer — 러프 스토리보드 재생성 ×2 (프롬프트 1 / UI 1)
- `/studio/writer` 러프보드 로드 대기. **랜덤 2장** 선택.
- **① UI 수정:** 카드 hover → "패널 재생성" 클릭 → 실 `generate([shotId], true)`.
- **② 프롬프트 수정:** 카드 → 상세 다이얼로그 → 힌트 입력 → 재생성 → 실 `generate([id], true, false, hints)`.
- 기록: 각 카드 전/후 이미지, 입력한 힌트, `generation_jobs`(shot rough) + `shots.static_spec`/`prompt_source_hash`(내 P2).

### T3. Artist — 인물 1 + 배경 1 재생성 (프롬프트 1 / UI 1), writer와 왕복
- `/studio/artist` main 준비 대기.
- **① UI 수정:** 셀 클릭 → 상세/재생성 다이얼로그 → UI 옵션으로 재생성.
- **② 프롬프트 수정:** 다른 셀 → 프롬프트/지시 텍스트로 재생성.
- 기록: 전/후 이미지, 입력, `generation_jobs`(asset). writer↔artist 2~3회 왕복.

### T4. Director 초기 화면
- `/studio/director` 진입 → 초기 캔버스: 씬/샷 노드 sync.
- 관측(핵심): 노드 프롬프트가 **`derivedPrompt`/`effectivePrompt`(내 P2 sync)** 로 정상, **빈 프롬프트→`actionDescription` 폴백 안 터짐**(에일리언 abstract 회귀 방지).

### T5. Director — 카메라 축 영상 A/B ×2 샷 (프롬프트 1 / UI 1) ★ 핵심
동일 샷·동일 첫 프레임(storyboard)·동일 base prompt에서 **카메라만 변인**:
- 샷마다 먼저 **baseline 영상**(카메라 0) 1회 생성.
- **샷 A — UI 수정:** director 카메라 **6축 컨트롤**로 단일 축 ±(예 pan+10) 세팅 → 실 `generate-video`.
- **샷 B — 프롬프트 수정:** 축 컨트롤 대신 **프롬프트에 카메라 이동 서술**(예 "camera pans right following subject") → 실 `generate-video`.
- 각 호출: 실 `buildVideoPrompt`/`cameraToText`가 요청 조립 → `generation_jobs.input_snapshot.fal_request`(실 전송 body)·`ignored_fields`·`response_snapshot`·`video_url` 기록.
- 세부: `specs/camera-motion-ab-real-backend-e2e.md` S4~S6.

## 4. 카메라 축 판정 로직 (fal 무시 여부 = P1 verdict)

샷별로 3영상 비교: **baseline / 축-UI / 축-프롬프트**.
- `fal_request`에 축 arg가 **실제로 실렸나** + `ignored_fields`에 축 필드가 **떴나**(fal 스키마 미수용 신호).
- 육안: 축-UI 영상이 baseline과 **사실상 동일**한데 축-프롬프트 영상만 달라지면 → **fal이 구조화된 축 arg를 조용히 무시하고 프롬프트 텍스트만 읽는다**는 증거.
- 반대로 축-UI가 baseline과 뚜렷이 다르면 → 그 축은 **effective**.
- 6축 각각 effective/no-op 표 → 이 verdict가 P3(모션 배선)·P4(노출목록)를 확정.

## 5. 검증 포인트 (내 변경 회귀)
- **P2 facets:** 러프보드 재생성 후 `static_spec`/`prompt_source_hash` 채워짐, 동일 입력 재생성 시 해시 skip.
- **P2 sync:** director 노드 프롬프트 = `shot.prompt`(rich), `actionDescription` 폴백 아님.
- **플래그 기본 off:** `FACET_RENDER`/`MOTION_PROMPT_IN_VIDEO` off → 레거시 안 깨짐.
- **관측성(P1):** 모든 재생성/영상 잡이 `fal_request`/`ignored_fields` 기록.

## 6. 백엔드 동치 체크 (우회 없음 증명)
- 스텝별 히트 경로 DB/네트워크 확인: T1=`/api/writer/start`, T2=writer generate, T3=artist generate, T5=`/api/director/generate-storyboard`+`/api/director/generate-video`. T4=director store sync(클라).
- 스크립트 역할 = 셋업 시드 + DB 조회뿐. 모든 테스트 동작 = UI 클릭 → 실 프런트가 실 요청 조립.

## 7. 산출
- 실행 로그(스텝·수정경로별 전후 스크린샷) + 회귀 검증점(§5) pass/fail.
- **카메라 축 판정표**(축 | fal_request 실림? | ignored? | baseline vs UISET vs PROMPT 육안) → `docs/camera-motion-ab-<ts>.md`.

## 8. 오픈 컨펌
- **director 동시편집 타이밍:** `director-store.ts` 활발히 편집 중 → T4/T5 구동 시 in-flight 태움. **지금** vs **director 일단락 후**. (T1~T3은 director 무관 → 선행 가능.)
