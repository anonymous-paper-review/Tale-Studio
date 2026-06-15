# producer-ui-redesign — Tasks

> 작업 체크리스트의 **정본** (단일 장부). PROGRESS.md 검증 보드에는
> 이 change의 "건수 + 본 파일 포인터" 한 줄만 추가한다 — 항목 복제 금지.

## Active

### Section 1: targetEmotion drop (Producer)
- [x] `producer-store.ts`: `ExtractedSettings.targetEmotion` 제거, Producer settings patch/storage에서 legacy targetEmotion strip
- [x] `producer-store.ts` saveAndHandoff: 사용자 targetEmotion 제거, writer compatibility용 `targetEmotion: []` 안전 전달
- [x] `producer-gate.ts`: softMissing targetEmotion 제거
- [x] `project-dashboard.tsx`: obsolete targetEmotion UI 제거 (component retired)
- [x] `produce/chat/route.ts`: system prompt에서 targetEmotion 추출 지시 + soft nudge 제거
- [x] writer target emotion 도출은 별도 writer-dev 영역으로 유지 — 본 change에서 writer derivation 침범 없음

### Section 2: character voice removal
- [x] Producer cast metadata에서 `voice` 제거 (`producer-store.ts`, `producer-gate.ts`, `cast-edit-dialog.tsx`, `produce/chat/route.ts`)
- [x] Writer cast metadata/write paths에서 `voice` 제거 (`cast-contract.ts`, `adapters.ts`, `types/pipeline.ts`, `s3_scenes.ts`, `writer/start/route.ts`)
- [x] Lifecycle hash/test에서 character `voice` 제거
- [x] `persist_manifest.ts` protected identity comment에서 `voice` 제거
- [x] `databases/migrations/021_drop_characters_voice.sql` 작성 (Gate G 후 적용)
- [x] Editor audio `kind='voice'` 영역 유지

### Section 3: Handoff readiness board
- [x] `page.tsx`: ProjectDashboard + CastPanel split → `ProducerReadinessBoard` 단일 surface
- [x] board 섹션 구성: story readiness / story foundation / cast readiness
- [x] design.md 토큰·dark-first·상태 icon+label 준수
- [x] GlobalChat 고정 rail 유지, Producer main만 `Board | Chat` 경험으로 변경

### Section 4: inline validation / GateStatus dump 제거
- [x] `page.tsx`: footer `GateStatus` 렌더 제거
- [x] `gate-status.tsx`: obsolete dump component 제거
- [x] 빠진 hard field를 board 항목 위 inline 표기로 이동
- [x] handoff button: 미충족 시 `남은 N개` 수준 표기
- [x] `evaluateProducerGate` 판정 유지

### Section 5: cast ↔ chat completion loop
- [x] 카드/board에 누락 hard field quick edit 제공
- [x] `프로듀서에게 채워달라`: GlobalChat 입력창 draft 채우기 + focus only
- [x] one-shot consume, no-clobber(default ignore), no auto-send, rail layout 불변
- [x] `CastEditDialog`는 arc/motivation 상세 편집 보조 surface로 유지

### Section 6: spec sync / verification
- [x] proposal.md를 deep-interview/ralplan truth로 갱신
- [x] `specs/ux_pages.md` P1 final state 반영
- [x] `pnpm typecheck` / `pnpm lint` executed (`tsc --noEmit` pass, ESLint exit 0 with 14 unrelated warnings)
- [x] Focused tests clean (`producer-gate`, `lifecycle`, `pending-proposal-store`: 18 passed)
- [x] `pnpm build` clean (`/studio/producer` compiled)
- [x] Gate G checklist 확인 — code/static portions pass; pre-drop real authenticated `/api/writer/start` smoke returned `started`, upserted a no-voice producer character, created a writer run, stored `targetEmotion: []`, and stored no `voice` payload
- [x] Browser e2e: authenticated producer page rendered readiness board, prompt assist focused GlobalChat, no-clobber preserved non-empty input, cast quick edit worked, handoff CTA enabled and redirected to Writer with writer-start mocked to avoid pipeline cost
- [x] targetEmotion UI 부재 + character voice UI 부재 + GateStatus dump 부재 확인 — code search/build pass and browser visual/accessibility text confirmation pass
- [x] `databases/migrations/021_drop_characters_voice.sql` live DB 적용 완료; `public.characters.voice` column absent verified
- [x] Post-drop writer-start smoke clean — no-voice producer character upsert + writer run creation succeeded after column removal; `targetEmotion: []` compatibility retained

## Blocked
- None.

## Done
- (검증 완료 후 archive 시 이동)
