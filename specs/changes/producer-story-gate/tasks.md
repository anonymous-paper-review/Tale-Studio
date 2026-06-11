# producer-story-gate — Tasks

> 작업 체크리스트의 **정본** (단일 장부, 2026-06-11). PROGRESS.md 검증 보드에는
> 이 change의 "건수 + 본 파일 포인터" 한 줄만 추가한다 — 항목 복제 금지.

## Active

### Section 1: 데이터 모델 + 마이그레이션

- [ ] open questions 1~4 확정 (format enum / toneStyle→tone[] / relationships 저장처 / locked vs user_edited)
- [ ] `ProjectSettings` 확장 — subGenre/tone[]/targetEmotion[]/format (types/project.ts) + 기존 settings JSONB 읽기 폴백
- [ ] `depthLevelFromRuntime(seconds)` 순수 함수 — s0 매핑표 코드화 + 소비처(Compact Mode 판정 등) 연결
- [ ] characters 마이그레이션 — entity_type/origin/voice/arc/motivation/user_edited 컬럼 + relationships 저장처 (라이브 DB 적용 후 `.claude/cache/db` refresh)

### Section 2: Producer 게이트 (UI + 추출)

- [ ] 게이트 검증 로직 (제품 레이어) — 게이트 A(S0 필수/권장) + 게이트 B(depth 연동 캐스트 요구치) 결정적 판정 함수
- [ ] producer-store 확장 — cast 상태(characters/relationships) + 게이트 충족 selector
- [ ] producer UI — 설정 폼 확장 + 캐릭터/사물 카드 에디터 + 미충족 사유 표시 + 핸드오프 버튼 게이팅
- [ ] produce/chat 추출 스키마 확장 — 신규 settings 필드 + characters[] 후보 제안 (확정은 사용자, user_edited 마킹)

### Section 3: 핸드오프 계약

- [ ] slug 생성기 (name→snake_case, 중복 suffix) — producer 소유
- [ ] `/api/writer/start` — 핸드오프 시 characters upsert(origin='producer') → run 시작 순서 보장
- [ ] `PipelineInput` 확장 — genre 완성형 + CastContract, initial WriterRunState seed (state.genre/characters)

### Section 4: Writer drop + 오픈 캐스트

- [ ] s0_genre.ts / s2_characters.ts 삭제 + steps.ts step 제거 + pipeline/index.ts 로컬 경로 + validators 동시 갱신
- [ ] s3_scenes 오픈 캐스트 계약 — 기존 cast slug 주입 프롬프트 + `new_characters[]` 분리 반환 + origin='writer' insert (slug 충돌 시 기존 행 사용)
- [ ] 덮어쓰기 보호 — producer-origin 사용자 확정 필드 불변, writer는 보강 필드만 / 재실행 시 user_edited·locked 보존
- [ ] persistAssetsToDb — characters insert → update-only(보강) 전환
- [ ] assets_generate entity_type 분기 — person 턴어라운드(#37) / object 단일 레퍼런스 이미지
- [ ] renderPrompts(l5) — object asset ref 주입 확인 (person과 동일 경로)

### Section 5: Artist object 카드

- [ ] entity_type='object' 카드 — 턴어라운드 UI 미노출, 단일 이미지 생성/교체 + 탭 내 구분 표시
- [ ] writer 완료 전 카드 노출 동작 점검 — enteredProjects 진입 게이트·완료 알림 상호작용

### Section 6: 검증 (브라우저)

- [ ] D3 프로젝트 — 게이트 차단→충족→핸드오프, writer 로그에 s0/s2 LLM 호출 없음
- [ ] D1 프로젝트 — 캐릭터 0명 핸드오프 통과
- [ ] object(반지) — 등록→artist 단일 이미지→등장 샷 renderPrompts ref 주입
- [ ] 오픈 캐스트 — writer new_characters 노출 + producer-origin 필드 미덮어쓰기
- [ ] `src/lib/writer/CLAUDE.md` 스테이지 맵 갱신 (하네스 정합)

## Blocked
- (없음)

## Done
- (없음)
