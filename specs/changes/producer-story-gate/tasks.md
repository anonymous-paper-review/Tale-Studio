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
- [x] 이미지 provenance + 후보 히스토리 — `019_character_image_provenance.sql` **적용·검증 완료** (2026-06-12, Section 5 진입 시점): `character_image_candidates` 테이블 10컬럼 생성 + 기존 view_* URL 78행 backfill(전부 is_selected) + 캐시 refresh ✓. 슬롯당 선택본 1개 partial-unique 인덱스 적용

### Section 2: Producer 게이트 (UI + 추출) — 캐스트 카드까지

> 2026-06-12 분리 결정: 관계(relationships) 편집 UI는 무게가 있어 **Section 2.5로 분리**. 본 섹션은 설정 인라인 편집 + 인물/사물 카드 + 게이트까지. 관계는 데이터/DB는 준비됨(018), 편집 UI만 후행.

- [x] 게이트 검증 로직 (제품 레이어) — `src/lib/producer-gate.ts` `evaluateProducerGate` (게이트 A S0 + 게이트 B depth 연동). `tests/producer-gate.test.ts` 8건 통과. 브라우저 ✓ (2026-06-12: 초기 하드 4건 차단 → 충족 시 활성화 / 30s=D2 캐스트 0명 통과 / 러닝타임 90s 인상 즉시 "D3: 주인공 1명" 재차단)
- [x] producer-store 확장 — `cast: CastMember[]` 상태 + add/update/remove + DB 하이드레이트(characters pull) + 추출 병합(빈칸만). 게이트는 컴포넌트에서 `evaluateProducerGate` 파생. (relationships 상태 → 2.5) 브라우저 ✓ (추출→카드 병합, 재진입 시 카드 3장·설정·스토리 복원)
- [x] producer UI — 설정 인라인 편집(`project-dashboard.tsx` 전체 위젯 + `tag-input.tsx`) + 인물/사물 카드(`cast-panel.tsx` + `cast-edit-dialog.tsx`) + 미충족 사유(`gate-status.tsx`) + 핸드오프 게이팅(`evaluateProducerGate`, 하드만 차단). TS/eslint clean. 브라우저 ✓ (인라인 subGenre/playtime 편집이 핸드오프 seed까지 반영 / person 다이얼로그 D3 필드·object 다이얼로그 person 필드 미노출 확인)
- [x] produce/chat 추출 스키마 확장 — 신규 settings 필드(format/tone[]/subGenre/targetEmotion[]) + characters[] 후보 제안 + soft 게이트 빈칸 시 채팅 넛지. 브라우저 ✓ (1턴에 설정+캐스트 3건+storyReady 추출, tone/감정 빈칸 넛지 노출)

### Section 2.5: 관계(relationships) 편집 (분리) — **보류 (2026-06-13, 결정 9)**

> 전용 편집 UI **보류**. 사유: ① 관계는 스토리 텍스트에서 *파생 가능*한 값(제1원칙: 파생값은 따로 저장 안 함) —
> producer 스토리 칸이 이미 관계를 담고 writer가 줄거리+캐스트 카드로 추론(현 동작과 동일, 기능 공백 없음).
> ② soft 권장 + 최고 무게 = 비용 대비 가치 최저. ③ 저장 테이블(018 `character_relationships`)은
> **미래용 보존** — "구조적 관계 메타(변화/가시성)가 정말 필요" 판명 시 UI만 얹으면 됨. 상세 proposal 결정 9.
> 핸드오프는 `relationships: []`(빈 배열)로 나가며 `castContractToCharacters`가 안전 처리(현 상태).

- [~] producer-store 관계 상태 — **보류** (스토리 텍스트로 대체)
- [~] 관계 편집 UI — **보류** (제일 무거운 soft 항목, 파생값)
- [~] 핸드오프 시 `character_relationships` upsert — **보류** (테이블은 미래용 보존, 현재 빈 배열 핸드오프)

### Section 3: 핸드오프 계약

- [x] slug 생성기 — `src/lib/cast-slug.ts` (`slugifyName`/`assignCastSlugs`, ascii-safe + 중복 suffix). `tests/cast-slug.test.ts` 통과. 브라우저 E2E ✓ (한글 이름 3건 → DB에 `char`/`char_2`/`char_3`)
- [x] `/api/writer/start` — getUser 인증 + `upsertProducerCast`(origin='producer', slug onConflict, 이미지칸 보존) → createRun 순서. genre/cast 수신. 브라우저 ✓ (핸드오프 200+runId / 중복 시작 409 / characters 3행 origin='producer'+voice/arc/motivation 저장)
- [x] `PipelineInput` 확장 — `genre?: Genre` + `cast?: CastContract` (pipeline.ts) + `castContractToCharacters`(`cast-contract.ts`) + createRun seed(state.genre/characters). producer-store saveAndHandoff 가 genre 완성형+cast 조립·전송. 브라우저 ✓ (run.state에 genre{subGenre 인라인값 포함}+characters 3건 seed / `_progress.jsonl`이 narrativeStructure부터 시작 — genre/characters 스테이지·LLM 호출 0건)

### Section 4: Writer drop + 오픈 캐스트

- [x] s0_genre.ts / s2_characters.ts **삭제** + steps.ts step 2개 제거(genre/characters) + pipeline/index.ts 로컬 경로 seed화(input.genre 필수·castContractToCharacters) + tsc clean. validators는 s0/s2 미참조라 변경 불필요(확인). 인프라성(파일 삭제·타입) → 코드 검증 OK
- [c] s3_scenes 오픈 캐스트 계약 — `runScenes` 프롬프트에 [기존 캐스트] slug+role+외형 주입 + 오픈캐스트 규칙(기존 slug 그대로/필요시만 신규/억지등장 금지) + 출력에 `new_characters[]` 추가. `mergeOpenCast`(s3_scenes.ts export)가 충돌·빈 id 거르고 StoryCharacter 기본값으로 머지 → steps.ts scenes step·index.ts 양 경로에서 호출 → persistAssetsToDb가 새 slug만 origin='writer' insert. tsc clean. **브라우저 검증 대기**(Section 6 additive 재실행 — new_characters 노출)
- [c] **additive 재실행** — `persistAssetsToDb` characters: delete 제거 → 기존 행 보존, 새 slug만 origin='writer' insert, 기존 행은 빈 보강 필드(appearance/costume)만 채움. (Section 3과 함께 선반영 — 핸드오프 캐스트 클로버 방지) 브라우저 검증 대기. *부분 증거(2026-06-12): 첫 run의 persist(productionDesign 시점) 후에도 producer 캐스트 3행 그대로(origin/정의 칸 미변경, 중복 insert 없음). 재실행 보존 시나리오는 Section 6에서.*
- [c] persistAssetsToDb — characters insert → 신규 insert + 빈 보강 필드 채우기만 (기존 정의 칸·이미지 칸 미변경). ↑와 동일 작업
- [c] **이미지 생성 스텝 writer에서 제거** (결정 8) — `assetImages` step(steps.ts) 삭제 + `submitHandoffAssetImages`/`assetImagesSubmitted` 제거 + `submit_asset_images.ts` 파일 삭제. index.ts(로컬)에서 `runAssetsGenerate`/`persistAssetImagesToDb` 호출·import 제거(`persistAssetImagesToDb` 함수도 persist_manifest.ts에서 삭제). writer는 행(characters/locations/scenes)만 채우고 이미지는 안 건드림. `assets_generate.ts`는 수동 라우트 `/api/writer/generate/assets`용으로 잔존. tsc clean. **브라우저 검증 대기**: 핸드오프 후 파이프라인 완주 + artist 진입 자동생성이 빈칸 채움(Section 6).
- [c] renderPrompts(l5) — object asset ref 주입 **코드 경로 확인 완료**: object는 `castContractToCharacters`로 state.characters에 들어가고(entity_type drop, id/name/appearance 보존) `buildAssetRegistry`의 characterIds에 포함 → l5 `reference_assets`가 person과 **동일 resolveAssetRef 경로**로 해소. 별도 코드 불필요. 런타임 주입 증명은 Section 6 object(반지) 브라우저 테스트

### Section 5: Artist — 이미지 생성 일원화 + object 카드

- [c] **이미지 초기 생성 artist로 이전 — 진입 시 자동 1회(결정 8)** — **기존 구현 확인**: `autoGenerateBaseImages`(artist-store) + `artist/page.tsx:96-101`(`autoGenTriggeredRef` 진입당 1회, 멱등 — 빈칸만 채움)이 이미 존재. writer 쪽 자동 생성은 A3에서 제거(결정 8). object는 main만(Phase2 directional skip — A4). 입력=producer 확정 appearance. **브라우저 검증 대기**(Section 6): 핸드오프 후 빈칸 진입 자동생성 + 재진입 멱등 skip.
- [c] **Lock UI/컬럼 제거** (결정 4) — `locked` 전면 제거(라이브 컬럼은 017에서 이미 드롭): character-panel Lock 토글 UI + character-view-dialog disabled/안내 + artist-store `lockCharacter`/`unlockCharacter` 액션·매핑 + asset-storage-store/global-chat-store 참조 + types/asset.ts·database.ts 필드 + `/api/artist/character` insert(없는 컬럼 insert 잠재버그도 수정). grep 0건, tsc clean. **브라우저 검증 대기**: artist 카드에 Lock 토글 미노출 + 재생성 항상 가능(Section 6 일부).
- [c] **stale 배지** (#57) — 입력 경계=**appearance만**(결정). `lib/image-provenance.ts`(`computeImageSourceHash`/`isImageStale`, FNV-1a, isomorphic, 9 테스트) → character-panel 각 셀 + character-view-dialog 상단 배지. 자동 무효화·자동 재생성 없음(정보 표시만). tsc clean. **브라우저 검증 대기**(Section 6).
- [c] **후보 히스토리 UI** (#57) — 재생성=후보 추가(`finalize`가 character_image_candidates에 insert, 선택본 자동 교체 없음 — 단 새 생성은 새 선택본). view-dialog 썸네일 스트립 + 클릭 선택 교체(`/api/artist/select-candidate` route + `selectCandidate` 액션). 보관=선택본 보존 + 미선택 최근 5장(`finalize` 정리). tsc clean. **브라우저 검증 대기**.
- [c] **webhook 착지 검증** (#57) — `generate-sheet`가 submit 시 외모 지문을 `input_snapshot.source_hash`에 동봉 → `finalize`가 그 지문으로 후보 기록(외모가 생성 중 바뀌어도 폐기 안 하고 착지). 현재 행과의 불일치는 **stale 순수 함수가 자동 표시**(별도 비교 코드 불필요 — submit지문 vs 현재외모지문). tsc clean. **브라우저 검증 대기**: 생성 중 외모 수정 → 늦은 착지에 즉시 배지.
- [c] entity_type='object' 카드 — artist 전역 entity_type 분기 추가(기존 0건): CharacterAsset.entityType + artist-store hydrate/addCharacter + `/api/artist/character` insert. object는 **단일 main 이미지**(방향뷰 미생성 — `generateCharacterAllViews`·`autoGenerateBaseImages` Phase2 skip), character-panel 단일 셀 + "사물" 배지, add-dialog 인물/사물 토글(object는 role 숨김·supporting 고정), view-dialog 방향뷰 미적용. tsc clean. **브라우저 검증 대기**(Section 6 반지).
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
