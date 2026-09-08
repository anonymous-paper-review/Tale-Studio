---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Architecture — 판별 규칙

> 새 설계마다 아래 질문으로 진실의 소유자와 경계를 확인한다.

## 상태 소유권

- 새 진실인가, 기존 진실에서 계산되는 값인가? 진실은 한 곳에만 두고 파생값은 저장하지 않는다.
- 재시작 후에도 남고 여러 소비자가 읽으면 DB, 화면에만 필요한 임시면 클라이언트가 소유한다.
- 소비자는 서로 통지하지 말고 같은 원천을 읽는다(pull). push는 표시를 위한 트리거일 뿐이다.

## 레이어 경계

- 컴포넌트는 표시 결정만 하며 DB·외부 API를 직접 호출하지 않는다.
- store는 화면 수명보다 오래 필요한 직렬화 가능한 상태만 둔다. 비밀과 서버 로직은 두지 않는다.
- route는 인증·입력 검증·쿼터·위임만 맡고 도메인 로직이나 SDK 호출을 키우지 않는다.
- 공용 도메인·연동 로직은 lib에 두고 UI에 의존하지 않는다. DB에는 재시작·공유가 필요한 원천만 둔다.
- 비밀·권한·과금 방어는 서버 제품 레이어가 소유한다. 같은 진실의 이중 기록과 store 간 직접 의존도 금지한다.
- 백그라운드 작업은 기존 `submit → webhook → CAS 터미널 전이` 패턴을 따른다. 새 복잡도는 상태 소유자와 트레이드오프를 먼저 적는다.

## 모델 제안과 제품 검증

- LLM 호출이 없어도 의미가 있으면 제품 레이어다. 모델 레이어는 컨텍스트 조립·프롬프트·호출·파싱만 담당한다.
- 모델은 제안만 한다. 제품 레이어가 화이트리스트 검증 후 명시적으로 적용하며, 프롬프트 가드는 최종 방어가 아니다.
- 모델 컨텍스트는 요청 시점의 원천을 pull해 만든다. 모델 출력의 무검증 실행은 금지한다.

## 원천·파생 정합성

- 사람이 정한 값은 원천, 읽어 생성한 결과는 파생으로 구분한다. 파생에는 실제 입력과 provenance(입력 지문)를 함께 기록한다.
- 각 단계는 다른 단계의 결과를 고치지 않고 독립적으로 빌드한다. 합류는 확정된 상류 결과를 하류 입력으로 삼을 때만 일어난다.
- 자동 실행은 빈칸만 멱등적으로 채운다. 값이 있으면 사람의 명시적 적용 없이 덮어쓰지 않는다.
- 상류 변경은 하류를 자동 무효화·재생성하지 않는다. 파생의 stale 상태를 보이고, 명시적 재생성으로 수렴시킨다.

## 생성 선행조건 (2026-09-02, #ref-gate)

- 생성 진입점(route)은 선행 산출물을 **DB 진실로** 직접 읽어 붙인다. 클라이언트가 보낸 참조는 추가 입력일 뿐이며,
  클라가 빼먹은 것을 서버가 대신 채우거나(시트·배경) 없으면 막는다.
- 선행 산출물이 없으면 조용히 진행하지 않는다 — `409 + code`(예: `missing_character_sheets`)와 사람이 읽을
  목록을 돌려주고, 클라이언트는 code 로 안내한다. 무음 폴백(참조 없이 생성, 단일 이미지로 강등)은 금지.
- 상류 완료가 하류의 입력을 만드는 경우(writer 완료 → 인물 시트), 그 생성은 상류 완료의 일부로 서버가
  시작한다. 사람이 특정 탭에 들어가야만 시작되는 자동 생성은 순서 결함의 원인이다.

## 씬 무대 (2026-09-03, #stage)

- 화면 안 위치(왼쪽/가운데/오른쪽)·깊이·크기·향은 **세계 좌표 + 카메라에서 계산**한다. LLM 이 샷마다 화면 위치를
  고르게 하지 않는다 — 그것이 좌우 뒤집힘의 원천이었다(겨울_4 실측: 70쌍 중 8쌍 뒤집힘).
- 작가는 씬마다 무대(`scenes.stage`, `SceneStage`)를 세운다: 표지·인물의 비트별 위치/향/자세·180° 축과 카메라 쪽.
  v4 는 샷마다 `camera_setup`(피사체·방향·높이·렌즈)만 고르고, `stage/apply` 가 `screen_layout` 을 계산해
  `character_blocking[].position_in_frame` 을 덮어쓴다. 프레임 안 포함 여부도 기하로 정한다.
- 180° 축은 **선**으로 존재한다(`axis` + `camera_side`). 반대편 카메라는 동기(`axis_cross:'motivated'`)가 없으면
  축 안쪽으로 되돌린다 — 방향 반사 → 같은 방향으로 물러서기 → 점 반사 순.
- 무대가 없는 run(구 state·`WRITER_STAGE_OFF`)은 옛 동작(LLM 위치 그대로) — 소비처는 `screen_layout` 유무로 분기한다.
- 진실: 무대는 `scenes.stage`, 샷 배치는 `shots.static_spec.screen_layout`. 러프·실사 프롬프트는 이 값을 읽는다.

## 배경 카드 = 캐릭터 카드 (2026-09-04, 약속 B — `tests/promise-b-background-card.test.ts`)

- 배경(locations)은 캐릭터와 같은 기능을 갖는다. 차이는 프롬프트에 사람이 들어가지 않는 것뿐이며 그 절은
  서버(`/api/artist/generate-world` → `ensureNoPeopleClause`)가 최종 보장한다. 카드에는 생성 버튼이 없다(팝업·채팅).
- 원천 = `locations.visual_description`(EN base) + `_native`(유저 언어). 팝업의 설명 편집과 채팅 승인
  (`artistSourceLocationPatch`)은 모두 `PATCH /api/artist/location` 으로 커밋한다 → Writer 씬이 같은 설명을 읽는다.
- 후보 히스토리 `location_image_candidates`: finalize 가 슬롯당 최근 5장(선택본 보존)을 남기고,
  `/api/artist/select-location-candidate` 로 되돌린다. 브라우저 읽기는 소유자 SELECT 정책(20260904100000).
- "설명 바뀜": submit 때 설명 해시를 `appearance_hash` 에 두고(`computeWorldDescriptionHash`), 지금 설명과 다르면
  `classifyWorldImageStale` 이 edited. 해시 없는 옛 후보는 fresh(소음 방지).
- 실패·우회: `listFailedWorldShotJobs`(generation-status `worldFailures`) → 카드 배지·팝업 배너, moderation 류면
  safe-mode 재시도(`applyWorldSafeMode`, `SAFE_RETRY_CAP`). 모델 선택은 캐릭터와 같은 `DEFAULT_IMAGE_MODEL`.

## 모습(타임라인) — 캐릭터·배경 공통 (2026-09-04, 약속 C — `tests/promise-c-appearances.test.ts`, `tests/promise-c-location-appearances.test.ts`)

- 캐릭터: `character_appearances` 행 = 모습. 탭 줄은 모습이 하나뿐이어도 보이고 "+ 모습 추가"(이름·시점·외형)는 행 추가 뒤
  기본 모습 얼굴을 참조해 이미지를 바로 만든다(오너 C4). 채팅 `createAppearance` 는 과금이 생기므로 승인 카드(`artistCreateAppearance`).
  `regenerateCharacter.appearanceKey` 로 특정 모습만 다시 그린다. 관리는 `character-appearance` PATCH(label·narrativeTime·isDefault)·DELETE.
- 배경: 기본 모습 = `locations` 행(키 `default`), 변형 = `location_appearances`(20260904110000). 변형 이미지는 `generate-world`
  `appearanceKey` → 잡 타깃 `appearanceKey` → finalize 가 변형 행의 wide_shot 에 쓰고 후보는 `variant_key` 슬롯. 변형 생성은 기본
  배경 wide_shot 을 연속성 참조로 붙인다. Writer 러프 설명·Director 배경 참조는 씬 `narrative_time` 과 같은 변형에 이미지가 있으면
  그것(`resolveLocationAppearanceForScene`), 아니면 기본. 배경은 "기본으로 지정"이 없다(기본 = 배경 자체).
- Artist AI 는 뒷모습·측면 4뷰를 말하지 않는다 — 모습마다 시트 1장이 전부다(C9).

## 숫자 싱크 — 생성 큐 하나 (2026-09-04, 약속 D — `tests/promise-d-number-sync.test.ts`)

- 채팅 핀·왼쪽 탭 배지·Director "스토리보드/영상 생성" 버튼 숫자는 **서버 큐(`generation_jobs`) 하나에서 파생**한다.
  `/api/generation/active` 가 `batches`(레인별 active/done/failed/total)와 `completions`(완료 기록)를 동봉하고,
  `generation-queue` 싱글턴 폴러가 그것을 `useGenerationBatches/useGenerationCompletions` 로 나눠 준다. 순수 함수는
  `src/lib/generation-batches.ts`(`summarizeGenerationBatches`·`completionsOf`·`deriveStageBadges`·`withStoryboardBacklog`).
- 배치 = 레인(artist·writer-rough·director-storyboard·director-video·director-previz)별 "도는 잡 + 같은 창(2분) 안에서 끝난 잡".
  도는 잡이 없으면 배치도 없다(핀이 사라진다). 유령 queued(10분)는 세지 않는다. 그리드 잡은 샷 수만큼 단위다.
  실사 레인만 아직 제출 못 한 일괄 잔여(`realBatchRemaining`)를 핀·버튼이 같은 함수로 더한다(2026-08-25 피드백).
- 스테이지 배지 = "그 스테이지를 마지막으로 본 시각(`stage-seen.ts`, localStorage) 이후의 완료 단위 수". 클라이언트 증가(`stageBadges`) 는 쓰지 않는다.
- 채팅 완료 줄은 **건별로 저장**하고(`notifyCompletion` 즉시 flush) **화면이 합친다**(`groupStatusStacks` → `StatusStackRow`,
  안드로이드 알림 스택: 앞줄 "+N"·"N개 완료, M개 실패", 누르면 펼침). 사이에 다른 말이 끼면 새 스택. 저장본에 코얼레싱 타이머 없음.
- 잡 폴링은 `pollGenerationJob` 이 잡 id 별로 한 루프만 돈다(`inFlightPolls`). 배경 자동 생성은 이 세션에서 이미 도는 배경을 건너뛰고
  (`generatingLocations`), 서버는 같은 슬롯의 queued 잡을 `hasQueuedWorldShotJob` 으로 막는다.
- Artist 탭(인물/배경)은 스토어 `uiTab`, 고른 카드는 `loadData` 가 되돌리지 않는다(`keepSelection`).

## 영상 일괄 생성과 Take (2026-09-04, 약속 E — `tests/promise-e-video-batch-takes.test.ts`, `tests/promise-e-chat-approval.test.ts`)

- 일괄 생성은 Take 를 **미리 센다**: `src/lib/director/video-batch-plan.ts`(순수)가 샷별 단가(마더 샷의 모델 → `takeCostForVideo`, 서버 hold 와 같은
  계산기)와 잔액(`/api/billing/take-balance`)으로 만들 영상 수·필요한 Take·가진 Take·만들 수 있는 수(runCount)를 낸다. 버튼 확인창과
  채팅 승인 카드가 같은 `describeVideoBatchPlan` 줄을 쓴다.
- 모자라면(오너 E2, 1안) enforce 는 앞에서부터 runCount 만 요청하고 "N개 중 M개만"을 미리 알린다. shadow 는 숫자는 보이되 막지 않는다.
  off 는 Take 줄이 없다. 무제한(admin, balance null)은 "제한 없음"만 적는다.
- 채팅 "영상 다 만들어줘" = Director 액션 `generateVideos`(필드 없음) → 승인 카드 `directorGenerateVideoBatch`(payload.limit) → 승인 시
  `runVideoBatch(pid, { limit })`. 승인 없이 스토어까지 온 `generateVideos` 는 skipped. 샷 하나의 영상은 여전히 채팅으로 시작하지 않는다.
- 끝나면 러너가 완료 영수증(잡 id 별 첫 종결)을 세어 "N개 완료, M개 실패" 한 줄을 남긴다(`notifyBatchSummary`, 보고 있는 stage 여도).
  일괄 모드에서는 건별 완료 알림을 내지 않는다.

## 캔버스 선 = 실제 입력 (2026-09-04, 약속 F·G — `tests/promise-f-edge-delete.test.ts`, `tests/promise-g-edge-truth.test.ts`)

- 선은 노드 데이터에서만 파생된다: 참조 선 ← `characterAssetIds/worldAssetIds`(rebuildAssetNodes), 이미지 선 ← `imageInputs`,
  프레임 선 ← `frameInputs`, 영상 체인 ← `videoChainInputId`. 없는 입력에는 선이 없다. 목록을 바꾸는 `updateNodeData` 는 참조 선을 바로 다시 그린다.
- 선 지우기(`deleteEdge`)는 확인창 없이 노드 데이터의 그 입력을 지우고(`commitHistory` 로 Ctrl+Z), Delete 키·고른 선 위의 X(`CategoryEdge`)가
  같은 경로다. 계층(parent)·previz 파생(chain)·프롬프트 선은 지우지 않는다.
- 참조 목록의 진실: 사람이 손댄 샷은 `referenceOverride` + `shots.director_refs`(20260904120000, `{characters, locations}`; null = Writer 그대로).
  Writer→Director 동기화는 손댄 목록을 덮지 않고, 실사 생성(단건·배치)은 `shots.characters ∩ director_refs.characters` 만 붙이며
  `locations` 가 비면 배경도 붙이지 않는다(배치 시트는 그 시트의 샷 전부가 뺐을 때만). 하이드레이트가 이 열을 읽어 되살아남을 막는다.

## 러프 3장 개별 재생성 (2026-09-04, 약속 I — `tests/promise-i-rough-frames.test.ts`)

- 러프(shots.rough_storyboard.frames start·direction·end)는 한 장씩 다시 그린다: `regenerateRoughFrame(projectId, shotId, frame)`
  (`/api/writer/rough-directing-edit` action `regenerate-frame`) — Grok i2i 1회, 나머지 두 장은 손대지 않는다(`mergeRoughFrame` 순수).
  end·start 는 DIRECTING 을 참조("움직임 뒤/앞"), direction 은 START + action_description 을 참조. 연출 장이 바뀌면 클린 플레이트 캐시를 버린다.
- 3장 정지 보기 + "이 장만 다시 만들기"는 Writer 팝업(`ShotDetailDialog` → `RoughFramesStill`)의 것이고, Director 그리드의 이미지·글자
  클릭은 같은 팝업(previzOpen)을 연다.
- 실사(storyboard_image)는 참조한 러프의 `roughGeneratedAt` 을 기록한다(단건·스트립·배치 잡 타깃 → finalize). `classifyRoughChanged` 가
  지금 러프의 generatedAt 과 다르면 "러프 바뀜" 배지(ShotNode·그리드). 자동 재생성은 없다(오너 I5) — 사람이 다시 만든다.

## 타이틀 카드 = 다른 클립처럼 (2026-09-04, 약속 J — `tests/promise-j-title-card.test.ts`)

- 타이틀 카드 클립(shotId 접미 `__t…`, 자른 조각은 `__t…__c…`)은 자르기·늘이기·옮기기가 영상 클립과 같은 액션이다. `isTitleCardShotId` 가
  자른 조각도 알아보고, 새로고침 복원은 타이틀 카드를 원본 샷 검증 없이 스냅샷 그대로 되살린다.
- 길이: 원본이 없으므로 손잡이로 늘린 만큼 `durationSeconds` 가 길어진다(`setTrim`, 상한 600초). 라벨 클릭 → 초 단위 숫자 입력(`setTitleCardDuration`). 기본 5초.
- 배치·줄바꿈의 진실은 `src/lib/editor/title-card.ts` 하나다: 레이어 자리는 카드 비율(0..1), 줄바꿈은 `layoutTitleText`(줄바꿈 문자 → 단어 → 글자),
  겹침 순서는 `layout.order`. 미리보기(`TitleCardStage`, 끌어 배치·우클릭 메뉴)와 내보내기(`drawTitleCard`)가 같은 함수를 쓴다. 빈 글자는 아무것도 찍지 않는다.
- 이미지: 프로젝트 이미지(에셋 저장소 인물·배경, Writer 러프 첫 장)에서 고르거나 `/api/editor/title-image` 로 올린다(보관함만, DB 행 없음).

## 클립 자막 (2026-09-04, 약속 K — `tests/promise-k-subtitles.test.ts`)

- 자막은 편집기 샷의 `subtitle`(글자·자리 비율) 한 덩어리다. `undefined` = 손대지 않음(Writer 대사 `dialogueLines` 가 초기값), `null` = 지움.
  진실은 편집기 스냅샷(editor_states)이고, 복원은 DB 원본 샷에도 저장된 자막을 다시 입힌다(`loadPersisted`).
- 자리·줄바꿈·모양(흰 글자 + 검은 테두리, 아래 가운데 기본)은 `src/lib/editor/subtitle.ts` 하나가 정한다: 미리보기 `SubtitleLayer`(누르면 편집,
  끌기·방향키 이동)와 내보내기 `drawSubtitle` 이 같은 함수를 쓴다. 지금 재생 중인 샷의 자막만 얹는다.

## 배경 카드 빈 칸은 카드 이름으로 짚는다 (2026-09-04, 약속 L — `tests/promise-l-background-gaps.test.ts`)

- Producer 게이트(`evaluateProducerGate`)는 배경 카드마다 빈 칸(이름·시각 설명·목적)을 `background:<localId>:<field>` 로 싣는다.
  완성 배경이 하나라도 있으면 권장 목록(soft)이고 넘김은 통과, 없으면 필수 목록(hard). 배경이 아예 없을 때만 "배경 1개 필요".
- 같은 목록이 채팅 요청(`gate.hardMissing/softMissing` → `[Handoff Gate Status]`)과 제작 여정에 실린다 — 화면이 아는 빈 칸을 채팅이 모르는 일이 없다.

## 완드 = 입력창에 @카드이름 (2026-09-04, 약속 M — `tests/promise-m-wand-mention.test.ts`)

- Producer 카드의 완드는 보내지 않는다(오너 2안). `useChatUiStore.requestMentionCompose(label, hint)` → 채팅이 입력창을 `@라벨 ` 로 바꾸고
  커서를 뒤에 두며, 입력이 그 상태인 동안 회색 안내(`MentionTextarea ghost`, "이 카드 채워줘")를 보인다.
- 라벨은 `card-mention.ts`(이름 없는 카드도 "이름 미정 인물 2" 같은 고정 라벨)이고 서버가 같은 목록으로 카드 ref 를 찾는다 — 이름 없는 카드도 AI 가 안다.
  Artist·Director·Editor 에는 완드를 새로 만들지 않는다(별도 결정 1안).

## 씬 무대 수리 (2026-09-05, 오너 결정 — `tests/promise-stage-repair.test.ts`)

- **전이 소유권**: 상태 변화(자세·2m 이상 이동)는 샷 하나만 보여준다. `decideTransitionOwners`(작가 동작 있는 샷 > 인물이 가장 크게 잡힌 샷,
  화면 높이 15% 미만 제외) → `transitionPins`(앞 샷은 START 상태, 뒤 샷은 END 상태로 고정) → 2차 `applyStageToShots({ pins })` → 장부는
  소유 샷에만 보충. 순서는 `stage/orchestrate.runStageForScene` 하나가 갖고 파이프라인(v4_shots)과 재적용 하네스가 같이 쓴다.
- **근거 게이트**(버전 2 무대만): 변화한 인물 항목의 `evidence`(원문 인용)가 원문에 없으면 직전 상태로 되돌리고 `gated_note` 메모만 남긴다
  (`gateStageEvidence`; 프롬프트는 메모를 읽지 않는다). 옛 무대(version 없음)는 건드리지 않는다. 작은 반응(자세를 낮춤 등)은 note 로만.
- **기하**: 표지 피사체도 거리 계산은 인물 키. 와이드(EWS/ELS/VWS/WS/LS/FS/MLS)에서 피사체가 표지뿐인데 인물 명단이 있으면 합집합.
  화면 높이 8% 미만 인물은 blocking 에서 빼고 `screen_layout.characters[].distant` 로만 남긴다(러프 문장 "먼 인물").
  END 카메라는 START 의 **최종** 카메라(시야 가림·물러섬·쌍 축 보정 뒤)에서 푼다(`tests/promise-stage-end-camera.test.ts`, 2026-09-07 실측
  겨울_6 sh_01_02: 쌍 축 보정 전 카메라로 END 를 계산해 안 움직인 용족이 화면 왼쪽→오른쪽으로 옮겨갔다).
- **프레임 밖 봉인**: 카메라 밖 인물은 `screen_layout.off_frame` + WARNING visual 제약("OFF-SCREEN … do not draw") → check_notes 로 러프·실사에 실린다.
  러프 셀은 이름을 대고 못박고, 실사 참조 계획(`planShotCharacterRefs`·배치 라우트)은 그 인물의 시트를 붙이지 않는다.
  START 에 없고 END 에 들어오는 인물은 "NOT visible at START; enters from the left/right".
- **정지 프롬프트 위생**(5, 2026-09-05 — `tests/promise-still-prompt-hygiene.test.ts`): 러프 셀의 배경은 `stage/view.landmarksInView`(screen_layout.camera 시야 안 표지)로
  고정한 문장(`backgroundClauseFromView`)을 싣고, moment 문장에서 카메라 무브 서술을 뺀다(`stripCameraMoveSentences`). 러프 라우트가 scenes.stage 의
  표지와 화면 비율을 셀에 넘긴다. 작가(v4) 프롬프트는 환경 사건의 출처·방향을 요구하고 first_frame_prompt 의 카메라 무브를 금한다.
  표지 라벨은 무대 LLM 이 콘텐츠 언어로 적으므로 라우트가 `deriveEnBatch` 로 영어로 바꿔 셀에 넘긴다(2026-09-06 실측: 겨울_6 러프에 한국어 라벨이 섞임).

## Director 배선 수리 (2026-09-06, 오너 지시 — `tests/promise-director-1~5-*.test.ts`)

겨울_6 조사에서 적은 위험 5건. 실시간 구독은 없고 폴링·수동 재수화 구조 그대로이며, 클라이언트 쪽 배선만 고쳤다.

- **1 선이 남는다**(`promise-director-1-lines-survive`): 재수화가 DB 연결 참조(`image_inputs`·`frame_inputs`)를 풀 때 아직 없는 노드(에셋 노드는
  Pass 2.6 에야 생긴다)를 가리키는 참조는 버리지 않고 `pendingImageRefsByShot`/`pendingFrameRefsByClip` 에 둔다(`splitImageInputs`/`splitFrameInputs`).
  `rebuildAssetNodes` 끝에서 `resolvePendingWiring` 이 풀어 선으로 되돌리고, 스윅은 보관분을 합쳐(`mergeStableRefs`) 되쓴다.
  스윅 시드는 스윅과 같은 모양(`{ i, r }`)이어야 한다 — 모양이 달라 재수화마다 전 샷을 되쓰던 것이 선을 지운 실제 경로였다.
  프로젝트 전환·reset 은 보관분과 시드를 비운다(shot_id 는 프로젝트마다 겹친다).
- **2 러프·previz 는 새로고침 없이 뜬다**: 큐 훅(`use-queue-rehydrate`)이 `shot_rough_storyboard` 도 감시하고, 정산·복귀 때 Director 재수화와 함께
  writer 스토어의 `refreshShotMedia`(러프·previz 두 칸만 DB 로 다시 채움, 타이핑 중인 다른 칸은 그대로)를 부른다.
- **3 배치 러너**: 시트 완료·라운드 종료 재수화 앞에 `invalidateShots` — 30초 사물함의 옛 행으로 헛돌지 않는다.
- **4 이미지가 되돌아가지 않는다**: `shots-cache` 는 무효화 세대를 응답 배열에 붙여(`rowsGen`, structuralSharing off) 무효화보다 먼저 시작된 요청에
  합류했거나 그 결과로 채워진 칸이면 한 번 더 받는다. 단건 이미지 잡은 제출 즉시 `refreshGenerationQueue()` 로 큐 훅의 정산 재수화를 탄다.
- **5 영상 프레임은 서버가 DB 로 정한다**(`video-reference-frames.ts`, #ref-gate 와 같은 방향): 클라는 `frameSource`('manual' = 손으로 배선한
  프레임·영상 체인, 그 밖 'auto')만 보내고, 라우트는 게이트 뒤에 `resolveVideoReferenceFrames` 로 auto 는 DB 실사의 시작·끝 프레임, manual 은 클라
  목록에 빠진 시작 프레임만 채운다. `frameSource` 가 없는 호출(구 클라·직접 호출)은 종전대로 클라 값을 쓴다.
  그리드 카드의 "영상 생성"은 이미지를 새로 만들기 전에 `hydrateFreshFromDb` 로 DB 를 먼저 읽는다(승인한 그림 보호).

## 카메라 동기 — 여섯으로 닫힌 목록 (2026-09-07, 오너 결정 — `tests/promise-camera-motivation-*.test.ts`)

현직 감독의 "카메라는 언제 움직일까"(강조·감정 고조·리빌·에너지·시점·롱테이크)를 계약으로 옮겼다. 여섯에 들지 않으면 움직이지 않는다.

- **어휘**: `motion-vocabulary.ts` `CAMERA_MOTIVATIONS = emphasis | emotion | reveal | energy | pov | long_take`, 동기별 허용 종류·속도·진폭과 기본값
  (`MOTIVATION_MOTION_RULES`), 지시서 문구 `CAMERA_MOTIVATION_GUIDE`, 동의어·한국어 접기 `normalizeCameraMotivation`, 꼴 교정 `coerceMotionForMotivation`,
  "왜" 문장 `cameraWhyClause`. `long_take` 는 예약(오너 결정 3번 — 클립 5~10초라 테이크 묶음·영상 사슬 설계 전까지 쓰지 않는다).
- **데쿠파주**: 기본 계약 `CAMERA_CONTRACT_MOTIVATED`(relaxed-v3 판단 규칙 + 닫힌 동기). 출력 `camera_motivation`·`camera_target`; 자유 문장 `camera_move_motivation` 은
  선택. `util/camera_motivation.coerceDecoupageCamera` 가 motivated_move 인데 여섯에 안 들면 static 으로 내리고 `decoupage_motivation_repair_*.txt` 에 남긴다.
  되돌림: `WRITER_CAMERA_CONTRACT=relaxed-v3|legacy`.
- **V4**: `camera_motion.motivation`·`target`(데쿠파주 값을 잇는다), `camera_setup.end.subject`(reveal 대상), `camera_setup.pov_of`(시점 주인).
  `enforceCameraMotivation` 이 유일한 강제 지점 — 동기 없는 무브는 static 으로, 동기 있는 무브는 꼴을 교정(`L4_vocab_repair_*.txt`). reveal/pov 대상은
  camera_setup 에 이어 준다.
- **기하**(`stage/apply.ts`): reveal 은 대상이 START 밖·END 안인지 검사하고, END 에 없으면 회전형(pan/tilt·무브 없음)은 제자리에서 대상을 향해 돌리고
  이동형은 대상을 피사체로 END 카메라를 다시 푼다(`screen_layout.reveal`). pov 는 카메라를 시점 주인의 눈(위치·눈높이·향)에 놓고(`povCamera`) 그 인물을
  명단·배치에서 빼며 "카메라 자신" 제약을 붙인다(`screen_layout.pov_of`); 시야 가림·물러섬·쌍 축 보정은 걸지 않는다.
- **프롬프트**: 러프 MOVEMENT 줄이 `camera pan right, medium — to reveal Elf Chief, …` 처럼 "왜"를 달고, pov 는 START 첫머리에 "point-of-view shot: the camera is
  X's eyes"를 싣는다. 영상 계약문은 카메라 절 뒤 `Purpose: …`(라우트가 대상 인물 이름을 조회해 넘긴다).
- **에너지 예외(오너 결정 2번 — 2026-09-07 전후 비교 뒤 켬)**: V4 지시서에 "energy 액션 비트에서는 카메라 큰 무브 + 인물 큰 액션 허용, 환경 변화만 따로" 가
  기본으로 실린다. `WRITER_ENERGY_EXCEPTION=0` 으로만 끈다(종전 동시 금지로 복귀). 비교 실측(겨울_6 sh_01_05): 전진 트래킹의 체감은 분명했으나 START 구도 수렴이 약해졌다.

## 이야기 문장에는 이름이 나온다 (2026-09-08, 오너 지시 — `tests/promise-names-in-prose.test.ts`)

- **원인**: 한글 이름은 슬러그가 비어 `char`,`char_2` 로 폴백하고(`cast-slug.ts`), 씬 스토리 지시서가 캐스트를 "char (용족수장)" 로만 보여 줘 모델이
  문장에도 id 를 썼다. 그 문장이 데쿠파주·V4·이미지 프롬프트까지 번졌고, 표시 층은 화면마다 치환이 달랐다(조사도 못 고침).
- **규칙**: 산문 필드는 표시 이름, 구조 칸(characters_in_scene·character_id·gaze_arc·camera_target)은 id. 지시서 공통 문구 `PROSE_NAME_RULE`
  (`pipeline/util/prose_names.ts`)을 s3·merged·데쿠파주·V4 가 싣고, 데쿠파주 캐스트 JSON 에 name 을 넣는다.
- **코드 치환(2차 방어)**: `cleanSceneProse`(scene_actions·dialogue_summary·key_dialogue.line, new_characters 포함) → `cleanDecoupageProse`
  (beat_summary·native·목적·사유) → `cleanShotDesignProse`(layers·focal·pose·prop significance·first_frame_prompt·motion_prompt·verb·환경 description).
  모르는 id 는 지어내지 않는다.
- **치환기**: `resolveEntityNames` 가 로스터의 맨몸 id(char)도 토큰 단위로 바꾸고(긴 id 먼저), `korean-particles.fixKoreanParticles` 로 이/가·을/를·은/는·
  과/와·아/야·으로/로를 받침에 맞춘다. `script-lines.replaceSlugs` 도 같은 규칙(prefix '' 일 때).
- **표시**: Director 그리드 카드의 한국어 설명·노드 카드 프롬프트 줄, Writer 대사 뷰, Editor 타임라인·소스 패널·미리보기가 치환을 쓴다.
  로스터는 `use-entity-names.ts`(writer 스토어 sceneManifest, 없으면 loadProject 1회).

## Editor 다섯 가지 (2026-09-08, 오너 지시 — `tests/editor/transitions-and-controls.test.ts`)

- **타이틀 카드 삽입 시 오디오 동행**: `addTitleCard` 가 끼우는 자리(끼어드는 영상의 시작, 맨 뒤면 전체 길이) 뒤에서 시작하는 오디오를 카드 길이만큼 민다. 앞의 오디오는 그대로.
- **디졸브**(`lib/editor/transition.ts`): 클립 앞 경계의 `VideoClip.transitionIn = { type: 'dissolve', durationSec }`. 미리보기는 검은 막(`dissolve-overlay`)의
  투명도만 `dissolveOpacityAt` 로 바꾼다 — 경계에서 1, 길이의 절반 밖에서 0. 우클릭 메뉴 "디졸브(검은 화면 전환)" 에서 없음·0.5·1·2초.
  스냅샷(editor_states)에 저장·복원, 되돌리기 대상. 내보내기 합성은 없다(샷 ZIP 은 원본 파일).
- **자막 자리표시**: "누르면 자막을 넣어요"는 자막 상자에 마우스를 올렸을 때만 보이고(`group-hover/sub`), 재생 중에는 그리지 않는다.
- **안내 문구 삭제**: "클립 우클릭 → 속도·분할·삭제" 제거(사전 키도 제거).
- **축척 +/−**: 전체 보기 왼쪽에 −·"1초 = N px"·+. `zoomStep`(×1.25 / ÷1.25, 8~240 px 한계).
