# unify-svc-writer-pipeline — Tasks

> PROGRESS.md mirror. 파킹된 future change — 순서(현재 change 전/후) 미정.
> 마커: `[ ]` 미착수 · `[c]` 코드완료/검증대기 · `[x]` 검증완료 · `[~]` 보류

## Active

### Section 1: 현황 분석 & 설계 (선행)
- [x] 1-1. svc 파이프라인 산출물 중 "영속 소비 대상" 토큰 목록화 (2026-06-05) — 인벤토리:
      전역=L0Visual(medium/resolution/fps/aspect_ratio/rendering_method)+L1Style(art_style/shape_language/
      line_quality/character_proportion/texture_philosophy)+L2Design(global_palette/color_meaning/vfx_approach);
      캐릭터=S2Character.appearance_description + L2Design.costumes[id]; 로케이션=L2Design.locations[](style_description/
      lighting_sources/props). 근거: src/lib/svc/types/pipeline.ts L198-344.
- [c] 1-2. generate-scenes ↔ svc 중복 매핑 — 핸드오프(producer-store.ts:94 generate-scenes + :107 svc/start)가
      둘 다 발사. 중복축: characters.fixed_prompt(writer, image-gen concise) ↔ svc appearance_description(prose, richer,
      adapters.ts:60에서 fixedPrompt 조립 소스). locations.visual_description/lighting_direction(writer) ↔ svc
      style_description/lighting_sources(중복). 검증대기.
- [x] 1-3. DB 저장 위치 결정 (2026-06-05) — **하이브리드**: 전역=projects.design_tokens JSONB,
      캐릭터/로케이션=기존 characters/locations 행 컬럼 확장. (신규 design_tokens 테이블 채택 안 함.)
- [ ] 1-4. 통합 형태 결정 — generate-scenes를 svc 단계로 흡수 vs 반대
- [ ] 1-5. "svc" 대체 도메인 용어 확정

### Section 2: svc 토큰 DB化
- [c] 2-1. DB 마이그레이션 (가산적) — `databases/migrations/008_svc_design_tokens.sql` 작성 (2026-06-05, 미적용).
      projects.design_tokens, characters.appearance/costume, locations.style_description/lighting_sources/props.
      **fixed_prompt 드롭 안 함** — 라이브 채워짐+image-gen 소스+소비 5곳. 드롭은 §3 후 009로 분리.
- [c] 2-2. 파이프라인이 전역 토큰을 DB에 기록 (2026-06-05) — `src/lib/svc/pipeline/util/persist_design_tokens.ts`
      신설, pipeline/index.ts L2 직후 non-blocking 훅. projects.design_tokens = {l0,l1,palette,color_meaning,
      vfx_approach}. handoff projectId=DB UUID 확인. DB 쓰기/읽기 경로 라이브 검증(되돌림). 로그파일과 병행(대체 X).
      **per-character/location 토큰은 제외** — svc S2 id(LLM snake_case) ↔ writer char_01 불일치로 §3 이후.
      파이프라인 전체 실행(LLM) 검증은 미수행 → `[c]`.
- [~] 2-3. artist/director 소비측 DB 읽기 전환 — **현재 전환할 소비자 없음**. turnaround.ts(source-agnostic)는
      순수함수로 미호출(`buildTurnaroundSheetPrompt` 호출자 0), 소비 기능은 writer-background-artist-progress §5(미구현).
      §5 구현 시 projects.design_tokens(artStyle=l1.art_style, palette=palette) 읽도록 연결. 보류.

### Section 3: 파이프라인 통합 & 중복 제거
- [c] 3-1. 핸드오프 단일화 (2026-06-05) — producer-store가 `/api/writer/start`만 발사, generate-scenes 제거.
- [c] 3-2. 중복 제거 — svc가 단일 생산자. 옛 generate-scenes route + writer-store 생성 액션 + write/chat 삭제.
      svc 파이프라인 결과를 `persist_manifest`로 DB 기록. `[c]`(풀 LLM 런 검증 미수행).
- [ ] 3-3. 회귀 검증 — artist/director가 동일 데이터를 받는지 (실제 핸드오프 1회 런타임 검증 필요).
- [x] 3-4. **`characters.fixed_prompt` 드롭** (009, 2026-06-05) — 소비측 appearance 전환 + persist가 appearance 생산.
      ⚠️ 단순화: 백필 대신 DB throwaway(MVP)라 재생성 전제. `description`/`visual_description` 중복 컬럼은 persist가
      양쪽 채워 가동 우선 → **잔여 정리 후속**.

### Section 4: 용어 정리 / 리네이밍
- [c] 4-1. "svc" → "writer" 리네임 (2026-06-05) — `lib/svc`→`lib/writer`, `api/svc`→`api/writer` (src+tests, tsc clean).
- [c] 4-2. 경계 재정의 — 옛 `api/write` 폐기, `api/writer`(파이프라인 엔진)로 일원화. writer UI 제거(백엔드 전용).
- [ ] 4-3. 스펙(L1/L2) 본문 반영 — `specs/layers/L1·L2`가 옛 generate-scenes 기준이면 svc 파이프라인 기준으로 갱신.

## Blocked
- (없음 — 단 `writer-background-artist-progress` §5와 순서 결합. proposal 의존/순서 참조)

## Done
- §2-1(007/008 적용), §2-2(persist_design_tokens), §3-1/3-2/3-4, §4-1/4-2: 2026-06-05.
  상세: `docs/research/svc-writer-unification-2026-06-05.md`, decision #38.
- (없음)
