# producer-story-gate — Tasks

> 작업 체크리스트의 **정본** (단일 장부, 2026-06-11). PROGRESS.md 검증 보드에는
> 이 change의 "건수 + 본 파일 포인터" 한 줄만 추가한다 — 항목 복제 금지.

## Active

### Section 1: 데이터 모델 + 마이그레이션

> 결정 확정(2026-06-12): format=합집합 enum / toneStyle→tone[]=일괄 마이그레이션 / relationships=별도 테이블 / 잠금·보호 플래그 전면 폐기(`locked` 제거 + `user_edited` 미도입, additive 원칙으로 대체). 같은 날 후속(decisions #57): 원천/파생 정합 원칙 — provenance+stale 배지+후보 히스토리로 OQ 1~4 해소. 상세 proposal §Decisions 1~7.

- [x] `ProjectSettings` 확장 — subGenre/tone[]/targetEmotion[]/format + `aspectRatioFromFormat` 파생 헬퍼 (types/project.ts, TS clean). producer-store/dashboard/page 정합 갱신. JSONB 일괄 마이그레이션 `020` 적용·검증 완료(old 키 0행, 캐시 refresh ✓)
- [x] `depthLevelFromRuntime(seconds)` 순수 함수 — `src/lib/depth.ts` (s0 매핑표 코드화) + `tests/depth.test.ts` 통과. 소비처(게이트/Compact/genre seed) 연결은 Section 2~3에서.
- [x] characters 마이그레이션 — `017` 적용·검증: entity_type/origin/voice/arc/motivation 추가 + `locked` 제거 + UNIQUE(project_id, character_id) ✓ (캐시 refresh ✓)
- [x] `character_relationships` / `subtext_notes` 신규 테이블 — `018` 적용·검증 (복합 FK cascade, 캐시에 노출) ✓
- [c] 이미지 provenance + 후보 히스토리 — `019_character_image_provenance.sql` 작성 완료. **PROVISIONAL — 미적용, Section 5 진입 직전 적용 권장**

### Section 2: Producer 게이트 (UI + 추출) — 캐스트 카드까지

> 2026-06-12 분리 결정: 관계(relationships) 편집 UI는 무게가 있어 **Section 2.5로 분리**. 본 섹션은 설정 인라인 편집 + 인물/사물 카드 + 게이트까지. 관계는 데이터/DB는 준비됨(018), 편집 UI만 후행.

- [x] 게이트 검증 로직 (제품 레이어) — `src/lib/producer-gate.ts` `evaluateProducerGate` (게이트 A S0 + 게이트 B depth 연동). `tests/producer-gate.test.ts` 8건 통과. 브라우저 ✓ (2026-06-12: 초기 하드 4건 차단 → 충족 시 활성화 / 30s=D2 캐스트 0명 통과 / 러닝타임 90s 인상 즉시 "D3: 주인공 1명" 재차단)
- [x] producer-store 확장 — `cast: CastMember[]` 상태 + add/update/remove + DB 하이드레이트(characters pull) + 추출 병합(빈칸만). 게이트는 컴포넌트에서 `evaluateProducerGate` 파생. (relationships 상태 → 2.5) 브라우저 ✓ (추출→카드 병합, 재진입 시 카드 3장·설정·스토리 복원)
- [x] producer UI — 설정 인라인 편집(`project-dashboard.tsx` 전체 위젯 + `tag-input.tsx`) + 인물/사물 카드(`cast-panel.tsx` + `cast-edit-dialog.tsx`) + 미충족 사유(`gate-status.tsx`) + 핸드오프 게이팅(`evaluateProducerGate`, 하드만 차단). TS/eslint clean. 브라우저 ✓ (인라인 subGenre/playtime 편집이 핸드오프 seed까지 반영 / person 다이얼로그 D3 필드·object 다이얼로그 person 필드 미노출 확인)
- [x] produce/chat 추출 스키마 확장 — 신규 settings 필드(format/tone[]/subGenre/targetEmotion[]) + characters[] 후보 제안 + soft 게이트 빈칸 시 채팅 넛지. 브라우저 ✓ (1턴에 설정+캐스트 3건+storyReady 추출, tone/감정 빈칸 넛지 노출)

### Section 2.5: 관계(relationships) 편집 (분리)

- [ ] producer-store 관계 상태 — `relationships: CastRelationship[]` + add/update/remove + DB 하이드레이트(`character_relationships` pull)
- [ ] 관계 편집 UI — D4+ soft 권장. 인물 쌍 + 관계 유형 + (선택) state_change/visible_in_video. cast-panel 내 섹션 또는 별도 다이얼로그
- [ ] 핸드오프 시 `character_relationships` upsert (Section 3 핸드오프 계약에 합류) + 인물 삭제 시 관계 정리(복합 FK cascade 확인)

### Section 3: 핸드오프 계약

- [x] slug 생성기 — `src/lib/cast-slug.ts` (`slugifyName`/`assignCastSlugs`, ascii-safe + 중복 suffix). `tests/cast-slug.test.ts` 통과. 브라우저 E2E ✓ (한글 이름 3건 → DB에 `char`/`char_2`/`char_3`)
- [x] `/api/writer/start` — getUser 인증 + `upsertProducerCast`(origin='producer', slug onConflict, 이미지칸 보존) → createRun 순서. genre/cast 수신. 브라우저 ✓ (핸드오프 200+runId / 중복 시작 409 / characters 3행 origin='producer'+voice/arc/motivation 저장)
- [x] `PipelineInput` 확장 — `genre?: Genre` + `cast?: CastContract` (pipeline.ts) + `castContractToCharacters`(`cast-contract.ts`) + createRun seed(state.genre/characters). producer-store saveAndHandoff 가 genre 완성형+cast 조립·전송. 브라우저 ✓ (run.state에 genre{subGenre 인라인값 포함}+characters 3건 seed / `_progress.jsonl`이 narrativeStructure부터 시작 — genre/characters 스테이지·LLM 호출 0건)

### Section 4: Writer drop + 오픈 캐스트

- [x] s0_genre.ts / s2_characters.ts **삭제** + steps.ts step 2개 제거(genre/characters) + pipeline/index.ts 로컬 경로 seed화(input.genre 필수·castContractToCharacters) + tsc clean. validators는 s0/s2 미참조라 변경 불필요(확인). 인프라성(파일 삭제·타입) → 코드 검증 OK
- [c] s3_scenes 오픈 캐스트 계약 — `runScenes` 프롬프트에 [기존 캐스트] slug+role+외형 주입 + 오픈캐스트 규칙(기존 slug 그대로/필요시만 신규/억지등장 금지) + 출력에 `new_characters[]` 추가. `mergeOpenCast`(s3_scenes.ts export)가 충돌·빈 id 거르고 StoryCharacter 기본값으로 머지 → steps.ts scenes step·index.ts 양 경로에서 호출 → persistAssetsToDb가 새 slug만 origin='writer' insert. tsc clean. **브라우저 검증 대기**(Section 6 additive 재실행 — new_characters 노출)
- [c] **additive 재실행** — `persistAssetsToDb` characters: delete 제거 → 기존 행 보존, 새 slug만 origin='writer' insert, 기존 행은 빈 보강 필드(appearance/costume)만 채움. (Section 3과 함께 선반영 — 핸드오프 캐스트 클로버 방지) 브라우저 검증 대기. *부분 증거(2026-06-12): 첫 run의 persist(productionDesign 시점) 후에도 producer 캐스트 3행 그대로(origin/정의 칸 미변경, 중복 insert 없음). 재실행 보존 시나리오는 Section 6에서.*
- [c] persistAssetsToDb — characters insert → 신규 insert + 빈 보강 필드 채우기만 (기존 정의 칸·이미지 칸 미변경). ↑와 동일 작업
- [ ] **이미지 생성 스텝 writer에서 제거** — view_main/wide_shot 레퍼런스 생성을 artist 초기 생성으로 이전. **의도적 후행(2026-06-12)**: artist가 이미지 생성을 인수하는 **Section 5**가 먼저 들어와야 한다 — 지금 writer에서 제거하면 이미지 생성 주체가 사라진다(공백). Section 5(artist 일원화)와 한 묶음으로 진행. 현재 writer는 `assetImages` step(steps.ts) + `assets_generate`/`submitHandoffAssetImages`로 이미지 submit 유지 중.
- [c] renderPrompts(l5) — object asset ref 주입 **코드 경로 확인 완료**: object는 `castContractToCharacters`로 state.characters에 들어가고(entity_type drop, id/name/appearance 보존) `buildAssetRegistry`의 characterIds에 포함 → l5 `reference_assets`가 person과 **동일 resolveAssetRef 경로**로 해소. 별도 코드 불필요. 런타임 주입 증명은 Section 6 object(반지) 브라우저 테스트

### Section 5: Artist — 이미지 생성 일원화 + object 카드

- [ ] **이미지 초기 생성 artist로 이전** — entity_type 분기(person 턴어라운드 #37 / object 단일 이미지) artist에서 수행
- [ ] **Lock UI/컬럼 제거** — character-panel/character-view-dialog Lock 토글 + 스토어 locked 필드 정리
- [ ] **stale 배지** (#57) — 상류(외모 등 이미지 입력) 변경 시 파생 이미지 낡음 표시. 자동 무효화·자동 재생성 금지(배지=정보, 행동=명시적)
- [ ] **후보 히스토리 UI** (#57) — 재생성=후보 추가(선택 자동 교체 없음), 선택본 교체 UI, 보관 정책(선택본 보존 + 미선택 최근 N장) 적용
- [ ] **webhook 착지 검증** (#57) — submit 시 `input_snapshot.source_hash` 동봉 → 착지 시 현재 행과 비교, 불일치면 착지+즉시 stale 배지(폐기 안 함)
- [ ] entity_type='object' 카드 — 턴어라운드 UI 미노출, 단일 이미지 생성/교체 + 탭 내 구분 표시
- [ ] writer 완료 전 카드 노출 동작 점검 — enteredProjects 진입 게이트·완료 알림 상호작용

### Section 6: 검증 (브라우저)

- [x] D3 프로젝트 — 게이트 차단→충족→핸드오프, writer 로그에 s0/s2 LLM 호출 없음 ✓ (2026-06-12 Playwright E2E, 프로젝트 a2fac5bf… / `logs/<pid>/debug/llm_calls`가 `001_narrativeStructure`부터)
- [ ] D1 프로젝트 — 캐릭터 0명 핸드오프 통과 (게이트 통과·버튼 활성까지는 ✓ 2026-06-12 — 30s=D2 캐스트 0명. 핸드오프 실행·파이프라인 완주는 미실행)
- [x] soft 게이트만 빈 상태 — 채팅 권유 → "그냥 진행" 시 빈 값 그대로 핸드오프 ✓ (넛지 노출, 무시하고 핸드오프 → projects.settings tone/targetEmotion `[]` + run seed에도 빈 배열)
- [ ] object(반지) — 등록→artist 단일 이미지→등장 샷 renderPrompts ref 주입
- [ ] additive 재실행 — 인물·이미지 확정 후 줄거리만 수정·재실행 → 기존 인물 정의·이미지 보존 + 장면만 갱신 + new_characters 노출
- [ ] stale 배지 + 히스토리 — 이미지 생성 후 외모 수정 → 배지(자동 재생성 없음) / 생성 중 수정 → 늦은 착지에 즉시 배지 / 재생성 → 후보 추가·선택본 유지
- [c] 하네스 정합 1차 — `CLAUDE.md`(루트)·`src/app/studio/CLAUDE.md`·`src/lib/writer/CLAUDE.md`에 producer-story-gate 분담(정체성=producer / 전개+연출=writer) + s0/s2 seed-생략 반영(writer-탭 부활과 공존 머지). **2026-06-12 갱신**: Section 4 s0/s2 실제 삭제 완료 → `src/lib/writer/CLAUDE.md` "생략 예정"→"삭제됨" + 오픈 캐스트 계약(`mergeOpenCast`) 반영. **남은 것**: 이미지 생성 artist 이전(Section 4 item 5 + Section 5) 후 하네스 반영

## Blocked
- (없음)

## Done
- (없음)
