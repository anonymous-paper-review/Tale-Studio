# 웹 검색을 쥐는 세 단계가 전부 새 모델로 가는가 — 조사 결과

- 실행: 2026-08-16 밤 · 티켓 `t0-grounding-pin-stage-coverage`
- 방법: 코드 읽기 + 저장된 호출 기록(데이터베이스) 읽기. **새로 부른 모델 0회, 지출 0원.**
- 조사 시점의 코드: `fb1ad7c` (main)

## 한 줄

**가설 유지.** 웹 검색을 켜고 나가는 글쓰기 단계는 네 곳인데(그중 하나는 꺼져 있는 예비 경로),
넷 다 같은 갈림길을 지나 어제 지정한 접지용 모델 하나로 간다. 예전 경로(느린 쪽)로 새는 단계는 없다.
저장된 호출 기록에서도 커밋 이후 이 세 단계에서 나간 검색 호출 12건이 **전부** 그 모델 이름으로 찍혀 있고,
예전 모델 이름은 0건이다.

## 왜 이 답이 나오는가 — 갈림길이 단계마다 있지 않다

세 단계가 각자 모델을 고르는 게 아니다. 세 단계 모두 "검색을 켜달라"는 표시만 붙여 **같은 배분기 함수**에
넘기고, 모델 이름을 실제로 정하는 곳은 그 아래 구글 클라이언트 파일의 딱 한 줄이다.

`src/lib/writer/llm/gemini.ts:73`

```ts
const modelName = opts.webSearch ? GROUNDING_MODEL : (opts.modelName ?? 'gemini-3.6-flash');
```

`GROUNDING_MODEL` 은 같은 파일 66번째 줄에서 `'gemini-3-flash-preview'` 로 고정돼 있다.
읽는 법: **검색을 켜고 들어오면 단계가 무엇이든 부르던 모델을 버리고 접지용 모델로 갈아탄다.**
검색 도구 자체를 붙이는 줄도 같은 파일 86번째 줄 한 곳뿐이다.

그래서 "세 단계 중 한 곳만 고쳐졌을 수 있다"는 걱정은 구조적으로 성립하지 않는다 —
갈림길이 단계마다 흩어져 있었다면 성립했겠지만, 지금은 단계들이 공유하는 한 줄이다.

## 단계별 분류표

| 단계 (사람 말) | 검색을 켜는 자리 | 어느 축의 설정을 받나 | 판정 |
|---|---|---|---|
| 드라마투르그 (실존 절차·사례 조사) | `s0_dramaturgy.ts:111` | 이야기 축 (`steps.ts:317`, `index.ts:194`) | **(a) 새 접지 모델** |
| 이야기 축 — 구조 (오마쥬·레퍼런스 접지) | `s1_structure.ts:81` | 이야기 축 (`steps.ts:350`, `index.ts:199`) | **(a) 새 접지 모델** |
| 장면 (오마쥬·레퍼런스 접지) | `s3_scenes.ts:283` | 이야기 축 (`steps.ts:360`, `index.ts:200`) | **(a) 새 접지 모델** |
| 병합 게이트 (평소 꺼짐) | `s1s3_merged.ts:168` | 이야기 축 (`steps.ts:339`) | **(a) 새 접지 모델** — 단, 스위치가 켜졌을 때만 존재하는 경로 |
| (참고) 프로듀서 채팅 | `api/produce/chat/route.ts:160` | 글쓰기 배분기를 아예 안 지남 | 범위 밖 — 별도 클라이언트 |

기각 조건이 말하는 "세 단계"는 위 표의 첫 세 줄이다. **한 곳도 예전(기본) 모델로 가지 않는다.**

병합 게이트는 `steps.ts:332` 의 `if (process.env.WRITER_MERGE_S1S3 === '1')` 뒤에서만 불린다.
그 환경 변수는 `.env.local` 에 없다 — 즉 지금은 꺼져 있다(티켓 전제와 일치). 켜더라도 같은 한 줄을
지나므로 접지용 모델로 간다.

프로듀서 채팅은 티켓이 지목한 네 곳에 들어 있지 않고, 글쓰기 배분기 대신 앤트로픽 쪽 검색 도구를
직접 쓰는 다른 배선이다(`src/lib/claude.ts:5` 의 고정 모델). 전수 열거를 위해 적어 두되 판정 대상은 아니다.

## 예전 모델은 언제 나오나 — 실패했을 때만

배분기 파일 `src/lib/writer/llm/dispatch.ts:120~131` 에 이런 갈래가 남아 있다.

```ts
const groundingFailed = cfg.provider === 'gemini' && opts.webSearch === true;
if (moderationBlocked || groundingFailed) {
  const fb = DEFAULT_MODELS.C;   // claude/claude-sonnet-4-6
  ...
  return dispatchOnce<T>(prompt, fb, { ...opts, maxTokens: ... });
}
```

이 갈래는 `try` 가 아니라 **`catch` 안**에 있다(85~86번째 줄에서 먼저 접지용 모델로 부르고, 그게 예외를
던졌을 때만 여기로 내려온다). 접지용 모델이 사라지거나 죽으면 그때 예전 모델로 떨어지라는 안전망이지,
평소에 지나는 길이 아니다. 저장된 기록에서도 커밋 이후 이 세 단계에 예전 모델 이름은 0건이다 —
안전망이 발동한 적이 없다.

## 저장된 호출 기록 — 12건 전부 새 모델

기록은 데이터베이스의 호출 원장(`llm_calls` 표)에 남는다. 커밋 시각(2026-08-12 15:08 한국시간) 이후로 잘라
단계 이름별로 셌다. 커밋 이후 이 원장에 쌓인 전체 행은 108건이고, 그중 관심 단계는 아래와 같다.

| 단계 | 검색 호출 수 | 찍힌 모델 | 소요 시간 (가운뎃값) |
|---|---|---|---|
| 드라마투르그 | 4건 | 새 접지 모델 4건 / 예전 모델 0건 | 14.1초 |
| 이야기 축 — 구조 | 4건 | 새 접지 모델 4건 / 예전 모델 0건 | 5.4초 |
| 장면 | 4건 | 새 접지 모델 4건 / 예전 모델 0건 | 19.7초 |
| 병합 게이트 | 0건 | — | 기록 없음 (스위치 꺼짐과 일치) |

오류로 끝난 호출은 0건이다. 기록 구간은 2026-08-12 16:09부터 2026-08-13 14:00(한국시간)까지이고,
그 이후로는 이 세 단계의 새 호출이 없다.

### 대조군 — 커밋 직전 일주일

같은 원장을 커밋 **이전** 구간(8/5~8/12)으로 잘라 보면 세 단계가 전부 예전 모델로 가 있었다.

| 단계 | 커밋 전 모델 | 커밋 전 소요 시간 | 커밋 후 소요 시간 |
|---|---|---|---|
| 드라마투르그 | 예전 모델 2건 | 154.6초 | 14.1초 |
| 이야기 축 — 구조 | 예전 모델 2건 | 38.7초 | 5.4초 |
| 장면 | 예전 모델 2건 | 144.2초 | 19.7초 |

세 단계 합계로 337.5초 → 39.2초. 티켓이 걱정한 "나머지 둘은 안 걷혔을 수도 있다"는 사실이 아니었다 —
같이 걷혔다. 다만 이 수치는 각 구간 표본이 2~4건씩이라 방향은 확실하되 정확한 절감폭의 근거로 쓰기엔 얇다.
정확한 절감은 형제 티켓의 재측정이 답할 몫이다.

## 확인 못 한 것 / 남는 조건

1. **접지용 모델 고정은 "이야기 축이 구글 계열일 때"만 작동한다.** 글쓰기 시작 요청의 본문에 축별
   모델을 실어 보내면 그 값이 우선한다(`api/writer/start/route.ts:112,117,239` → `pipeline/index.ts:71~87`).
   제품 화면은 그 칸을 보내지 않으므로(`stores/producer-store.ts:858~870`) 기본값인 구글 계열이 쓰이고,
   따라서 고정이 걸린다. 누가 요청 본문에 다른 회사 모델을 실어 보내면 세 단계가 통째로 그쪽으로 간다 —
   이건 "예전 경로로 샌다"가 아니라 호출자의 명시적 덮어쓰기다.
2. **장면 단계의 재생성(교정) 호출 2종은 검색을 켜지 않는다**(`s3_scenes.ts:304`, `s3_scenes.ts:330`).
   설계상 접지 대상이 아니므로 축 기본 모델을 그대로 쓴다. 기록 집계에서 이 둘은 검색 호출로 세지 않았다
   (프롬프트에 붙는 대괄호 지시문으로 걸러냈고, 커밋 이후 구간에는 실제로 한 건도 없었다).
3. **표본이 작다.** 세 단계 각 4건, 하루치다. 커밋 이후 실행 자체가 그만큼밖에 없었다.

## 부록 — 인용한 자리 원문

<details>
<summary>모델 이름을 실제로 정하는 곳</summary>

`src/lib/writer/llm/gemini.ts:66`
```ts
const GROUNDING_MODEL = 'gemini-3-flash-preview';
```

`src/lib/writer/llm/gemini.ts:73`
```ts
const modelName = opts.webSearch ? GROUNDING_MODEL : (opts.modelName ?? 'gemini-3.6-flash');
```

`src/lib/writer/llm/gemini.ts:86` — 검색 도구를 실제로 붙이는 유일한 줄
```ts
...(opts.webSearch ? ({ tools: [{ googleSearch: {} }] } as never) : {}),
```

`src/lib/writer/llm/gemini.ts:116~117` — 검색이 조용히 안 붙었을 때의 경고
```ts
if (opts.webSearch && !(result.response.candidates?.[0] as { groundingMetadata?: unknown } | undefined)?.groundingMetadata) {
  console.warn(`[gemini] webSearch 요청됐으나 접지 미발화 (model=${modelName}, groundingMetadata 부재)`);
}
```
</details>

<details>
<summary>검색을 켜는 네 자리</summary>

`src/lib/writer/pipeline/stages/s0_dramaturgy.ts:108~111`
```ts
const result = await generateJson<Dramaturgy>(userPrompt, axisConfig, {
  ...
  webSearch: true, // #p4-websearch: 메커니즘 조사 — 실존 절차/사례 접지
```

`src/lib/writer/pipeline/stages/s1_structure.ts:78~81`
```ts
const result = await generateJson<NarrativeStructure>(userPrompt, axisConfig, {
  ...
  webSearch: true, // #p4-websearch: 스토리 축 — 오마쥬/실존 레퍼런스 접지
```

`src/lib/writer/pipeline/stages/s3_scenes.ts:280~283`
```ts
const result = await generateJson<Scenes>(userPrompt, axisConfig, {
  ...
  webSearch: true, // #p4-websearch: 스토리 축 — 오마쥬/실존 레퍼런스 접지
```

`src/lib/writer/pipeline/stages/s1s3_merged.ts:168`
```ts
const raw = await generateJson<MergedRaw>(user, axisConfig, { systemInstruction: system, temperature: 0.7, webSearch: true, schema: MergedRawSchema });
```

병합 게이트 스위치 — `src/lib/writer/pipeline/steps.ts:332`
```ts
if (process.env.WRITER_MERGE_S1S3 === '1') {
```

범위 밖 — `src/app/api/produce/chat/route.ts:160`
```ts
{ webSearch: true, imageUrls: attachments.urls },
```
</details>

<details>
<summary>축 설정이 흘러가는 길</summary>

- 기본값: `src/lib/writer/llm/dispatch.ts:24~28` — 이야기 축 = 구글 계열, 검증 축 = 앤트로픽 계열
- 요청 본문의 덮어쓰기 수용: `src/app/api/writer/start/route.ts:112, 117, 239`
- 덮어쓰기 병합: `src/lib/writer/pipeline/index.ts:71~87` (`resolveModels`)
- 제품 화면의 실제 요청 본문: `src/stores/producer-store.ts:858~870` — `models` 칸 없음
- 단계별 축 전달: `src/lib/writer/pipeline/steps.ts:317, 339, 350, 360` / `src/lib/writer/pipeline/index.ts:194, 199, 200`
</details>

<details>
<summary>기록 조회 방법</summary>

- 표: `llm_calls` (쓰는 곳 `src/lib/writer/llm/archive-calls.ts:64`, 단계 이름은 `logger.flushRawLlm(...)` 인자)
- 자른 시각: 2026-08-12T06:08:59Z (커밋 `b964a35` 의 작성 시각)
- 조회 스크립트: `query-llm-calls.mjs` (커밋 이후) · `query-before.mjs` (커밋 이전 대조군).
  둘 다 읽기 전용이며 원자료는 `db-raw.json` · `db-before.json` 에 그대로 저장돼 있다.
- 재생성(교정) 호출은 프롬프트에 붙는 `[규칙 위반` · `[시간 예산 위반` 표지로 걸러 검색 호출과 분리했다.
</details>
