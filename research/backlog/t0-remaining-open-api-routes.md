# t0-remaining-open-api-routes — 열어둔 채 남긴 API가 정말 무해한가

```yaml
id: t0-remaining-open-api-routes
source: sweep:claude:70378c3d   # 스위퍼 분해 — 사람 심사 미경유
종류: 조사
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: 완료  # 2026-08-12 밤 러너 — 🔴 가설 기각(기각 조건 발동: 무인증 9개 중 3개가 유료 호출/DB 쓰기 — fal/webhook·writer/step·writer/watchdog). 단, 3개 모두 비-로그인 문지기 보유(서명·서버 비밀, fail-closed). 부수 발견: 어제 선언 목록에 없던 generate/health·video-health가 내부 주소 노출. 결과: research/experiments/t0-remaining-open-api-routes/
priority: high
```

- **맥락 (사람 언어)**: 어제 밤 보안 점검에서 **로그인 없이 열리는 창구가 17개** 발견됐고, 그중 대부분을 막았다. 실제로 남의 계정 이야기 전문과 공유 열쇠가 그냥 나오던 상태였고, 막은 뒤 다시 호출해 안 나오는 것까지 확인했다. 그런데 **일부는 일부러 안 막았다** — "이건 원래 공개해도 되는 창구"라고 판단해서다. 문제는 그 판단이 전수 확인이 아니라 눈대중이었다는 것이다. 열어둔 창구 중 하나라도 돈 쓰는 생성을 부르거나 데이터를 쓰거나 남의 정보를 흘리면, 어제 막은 의미가 반쯤 사라진다.
- **가설**: 인증 가드 적용 후에도 무인증으로 열려 있는 API 라우트는 전부 읽기 전용이며, 유료 생성 호출·DB 쓰기·개인 데이터 노출 경로가 하나도 없다.
- **전제**: 미들웨어는 페이지만 막고 API는 한 줄도 안 막는다(`src/middleware.ts` matcher가 `api/` 제외) — 각 라우트가 자기 손으로 막는 구조가 현행 결정. 어제 세션이 "남은 200(`knowledge/*`, `playground`)은 의도된 공개 표면"이라고 선언했으나 근거 나열은 없었다.
- **예측**: 참이면 열린 라우트 목록의 각 파일에서 생성 API 호출(fal)·DB 쓰기(insert/update/delete/upsert)·사용자 소유 테이블 읽기가 0건이다. 거짓이면 그중 하나 이상이 걸린다 — 그건 어제 놓친 구멍이다.
- **측정**: `src/app/api/**/route.ts` 전수 열거 → 각 파일에서 인증 가드(`requireUser`/`guard.ts` 계열) 호출 유무로 **무인증 목록을 코드로 추출** → 그 목록의 각 파일에 대해 (a) fal 호출 (b) supabase 쓰기 동사 (c) 사용자 소유 테이블 접근을 grep으로 집계한다. LLM 판정 없음. 산출: 무인증 라우트 표(경로 / 읽기·쓰기 / 유료 호출 / 소유 테이블 접근).
- **기각 조건** (사전 등록): 무인증 라우트 중 **유료 생성 호출 또는 DB 쓰기가 1건이라도** 있으면 가설 기각 — 해당 경로와 코드 라인을 원문으로 남기고 리포트에 🔴로 표시한다. 무인증 라우트가 0건이면 "이미 전부 닫힘"으로 done.

## 좌표 (동결)

- 라우트 루트: `src/app/api/`
- 가드 정본: `src/lib/api/guard.ts` (어제 신설)
- 미들웨어 matcher: `src/middleware.ts:134` — `api/` 제외가 이 티켓의 전제
- 선행 커밋: `55cbca9 fix(security): API 인증 가드 + RLS 잠금 — 무인증 8라우트·anon 전권한 차단 (#api-rls-lockdown)`
- **주의**: 실제 HTTP 호출은 하지 마라. 프로덕션 상태 변경 위험이 있고, 이 티켓은 코드 추적만으로 죽는다.

## 산출 계약

- `research/experiments/t0-remaining-open-api-routes/{result.md, results.json}`
- 이 티켓 status 갱신 + `research/backlog/reports/2026-08-12.md`에 1줄
