# 스스로 다시 시도한다는 그 장치는, 한 번이라도 다시 시도한 적이 있나

- 티켓: `.claude/vault/backlog/t0-generation-retry-never-fires.md`
- 조사 시각: 2026-08-15 16:44 (UTC)
- 지출: **0원** — 모델 호출 0회, 그림·영상 발주 0회. 데이터베이스는 **읽기만** 했다.
- 결론 한 줄: **한 번도 없다. 없을 수밖에 없다 — 다시 시도한 횟수를 세는 칸은 있는데, 그 칸의 숫자를 늘리는 코드가 저장소에 한 줄도 없다.**

---

## 1. 무엇을 물었나

목적지 문서는 지금 깔려 있는 공사를 이렇게 적고 있다.

> 그 아래를 받치는 공사로, 생성 실패를 원인별로 태깅하고 스스로 재시도하는 척추를 깔았다.
>
> — `.claude/vault/destination/_NOW.md` 1절 "지금 무엇을 만들고 있나"

어제 정리된 발견 목록에는 정반대 주장이 올라와 있다.

> 그림 생성이 5건 중 1건꼴로 실패하는데 재시도가 단 한 번도 일어난 적이 없다
>
> — `.claude/vault/backlog/reports/2026-08-15-새발견103-판정.json`, `index: 58` 의 제목

둘 중 하나는 틀렸다. 어느 쪽이 틀렸느냐에 따라 **완주율**(사람 손 없이 완성 영상까지 간 이야기의 비율)을
올리는 다음 수리 지점이 완전히 달라진다.

---

## 2. 어떻게 쟀나

두 축을 따로 쟀다. **데이터 축**(실제로 일어난 일)과 **코드 축**(일어날 수 있는 일).

### 데이터 축 — 작업 기록 전 건 다시 세기

라이브 Supabase 의 작업 기록표 `generation_jobs` 를 **쪽 나눠 읽어** 전 건을 가져왔다.
티켓에 미리 적힌 952건은 상한을 걸어둔 예비 조회였으므로, 상한 없이 처음부터 다시 셌다.

조회 스크립트: `research/experiments/t0-generation-retry-never-fires/probe.mjs`

핵심 질의 두 개를 원문 그대로 옮기면 이렇다.

```js
// (가) 서버가 직접 센 정확한 전체 건수 — 페이징이 뭘 빠뜨렸는지 대조용
const { count: headCount } = await db
  .from('generation_jobs')
  .select('id', { count: 'exact', head: true })

// (나) 1000건씩 쪽 나눠 전 건 읽기 — 더 안 나올 때까지
for (let from = 0; ; from += PAGE) {
  const { data } = await db
    .from('generation_jobs')
    .select(COLS)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)
  if (!data || data.length === 0) break
  rows.push(...data)
  if (data.length < PAGE) break
}
```

세 숫자가 서로 맞는지부터 확인했다. 서버가 센 건수, 쪽 나눠 읽어 모은 줄 수, 그중 서로 다른 식별자 개수.

```
"headCountExact": 952,
"pagedRowCount": 952,
"uniqueIdCount": 952,
"countsMatch": true
```

셋이 같으므로 빠뜨린 줄도, 중복으로 두 번 센 줄도 없다. 기록 범위는
**2026-07-14 13:34 부터 2026-08-14 09:27 까지** (약 한 달).

### 코드 축 — 시도 횟수를 늘리는 자리 전수 검색

저장소 전체에서 `attempts` 라는 낱말이 나오는 자리를 전부 훑고, 그중 **작업 기록표의 시도 횟수 칸에
값을 쓰는 자리**만 골라냈다. 실행한 명령 원문:

```sh
rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!.git' --glob '!research/**' 'attempts' .
# → 37줄 (대부분 글쓰기 엔진의 동명이인 변수)

rg -n --glob '!node_modules' --glob '!.next' --glob '!research/**' 'attempts\s*(=|:)\s*[^=]' .
# → 작업 기록표에 값을 쓰는 자리는 아래 3곳뿐

rg -n --glob '!node_modules' --glob '!.next' 'attempts\s*\+|increment' .
# → 작업 기록표를 건드리는 결과 0건 (걸린 3줄은 화면단 재시도 타이머와 tsconfig 설정)
```

면제 목록과 분류 함수는 **제품 코드에서 그대로 불러다 썼다**(복붙 금지 규칙).
대조 스크립트: `research/experiments/t0-generation-retry-never-fires/classify-check.mts`

---

## 3. 나온 값

### 표 1 — 시도 횟수 분포 (전 건 952건)

| 시도 횟수 | 건수 | 비율 |
|---|---:|---:|
| 1 | 952 | 100.00% |
| 2 이상 | **0** | **0.00%** |

실패한 48건만 따로 봐도 똑같다. 전부 시도 횟수 1.

```
"attemptsDistributionAll": { "1": 952 },
"attemptsDistributionFailed": { "1": 48 },
"attemptsGte2Count": 0,
"attemptsGte2Rows": []
```

상태 분포는 이렇다.

| 상태 | 건수 | 비율 |
|---|---:|---:|
| 완료 (`completed`) | 901 | 94.64% |
| 실패 (`failed`) | 48 | 5.04% |
| 대기 중 (`queued`) | 3 | 0.32% |

### 표 2 — 실패 원인 분류별 건수와 자동 재시도 면제 여부

실패 48건 전부에 원인 분류가 붙어 있다(48/48). 사람이 읽을 오류 문구는 48/48 에,
별도 보관 칸(`last_error`)에는 35/48 에 채워져 있다.

"면제"란 `src/lib/generation-jobs.ts:564` 의 목록 `GIVE_UP_EXEMPT_CLASSES = { 'provider', 'infra' }` 에
드는지를 말한다. **면제는 다시 시도하게 만드는 장치가 아니다** — 뒤에서 다시 설명한다.

| 실패 원인 분류 | 뜻 | 건수 | 면제인가 |
|---|---|---:|---|
| `bad_request` | 이유를 안 알려주는 400 거절 | 14 | 아니오 |
| `infra` | 우리 쪽 뒷정리(소식 못 받은 좀비 회수 등) | 13 | **예** |
| `moderation_soft` | 빈 그림/검은 그림이 돌아옴 | 9 | 아니오 |
| `data_ref` | 참조 그림을 못 읽음 | 5 | 아니오 |
| `billing` | 잔액 소진 | 4 | 아니오 |
| `provider` | 생성 업체 일시 장애 | 2 | **예** |
| `moderation` | 콘텐츠 정책 거절 | 1 | 아니오 |
| **합계** | | **48** | 면제 15 / 비면제 33 |

각 분류의 실제 오류 문구를 원문 그대로 하나씩 옮기면 이렇다
(전체 표본은 `error-samples.json`).

- `infra` — `stale queued reaped — webhook 유실 좀비 정리 (quota 복구 2026-08-05)`
- `moderation_soft` — `image too small (1795b < 20000) — likely blank/moderated output`
- `data_ref` — `status=422 | body={"detail":[{"loc":["body","input.image_urls"],"msg":"Failed to load the image. Please ensure the image file is not corrupted and is in a supported format.","type":"image_load_error",…`
- `billing` — `fal 잔액 소진으로 미실행 — 수동 이미지 경로로 대체`
- `bad_request` — `Bad Request` (이게 문구 전부다. 업체가 본문을 버린다)
- `moderation` — `status=422 | Unprocessable Entity | body={"detail":[{"loc":["body","prompt"],"msg":"The content could not be processed because it contained material flagged by a content checker.","type":"content_poli…`
- `provider` — `invalid video url in provider result`

### 표 3 — 작업 종류별 실패

| 작업 종류 | 뜻 | 전체 | 실패 | 실패율 |
|---|---|---:|---:|---:|
| `shot_rough_storyboard` | 러프 그림콘티 | 447 | 25 | 5.59% |
| `character_view` | 인물 시트 | 83 | 9 | **10.84%** |
| `world_shot` | 배경 그림 | 88 | 7 | 7.95% |
| `shot_storyboard` | 그림콘티 | 60 | 3 | 5.00% |
| `shot_video` | 영상 | 155 | 2 | 1.29% |
| `storyboard_real_grid` | 실사 그리드 | 115 | 2 | 1.74% |
| `shot_previz_video` | 미리보기 영상 | 4 | 0 | 0.00% |
| **합계** | | **952** | **48** | **5.04%** |

**절대 건수로는 러프 그림콘티가 완주를 가장 많이 깬다(25건, 실패 전체의 52%). 비율로는 인물 시트가 가장 나쁘다(10.84%, 평균의 2배).**

작업 종류 × 실패 원인 교차표는 원인이 종류별로 확연히 갈린다는 걸 보여준다.

| 작업 종류 | 주된 실패 원인 |
|---|---|
| 러프 그림콘티 (25건) | `bad_request` 10 · `moderation_soft` 9 · `infra` 6 |
| 인물 시트 (9건) | `data_ref` 5 · `billing` 4 |
| 배경 그림 (7건) | `infra` 7 (전부) |
| 그림콘티 (3건) | `bad_request` 2 · `moderation` 1 |
| 영상 (2건) | `provider` 2 |
| 실사 그리드 (2건) | `bad_request` 2 |

### 표 4 — 시도 횟수 칸에 값을 쓰는 자리, 전수

| 파일 | 줄 | 코드 | 하는 일 | 숫자를 늘리나 |
|---|---:|---|---|---|
| `src/lib/generation-jobs.ts` | 167 | `attempts: 1,` | 새 작업을 만들 때 **상수 1로 고정** | 아니오 |
| `supabase/migrations/20260720043300_director_video_retakes_hardening.sql` | 136 | `update public.generation_jobs set … attempts = 1, … where id = p_job_id and status = 'queued'` | 예약된 영상 작업을 실제로 제출할 때 **1로 설정** | 아니오 |
| `src/types/database.ts` | 192 | `attempts: number` | 타입 선언만 | 아니오 |

**시도 횟수를 늘리는 코드: 0곳.**

---

## 4. 판정

> **판정선 2번 발동** — 티켓 원문:
>
> > **0건이고** 시도 횟수를 늘리는 코드도 **0곳**이면 → "재시도 장치는 존재하지 않는다" 확정.
> > 목적지 문서 1절의 서술이 코드와 어긋난다는 뜻이므로 **아침 목록에 목적지 갱신 초안**을 올린다.

- 시도 횟수 2 이상인 건: **0 / 952**
- 시도 횟수를 늘리는 코드: **0곳**

**같은 작업 주문을 자동으로 다시 보내는 장치는 존재하지 않는다.** 발견 #58 의 본체 주장은 **살아 있다**.
목적지 문서 1절의 *"스스로 재시도하는 척추를 깔았다"* 는 서술은 코드와 어긋난다.

### 실패율 주장 대조 (판정과 별개)

| | 발견 #58 주장 | 실측 |
|---|---|---|
| 실패율 | "5건 중 1건꼴" = 20% | **5.04%** (48 / 952) — 약 20건 중 1건 |

**약 4배 어긋난다.** 발견 #58 자신도 근거란에 *"실패율 수치는 DB 접근 불가로 재확인하지 못했으나
코드 구조는 발견 그대로다"* 라고 적어 두었다 — 실패율은 애초에 확인 안 된 곁가지였다.
티켓 규칙대로 **이 어긋남은 위 판정을 바꾸지 않는다**. 다만 발견 제목에 실린 20% 는 사실이 아니므로
인용될 때 정정이 필요하다.

---

## 5. 왜 "실패 원인 태깅"은 있는데 재시도는 없나 — 무엇이 오해를 만들었나

실패를 원인별로 태깅하는 장치는 **진짜로 있다**(48/48 태깅됨). 목적지 문서 서술의 앞 절반은 맞다.
어긋나는 건 뒷 절반 "스스로 재시도한다" 쪽이다. 왜 재시도가 있는 것처럼 보였는지, 코드에서 확인한 세 가지.

**첫째, 있는 장치는 브레이크지 액셀이 아니다.** `AUTO_GENERATION_GIVE_UP_THRESHOLD`
(`src/lib/generation-jobs.ts:556`, 값 2)와 면제 목록(`:564`)은 이름 그대로 **포기 게이트**다.
`src/app/api/artist/generate-sheet/route.ts:90` 과 `src/app/api/artist/generate-world/route.ts:61` 에서
같은 슬롯 실패가 2건 쌓이면 자율 생성을 **막는다**. 코드의 주석이 그대로 말한다.

> `// give-up 게이트: 자율 first-fill(actor='auto')은 같은 슬롯(캐릭터×뷰) 실패가 임계값 이상이면`
> `//   멈춘다(무한 재시도·fal 과금 차단).`
>
> — `src/app/api/artist/generate-sheet/route.ts:88-89`

면제 클래스(`provider`, `infra`)라고 해서 다시 시도가 **일어나지는** 않는다. 그저 이 게이트의 계산에
안 들어갈 뿐이다 — 즉 "나중에 누군가 다시 요청하면 막지 않는다"는 뜻이지, 누가 다시 요청해 주지는 않는다.
재시도 정책의 **측정 기반**이 깔린 것이지 정책 자체가 돌고 있는 게 아니다
(주석도 `#error-class` 를 "클래스별 재시도 정책(P2/P3)의 측정 기반"이라 부른다, `:226`).

**둘째, 실패를 계기로 무언가를 다시 보내는 코드 경로가 없다.** 작업을 만드는 함수
`createGenerationJob` 을 부르는 자리는 저장소에 6곳이고, 전부 **요청이 들어와서** 만드는 자리다
(초안 트리거, 배경 제출, 그림콘티 3종, 인물 시트, 러프 콘티). 실패 처리 경로
(`src/app/api/fal/webhook/route.ts`, `src/lib/fal/reconcile.ts`)는 작업을 완료나 실패로 **닫기만 하고**
새로 만들지 않는다. 정기 실행 목록(`vercel.json`)에 걸린 것은
`/api/writer/watchdog` 하나뿐이고, 그건 글쓰기 파이프라인의 멈춘 실행을 재개하는 것이지 그림 생성과 무관하다.

**셋째, "다시 시도"처럼 보이는 것 둘은 전부 사람이 눌러야 돈다.**

- `POST /api/artist/retry-drafts` — 이름에 재시도가 들어 있지만,
  `src/components/layout/sidebar.tsx:255` 의 **클릭 처리기**에서만 불린다
  (`onClick={() => { if (isArtistRetryable) void retryArtistDrafts() }}`). 사람이 사이드바 아이콘을
  눌러야 실행된다.
- 화면단 자율 채움 `autoGenerateBaseImages` (`src/stores/artist-store.ts:1093`) — **빈칸을 채우는**
  펌프지 실패에 반응하는 펌프가 아니다. 브라우저에서 화면을 열어야 돌고, 판단 기준은
  `if (c.views.main != null) { skipped… }` 처럼 "이미 있나"이지 "지난번 실패했나"가 아니다.

### 곁가지 관측 — 칸이 아니라 새 줄로 다시 보내진 흔적 (판정선 밖)

시도 횟수 칸 대신 **새 작업 줄**로 다시 보내진 게 있는지도 세어 봤다. 같은 슬롯(프로젝트+종류+대상)으로
묶었을 때:

| | 건수 |
|---|---:|
| 실패가 한 번이라도 있는 슬롯 | 44 |
| 그 실패 이후에 같은 슬롯으로 작업이 또 생긴 슬롯 | 31 |
| 그중 결국 성공한 슬롯 | 31 |

즉 실패한 슬롯의 70%(31/44)는 결국 그림이 채워졌다. **다만 이걸 자동 재시도의 증거로 삼을 수는 없다.**
뒤따른 작업 125건의 요청 주체는 전부 `ui`(118) 또는 `writer`(7)로 기록돼 있는데, 여기엔 함정이 있다 —
`src/app/api/artist/generate-sheet/route.ts:83` 과 `generate-world/route.ts:54` 가
`actor === 'chat' ? 'chat' : 'ui'` 로 접어 버려서, **자율(`auto`) 요청도 기록에는 `ui` 로 남는다.**
그래서 이 뒤따른 작업들이 사람 클릭인지 화면단 자율 채움인지는 **기록만으로는 구분할 수 없다**(확인 못 함).
어느 쪽이든 **실패를 계기로 자동으로 다시 보낸 것은 아니다** — 위 세 가지에서 그 경로가 없음을 확인했다.

---

## 6. 좌표 대조 — 티켓의 옛 줄 번호는 맞았나

티켓이 스스로 경고한 대로 다시 찾아 확인했다.

| 티켓이 적은 좌표 | 지금 실제 | 맞았나 |
|---|---|---|
| `src/lib/generation-jobs.ts:167` 의 `attempts: 1` 고정 | `:167` `attempts: 1,` | **정확** |
| 분류는 `:242` | 분류 규칙 배열은 `:240` 에서 시작(`:242` 는 그 안의 `data_ref` 줄), 분류 함수 `classifyJobError` 는 `:253` | **거의 맞음** — 가리키려던 덩어리 안이긴 하나 시작점은 240 |
| 면제 목록은 `:564` 부근 | `:564` `GIVE_UP_EXEMPT_CLASSES = new Set(['provider', 'infra'])` | **정확** |
| 자동 회수 장치: `vercel.json` 정기 실행 목록, `src/lib/fal/reconcile.ts` | 둘 다 실재. 정기 실행은 `/api/writer/watchdog` 하나뿐이고 그림 생성과 무관, `reconcile.ts` 는 닫기만 하고 다시 보내지 않음 | **실재하나 재시도는 안 함** |

---

## 부록 — 좌표 기록 (재현용)

- 실행 시각: 2026-08-15 16:44 UTC / 조사 기준 코드: 브랜치 `main`, 최근 커밋 `fb1ad7c`
- 데이터 원천: 라이브 Supabase, 표 `generation_jobs`, 읽기 전용(`select` 만 사용)
- 읽은 칸: `id, project_id, kind, status, attempts, error_class, last_error, error, actor, provider, model, target, created_at, completed_at`
- 실행 명령
  - `node research/experiments/t0-generation-retry-never-fires/probe.mjs`
  - `pnpm dlx tsx research/experiments/t0-generation-retry-never-fires/classify-check.mts`
  - `node research/experiments/t0-generation-retry-never-fires/samples.mjs`
- 산출물: `results.json`(기계용 원자료), `error-samples.json`(오류 문구 표본), 이 문서
- 채점 방식: 전부 세기. **모델 판정 없음.** 면제 목록·분류 함수는 제품 코드에서 직접 불러 씀(복붙 없음)
- 지출: 0원

### 영어 원문 용어 대조

| 이 문서에서 쓴 말 | 코드/데이터의 원문 |
|---|---|
| 작업 기록표 | `generation_jobs` |
| 시도 횟수 | `attempts` |
| 실패 원인 분류 | `error_class` |
| 자동 재시도 면제 목록 | `GIVE_UP_EXEMPT_CLASSES` |
| 포기 게이트 임계값 | `AUTO_GENERATION_GIVE_UP_THRESHOLD` |
| 요청 주체 | `actor` (`ui` / `writer` / `chat` / `auto`) |
| 러프 그림콘티 / 그림콘티 / 인물 시트 / 배경 그림 / 실사 그리드 / 영상 / 미리보기 영상 | `shot_rough_storyboard` / `shot_storyboard` / `character_view` / `world_shot` / `storyboard_real_grid` / `shot_video` / `shot_previz_video` |
