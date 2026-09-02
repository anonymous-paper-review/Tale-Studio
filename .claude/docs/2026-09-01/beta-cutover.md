# 베타 계정 컷오버 명단 — Take 차단(enforce) 켜기 전 필수 조치

상태: **차단 활성화 게이트** — 이 명단에 grant를 뿌리기 전에는 enforce 모드를 켜지 않는다.
신원(이름·소속)은 [Notion 테스트계정 페이지](https://app.notion.com/p/3813b513ca7e807d9592f23515f0dc4e) 참조 — 이 문서에는 계정과 워크스페이스만 둔다.

## 명단 (2026-09-02 실측 — Notion 사용여부 체크 ∪ live DB 활동)

| 계정 | workspace_id | 출처 | 활동 실측 |
|---|---|---|---|
| test-0ef30e41@tale.studio | `53dca36a-bfab-4d67-9fa6-deff67897a81` | Notion 체크 | 08-31 로그인 |
| test-223bdf01@tale.studio | `00f50a9a-5e6b-4570-8418-81313d2d777a` | Notion 체크 | 08-31 로그인 · 프로젝트 1 · 잡 30 |
| test-3f702018@tale.studio | `973cd0f7-62fd-48ff-9b79-d6bb4e9de0b6` | Notion 체크 | 08-31 로그인 |
| test-9f2d8640@tale.studio | (워크스페이스 미생성) | Notion 체크 | 08-31 로그인 |
| test-9490a4d7@tale.studio | (워크스페이스 미생성) | Notion 체크 (기존계정 비번 리셋) | 최근 활동 없음 |
| test-1c9dfc14@tale.studio | `f44a846b-1e9f-4c2a-b1a1-264ca193ff43` | Notion 체크 — **live 스모크 E2E 계정** | 잡 28 |
| test-d8f28352@tale.studio | `ff37e493-5231-47ac-bb31-abb9c7da9e7f` | 정정(09-02): **상주 env의 TALE_SMOKE 계정** — 베타 유저 아님, 스모크/운영 축(admin 처리) | 잡 28 = 스모크 활동 |
| test-9b52b921@tale.studio | `299cd6fe-5dd1-424f-86db-2a4c1edb3e3d` | ⚠ Notion 미체크 · 실사용 발견 | 프로젝트 2 |
| test-eb2da004@tale.studio | `24a64502-9d9b-49ee-9c0e-6329e3a390ed` | ⚠ Notion 미체크 · **헤비 유저** | 프로젝트 3 · **잡 230** |

발견: Notion 수기 체크와 실사용이 어긋난다 — 미체크 3계정에 실활동(합계 잡 258). 컷오버 명단은
수기 체크가 아니라 **이 문서(체크 ∪ 실측)**를 진실원으로 쓰고, 켜기 직전에 실측 쿼리를 재실행해 갱신한다.

## 컷오버 순서 (enforce 켜는 날)

1. 실측 쿼리 재실행 → 명단 갱신 (신규 활동 계정 추가)
2. 명단 전원에게 `POST /api/admin/billing` `grant_takes` (`grant_free`, 수량 = 오너 결정, reason: `beta comp`)
   — 워크스페이스 미생성 계정은 로그인 유도 후 grant, 또는 스킵하고 문의 시 지급
3. 스모크 E2E 계정(`test-1c9dfc14`)은 admin 명단(슈퍼계정 축) 포함 여부 확인 — 스모크가 차감에 안 막히게
4. `TAKE_BILLING_MODE=enforce` 전환 (Vercel Production env)

## 결정 반영 (2026-09-02 오너)

- **admin 계정 = 슈퍼계정**: hold/차감 게이트에서 admin 면제 (기존 generation-quota admin 면제와 같은 축).
  원장 grant 불필요 — 소비 기록 자체가 안 쌓임(운영·QA 계정).
- 일반 베타 유저 = 원장 grant 방식 (슈퍼계정 아님 — 소비가 장부에 찍혀 원가 추적 가능).
