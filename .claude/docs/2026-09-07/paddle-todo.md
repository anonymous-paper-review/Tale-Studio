# Paddle 결제 붙이기 - 할 일

기준일 2026-09-07. 정본은 셋이다: `specs/payments-readiness.md`(전체 지도) ·
`.claude/docs/2026-09-01/phase-3-payments-mor.md`(3단계 작업표) ·
`~/Downloads/ref/tale_pricing_usd_v4.xlsx`(가격 정책 v4.0). 이 문서는 그 셋을 "지금 뭘 하면 되나"
순서로 펼친 체크리스트다. 새 결정은 여기 적지 않고 phase-3 문서에 적는다.

약속 문장(테스트 이름이 되는 한국어 문장)은 [paddle-promises.md](paddle-promises.md)에 슬라이스별로 둔다.
오너는 그 파일만 고치면 된다.

## 지금 상태 (2026-09-07 실측, main `480f94b`)

있음
- Take 장부(적립·차감·잡아두기·돌려주기), 관리자 수동 플랜 부여, 잔액 API, 부족 안내 토스트.
- `TAKE_BILLING_MODE=shadow`로 전 환경 가동(기록만, 차단 없음).
- 결제 테이블 4개(`billing_customers` · `billing_events` · `subscriptions` · `take_ledger`). 웹훅 자리만 비어 있음.
- 요금제 사다리 9개(무료~P-30)의 축 4개가 코드에 있음(`getPlanEntitlements`).

없음
- Paddle 코드 0줄(결제창·웹훅·상품 등록).
- `/pricing`은 "베타 끝나면" 예고 카드. 실가격 없음.
- 약관·환불정책·개인정보처리방침 페이지 없음.
- 부족 토스트의 "채우러 가기" 버튼 목적지 없음(3-10).

막힌 항 하나: Paddle 샌드박스 계정. 사업자 정보가 필요해 오너만 열 수 있다.
기획 미결 3건(통로 이원화 · 숫자 3개 · 문서 4종)은 샌드박스 개발을 막지 않는다. 문서 4종은 라이브 심사 때 필요하다.

## 0. 샌드박스 없이 지금 할 수 있는 것 (에이전트)

각 슬라이스는 `tdd.md` 순서(설명 → 약속 → 빨강 → 초록 → 보고)를 밟는다.

**순서 (2026-09-07 오너 재편): 시나리오 → 가격 페이지 → 잔액 화면 → 웹훅.** 오너가 정책 시나리오가 안 그려지면 웹훅 약속에 삼진할 수 없다.
화면이 정책의 표면이니 화면을 먼저 만들고, 그 화면에서 정한 것을 웹훅이 지킨다.

- [ ] **P0 시나리오 문서** → [paddle-scenarios.md](paddle-scenarios.md). 이감독·박PD·유크리를 시간축으로 8장면. 오너는 `?` 8개만 정한다.
      여기서 정한 것이 P4·P9·P1의 원천. 검수: 한국어 문장.
- [~] **P4 `/pricing` 실물화** - 2026-09-07 보여주기 버전 배선(결제 버튼은 "Coming soon" 비활성, 베타 배너 유지). 로컬 `pnpm dev` → http://localhost:3000/pricing
      스크린샷: `evidence/pricing-0~3.png`. P2 대응표(`src/lib/billing/catalog.ts`)를 같이 만들어 숫자는 테스트가 v4 시트와 대조한다.
      남음: 오너 스크린샷 검수 · 문구 수정 · 커밋(미커밋, dev 브랜치로 갈지 오너 결정).
- [~] **P9a 앱 안 계정·결제 페이지 + 좌측 nav Take 배지** - ✅ 구현·테스트 초록 (2026-09-07). `/account` 페이지(플랜·결제일·실패 배너·종류별 잔액·팩 카드·최근 내역·계정) · 대시보드 헤더 "Account" 탭 · 스튜디오 nav Take 배지(호버 종류 구분, 클릭 → /account) · 사용자 메뉴 항목 · 부족 토스트 "Add Takes" 버튼(3-10).
      약속 → [paddle-promises.md §P9a](paddle-promises.md#p9a). 스크린샷 `evidence/account-{free,s5,payment-failed,negative}.png`, `sidebar-badge-*.png`.
      남음: 오너 스크린샷 검수 · 결제 버튼·포털 링크 활성(P7·P9). Director 안 소모량 배지 UI 개선은 별도.
- [x] **P1 결제 알림(웹훅) 받기** - ✅ 2026-09-07. `POST /api/billing/paddle/webhook` · 로직 `src/lib/billing/paddle-webhook.ts` · 약속 23개 초록 · dev 실물 8건 · Paddle 시뮬레이터 → dev 200.
      샌드박스 알림 목적지 등록(ntfset_01m1x9ykr2t1k432f4d39shff9, 이벤트 11종) · 시크릿은 `.env.local`·Vercel Preview/Development. 보고서 `webhook-report.html`.
- [~] **P2 상품 목록 정의 + 등록 스크립트** - ✅ 대응표 `src/lib/billing/catalog.ts` + `tests/paddle-catalog.test.ts` 6케이스 초록(2026-09-07).
      가격 ID는 `NEXT_PUBLIC_PADDLE_PRICE_PLAN_<ID>` / `NEXT_PUBLIC_PADDLE_PRICE_PACK_<ID>` env 에서 읽고 없으면 버튼 비활성.
      남음: 등록 스크립트(P6에서 실행).
- [ ] **P3 정책 문서 3종 초안** - 약관(생성물 권리 · 학습 미사용 · 공정 사용) · 환불정책(v4 6_소멸시효 기준) · 개인정보처리방침(서브프로세서: Supabase · Anthropic · Google · fal · Paddle).
      검수: 정책 문장(오너가 문안을 읽고 삼진). 페이지는 푸터에서 열린다.
- [ ] **P4 `/pricing` 실물화** - 사다리 S-1~P-30 + 팩 4종 + 스튜디오 "문의". 축 4개만 노출, 원가·마진 열 없음.
      결제 버튼은 가격 ID가 없으면 비활성. 문구는 `copy-style.md`(긴 대시 금지, sentence case).
      검수: 스크린샷.
- [ ] **P5 Paddle 수수료 반영 마진 재검산** - v4 마진 밴드에 Paddle 수수료(대략 5% + 건당 $0.50)가 빠져 있다.
      가격 페이지 게시 전에 표 한 장. 가격을 바꾸자는 게 아니라 게시 뒤 바꾸면 심사를 다시 받으니 먼저 본다.
      검수: 숫자 표(오너).

## 1. 오너가 할 것

- [x] **샌드박스 계정 개설** - https://sandbox-vendors.paddle.com/signup (2026-09-07 완료)
- [x] **키 2개 발급** - `.env.local`에 `PADDLE_API_KEY`(`_sdbx`, 샌드박스 API 응답 확인) · `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`(`test_`) · `NEXT_PUBLIC_PADDLE_ENV=sandbox` (2026-09-07 완료).
      남음: 같은 값을 Vercel **Preview/Development 스코프에만** 넣는다(P1 배포 전). Production에 넣지 않는다.
- [x] **웹훅 시크릿** - ✅ 2026-09-07 발급·배선. (원래 메모: 비어 있는 게 정상. Paddle에 "알림 목적지"를 만들 때 발급된다. 에이전트가 API로 만든다(P1 끝나면).
      목적지 URL: `https://tale-git-dev-talestudio.vercel.app/api/billing/paddle/webhook` (dev 브랜치 고정 주소, 2026-09-07 확인).
- [x] **Default payment link 설정** - ✅ 2026-09-07 에이전트가 오너 브라우저의 샌드박스 대시보드 탭에서 `https://tale-git-dev-talestudio.vercel.app/account` 로 저장. 이게 없으면 Paddle 이 거래 생성을 거부한다(실측 400).
- [ ] **디스코드 경보 웹훅** (2026-09-07 오너 확정, P11 채널) - 5분.
      1. 디스코드 서버(혹은 혼자 쓰는 서버 새로) → 채널 하나 만들기(예: `#tale-alerts`).
      2. 그 채널 ⚙️ 채널 편집 → **연동** → **웹훅** → 새 웹훅 → 이름 `Tale` → **웹훅 URL 복사**.
      3. `.env.local`에 `DISCORD_ALERT_WEBHOOK_URL=<복사한 URL>`. Vercel에는 Preview·Production 둘 다(운영 경보는 환경 구분 없이 받고, 메시지에 환경 이름을 붙인다).
      4. 에이전트가 `src/lib/ops-alert.ts`를 만들고 테스트 메시지 1건 보낸다. 보내는 것: 웹훅 처리 실패 · 갱신 결제 실패 · 서버 판정 우회 결제 · 일일 대사 불일치.
      토큰·봇 계정 필요 없다. URL 하나가 전부다. URL이 새면 누구나 그 채널에 글을 쓸 수 있으니 env에만 둔다.
- [ ] **기획 숫자 3개** (첫 결제를 막지는 않음, 병렬) - Account 초과 단가($79~158) · 자동 충전 월 상한 기본값 · 무료 Take 유효기간(1~3개월).
- [ ] **정책 문서 3종 문안 검수** - P3 초안이 나오면.
- [ ] **PITR 켜기** - phase-1 잔여. 결제 데이터는 "지워지면 돈 분쟁"이다.
- [ ] **세무사 1회 상담** - 정산금 영세율 · 통신판매업 신고 여부. 라이브 전까지.
- [ ] **라이브 계정** (심사 뒤) - https://vendors.paddle.com/ 사업자 정보 · 정산 계좌(외화 수취) · Website approval 신청.

## 2. 샌드박스 키 받은 뒤 (에이전트)

- [x] **P6 상품 등록 실행** - ✅ 2026-09-07 `scripts/paddle-register-catalog.mts` 로 샌드박스에 13개(플랜 9·팩 4) 등록. 멱등(두 번째 실행 exists 13). 가격 ID 13개 → `.env.local` + Vercel Preview/Development.
- [x] **P7 결제창 연결** - ✅ 2026-09-07. `/pricing`·`/account` 버튼 → `POST /api/billing/checkout`(서버 판정: 로그인·무료 팩 1회·구독 중 중복 금지·상품 ID) → Paddle 거래 생성(custom_data.workspace_id, 고객 재사용) → `Paddle.Checkout.open({ transactionId })`. 약속 10개 `tests/paddle-checkout.test.ts`.
      **실물 전 구간 1회 완료**: 로컬 /pricing → Mini $29 결제창 → 테스트 카드 4242 → Paddle 결제 성공 → 웹훅(dev) → dev DB 적립 50(2027-09-07 만료) → 로컬 토스트 "Take 50개가 들어왔어요" → 계정 페이지 잔액 50 · 내역 · 두 번째 팩 버튼 409 차단. 스크린샷 `evidence/checkout-*.png`, `account-after-real-payment.png`.
- [x] **P8 결제 직후 화면** - ✅ 최소 버전: 결제 완료 콜백 → "결제 확인 중…" 토스트 → 3초 폴링 → 잔액 바뀌면 "Take N개가 들어왔어요"(실측 ~20초). 90초 넘으면 계정 페이지 안내. 별도 페이지는 안 만들었다.
- [ ] **P9 앱 안 충전 화면** - 잔액 · 소멸 예정 · 팩 구매 · 현재 플랜 · "구독 관리"(Paddle 고객 포털 링크, 취소·카드 변경 화면은 Paddle 것).
      부족 토스트의 "채우러 가기" 버튼이 여기로 온다(3-10).
      검수: 스크린샷 + 약속.
- [ ] **P10 dev 전 구간 스모크** - 샌드박스 카드 `4242 4242 4242 4242` → 알림 → 적립 → 생성 1회 → 차감 확인. 같은 알림 2회 재전송 → 적립 1회. 환불 → 회수.
- [x] **P11 알림 처리 실패 시 경보** - ✅ 디스코드 웹훅(`src/lib/ops-alert.ts`). 처리 실패·갱신 실패·상품 매핑 실패·워크스페이스 없음·무료 초과 팩·환불 회수가 간다. 로컬·dev 실측 전송 확인.
- [ ] **P12 일일 대사** - Paddle 거래 목록 vs `billing_events` 비교. Vercel Cron(`CRON_SECRET` 재사용). 놓친 알림은 반드시 생긴다.

## 3. 라이브 전환

- [ ] 문서 4종(약관 · 환불 · 개인정보 · 실가격) 게시 확인 → Website approval 신청 → 승인.
- [ ] 라이브 상품 등록(P2 스크립트, 라이브 키) → 라이브 가격 ID는 Production env에만.
- [ ] 라이브 API 키 · 클라이언트 토큰 · 웹훅 시크릿은 Production 스코프에만. 샌드박스 값과 같은 스코프에 두지 않는다.
- [ ] 라이브 웹훅 목적지 = production 도메인.
- [ ] 베타 명단 grant(`beta-cutover.md`) → `TAKE_BILLING_MODE=enforce`. 두 조건 다 충족해야 켠다.
- [ ] 라이브 첫 결제 1건을 일일 대사가 정상 대조.

## 나중에 (첫 결제 뒤)

- 자동 충전(기본 OFF · 월 상한 숫자 필요).
- 플랜 변경 일할(업그레이드 즉시 · 다운그레이드 다음 결제일).
- Account 초과 과금(단가 필요).
- 국내 B2B 수동 계약 경로(안건 ①) - 관리자 수동 부여가 이미 그 경로다.
- 만기 정산 잡(월말 플랜분 소멸 · 12개월 충전분 · 소멸 임박 알림).

## Paddle 링크

| 용도 | 링크 |
|---|---|
| 샌드박스 가입 | https://sandbox-vendors.paddle.com/signup |
| 샌드박스 대시보드 | https://sandbox-vendors.paddle.com/ |
| 라이브 대시보드 | https://vendors.paddle.com/ |
| 샌드박스 안내 · 테스트 카드 | https://developer.paddle.com/sdks/sandbox |
| 라이브 전환 체크리스트 | https://developer.paddle.com/build/go-live-checklist |
| 웹훅 서명 검증 | https://developer.paddle.com/webhooks/about/signature-verification |
| Paddle.js 결제창 | https://developer.paddle.com/paddle-js/methods/paddle-checkout-open |

공식 문서에서 확인한 사실
- 샌드박스와 라이브는 완전히 별개 계정. 상품 · 키 · 웹훅 전부 따로.
- 샌드박스는 웹사이트 승인 없이 결제창이 뜬다. 라이브는 Website approval 필요(약관 · 환불정책 · 가격 페이지를 본다).
- 테스트 카드: `4242 4242 4242 4242` 성공 · `4000 0000 0000 0002` 거절 · `4000 0038 0000 0446` 3DS.
- 웹훅 재시도: 샌드박스 3회/15분, 라이브 60회/3일. 5초 안에 2xx로 답해야 한다.
- 환불은 샌드박스에서 10분마다 자동 승인. 환불 → 회수 흐름을 끝까지 돌릴 수 있다.
- API 주소: 샌드박스 `https://sandbox-api.paddle.com` · 라이브 `https://api.paddle.com`.

## 환경 변수 (예정)

| 이름 | 스코프 | 비고 |
|---|---|---|
| `PADDLE_API_KEY` | 서버 | 샌드박스 `_sdbx` / 라이브 |
| `PADDLE_WEBHOOK_SECRET` | 서버 | 알림 목적지마다 발급 |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | 브라우저 | `test_` / `live_` |
| `NEXT_PUBLIC_PADDLE_ENV` | 브라우저 | `sandbox` / `production` |
| `PADDLE_PRICE_*` | 서버·브라우저 | 플랜 9 + 팩 4 = 13개. P2에서 이름 확정 |

샌드박스 값은 Preview/Development, 라이브 값은 Production에만. 둘이 한 스코프에 공존하는 순간 사고가 난다(CLAUDE.md 개발환경 절).
