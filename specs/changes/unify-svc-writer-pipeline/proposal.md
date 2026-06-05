---
change: unify-svc-writer-pipeline
status: active
created: 2026-06-05
decisions: []
---

# svc 파이프라인 ↔ Writer 통합 + svc 토큰 DB化 + 용어 정리

## Why

현재 producer 핸드오프에서 **두 개의 병렬 LLM 파이프라인**이 같은 스토리로부터 캐릭터/씬
데이터를 중복 생성한다:

- **Writer** (`/api/write/generate-scenes`) → 씬/캐릭터/로케이션/샷을 **DB**에 저장 (`fixed_prompt` 등)
- **svc 파이프라인** (`/api/svc/start` → S0~L5 단계) → appearance/art_style/shape_language/palette 등
  더 풍부한 디자인 토큰을 **로그 파일**(`04_S2`/`08_L0_L1`/`09_L2` …)에만 저장

문제:
1. **데이터 중복** — 같은 스토리에서 캐릭터 외형 묘사를 두 시스템이 따로 만든다.
2. **소비 불편** — svc 토큰(전역 화풍/팔레트)이 DB에 없어 artist/director가 깔끔히 못 읽는다
   (로그 파일 접근 필요). artist 턴어라운드 시트(decisions #37)가 svc 토큰을 쓰려면 이게 걸림.
3. **용어 모호** — "svc"는 디버그성 명칭으로 도메인 의미가 불명확하고, "writer"와 역할이 겹쳐
   `api/writer` vs `api/svc`의 경계가 흐릿하다.

## What Changes (방향 — 구현 시 구체화)

- **svc 토큰 DB化**: svc 파이프라인 산출물 중 영속 소비 대상(디자인 토큰: art_style/shape_language/
  palette, 캐릭터 appearance 등)을 로그 파일 → **DB 컬럼/테이블**로 저장.
- **파이프라인 통합**: writer(generate-scenes)와 svc 텍스트 파이프라인의 **중복 LLM 호출 제거** 또는
  단일 파이프라인으로 일원화. 핸드오프에서 하나만 발사.
- **용어 정리**: "svc"(디버그 잔재) → 명확한 도메인 용어로 리네이밍. `api/` 라우트 경계 재정의.

## Impact
- Affected code: `src/app/api/write/generate-scenes`, `src/app/api/svc/*`, `src/lib/svc/pipeline/*`, producer-store(핸드오프 트리거)
- Affected stores: `producer-store`(트리거), `writer-store`/`artist-store`/`director-store`(소비)
- Affected DB: 디자인 토큰 컬럼/테이블 신설 (characters/projects 또는 신규 테이블)
- Affected specs: `specs/layers/L1_scene_architect.md`, `specs/layers/L2_shot_composer.md` (파이프라인 정의)

## 의존/순서 (중요)
- **`writer-background-artist-progress` §5(턴어라운드 시트 프롬프트 입력 출처)와 결합됨.**
  - 이 통합을 **먼저** 하면 → §5는 "DB에서 svc 디자인 토큰 읽기"로 깔끔히 구현.
  - **나중에** 하면 → §5는 임시로 "로그 파일 읽기 + fixed_prompt 폴백"으로 구현 후, 이 change에서 정리.
- 순서 미정 (사용자 결정 대기). 현재 change의 §1~4·6은 이 통합과 독립.

## 열린 질문
- svc 토큰의 DB 저장 위치 — 기존 `characters`/`projects` 확장 vs 신규 `design_tokens` 테이블.
- 통합 형태 — generate-scenes를 svc 파이프라인의 한 단계로 흡수 vs svc를 writer 하위로 흡수.
- "svc" 대체 도메인 용어 확정.

## Verification gate (archive 조건)
- tasks.md의 모든 [c] → [x]
- 핸드오프에서 단일 파이프라인만 발사 (중복 LLM 호출 제거 확인)
- 디자인 토큰이 DB에서 조회 가능 + artist/director가 로그 파일 미접근으로 소비
- 용어 리네이밍이 코드/스펙 전반 일관 반영
