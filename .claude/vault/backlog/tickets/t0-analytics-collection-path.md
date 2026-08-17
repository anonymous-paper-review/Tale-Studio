# t0-analytics-collection-path — 방문자 계측이 로그인 문턱에 튕기고 있지 않은가

```yaml
id: t0-analytics-collection-path
source: sweep:claude:e3519ae6
kind: audit
budget: { usd: 0, runs: 1, wall_min: 20 }
blockers: []
status: done  # 2026-08-12 밤 러너 — NA(수집 경로 404 → 사전 등록대로 기각 아님). 기각 조건 미발동. 핵심 걱정은 해소: 같은 구역 script.js가 200으로 통과(문턱 예외 작동), 대조 /studio는 307→/login 정상. 미확인: 실제 기록 적재(대시보드 확인은 오너 영역). 결과: research/experiments/t0-analytics-collection-path/
priority: normal
```

- **맥락 (사람 언어)**: 어제 방문자 통계를 처음 붙였다. 코드는 10줄이었는데 그중 하나가 진짜 일이었다 — 우리 사이트는 **로그인 안 한 요청을 전부 로그인 페이지로 돌려보내는데**, 통계를 수집하는 경로도 거기 걸리면 **랜딩에 온 익명 방문자 기록이 통째로 사라진다.** 하필 우리가 제일 보고 싶은 게 "구경만 하고 간 사람"이라 그게 사라지면 붙인 의미가 없다. 그래서 그 경로만 문턱에서 빼두는 처리를 했다. **그런데 그게 실제로 먹혔는지 확인하기 직전에 대화가 끝났다.** 안 먹혔으면 대시보드가 계속 0으로 남을 텐데, 0은 "방문자가 없다"처럼 보이지 "계측이 막혔다"로는 안 보인다 — 조용히 틀린 그림을 믿게 된다.
- **가설**: 프로덕션에서 통계 수집 경로는 미들웨어 리다이렉트를 타지 않는다 — 즉 비로그인 상태로 요청해도 로그인 페이지로 튕기지 않는다.
- **전제**: 배선은 살아 있고 푸시됐다(`src/app/layout.tsx:46`, `src/middleware.ts:131·134`, 커밋 `1040fd3`, main↔origin 동기, main 자동배포) — sweep에서 대조 확인. matcher 제외 문자열이 `_vercel/`로 들어간 것도 확인. **실제 응답만 미확인.**
- **예측**: 참이면 비로그인 요청이 로그인 페이지로 리다이렉트되지 않는다(3xx→`/login` 아님). 거짓이면 리다이렉트가 잡힌다 — 그 경우 익명 트래픽이 통째로 유실되고 있다는 뜻이라 즉시 표면화해야 한다.
- **측정**: 쿠키 없이 프로덕션의 통계 수집 경로에 **GET 1회**를 보내 상태 코드와 `Location` 헤더만 기록한다. 대조로 보호된 페이지 경로에도 1회 보내 그건 정상적으로 로그인으로 튕기는지 확인한다(계측 경로만 예외인지 가려내기 위함). 응답 본문은 기록하지 않는다.
- **기각 조건** (사전 등록): 통계 수집 경로 응답이 **`/login`으로의 리다이렉트면 가설 기각**. 404가 나오면 "판정 불가 — 배포 미반영 또는 경로 상이"로 분류하고 기각으로 세지 않는다(NA).
- **금지**: POST·쓰기 요청 금지. 실사용자 데이터를 건드리는 경로 호출 금지. 대시보드 로그인·토큰 사용 금지(오너 계정 영역).

## 좌표 (동결)

- 계측 삽입: `src/app/layout.tsx:46` (`<Analytics />`, `@vercel/analytics/next`)
- 미들웨어 matcher: `src/middleware.ts:134` — 제외 목록에 `_vercel/` 포함, 주석은 131행
- 수집 경로: `/_vercel/insights/view` (미들웨어 주석에 `/_vercel/insights/*`로 명시)
- 프로덕션 도메인: `talestudio.art`
- 커밋: `1040fd3 feat(analytics): Vercel Web Analytics 페이지뷰 계측 (#web-analytics)`

## 산출 계약

- `research/experiments/t0-analytics-collection-path/{result.md, results.json}`
- 이 티켓 status 갱신 + `.claude/vault/backlog/reports/2026-08-12.md`에 1줄
