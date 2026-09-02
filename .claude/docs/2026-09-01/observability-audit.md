# 관측 가능성 감사 — "DB 로그만 보고 원인 파악 되나" (2026-09-02 실측)

방법: 코드 전수 추적(기록 지점) + dev DB에서 실제 429를 유발해 흔적이 남는지 실측.
실측 증거: `writer_observability_events`에 거절 4건(수동 2·**자동 2**) 전부 착지 확인.

## 잡힌다 — DB만으로 원인 파악 가능

| 사례 | 근거 테이블/이벤트 |
|---|---|
| 영상·이미지가 안 나옴 | `generation_jobs` — status·error·last_error·**error_class**(분류 태깅)·attempts·fal_key_id·input/response_snapshot·actor(ui/chat/writer 귀속). fal 무상세 실패("<none>")도 error-evidence가 맥락 포장 |
| 생성 요청이 거절됨 (429) | `writer_observability_events.generation_submit_rejected_quota/_video_budget` — kind·scope(user/global)·queued 포함. **실측 확인** |
| writer 파이프라인 단계 실패 | `stage_started/failed/completed` + `route_entered/classified` + `fal_submit_started/failed/accepted` 체인 |
| 크레딧/돈 흐름 | `take_ledger`(shadow 가동 — hold/release·lot·reason), `billing_events` 자리 |
| 자동생성이 멈춘 이유 | give-up 임계(failed 잡 카운트) + `asset_trigger_blocked` + 채팅 안내(실측: "배경 이미지 자동 생성을 멈췄어요") |
| LLM 호출·챗 흐름 | `llm_calls`, `chat_traces` |

## 못 잡는다 — DB 무흔적

| 사례 | 왜 | 보강 |
|---|---|---|
| 브라우저 JS 에러·hydration | 클라 이벤트는 일부(cache_*)만 best-effort. Sentry 없음 | 결제 라이브 전 Sentry (readiness 1장 기존 항목 — 지금은 미룸) |
| 라우트 500 예외(관문 이전) | Vercel 로그에만, 보존 짧음. route_failed는 일부 라우트만 | 수용 (Sentry가 같이 해결) |
| **enforce 402 거절 (미래)** | hold RPC insufficient는 행 미삽입 — 429는 기록되는데 402는 무흔적 | **보강 #1: rejected_quota와 같은 이벤트 1줄 — enforce 켜기 전 필수, 다음 슬라이스** |
| 웹훅 유실 | 유실은 정의상 무흔적 | phase-3 3-7 일일 대사 + 3-8 실패 알림 (기존 계획) |
| fal 계정 상태(한도·잔액) | 우리 DB 밖 | 지출 알림(오너) + 프로브 재측정 |

과하지 않게: 전 라우트 이벤트 도배·APM 도입은 하지 않는다 — 위 보강 #1(코드 몇 줄)과 기존 계획으로 충분.

## 자동생성 × 동시성 충돌 — 경로별 실태 (실측 포함)

| 자동생성 경로 | 429 관문 | 꽉 찼을 때 실제 동작 |
|---|---|---|
| ① 러프 previz 자동 제출 (writer 진입) | **없음** (8/25 오너 지시 `#initial-rough-unblocked`) | 거절되지 않고 제출됨 → fal 큐에서 침묵 대기. 화면의 429 대기 코드는 죽은 코드(티켓 rough-storyboard-429-unreachable) |
| ② writer→artist 초안 (triggerAssetDrafts, 서버) | 없음 | 제출됨 → fal 큐 대기. 반복 실패 시 give-up 임계로 자동 중단 |
| ③ artist 진입/완료 시 빈칸 보강 (클라, 동시성 1) | **있음** | **실측: 429 → 이벤트 기록 + 채팅에 자동 중단 안내, 수동 재시도는 허용** |

"동시성 꽉 참 + 새 유저 previz 자동생성" 답: **실패하지 않는다** — ①은 관문이 없어 fal 큐로 넘어가 순서를 기다린다(fal은 초과를 거부하지 않음). 대가: 관문 없는 경로가 전역 카운트를 채워 관문 있는 경로(artist·director)가 먼저 429를 맞는다 — "첫 러프는 막지 않는다"는 오너 정책의 의도된 트레이드오프. 유저 체감은 오류가 아니라 "오래 걸림".

토스트 실물: `.smoke/quota-toast/quota-toast-artist.png`(이미지 6개 문구) · `quota-toast-director.png`(배치 영상 — "0/2개 영상 생성" 집계+개별 안내). 재현은 dev DB에 queued 잡 시드 → 관문이 fal 제출 전 거절 — 과금 0.

## 이 감사가 찾은 정정 2건

1. **bash 세션 상주 env가 live 값** — dotenv는 기존 process.env를 덮지 않아, 에이전트 셸에서 돌린 fixture/smoke가 live를 쳤다(스모크 전용 프로젝트만 건드려 무해). 규칙: 에이전트 셸에서 DB 겨냥 스크립트는 항상 env를 명시 주입한다.
2. `test-d8f28352`는 베타 유저가 아니라 **상주 env의 TALE_SMOKE 계정**(E2E 스모크) — beta-cutover 명단에서 스모크/운영 축으로 재분류.
