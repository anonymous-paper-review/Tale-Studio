# Tale-Studio 열린 문제 통합 (2026-06-12)

> 5개 카테고리 서브에이전트 조사(A 선언된미결 / B 파이프라인증발 / C 상태·동시성 / D 네이밍 / E 운영·보안) +
> 라이브 DB RLS 직접 검증 결과 통합. 원본 단편: `/tmp/openissues_{A..E}.md` (휘발성).
> 심각도·위치는 코드 1-패스 조사 — Tier 0 착수 전 항목별 재확인 권장.

## 🔴 RLS 라이브 검증 결과 (2026-06-12, `supabase db query --linked`)

핵심 테이블은 **RLS ON + owner 범위 정책**이 이미 걸려 있음 — 클라 anon 직접 접근은 보호됨:

| 테이블 | RLS | 정책 | 비고 |
|---|---|---|---|
| projects/characters/scenes/shots/locations/video_clips/workspaces | ✅ on | 5개 (owner-scoped: `workspace.owner_id = auth.uid()`) | 클라 anon R/W 보호됨 |
| editor_states / generation_jobs | ✅ on | 0개 | service-role 전용(정책 없음=anon deny). 단 API는 owner 미검증 |
| **messages** | ❌ off | 0개 | **노출 — 클라가 anon으로 접근 시 크로스테넌트** |
| **character_relationships** | ❌ off | 0개 | 노출이나 현재 코드 참조 0건(B) — 사용 전 RLS 필요 |

**→ 재평가**: "RLS 전면 부재" 가설은 **반증됨**. 진짜 위험은 **service-role API 라우트가 자체 owner 검증을 안 하는 것**(아래 T0-1~4) — service-role은 RLS를 우회하므로 RLS가 못 막음. 처방은 "RLS 추가"가 아니라 "API 라우트에 owner/scope 검증 추가" + messages/character_relationships RLS 켜기.

---

## 🔴 TIER 0 — 즉시 (사고·과금·데이터파괴). 처방: 공용 헬퍼 + scope 수정

- **T0-1 무인증 과금 라우트** | `app/api/writer/generate/*`, `app/api/writer/resume/*` | getUser·시크릿·쿼터 0건, middleware가 `api/` 제외 → 외부에서 인증 없이 fal 배치 무한 트리거 | E
- **T0-2 IDOR (owner 미검증, service-role)** | generate 계열 11개 라우트 + `app/api/project/[id]` PATCH/**DELETE** | getUser(로그인)만, `owner_id===user.id` 0건. service-role이라 RLS 우회 → 타인 projectId로 과금/영구삭제 | E
- **T0-3 editor 라우트 project_id 스코프 누락** | `app/api/editor/{speed,trim,reorder}` | `.update().eq('shot_id', x)` — project_id 조건 없음 + service-role. shot_id는 `shot_1`처럼 프로젝트 간 중복 → **같은 shot_id 가진 모든 프로젝트(타 테넌트 포함) 행이 함께 덮어써짐** | C
- **T0-4 프로젝트 전환 시 editor 편집본 빈 와이프** | `stores/project-store.ts` switchProject가 `resetChildStores()`를 projectId 교체 *전* 호출 → editor reset이 이전 projectId로 빈 스냅샷 저장(400ms/1500ms 디바운스, 취소 없음) | 전환·새프로젝트마다 이전 프로젝트 오디오 편집 **복구불가 유실** | C
- **T0-5 messages/character_relationships RLS off** | 라이브 검증 | messages는 클라 접근 시 크로스테넌트 노출 | RLS 검증
- **T0-6 시크릿 옵셔널** | `WRITER_STEP_SECRET`/`CRON_SECRET` env 미설정 시 검사 skip (`writer/step`, `writer/watchdog`) | 미설정이면 무인증 파이프라인 트리거 | E
- **T0-7 무인증 정보 노출** | `writer/logs/[projectId]`(스토리·프롬프트·LLM I/O), `writer/status/[projectId]`, `editor/state` GET/PUT | getUser/owner 0건 | E·C

처방 요약: `assertProjectOwnership(projectId, userId)` 공용 헬퍼 → 모든 generate/cost·project·editor·logs 라우트에 삽입 / editor 라우트에 `.eq('project_id', …)` / switchProject 순서 교정 / messages·character_relationships RLS+정책 / 시크릿 필수화.

---

## 🟠 TIER 1 — 높음 (파이프라인 정합 / 손실)

- **T1-1 shot_id 3중 재번호화 → 오프바이원/매칭실패** | `decoupage.ts:225` → `l4_shots.ts:283` → `c_application_2.ts:297` | C2 split 1건이면 이후 전 샷 시프트 → 러프보드 spec이 한 칸 밀려 잘못 붙거나 경계샷 실패(dbde5406 sh_02_12 시그니처) | B
- **T1-2 shot_id 혼합 네임스페이스** | `adapters.ts:42` 정규식 `\d{2,3}`이 1자리 미매칭 → DB에 `shot_1`(1~9)·`sh_XX_NN`(10+) 혼재 | B
- **T1-3 cast arc/motivation/voice가 스토리 단계 미도달** | `steps.ts:130`(s1 characters 미수신), `s3_scenes.ts:66`(`id (name)`만) | producer 저작 인물심리가 씬 전개 LLM에 무반영 → seed 주목적 미달성 | B
- **T1-4 persist delete-then-insert가 하류 산출물 소거** | `persist_manifest.ts:240` `from('shots').delete()` 후 재삽입 → rough_storyboard/storyboard_image/video_url/canvas_position 행째 증발 | writer 재실행 시 러프보드·콘티·비디오 링크 전멸 | B

---

## 🟡 TIER 2 — 중간 (증발 / 死스테이지 / 멀티탭)

- **L4→L5 미전달** (`steps.ts:362` shotDesign 미전달, l5 static_spec fallback 死코드) · **L5 출력 프로덕션 미소비**(loadStage Vercel null) · **persist V축 평탄화 + DEFAULT 주입**(`persist_manifest.ts:254-263`) — 이번 세션 추적한 깔때기, 유효 | B
- **storyCheck·midPreview 프로덕션 항상 skip** (켤 경로 자체 부재) · **sceneCinematography DB 미보존** · **assets reference 샷생성 미주입**(I2I 일관성 설계 프로덕션 무효, `l6_images.ts`) | B
- **멀티탭 LWW**: editor_states 통짜 upsert(`editor-store.ts:1146`) / director·asset-storage 전역 persist 키(`-default` suffix=projectId 자리 흔적 → 동적 키 전환 시 소멸) | C
- **unload 플러시 0건**(beforeunload/pagehide/sendBeacon 0) → 0.3~1.5초 내 탭 닫기 시 편집 유실 | C
- **cut/드래그 synthetic 클립 리로드 후 소실**(`editor-store.ts:980`, DB 미기록) | C
- **CAS는 잡 행만 보호, 엔티티 행 last-completer-wins**(같은 샷 잡 2개 시 비결정적) | C
- **ProjectFormat 미반영**: `aspectRatioFromFormat` 호출처 0건, 러프보드 16:9 하드코딩 → 9:16/1:1 previz도 16:9 | B
- **content_policy 핸들링 flux(러프보드)에만** — gpt-image-2 콘티/캐릭터 경로 safeMode 없음 | E
- **쿼터 미적용 경로**(generate/image, chat, generate-shots) + **fail-open** | E
- **S3 key_dialogue 화자/delivery 미운반**(`persist_manifest.ts:259` `chars[0]` 추정) | B
- **dialogue 추정 귀속 오염**(효과음이 캐릭터 대사로) | B
- **webhook 에러 payload 폐기**(`fal/webhook:79` body.payload 미사용 → 진단 시 fal 재조회) | C
- **_serverSaveDisabled 첫 실패로 세션 영구 중단**(`editor-store.ts:1143`) | C

---

## 🟢 TIER 3 — 낮음 / 사용자 직접 작업

### A. 선언된 미결
- producer-story-gate 미완 task 31건 (S2.5 관계편집 / S4 s0·s2삭제+오픈캐스트 / S5 artist 이미지일원화 / S6 E2E) — 보드(25) vs 정본 tasks.md(35) 건수 불일치
- 열린질문 2 (에러 UX 정책 Q-SYS-2, 대사 용도 Q-L2-1)
- 코드 TODO 7 (양방향 sync, FFmpeg 렌더, knowledge DB 어댑터 등)
- decisions.md forward/defer 12건, 레거시 이미지 라우트 Nano Banana 임시(#34)

### D. 네이밍 (사용자 진행 중)
- L/S/C 옛 코드 `src/lib/writer` **127건** 잔존 — 최대 핫스팟 `l0_l1_visual.ts`(파일명·키 visualFormat·state renderFormat+artDirection·로그 4중 불일치)
- **MidPreview JSON 출력 키 자체가 L0/L1/L2_summary** (LLM 출력 계약이 레거시 코드명, 4곳 동시변경)
- 워크시트 After 컬럼 0/25, 인벤토리 스냅샷 06-10(assetImages step·rough-storyboard 신규 누락)
- CastContract/ProjectFormat 글로서리 미등재, 루트 CLAUDE.md "충돌 10건" 표기는 구버전(#3 해소됨)

### B/C 死코드·문서드리프트
- Compact Mode/inferSceneCinematography 死코드(`COMPACT_DEPTH_LEVELS=[]`) | character_relationships 코드참조 0 | `.claude/rules/async-generation.md` 경로 깨짐(CAS 규칙 진실이 코드에만)

---

## 권고 착수 순서
1. **T0 보안/데이터파괴 클러스터** (assertProjectOwnership 헬퍼 + editor scope + switchProject 순서 + messages RLS + 시크릿 필수). 기능 아닌 사고방지 — 최우선.
2. T1-1/T1-2 shot_id 정합 (러프보드/콘티 품질의 뿌리, 네이밍 재설계와도 연결)
3. T1-4 재실행 산출물 보존
4. T2 증발/멀티탭 — Visual축 재설계 시 "facet 생존 계약"과 함께
5. T3 — 사용자 직접 (네이밍) + 백로그
