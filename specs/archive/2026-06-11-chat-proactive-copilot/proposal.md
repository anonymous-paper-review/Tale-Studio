---
change: chat-proactive-copilot
status: active
created: 2026-06-09
decisions: [38]
---

# 채팅 프로액티브 코파일럿 (Chat Proactive Copilot)

## Why

글로벌 채팅을 "우리 Claude처럼" 오케스트레이션 레이어로 격상하려는 요구에서 출발.
deep-interview(6라운드, 명료도 19%, `.omc/specs/deep-interview-chat-orchestration-architecture.md`)
결과, 핵심 질문 *"각 기능을 에이전틱하게 vs 단순 글로벌 채팅?"* 이 **제3의 길**로 수렴했다:

> 채팅은 **자율 실행 에이전트가 아니라 "프로액티브 코파일럿"** 이다.
> 실행은 유저 승인 기반(L1~L2)을 유지하되, 그 위에 **(1) 선제 제안 + (2) 완료 알림** 레이어를 얹는다.

인터뷰가 드러낸 3가지 결정 근거:
1. **백그라운드 병렬화의 "속도 이득"은 환상** — 병목은 오케스트레이션이 아니라 fal 처리량
   (`runPool(concurrency=4)` + fal 셀프서브 동시 10개 공유). 자율성을 올려도 벽시계는 그대로.
   실익은 "인지부하 감소"뿐.
2. **자율 재생성(L3)은 비용 블랙홀** — fal은 호출당 과금(이미지 `openai/gpt-image-2`,
   영상 `alibaba/happy-horse/reference-to-video`, cf. #37/#34). LLM이 스스로 재생성하면 청구서 폭탄.
   → 자동 재생성/자율 비용 지출 **금지**.
3. **진짜 제약은 "자율성 레벨"이 아니라 "`FAL_KEY` 1개 = 전 유저 동시 10개 공유"** — 멀티유저의
   핵심은 유저별 동시성 쿼터지 에이전트가 아님.

하부 배관(큐·webhook·폴링·오버레이)은 이미 코드에 존재 → 재사용. 새로 필요한 건 4개:
completeness 모델 / 선제 제안 트리거 / 유저별 쿼터 / 크로스스테이지 알림.

## What Changes

- **채팅 역할 정의**: (editor 제외) producer/artist/director UI 기능의 **완전한 대체 surface(parity)**
  + 직접조작 병존. 채팅은 보조가 아니라 동등한 인터페이스.
- **선제 제안 레이어** 신설: 스테이지 진입/핸드오프 직후, 작업 완료 후 다음 단계, 누락 감지,
  현재 작업 맥락에서 채팅이 **먼저 제안**(유저 승인 게이트 필수).
- **완료 알림 레이어** 신설: 백그라운드 작업 완료 시 글로벌 채팅 메시지 + 사이드바/탭 배지로
  통지(인앱 한정, 토스트·OS알림 제외). 딥링크로 결과 위치 이동.
- **멀티유저 자원 정책**: 큐 + 유저별 동시성 쿼터로 fal 공유 풀 공정 분배.
- **completeness 모델**: 스테이지별 "완성" 체크리스트(필수 에셋/필드) → 누락 감지 제안의 연료.
- **제외**: editor 채팅(추후), 자동 재생성, 토스트/OS 알림, 자체 GPU.

### Phasing
- **Phase 1 (첫 조각 — 구현 완료 2026-06-09, 브라우저 검증 대기)**: 프로액티브 '다음 단계' 넛지 1종.
  *구현 중 재정의(Option B)*: 핸드오프 직후엔 writer 파이프라인(~2분)이 DB를 아직 안 채웠고, artist
  진입 시 `autoGenerateBaseImages()`가 **이미 자동 생성**하므로 "지금 생성?" 제안은 불가능/중복.
  → 자동생성 완료 후 채팅이 "캐릭터 N·배경 M 준비됐어요 — Director로 갈까요?" 1회 제안(비용 무발생,
  승인 시 Director 네비게이션). *제품 검증 게이트: "먼저 말 거는 비서" UX 체감 확인 후 나머지 진행.*
  > ⚠️ 발견: 앱이 artist 진입 시 fal 비용을 **자동 지출**(autoGenerateBaseImages + 서버 assetImages)
  > 한다. 코파일럿 원칙("자동 비용 지출 금지")과 충돌 → 추후 Phase에서 "자동생성을 제안 뒤로 게이트"
  > 재검토 필요 (이번엔 저리스크 우선해 자동생성 유지).
- **Phase 2**: 완료 알림(채팅 메시지 + 배지) + 크로스스테이지 통지.
- **Phase 3**: 멀티유저 큐 + 유저별 동시성 쿼터.
- **Phase 4**: 스테이지별 completeness 모델 → 누락 감지 제안.
- **Phase 5**: 채팅-UI parity 감사 + writer 채팅 결정
  (`/api/writer/chat` 구현 vs `CHAT_SUPPORTED_STAGES`에서 `'writer'` 제거 — 현재 라우트 없어 에러).

## Impact

- **Affected specs**: `specs/layers/` 채팅 오케스트레이션 계약 추가/갱신 (프로액티브 레이어·알림·parity)
- **Affected code**: `src/app/api/{produce,artist,director}/chat/route.ts`, 선제 제안 트리거 로직,
  알림 emit 경로, (Phase 3) 쿼터 미들웨어
- **Affected stores**: `global-chat-store`, `artist-store`, `producer-store` (제안/알림 상태),
  사이드바 배지 상태
- **Affected DB**: (Phase 2/3) `generation_jobs` 확장 또는 신규 — 알림 상태 + 유저별 쿼터
- **Affected decisions**: #38 (writer 엔진 — Phase 5 writer 채팅 결정과 연결).
  *이 변경 자체를 decisions.md 새 entry로 올릴 것* (프로액티브 코파일럿 방향 전환).

## Verification gate (archive 조건)
- tasks.md의 모든 [c] → [x]
- **Phase 1 브라우저 검증**: producer→artist 핸드오프 후 채팅에 선제 제안이 뜨고, 승인 시
  캐릭터/배경 생성이 실제 트리거되며, 거부 시 아무것도 실행되지 않음(자동 실행 없음 확인).
- 자동 재생성/자율 비용 지출이 일어나지 않음(비용 가드 확인).
- source-of-truth: `specs/layers/` 채팅 계약 final state 반영 + CLAUDE.md AI 스택 정정 반영(완료).
