# 1단계 — Seedance 2.5 가용성·시간 파라미터 조사 (지출 $0)

- 조사일: 2026-08-11
- 방법: fal OpenAPI 스키마 직접 조회(curl), higgsfield CLI 직접 조회, WebFetch/WebSearch.
- 인용 규칙: `[스키마]`는 기계 판독 가능한 API 스펙에서 직접 읽은 것(가장 강함). `[확인]`은 해당 URL을
  fetch 해서 본문에서 읽은 것. `[검색요약]`은 검색엔진 요약에만 있고 원문 fetch가 막힌 것.

---

## §요약 (한 줄씩)

1. **fal에 Seedance 2.5 있다.** 3개 엔드포인트(text-to-video / image-to-video / **reference-to-video**).
   우리가 쓰는 것과 같은 계열인 `bytedance/seedance-2.5/reference-to-video`가 실존한다.
2. **higgsfield에도 있다.** CLI 로그인 돼 있고 `seedance_2_5`가 모델 목록에 있다. 크레딧 잔액 5465.49로 즉시 발주 가능.
3. **양쪽 다 시간·카메라 전용 파라미터는 없다.** 2.5의 입력 스키마는 2.0과 같은 가족이다 —
   `prompt / image_urls / video_urls / audio_urls / resolution / duration / aspect_ratio / generate_audio`.
   **타임코드·카메라 궤적·모션 강도를 받는 필드는 fal에도 higgsfield에도 존재하지 않는다.**
   초 단위 통제 채널은 **프롬프트 텍스트 하나뿐**이다.
4. **출발점이던 "Runware 문서의 1초 granularity 타임코드" 주장은 문서 자체로는 확인됐다.** 다만
   **Runware는 API 리셀러지 ByteDance가 아니다 — 2차 근거다.** ByteDance 1차 문서(火山引擎/即梦)는
   이 환경에서 fetch 불가(JS 렌더링)라 **원문 확인 실패**. 여러 3자 문서가 "공식 가이드"라며 인용하는
   문구는 서로 **표기법이 갈린다**(`[0-3s]` vs `0-5s:`).
5. **어떤 문서도 "타임스탬프가 지켜진다"고 보증하지 않는다.** 가장 강한 표현조차 "순서와 페이싱을 같이 준다"
   수준의 이점 주장이고, 하드 제약이라는 서술은 어디에도 없다.

---

## §fal — Seedance 2.5

### 실존하는 엔드포인트

| 엔드포인트 | 용도 |
|---|---|
| `bytedance/seedance-2.5/text-to-video` | 텍스트만 |
| `bytedance/seedance-2.5/image-to-video` | 이미지 1장 애니메이션 |
| **`bytedance/seedance-2.5/reference-to-video`** | **최대 50개 멀티모달 참조 (우리 계열)** |

출처: https://fal.ai/seedance-2.5 , https://fal.ai/models/bytedance/seedance-2.5/reference-to-video

### 입력 스키마 — 기계 판독 원본 `[스키마]`

```
GET https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video
→ HTTP 200, components.schemas.Seedance25ReferenceToVideoInput  (2026-08-11 실측)
```

| 파라미터 | 타입 | enum / 기본값 |
|---|---|---|
| `prompt` | string | **required** |
| `image_urls` | array | — |
| `video_urls` | array | — |
| `audio_urls` | array | — |
| `resolution` | string | `[480p, 720p]`, 기본 `720p` |
| `duration` | **string** | `[auto, 4, 5, …, 30]`, 기본 `auto` |
| `aspect_ratio` | string | `[auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16]`, 기본 `auto` |
| `generate_audio` | boolean | 기본 `true` |
| `end_user_id` | string\|null | — |

**2.0과의 차이 (같은 방법으로 실측한 `Seedance20ReferenceToVideoInput`과 대조)** `[스키마]`

| 축 | 2.0 reference-to-video | 2.5 reference-to-video |
|---|---|---|
| `duration` | `auto, 4..15` | `auto, 4..**30**` |
| `resolution` | `480p, 720p, **1080p, 4k**` | `480p, 720p` (**1080p·4k 없음**) |
| `bitrate_mode` | `standard, high` | **없음** |
| 시간/카메라/모션 파라미터 | **없음** | **없음** |
| `seed` | **없음** | **없음** |

> **주의 — 모델 페이지 표와 OpenAPI가 어긋난다.** fal 모델 소개 페이지의 파라미터 표에는 `seed`가
> 있다고 적혀 있으나, **OpenAPI 스키마에는 reference-to-video에 `seed`가 없다**(text-to-video에는 있음).
> 스키마를 진실원으로 본다. → **reference-to-video는 seed 고정 재현이 불가능하다**(2.0도 동일).

> **핵심**: 2.5로 올라가며 늘어난 것은 **길이(15→30초)와 참조 개수(12→50)**지 **시간 제어 파라미터가 아니다.**
> 카메라 궤적·모션 강도·타임코드를 받는 필드는 2.0에도 2.5에도 **없다.**

### 단가 `[확인]`

> "You are charged **$0.0214 per 1000 tokens** at both 480p and 720p."
> "If any video references are provided, the price is **multiplied by 0.6**."
> "The cost of video generation is the same regardless of whether audio is generated or not."

초당 환산(모델 페이지 게시값):

| 해상도 | 영상참조 없음 | 영상참조 있음 |
|---|---|---|
| 720p | ~$0.4730 / s | ~$0.2838 / s |
| 480p | ~$0.2205 / s | ~$0.1323 / s |

**2.0 대비**: 720p 영상참조 있음 기준 $0.1814/s → $0.2838/s (**약 1.56배**).
7초 1클립 = $1.99 (2.0은 $1.27).

출처: https://fal.ai/models/bytedance/seedance-2.5/reference-to-video

### 우리 레지스트리 상태

`src/lib/video-models.ts`의 `seedance` 엔트리는 `bytedance/seedance-2.0/reference-to-video`,
`duration {min:4, max:15}`, `pricePerSecNoAudio: 0.3024`. `src/lib/fal/model-schemas.ts`도 2.0만 매핑.
**2.5는 제품에 미등록** — 이번 실험은 src/ 수정 없이 엔드포인트만 로컬 상수로 선언해 발주했다.

---

## §higgsfield — Seedance 2.5

### CLI·로그인 상태 (실측)

- 바이너리: `/opt/homebrew/bin/higgsfield`
- `higgsfield auth token` → 토큰 반환됨 (**로그인 돼 있음**)
- `higgsfield workspace list` → `Private` / plan `creator` / **크레딧 5465.49** / 선택됨 ✓

### 모델 목록 — `higgsfield model list --video` 중 seedance 계열

```
seedance1_5        Seedance 1.5 Pro     video
seedance_2_0       Seedance 2.0         video
seedance_2_0_mini  Seedance 2.0 Mini    video
seedance_2_5       Seedance 2.5         video
```

### `higgsfield model get seedance_2_5` — 파라미터 `[스키마]`

| 파라미터 | 타입 | enum / 기본값 |
|---|---|---|
| `prompt` | string | **required** |
| `mode` | string | `[t2v, omni_reference, video_edit, video_extension]`, 기본 `t2v` |
| `duration` | **integer** | 기본 `5` (enum 없음) |
| `resolution` | string | `[480p, 720p]`, 기본 `720p` |
| `aspect_ratio` | string | `[auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16]`, 기본 `16:9` |
| `generate_audio` | boolean | 기본 `true` |
| `start_image` / `end_image` | object\|null | — |
| `image_references` / `video_references` / `audio_references` | array | — |
| `extension_mode` | string\|null | `[backward, forward]` |

검증 규칙(CEL)도 함께 노출된다 — 예: `t2v`는 참조 미디어를 못 받고, `omni_reference`는 최소 1개를 요구하며,
참조 미디어 총합 ≤ 50, `video_edit`은 영상 참조 정확히 1개.

> **higgsfield가 fal보다 노출하는 축이 많다** — `mode`(video_edit / video_extension), `start_image`/`end_image`,
> `extension_mode`(앞으로/뒤로 확장). 즉 **클립을 쪼개 이어붙이는 배선은 higgsfield 쪽이 유리**하다.
> 그러나 **여기에도 타임코드·카메라 궤적 파라미터는 없다.** 시간 통제는 여전히 프롬프트 텍스트뿐.

### 단가 (실측, `higgsfield generate cost`)

| 모델 | 7초 720p |
|---|---|
| `seedance_2_5` | **45.5 크레딧** |
| `seedance_2_0` | 31.5 크레딧 |

2.5가 2.0의 **약 1.44배** (fal의 1.56배와 방향 일치). 잔액 5465.49 크레딧 → 7초 클립 약 120회분.
**신규 결제 등록 없이 선불 크레딧으로 발주 가능**하다.

---

## §출발점 주장의 1차 근거 추적

검증 대상: `_research/short-video-timing-and-rampup.md` §요약 (B)의
**"Seedance 2.5는 `[0-3s]` 1초 granularity 타임코드 지원(Runware 문서)"**.

### ① Runware 문서 — 주장 자체는 확인됨, 단 2차 근거 `[확인]`

https://runware.ai/docs/models/bytedance-seedance-2-5/guides/prompting

> "Write time ranges at roughly **one-second granularity**"
> "Keep them **continuous, with no gaps** between windows."
> "Put **too little in a window** and the model improvises to fill it."
> 타임코드는 "**high-frequency micro-control**"용이 아니다 — "asking for 'shake three times a second'
> **fights the model rather than directing it**."

표기법은 `[0-3s]`, `[3-6s]`, `[6-9s]` 대괄호 형식. 예시는 9초짜리.

> **한계: Runware는 ByteDance가 아니라 API 리셀러다.** 이 문서가 ByteDance 공식 사양을 옮긴 것인지,
> Runware가 자체 실측·재서술한 것인지 문서 안에 명시가 없다. **"1차 근거"로 승격할 수 없다.**

### ② ByteDance 1차 문서 — **fetch 실패, 확인 못 함**

- `docs.volcengine.com/docs/82379/*` — 301 리다이렉트 후 본문이 **빈 페이지**로 온다(클라이언트 렌더링).
  이 환경에서 **본문을 하나도 못 읽었다.**
- 즉몽(即梦)/火山引擎 공식 "Seedance 2.5 提示词指南"의 원문을 **직접 인용하지 못했다.**
  아래 ③은 전부 그 공식 가이드를 **3자가 재서술한 것**이다.

### ③ "공식 가이드"를 인용한다는 3자 문서들 — **표기법이 서로 갈린다**

| 출처 | 표기법 | 시간 규칙 | 확인 |
|---|---|---|---|
| **Runware** | `[0-3s]` 대괄호 | 약 1초 granularity, 빈틈 없이 연속 | `[확인]` |
| **fal 자체 가이드** | `0-5 seconds:` 콜론 | "타이밍 블록은 한 샷에 여러 사건이 있고 **순서가 중요할 때** 유용" | `[확인]` |
| **Luma 2.5 가이드** | `0–5s:` 콜론 | "**15초당 의미 있는 비트 3~4개**가 실전 출발점", "**매 초를 타임스탬프할 필요는 없다. 중요한 비트만 찍어라**" | `[확인]` |
| ByteDance 공식(3자 인용) | `0-5s:` 콜론 | "Use **whole seconds, never half seconds**", "Leave **no gaps** in the timeline" | `[검색요약]` |

가장 강한 효용 주장(역시 3자 재서술) `[검색요약]`:
> "Timestamps beat 'opens with, then, and finally' because the model gets **both the order and the pacing**."

> **→ 이 문장이 우리 실험 ⓐ(타임코드) vs ⓑ(순서형)의 정확한 대조 가설이다.** 다만 근거 등급은 검색요약이다.

### ④ 이번 조사로 뒤집힌 것 없음, 보탠 것

- 2.0 시절 인용됐던 Morphic의 경고("정밀 타이밍 지원은 **불안정**하며 구간에 정확한 길이를 강제하면
  생성 자체를 망가뜨릴 수 있다", "**모델이 지켜줄 수도 있는 힌트**")는 **2.0 문서**다. 2.5용으로 이를
  철회한다는 벤더 서술은 찾지 못했다.
- **어떤 문서도 "타임스탬프 = 하드 제약"이라고 쓰지 않는다.** Luma·fal은 오히려 "매 초 찍지 마라",
  "순서가 중요할 때 쓰라"로 효용을 **순서 쪽으로** 한정한다.
- **우리 실험(7초에 1초 창 2개)은 Luma 권장(15초당 3~4비트 ≈ 비트당 4초)보다 촘촘하다.** Runware 기준
  (약 1초 granularity)으로는 규격 안이지만, Luma 기준으로는 규격 밖이다. 판독 시 이 점을 감안할 것.

---

## §신뢰도

| 주장 | 등급 |
|---|---|
| fal에 `bytedance/seedance-2.5/reference-to-video` 실존 | **OpenAPI 200 + 실제 발주 성공, 직접 확인** |
| 2.5 입력 스키마에 시간/카메라/모션/seed 파라미터 없음 | **OpenAPI 스키마, 직접 확인** |
| 2.5 ref2vid는 1080p/4k 미지원(2.0은 지원) | **OpenAPI 스키마, 직접 확인** |
| fal 2.5 단가 $0.0214/1k토큰, 영상참조 시 ×0.6 | **벤더 모델 페이지, 직접 확인** |
| higgsfield에 `seedance_2_5` 존재, 45.5크레딧/7초720p | **CLI 직접 실행** |
| higgsfield 로그인·워크스페이스·잔액 | **CLI 직접 실행** |
| Runware의 `[0-3s]` 1초 granularity 서술 | **리셀러 문서, 직접 확인 — ByteDance 1차 아님** |
| ByteDance 공식 타임코드 규칙(whole seconds/no gaps) | **검색요약만. 원문 미확인** |
| "타임스탬프가 순서형보다 낫다" | **검색요약만. 원문 미확인** |
| 火山引擎 공식 문서 본문 | **fetch 실패 — 확인 못 함** |

## §못 찾은 것

1. **ByteDance/火山引擎 공식 Seedance 2.5 프롬프트 가이드 원문.** JS 렌더링으로 본문 회수 실패.
   3자 재서술만 4건 확보. **표기법이 갈리는 문제(`[0-3s]` vs `0-5s:`)를 원문으로 못 끊었다.**
2. **타임스탬프가 하드 제약인지 힌트인지에 대한 벤더 명시.** 어느 문서도 답하지 않는다.
3. **2.5의 타이밍 준수율 정량 벤치마크.** 누가 재서 보고한 자료 없음 — 2단계 실측이 이 빈칸을 메운다.
