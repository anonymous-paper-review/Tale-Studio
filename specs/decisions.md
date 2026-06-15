# Decisions

> 최종 수정: 2026-06-15
> 레거시 아카이브: `specs/archive/decisions_legacy_2026-03-03.md`
> superseded/archive-event 결정: `specs/decisions-archive.md` (아래 인덱스 참조)

> **이 파일은 cross-cutting 결정의 rolling 로그입니다. Append-only.**
>
> 새 변경 작업은 `specs/changes/<name>/proposal.md`에 작성하고, 끝나면 `specs/archive/YYYY-MM-DD-<name>/`로 이동. archive 시 본 파일에 entry 1줄 append (entry 번호 + archive 폴더 링크).
>
> Entry 번호는 monotonic. **기존 번호 mid-history 편집 금지**. 변경 적은 원칙은 `specs/_constitution.md` 참조.
>
> **본문 = 현재 유효한(Active) 결정만.** 이후 결정에 번복(superseded)되었거나 archive 사실만 기록하는
> entry는 `specs/decisions-archive.md`로 분리하고, 아래 **아카이브 인덱스**에 한 줄로 남긴다(2026-06-05 정책).

## 확정

### 58. producer-story-gate archived
- **결정**: producer-story-gate 구현 완료 — s0(장르축)·s2(캐릭터 정의)를 producer 게이트로 승격, writer는 s1부터 + 오픈 캐스트(`new_characters[]`/`mergeOpenCast`), 이미지 생성 artist 일원화(진입 시 자동 1회·결정 8), 파생 이미지 provenance + stale 배지 + 후보 히스토리(#57), Lock 플래그 전면 폐기(결정 4). `specs/archive/2026-06-13-producer-story-gate/`로 이동.
- **검증**: 코드/빌드/유닛(provenance 9 테스트) + **A3 진입게이트 회귀 발견·수정**(writer view_main 사전생성 제거로 mainReady 데드락 → `pipeline_completed` 진입). 생성 의존 브라우저 플로우(자동생성 실이미지·stale 실편집·후보 교체·object ref·additive 재실행)는 **수동 확인 권장**으로 남김(사용자 (A) 결정, 2026-06-13).
- **관계 편집(Section 2.5)**: 결정 9로 **보류** — 관계는 스토리 텍스트에서 파생, producer 전용 UI 미구현. 저장 테이블(018 `character_relationships`)은 미래용 보존, 핸드오프는 빈 배열.
- **신설 결정**: 본 change 진행 중 #57(provenance, cross-cutting) + 내부 결정 1~9(proposal §Decisions). 결정 8(이미지 초기생성 자동/재생성 수동)은 architecture §5의 "과금 파생물 사람 방아쇠" 예외를 폐기.
- **일자**: 2026-06-13

### 59. producer-ui-redesign archived
- **결정**: Producer 메인 UI를 `Handoff readiness board` 단일 surface로 전환하고, 기존 `ProjectDashboard`/`CastPanel`/`GateStatus` 분할을 제거했다. Producer는 더 이상 `targetEmotion`을 입력·추출·검증하지 않으며 writer 호환 payload에는 `targetEmotion: []`만 유지한다. character/cast `voice`는 Producer/Writer metadata·prompt·gate·writer DB write path에서 제거했고, `characters.voice` live DB column도 Gate G 후 `021_drop_characters_voice.sql`로 드롭 완료. `specs/archive/2026-06-15-producer-ui-redesign/`로 이동.
- **검증**: `tsc --noEmit`, focused Vitest 18 tests, `pnpm run lint`(0 errors, 기존 warning 14), `pnpm run build`, authenticated browser E2E(`/tmp/producer-readiness-board-e2e.png`), pre-drop and post-drop authenticated `/api/writer/start` smoke 통과. Post-drop smoke에서 no-voice producer character upsert + writer_run 생성 + `targetEmotion: []` + serialized state에 `voice` 없음 확인.
- **일자**: 2026-06-15

### 57. 데이터 정합 원칙 — 원천/파생(provenance) 모델 채택 (cross-cutting)
- **결정**: 다단계(stage) 공유 데이터의 정합성 원칙 확정. 데이터는 **원천**(사람이 직접 정한 값)과 **파생**(원천을 읽어 생성된 결과물)으로 나뉘며, 파생물에는 sync가 아니라 **provenance(입력 지문)**를 설계한다. 5원칙: ① **빌드는 독립** ② **원천은 공동 편집**(자율 실행=빈칸만, 덮어쓰기=사람의 명시적 행동만) ③ **합류는 하류**(스테이지 간 영향은 통지/sync가 아니라 하류 빌드의 재료로만 — writer·artist는 형제, 합류는 director) ④ **일관성 = 순간이 아니라 수습 가능성**(전역 불일치는 정상 — 파생물이 입력 지문 보유 + 낡음(stale) 표시 + 명시적 재생성으로 수렴) ⑤ **통합 경험은 에이전트**(낡음을 읽고 재생성을 *제안* — 데이터 자동 연쇄 금지).
- **적용**: stale = 표시(정보)만, 자동 무효화/자동 재생성 금지(사람 선별 보호 + 과금). "초기생성 vs 재생성" 구분 폐기 → "빈칸 채우기(자율 가능) vs 차 있는 것 교체(사람만)". 보존 판별 = "갈아엎으면 잃는 게 있는가(사람이 선별·편집했는가)" — 비용이 아니라 복원 불가능성+선별 투자 기준. producer-story-gate의 데이터 모델 OQ 1~4를 이 원칙으로 전부 해소(상세·구현은 해당 proposal §Decisions 5~7). 이미지 후보 히스토리(#55에서 defer했던 버전 히스토리)를 동 change 범위로 승급.
- **amend(2026-06-12, producer-story-gate 결정 8)**: 빈칸 자율 채움의 "과금 파생물은 빈칸이라도 사람 방아쇠" 예외를 **폐기**. 과금 파생물(이미지)도 *빈칸*이면 자율 채움 대상 — 트리거는 파이프라인이든 화면 진입이든 무관(상류 확정 입력 + 멱등 + 진입/세션당 1회 + 실패 배지). 사람 전속은 *차 있는 것 교체*(재생성)뿐. **불변**: 상류 변경 시 *차 있는* 파생물의 자동 무효화·자동 재생성은 여전히 금지(stale 배지만). 상세 = producer-story-gate proposal 결정 8.
- **주의(forward)**: "장면 = 매 실행 통째 재생성" 티어 배치는 *장면에 사람 손이 안 탄* 현 구조에서만 참 — **#53 writer UI 부활로 사용자가 장면/스토리보드를 직접 편집하게 되면 장면 단위 보존 표식 재논의 필요**.
- **하네스/원칙 격상**: `.claude/rules/architecture.md` §5(판별 규칙) + `specs/_constitution.md` §데이터 정합(5원칙 서술) + `specs/_DECISION_TEMPLATE.md` §Data/State Ownership(게이트 질문) 반영.
- **일자**: 2026-06-12

### 56. chat-context-management archived
- **결정**: 전역 채팅 컨텍스트 관리 구현 완료. **prompt caching(top-level `cache_control`) + 토큰예산 윈도잉(메시지 40개 + char 48K 이중 상한) + 서버사이드 compaction 안전망(@600K)**. proposal의 "compaction을 주 메커니즘 + 블록 영속화 마이그레이션" 전제는 **번복** — 스테이지 산출물은 이미 DB pull로 외부화돼 transcript 미누적(Anthropic/Manus just-in-time)이라, 윈도잉이 입력을 compaction 트리거(600K) 한참 아래로 캡한다. 채택: 외부화(기존) + 윈도잉 + compaction 보험, **마이그레이션 0**. `specs/archive/2026-06-12-chat-context-management/`로 이동.
- **검증**: tsc·eslint clean. 브라우저/로그(cache_read>0, compaction 트리거) 검증은 사용자 waive(2026-06-12) — 규모상 compaction은 평소 발효 경로 없음(순수 보험).
- **계승/제외**: #51 chat-proactive-copilot 전역 채팅 구조 계승. 제외(defer): compaction 블록 DB 영속화 + `loadMessages` carry-over(`[~]`) — 윈도우를 풀어 대화를 키우는 설계(Phase 3 tool-calling 외부화)로 갈 때만 재평가.
- **일자**: 2026-06-12

### 55. chat-aware-regeneration archived
- **결정**: artist 이미지 재생성의 워크스페이스 인식(workspace awareness) 구현 완료. `generation_jobs`를 활동 로그로 삼아 actor(ui/chat/writer) 귀속(015), 채팅 컨텍스트 빌더(`src/lib/artist/chat-context.ts`)가 매 턴 최근 잡을 **pull**해 주입 — 이벤트 push 없음(Cursor 패턴). 단일 명령·다중 진입점(generate-sheet/generate-world 라우트를 UI·채팅 공용, 별도 regenerate 라우트 미생성). `specs/archive/2026-06-12-chat-aware-regeneration/`로 이동.
- **검증**: 2026-06-12 사용자 라이브 — ①UI 재생성 actor='ui'(malenia/sideLeft) ②"방금 뭐 했어?"에 UI발 재생성 인지 답변(활동 로그 pull) ③채팅 재생성 actor='chat'(malenia/sideRight) DB row 확인. ④비용 가드 = ②/③ 사이 자율 잡 미생성으로 증명.
- **계승/제외**: #51 비용 가드(명시 요청에만 재생성), #38 writer actor, #37 턴어라운드 재생성 대상 계승. 제외: asset_versions 버전 히스토리, push형 채팅 알림(#51 Phase 2), director/editor actor 귀속(default 'ui').
- **일자**: 2026-06-12

### 54. generation-jobs-multiuser-guard archived
- **결정**: Async MVP→Multi-user 전환 안전장치 구현 완료. `generation_jobs`에 runtime metadata(`actor`/`user_id`/`workspace_id`/`provider`/`input_snapshot`/`submitted_at`/`completed_at`/`attempts`/`last_error`) 추가(015·016 라이브 적용 + 기존 240 row 백필), 보수적 한도(유저 queued cap 8, artist/director/writer submit concurrency 2) 적용. `specs/archive/2026-06-12-generation-jobs-multiuser-guard/`로 이동.
- **검증**: 2026-06-12 00:55 KST 사용자 Artist 재생성 라이브 row로 전 필드 정상 기록 확인(actor=ui/writer 구분, input_snapshot 풍부 — 백필 미터치 필드라 앱 write 입증). DB 캐시·`src/types/database.ts` 재생성, tsc clean.
- **유지(non-goal)**: full dispatcher/fair queue/worker pool, billing, `pending_submit` 상태 도입은 후속. dispatcher 트리거 조건은 archived proposal에 보존.
- **일자**: 2026-06-12

### 53. writer = UI 스테이지로 부활 + 스토리보드 도입 (#38 "writer UI 제거" 부분 번복) — forward
- **결정(방향)**: writer를 **백엔드 전용 → UI 스테이지로 복원**. producer 스토리 게이트 통과 후 writer·artist가 **함께 열려 상호 편집**(artist 첫 생성은 producer 기반). writer 산출 = **스토리보드(목각인형 + 6축 연출 annotation, artist 디테일 이미지 없음)**.
- **스토리보드 3단 점진**: ① writer 스토리보드(목각+연출) → ② director storyboard 샷 이미지(artist 디테일 기반) → ③ 영상 storyboard(②+영상 프롬프트). UI는 아직 명세화 전.
- **#38 관계**: #38의 **writer UI 제거·producer→artist 직행**만 번복. 엔진 일원화(svc→writer)·`characters.fixed_prompt` drop·`appearance` 단일화는 **유지**(#38 잔존).
- **범위**: 본 결정은 *방향*만 확정 — writer UI/스토리보드 **기능 명세·코드는 미작성/미구현**(현 코드의 writer는 여전히 백엔드 엔진). producer 선행 개선은 `specs/changes/producer-story-gate/`(미구현).
- **정합**: editor 오디오 트랙은 코드에 이미 구현 → mvp_scope에서 MVP 포함으로 정정(V3.4).
- **상세**: `specs/mvp_scope.md` V3.4
- **일자**: 2026-06-12

### 52. workspace-inventory archived
- **결정**: `inventory_items` 테이블 + API 4종(list/save-from-asset/upload/delete) + `inventory-store` + Artist "인벤토리에 저장" 버튼 + Director ShotNodePopup 인벤토리 picker 구현 완료. `specs/archive/2026-06-11-workspace-inventory/`로 이동
- **참고**: 잔여 [ ] 3건(rate limiting, load race guard, instantiate)은 범위 외 후속
- **일자**: 2026-06-11

### 51. chat-proactive-copilot archived
- **결정**: Phase 1 프로액티브 '다음 단계' 넛지 + 쿼터 가드 + 크로스스테이지 알림 + completeness 감지 + 핸드오프 구현 완료. 브라우저 검증은 2026-06-10 사용자 결정으로 waive. `specs/archive/2026-06-11-chat-proactive-copilot/`로 이동
- **참고**: 후속 [~] 6건(fair-queue, 갭 채우기 action, parity 갭 등)은 archive된 tasks.md에 보존
- **일자**: 2026-06-11

### 48. Director 데이터 DB 일원화 — #43 번복(005 적용), director-store 제거
- **결정**: Director를 **DB 단일 진실 + canvas-store 단일 스토어**로 일원화(`unify-director-store-db`). #43("005 불필요, canvas_position=localStorage")을 **번복** — 노선을 localStorage→DB로 전환.
- **Step 0**: canvas-store `updateNodeData`가 Shot camera/lighting/cameraPreset/prompt를 DB `shots`로 write-through(debounce). 마이그레이션 0(컬럼 기존). → 캔버스 편집 drift 해소.
- **Step 1**: `director-store.ts`(780줄) 삭제. `editor-store` fallback→DB 경로만, `global-chat-store` director 분기→항상 canvas, `project-store.resetChildStores`에서 제거. 내부 #14 종결.
- **Step 2**: 마이그레이션 **005 라이브 적용 완료**(2026-06-05, scenes/shots/video_clips `canvas_position` + video_clips `is_final/take_label/override`, `_apply_migration.mjs`+`NOTIFY pgrst`+`_refresh.py`, drift 0). 그래프 구조 hydrate/write-back은 진행 중.
- **유지**: 양방향 라이브 sync는 여전히 범위 밖(#44) — 단방향 write-through + 1회 hydrate만.
- **상세**: `specs/changes/unify-director-store-db/`
- **일자**: 2026-06-05

### 47. presets 라우트 IDOR 해결 + D-8 안전분 정리 (director-store 제거는 별도 change로 보류)
- **보안**: `/api/director/presets` GET/POST/DELETE에 `isProjectOwned(projectId, user.id)` 가드 추가 — `workspaces.owner_id`→`projects.workspace_id` 소유권 검증(project/init과 동일), 미소유 403. DELETE는 preset→project_id 역추적 후 검증.
- **D-8 정리 완료(안전분)**: `movement-control.tsx`(고아) / `legacy/page.tsx`(+PaletteBar Legacy 링크) / `cinematographic-inspector.tsx`(legacy 전용) 삭제. tsc/eslint clean.
- **director-store 제거 보류**: 780줄 store가 legacy 아니라 **load-bearing** — `editor-store`(핸드오프) + `global-chat-store`(legacy director chat 분기)가 의존. 무리한 제거는 가동 기능 파손 위험 → **별도 change**로 분리(내부 #14는 그때 종결). angle-control/key-light/camera-preset-control은 새 NodePopup 재사용이라 **유지**(task 원문 삭제 목록은 부정확).
- **일자**: 2026-06-05

### 46. D-6 Camera/Light Preset 라이브러리 = DB 백엔드 (camera_light_presets)
- **결정**: Director Canvas 프리셋 라이브러리를 **DB 테이블** `camera_light_presets`(project_id 1:N, camera/lighting/camera_preset JSONB)로 영속. localStorage 아님 — 프로젝트 단위 영속 + 기기 간 공유. 마이그레이션 `011_camera_light_presets.sql`.
- **적용 규칙**: 프리셋 적용 = camera/lighting/cameraPreset **전체 덮어쓰기**, prompt/참고이미지는 유지 (내부 #16).
- **DB 적용**: 011 라이브 적용 완료(2026-06-05) — `_apply_migration.mjs` + `NOTIFY pgrst reload schema` → PostgREST 200, `_refresh.py` 캐시 반영.
- **일자**: 2026-06-05

### 45. redesign-director — 단방향 seed(writer→director 1회 로드) 채택
- **결정**: #44에서 양방향 sync를 폐기하되, **단방향 seed**는 채택. Director 진입 시 writer 산출 scenes/shots를 캔버스 노드로 **1회 로드**(멱등 — 기존 노드/seed 플래그 있으면 skip). seed 이후엔 사용자 편집 + localStorage persist가 진실, writer 변경은 재반영 안 함.
- **사유**: 양방향(무한루프 가드) 비용 없이 "캔버스가 빈 채로 시작" 여파(#44)만 해소.
- **남은 실작업 = D-4S(seed) + D-5(NodePopup 영상생성 wire-up) + D-6(Preset 라이브러리)**.
- **일자**: 2026-06-05

### 44. redesign-director 스코프 축소 — D-4(양방향 sync)·Editor 핸드오프 폐기
- **결정**: `redesign-director`에서 **D-4 Writer↔Director 양방향 sync**와 **D-8의 Editor 핸드오프(Final Video export)**를 **지금 안 함(드롭)**. 양방향 sync는 무한 루프 가드 비용이 크고 현 우선순위 아님, editor 연동도 현재 작업 아님.
- **여파**: writer 파이프라인이 채운 shots가 Director 캔버스에 **자동 표출되지 않음**(수동 노드 생성 + localStorage persist만). 필요 시 별도 change로 "단방향 seed(writer→director 1회 로드)"부터 재검토.
- **남은 실작업**: **D-5**(NodePopup 영상생성 wire-up — store/그리드뷰는 director-storyboard에서 이미 구현, NodePopup 버튼만 연결) + **D-6**(Camera/Light Preset 라이브러리 — 신규 store + `camera_light_presets` 테이블 + Palette UI). D-8 레거시 정리(구 Inspector/director-store/구 컴포넌트 삭제)는 선택(tech-debt).
- **일자**: 2026-06-05

### 43. 마이그레이션 005(director_layout) 불필요 확정 — canvas_position은 localStorage 유지
> ⚠️ **#48에 의해 번복(superseded)** — DB 일원화 노선 전환으로 005 적용함(2026-06-05).
- **결정**: `005_director_layout.sql`(scenes/shots/video_clips `canvas_position` + video_clips `is_final/take_label/override`)를 **라이브에 적용하지 않는다**. director 노드 위치는 현 코드가 DB가 아니라 Zustand persist(localStorage, key `tale-director-v1-*`)에 저장한다(`grep canvas_position src/` = 0건, `007` 마이그레이션 주석도 명시).
- **근거**: 2026-06-05 `_refresh.py` 라이브 introspection — 006/007/008/009/010은 적용됨, **005만 미적용**. 미적용이 현재 동작을 깨지 않음(코드가 그 컬럼을 안 씀).
- **영향**: `redesign-director` D-1의 "005 적용" task는 `[~] 불필요`로 정정. 향후 D-4(Writer↔Director sync)를 DB 영속으로 구현하면 005가 다시 필요해질 수 있음 — 그때 재검토.
- **일자**: 2026-06-05

### 38. SVC 파이프라인 = 단일 writer 엔진으로 일원화, fixed_prompt 폐기, writer UI 제거
- **결정**: producer 핸드오프에서 병렬로 돌던 두 파이프라인(옛 `generate-scenes` writer + `svc`)을 **svc 하나로 일원화**. svc가 상위집합(검증·비주얼스타일·3분할샷)이므로 svc를 남기고 **`svc`→`writer`로 리네임**, 옛 generate-scenes/writer-chat/writer-UI 제거.
- **캐릭터 프롬프트 단일화**: 옛 writer의 `fixed_prompt` vs svc `appearance` 2개를 **`appearance` 하나로** 통합. `characters.fixed_prompt` DROP(`009`). 소비측(`buildCharacterPrompt`)은 appearance 사용. → #37의 "svc 토큰 미완 시 fixed_prompt 폴백"을 대체(이제 svc가 DB로 직접 공급).
- **writer = 백엔드 전용**: `studio/writer` 페이지·`features/writer` 제거, nav producer→artist 직행. svc 파이프라인이 `/api/writer/start`(핸드오프)에서 백그라운드 실행되어 DB(characters/scenes/locations/shots, 샷별 대사 포함)를 채움(`persist_manifest`). `writer-store`는 artist/director가 소비하는 **공유 데이터 허브로 유지**.
- **DB 정합 선행**: 코드가 라이브에 없는 컬럼에 write(Director/Editor 조용히 실패)임을 실증 → `007`(shots 기어/무브먼트/speed/storyboard_image), `008`(design_tokens + appearance/costume + location 토큰) 적용. `database.ts` 라이브 기준 재생성. 적용은 supabase CLI 히스토리 불일치로 pg 직접.
- **트레이드오프**: svc는 16단계라 핸드오프 지연 ↑. `adapters.ts`가 대사 손실(L4 연결)이라 `shot_sequence` 기반 persist 신작성. `description`/`visual_description` 등 레거시 컬럼은 가동 우선으로 중복 잔존(후속 정리). svc 풀 런 런타임 검증 미수행(합성 테스트만).
- **상세**: `specs/archive/2026-06-05-unify-svc-writer-pipeline/`
- **일자**: 2026-06-05

### 37. Artist 캐릭터 이미지 — 턴어라운드 시트 + crop 파이프라인 채택
- **결정**: artist 캐릭터 이미지 생성을 뷰별 개별 호출(Path B `autoGenerateBaseImages`)에서 **"턴어라운드 시트 1장 생성 → 서버 crop → 뷰 분배"** 방식으로 전환. A 방식(svc 구조화 프롬프트: S2.appearance + L1.art_style/shape_language + L2.palette) 기반.
- **시트 구성**: **1×4 가로 스트립** (front | side-left | side-right | back, 균등 4등분). 모델 = fal `openai/gpt-image-2`.
- **crop**: `sharp`로 서버사이드 4등분 고정좌표 crop (MVP). 모델이 그리드를 완벽히 안 맞추면 일부 잘림 — 수동조정/피사체감지 crop은 후속 승급 여지.
- **뷰 모델 변경**: `CharacterAsset.views` `{front, side, back, threeQuarterLeft, threeQuarterRight}` → **`{main, front, back, sideLeft, sideRight}`**. main=전체 시트. DB 컬럼 `view_main`/`view_side_left`/`view_side_right` 신설, `view_side`·`view_three_quarter_*` deprecate.
- **이유**:
  - 한 번의 생성으로 다각도 일관성 확보 + 호출 수 절감. 시트가 동일 캐릭터를 한 캔버스에 그리므로 뷰 간 외형 드리프트 ↓
  - svc 14b_assets(Path A)는 디버그 패널에서만 소비되어 artist 카드와 무관했고, 디버그 패널 제거로 고아화 → A의 *프롬프트 자산*만 artist로 이관
- **트레이드오프**: 고정좌표 crop은 모델 레이아웃 정합에 의존 (MVP 한계). svc 디자인 토큰(04_S2/08_L0_L1/09_L2) 접근 필요 — 미완료 시 `fixedPrompt` 폴백.
- **상세/태스크**: `specs/changes/writer-background-artist-progress/` (decisions [25,29] 연계)
- **일자**: 2026-06-05

### 35. Pretendard Variable 한국어 폰트 도입
- **결정**: `next/font/local`로 Pretendard Variable woff2를 로드해 한국어 fallback 확보. `--font-pretendard` CSS variable로 노출. `--font-sans` chain은 `Geist Sans → Pretendard → ui-sans-serif → system-ui → sans-serif`
- **이유**:
  - UI 기본 언어가 한국어 (decisions log 2026-05-17 cleanup)인데 Geist Sans는 한글 미지원 → 시스템 기본 폰트로 fallback되어 OS/브라우저별 일관성 깨짐
  - Pretendard Variable은 weight 45~920 가변 폰트 (단일 woff2 ~2MB) — 별도 weight 파일 불필요
  - Latin 글리프는 Geist 우선이라 영문 타이포 정체성 유지
- **구현**:
  - 패키지: `pretendard@1.3.9` (npm) 설치 후 `dist/web/variable/woff2/PretendardVariable.woff2`를 `src/app/fonts/`로 복사 (build-time bundle용)
  - `src/app/layout.tsx`에 `localFont({ src: './fonts/PretendardVariable.woff2', variable: '--font-pretendard', display: 'swap', weight: '45 920' })` 추가
  - `globals.css @theme inline`의 `--font-sans` chain에 `var(--font-pretendard)` 삽입
- **트레이드오프**: 초기 bundle 크기 ~2MB 증가. 분할 subset (`pretendard/dist/web/variable/woff2-dynamic-subset/`) 도입은 후속 작업 (현재 단일 file로 단순화)
- **일자**: 2026-05-28

### 34. 이미지 생성 모델 — Nano Banana 임시 사용 (Imagen paid 까지)
- **결정**: `/api/generate/image`에서 `imagen-4.0-generate-001`(paid-only) → **`gemini-2.5-flash-image`** (Nano Banana, free tier 500 req/day)
- **이유**:
  - 검증 단계에서 Imagen paid plan 결제 부담 회피
  - Nano Banana는 free tier에서 동일 image generation 호출 가능 (Google AI Studio key)
  - SDK 호출 방식: `generateImages` → `generateContent` + `responseModalities: ['Text', 'Image']` + `inlineData` 추출
  - aspectRatio는 prompt 후미에 자연어 힌트로 주입 (Nano Banana가 명시적 옵션 미지원)
- **트레이드오프**: Nano Banana는 Imagen 대비 캐릭터 일관성/품질 다소 낮음. 검증·내부 시연 단계에 충분, 외부 데모 직전에는 Imagen 복원 검토
- **복원 트리거**: paid plan 결제 시 `route.ts`의 `generateViaGemini` 함수를 이전 `generateImages` 호출로 복원 (git history 참조)
- **일자**: 2026-05-17

### 30. Design Constitution (`specs/design.md`) 도입
- **결정**: 시각·인터랙션 공통 컨벤션의 단일 진실 소스로 `specs/design.md` 채택. 페이지별 레이아웃(`specs/ux_pages.md`)과 분리
- **원칙 5개**:
  1. 캔버스 제일주의 (패널 보조)
  2. `globals.css` 토큰 외 신규 색 금지
  3. 모션은 정보 전달 (장식 아님)
  4. 키보드 일등 시민
  5. 한 화면 정보 위계 2단까지
- **색 시스템**: Netflix Dark 그대로. Actor=`--chart-1`(red), World=`--chart-2`(blue), Status=마더 색 채도 50% 감소
- **엣지 시각**: neutral gray 한 톤, 카테고리는 굵기+스타일로 구분 (색 분기 안 함)
- **모션 4-tier**: 100 / 150 / 250 / 350ms
- **근거**: Linear / shadcn / Geist 디자인 시스템 리서치. 소규모 팀 헌법은 *결정된 것을 명문화*가 핵심
- **일자**: 2026-05-17

### 28. MVP 범위 P1~P5 전체 포함
- **결정**: MVP를 P3+P4+P5 Lite → **P1~P5 (P5 Lite)** 로 확장. P1/P2 Mock 대체 전략 폐기
- **변경 요약**:
  - P1 The Meeting Room: **포함** (Producer Agent 대화 수집)
  - P2 The Script Room: **포함** (Writer Agent + L1 Pipeline 씬 분할)
  - P3~P5: 기존 그대로 유지
- **P5**: Lite 유지 (In-Painting/In-Pointing/음악 싱크는 Post-MVP)
- **폐기**: DataProvider Mock 패턴 (P1/P2가 실제 구현되므로 불필요)
- **근거**: 전체 파이프라인 구현이 제품 가치 전달에 필수. P1/P2 없이는 데모 불가
- **일자**: 2026-03-03

### 27. P5 Post-Production MVP Lite 포함
- **결정**: P5를 Lite 범위로 MVP에 포함
- **MVP 포함**: 비디오 프리뷰 + 타임라인 (씬별 탭, 샷 썸네일) + Crop + 순서 편집 + Draft 렌더링
- **MVP 제외**: In-Painting, In-Pointing, 음악 Waveform 싱크, AI 품질 평가
- **근거**: P3 범위 축소(탭3개→2컬럼)로 여유 발생 + V2에서 P5 디자인 확정(image5.png) + 파이프라인 완성 필요
- **일자**: 2026-03-03

### 26. P4 Storyboard 통합 (Shot Node Grid-Mindmap)
- **결정**: 기존 P3 Storyboard 탭을 P4로 이동. P4 = Scene Navigator + Shot Node Grid-Mindmap + Cinematographic Inspector + Director Chat
- **V1 P4**: 탭 기반 (Cinematographic / Shot Frames / Music)
- **V2 P4**: 3패널 통합. Shot Frames 탭 제거 → Grid 내 Frame Mode로 대체
- **추가 요소**: Director Kim Chat (AI 촬영 가이드, Inspector 실시간 연동), Lens Combo 캐러셀, Lighting Sphere UI
- **근거**: V2 디자인 (reference_v2/image4.png). 스토리보드와 촬영 설정을 한 화면에서 작업
- **후속**: P4 자체는 Phase 11 Director Canvas(노드 그래프)로 재설계 진행 중 — `specs/layers/director.md`
- **일자**: 2026-03-03

### 22. 프론트엔드 스택
- **결정**: Next.js + Vercel
- **대안**: React + Vite + Vercel
- **선택 근거**: API Routes 내장으로 프론트+백엔드 통합 가능. Vercel 배포 간편. P3/P4의 복잡한 상태 관리(샷 목록, 6축 카메라, Three.js) 대응
- **일자**: 2026-02-25

### 20. Kling 6축 카메라 파라미터 매핑
- **결정**: Knowledge DB camera_language 10개를 Kling 6축 값으로 수동 매핑
- **파일**: `databases/knowledge/camera_presets.yaml`
- **Kling 축 정의** (공식 API):
  | 축 | 범위 | 동작 |
  |----|------|------|
  | horizontal | -10~+10 | 카메라 좌(-)/우(+) 슬라이드 |
  | vertical | -10~+10 | 카메라 하(-)/상(+) 슬라이드 |
  | pan | -10~+10 | 피치 하(-)/상(+) 회전 |
  | tilt | -10~+10 | 요 좌(-)/우(+) 회전 |
  | roll | -10~+10 | 롤 반시계(-)/시계(+) |
  | zoom | -10~+10 | 화각 좁(-)/넓(+) |
- **주의**: Kling의 pan/tilt 명명이 일반 시네마토그래피와 반대 (pan=pitch, tilt=yaw)
- **일자**: 2026-02-12

### 17. Veo 프롬프트 최적화 (삽질 기록)
- **결정**: Veo 프롬프트는 **150자 이내**, 8초 영상에 맞게 **핵심 액션만** 기술
- **삽질 과정**:
  | 시도 | 문제 | 결과 |
  |------|------|------|
  | v1: 400자 상세 프롬프트 | 앞부분만 반영, 뒷부분 무시 | 정적인 장면만 생성 |
  | v2: "POV shot moving forward" 추가 | 카메라 움직임 설명만, 피사체 정적 | 카메라만 움직임 |
  | v3: 짧은 프롬프트 + 동시 액션 | 핵심만 150자 이내 | 성공 |
- **핵심 교훈**:
  1. **길이 제한**: 8초 영상 = 앞부분 100-150자만 유효
  2. **동시 서술**: 카메라 움직임 + 피사체 움직임을 한 문장에
  3. **정적 표현 금지**: "stand in formation" → "walk toward camera"
  4. **구체적 동사**: "approaches" → "walk toward camera"
- **추가 발견**:
  - cinematography 필드는 Veo가 잘 못 읽음 (scene_context에 통합 권장)
  - negative_prompts는 효과 불분명 (짧게 유지)
  - style_keywords도 짧게 (2-3개 max)
- **일자**: 2026-01-28

### 14. Lore 데이터 구조화
- **결정**: `assets/lore/*.yaml`에 테스트용 입력 데이터 저장
- **구조**: AVA Framework 기반 (anchor, style, characters, scenes)
- **파일**:
  - `mountain_king.yaml`: Dark Romanticism + Horror (클래식 음악)
  - `luterra_trailer.yaml`: Epic Fantasy (게임 lore)
- **이유**: 다양한 입력 소스 테스트, Mock DataProvider에서 사용
- **일자**: 2026-01-28

### 13. Knowledge DB Supabase 이관
- **결정**: YAML 기반 Knowledge DB를 Supabase `knowledge_techniques` 테이블로 이관
- **구조**:
  - `technique_id`: 고유 ID (handheld, chiaroscuro 등)
  - `category`: camera_language / rendering_style / shot_grammar
  - `prompt_fragment`: 프롬프트에 삽입할 텍스트
  - `emotional_tags`: 감정 기반 검색용 배열 (GIN 인덱스)
  - `shot_type_affinity`: 샷 타입 매칭용 배열 (GIN 인덱스)
- **이유**: Video Reference DB와 동일 인프라 사용, 배열 검색 성능, 향후 확장성
- **어댑터**: `SupabaseKnowledgeDB` (YAML과 동일 인터페이스)
- **일자**: 2026-01-28

### 12. Video Reference DB 구현
- **결정**: Supabase 기반 영상 레퍼런스 DB, Knowledge DB와 soft reference 연결
- **구조**:
  - `videos` 테이블: 영상 메타데이터 (URL, platform, status)
  - `shot_analysis` 테이블: 샷 단위 분석 (timestamp, technique_id, confidence)
  - `analysis_jobs` 테이블: 분석 작업 추적
- **연결 방식**: shot_analysis.technique_id → Knowledge DB의 id (FK 없음, soft reference)
- **워크플로우**: pending → analyzed (LLM) → reviewed (Human)
- **일자**: 2026-01-27

---

## 파이프라인 설계 (Post-MVP 구현 예정)

### 3. L1 펌프업 기능
- **결정**: L1 입력 최적화 + Veo 시각화 정보 추가 (서사 보존 + 시각 정보 확장)
- **이유**: L1이 씬 분할하기 좋고, Veo가 그릴 수 있는 정보 필요
- **일자**: 2026-01-23

### 3-1. 펌프업 범위 제한
- **결정**: 캐릭터성/감정선 기반 표현 선택은 펌프업에서 제외
- **펌프업이 하는 것**: 시간/조명, 장소 구체화, 물리적 동작, 환경 디테일
- **펌프업이 안 하는 것**: 감정→시각 표현 선택, 캐릭터성 반영
- **일자**: 2026-01-23

### 8. 펌프업 구현 세부사항
- **결정**: 목표 1500자 (1500~2000), source_title로 웹검색, 감정 단어 배제
- **일자**: 2026-01-23

### 6. 펌프업 참조 소스
- **결정**: LLM 상상력 + 원작 로어/설정 + 외부 자료 (있으면)
- **일자**: 2026-01-22

### 4. L2 대화 생성 기능
- **결정**: 대화 씬에서 대사 스크립트 자동 생성
- **일자**: 2026-01-22

### 1. 3-Level Architecture 역할 분리
- **결정**: L2는 스토리 요소(대사, 액션, 감정), L3는 연출 테크닉(카메라, 조명, 효과)만 담당
- **이유**: 관심사 분리 명확화, 각 레벨의 책임 범위 정의
- **일자**: 2026-01-22

### 2. L3 DB 목적
- **결정**: 영상 분석 → 시네마틱 테크닉 DB (카메라워크, 조명, 효과 등)
- **이유**: L3 Prompt Builder의 프롬프트 품질 향상을 위한 레퍼런스
- **일자**: 2026-01-22

---

## 아카이브된 결정 (인덱스 → `specs/decisions-archive.md`)

> 이후 결정에 번복(superseded)됐거나 archive 사실만 기록하는 entry. 상세는 archive 파일 참조.

- **#50** unify-director-store-db archived (검증 waive) — 2026-06-05
- **#49** redesign-director archived (검증 waive) — 2026-06-05
- **#42** director-storyboard archived (검증 waive) — 2026-06-05
- **#41** writer-background-artist-progress archived (검증 waive) — 2026-06-05
- **#40** unify-svc-writer-pipeline archived (런타임 검증 waive) — 2026-06-05
- **#39** rollback-artist-card archived — 2026-06-05
- **#36** redesign-l0-canvas archived (superseded, 카드형 롤백) — 2026-06-04
- **#33** F-D2 노드 우클릭 메뉴 제거 (artist L0, superseded by #36) — 2026-05-17
- **#32** F-D1 Actor↔Actor 엣지 단순화 (artist L0, superseded by #36) — 2026-05-17
- **#31** L0 Meeting Room Agentic Canvas (artist L0, superseded by #36) — 2026-05-17
- **#29** P3→L0 Concept Canvas 전면 재설계 (superseded by #36 카드형 롤백) — 2026-05-17
- **#25** P3 에셋 전용 범위 축소 (superseded by #29→#36) — 2026-03-03
- **#24** V2 MVP 범위 재정의 (superseded by #28) — 2026-03-03
- **#23** 코드베이스 리셋 및 MVP 스코프 (superseded by #24→#28) — 2026-02-25

---

## 번복됨

(없음 — superseded 결정은 위 아카이브 인덱스 + `specs/decisions-archive.md` 참조)
