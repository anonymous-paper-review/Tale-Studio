# 올린 그림으로 그림체를 정하면 딸려오던 보호 장치가 사라지는가 — 조사 결과

- 티켓: `audit-upload-anchor-missing-fields`
- 실행: 2026-08-16 밤 (코드 읽기 + 읽기 전용 조회 — 그림·영상 생성 0건, 모델 호출 0건, 지출 0원)

## 한 줄 판정

**가설 성립.** 카드로 골랐다면 받았을 보호 장치를 못 받는 자리가 **4곳**이다.
발동한 판정선 원문:

> **판정선**: "다른 결과"로 분류된 자리가 **1곳 이상**이면 가설 성립 — 그 목록이 산출이다.
> **0곳이면 기각.**

4곳은 1곳 이상이므로 성립한다. "판단 불가"로 남은 자리는 **0곳**이다.

## 먼저 — 티켓이 깔고 있던 전제 하나가 사실과 다르다

티켓은 *"카드 쪽에도 원래 비어 있는 값이 있다 (일부 그림체는 보정 문구가 의도적으로 비어 있다)"*
를 전제로 깔고, 그런 자리는 피해 없음으로 세라고 했다. **라이브 조회 결과 그 전제는 지금 거짓이다.**

카탈로그 **12행 전부 살아 있고, 12행 전부 보정 문구를 갖고 있다 (12/12)**. 비어 있는 행은 0개다.
코드 주석(`style-anchor.ts` 해석 결과 정의 근처)도 아직 *"역사극·공포는 비어 있다"* 라고 말하는데,
그 주석 역시 지금 데이터베이스와 어긋난다. 문구가 나중에 전 항목에 채워진 것으로 보인다.

이 사실이 판정을 바꾼다. 보정 문구가 빠지는 자리는 "카드도 종종 그러니 피해 없음"이 **아니라**
"어떤 카드도 그 분기로 떨어지지 않는다 = 올린 그림만 떨어지는 분기"가 된다.

## 필드 대조표 — 카드 경로 vs 올린 그림 경로

그림체 해석 결과 덩어리에 들어갈 수 있는 값은 **7개**다.

| # | 값 | 무엇인가 | 카드로 고르면 | 그림을 올리면 |
|---|---|---|---|---|
| 1 | 이름표 | 이 그림체의 정체성 | 채운다 | **채운다** |
| 2 | 그림 주소 | 참조로 넣을 그림 | 채운다 | **채운다** |
| 3 | 매체 | 만화인지 실사인지 3D인지 | 채운다 (12/12) | **비운다** |
| 4 | 보정 문구 | 이 그림체 전용 검증된 문장 | 채운다 (12/12) | **비운다** |
| 5 | 미리보기 병행 여부 | 예시 그림을 2번째 참조로 같이 넣을지 | 채운다 (참=2, 거짓=10) | **비운다** |
| 6 | 미리보기 주소 | 그 예시 그림 | 채운다 | **비운다** |
| 7 | 앵커 종류 | 매체형인지 서브룩형인지 | 채운다 (매체형 6, 서브룩 6) | **비운다** |

카드만 채우는 값은 **5개**(3~7). 티켓이 적은 그대로다.

주목할 점: **매체 값은 올린 그림 쪽에도 실제로 저장돼 있다.** 이 프로젝트의 프로젝트 행에는
`medium: "2d_anime"` 가 분명히 들어 있다. 업로드 저장 경로가 매체를 사용자에게 받아 검증까지 하고
저장한다. 그런데 **그림체를 푸는 해석기가 그 값을 도로 버린다** — 이름표와 그림 주소 두 개만
돌려주고 매체는 안 싣는다. 값이 없어서 못 쓰는 게 아니라, 있는 값을 중간에서 떨어뜨리는 것이다.

## 소비 자리 전수 — 12곳 (티켓이 적은 9곳 + 새로 찾은 3곳)

티켓의 사전 조사는 라우트 3개에서 9곳을 셌다. 다시 세어 보니 **그림체 적용 함수 자신이 세 자리에서
같은 값들을 읽는다** — 이건 사전 조사가 놓친 자리다. 게다가 이 자리들이 제일 넓게 쓰인다
(인물 그림·배경 그림·단일 그림 주문이 전부 이 함수를 지난다).

| # | 자리 | 읽는 값 | 비면 어디로 떨어지나 | 분류 |
|---|---|---|---|---|
| 1 | 적용 함수 — 2참조 판정 | 미리보기 병행 여부·주소 | 1참조 모드 | 피해 없음 |
| 2 | **적용 함수 — 보정 문구 줄** | 보정 문구 | **문구 줄이 통째로 빠진다** | **다른 결과** |
| 3 | 적용 함수 — 참조 배열 | 미리보기 주소 | 미리보기 안 넣음 | 피해 없음 |
| 4 | **그림판 주문 — 보정 문구** | 보정 문구 | **문구 항목이 빠진다** | **다른 결과** |
| 5 | 그림판 주문 — 그레이드 권위 | 앵커 종류 | 매체형과 동일 | 피해 없음 |
| 6 | 그림판 주문 — 스타일 참조 개수 | 미리보기 병행 여부·주소 | 1로 고정 | 피해 없음 |
| 7 | 그림판 주문 — 참조 배열 | 미리보기 주소 | 미리보기 안 넣음 | 피해 없음 |
| 8 | 묶음 주문 — 2참조 판정 | 미리보기 병행 여부·주소 | 1참조 모드 | 피해 없음 |
| 9 | **묶음 주문 — 보정 문구** | 보정 문구 | **문구 항목이 빠진다** | **다른 결과** |
| 10 | 묶음 주문 — 그레이드 권위 | 앵커 종류 | 매체형과 동일 | 피해 없음 |
| 11 | 묶음 주문 — 참조 배열 | 미리보기 주소 | 미리보기 안 넣음 | 피해 없음 |
| 12 | **영상 주문 — 카메라 장비 억제** | 매체 | **억제 안 함 (장비 문구 그대로 나감)** | **다른 결과** |

**다른 결과 4곳 · 피해 없음 8곳 · 판단 불가 0곳.**

### 왜 그렇게 분류했나

**피해 없음 (8곳)** — 카드 12장 중 상당수가 **똑같은 분기로 떨어진다**. 미리보기 병행은 12장 중
**10장이 거짓**이고, 앵커 종류는 12장 중 **6장이 매체형**이라 그레이드 권위 판정이 동일하게 떨어진다.
게다가 올린 그림에는 "예시 그림"이라는 개념 자체가 없다(참조로 쓸 그림이 곧 그 그림이다).
카드 해석기 자신도 앵커 종류가 없으면 매체형으로 기본값을 준다 — 올린 그림은 코드가 스스로 선언한
기본 분기에 그대로 앉는 것이다.

**다른 결과 — 보정 문구 (3곳)** — 카드 12장이 **전부** 문구를 갖고 있으므로, 문구 없는 분기로
떨어지는 것은 올린 그림뿐이다. 세 자리 모두 "문구가 있으면 한 줄 넣고 없으면 아무것도 안 넣는다"
형태라, 결과는 문구 한 줄이 주문서에서 사라지는 것이다.
다만 정직하게 덧붙인다: 보정 문구는 그 그림체를 **실제로 재어 보고 만든 문장**이다. 임의로 올린
그림에는 재어 본 적이 없으니 원래 존재할 수 없는 값이다. 즉 이 3곳은 "있는 걸 흘리는" 고장이
아니라 "만들 방법이 아직 없는" 빈자리다. 다음 자리와는 성격이 다르다.

**다른 결과 — 매체 (1곳, 성격이 다르다)** — 여기는 **값이 있는데 도달을 못 한다**. 게다가 끊긴
곳이 두 군데다.
1. 영상 경로는 프로젝트 행을 읽을 때 **올린 그림 칸을 아예 안 가져온다**.
2. 그리고 **카탈로그 전용 조회**로 그림체를 찾는다. 올린 그림의 이름표(`custom_` 으로 시작)는
   카탈로그 12행 어디에도 없다(라이브 조회로 확인) → 아무것도 못 찾고 "그림체 없음"이 된다.

둘 중 하나만 있어도 매체는 도달하지 못한다. 결과: 이 프로젝트의 매체가 만화(`2d_anime`)인데
**억제 판정이 거짓**으로 떨어져 영상 주문서에 실사 카메라 장비 문구가 그대로 실린다.
이건 지난달 실제 사고(3D 애니메이션 프로젝트에 실사 촬영 지시)를 막으려고 넣은 바로 그 장치다.
카드로 골랐다면 매체가 실사가 아닌 카드 5장은 전부 억제가 걸린다.

### 티켓이 "직접 확인하라"고 못 박은 자리

티켓은 영상 경로에 대해 *"'다른 결과'로 단정하지 말고 코드를 열어 직접 확인할 것"* 이라고 했다.
열어서 확인했다. 단정이 아니라 **두 겹으로 끊겨 있음을 코드 원문으로 확인**했고, 위에 그 원문을
부록에 실었다.

### 매체가 쓰이는 또 다른 자리 — 검사했고 이상 없음

티켓이 좌표로 준 "매체가 쓰이는 또 다른 자리(비면 실사로 간주하는 기본값)"도 열어 봤다.
**여기는 다른 덩어리를 읽는다.** 작가 파이프라인은 그림체 해석기를 쓰지 않고 **자기 나름의 조회를
따로 돌리는데, 그 조회는 올린 그림 칸을 제대로 읽어 매체와 이름표를 챙긴다.** 코드에 그 이유까지
주석으로 적혀 있다("여기서 매체를 안 채우면 매체를 지어낸다"). 그래서 이 자리는 **피해 없음**이고,
애초에 그림체 해석 결과를 읽는 자리도 아니다.

역설적인 그림이 나온다: **글 쪽 파이프라인은 올린 그림의 매체를 제대로 챙기는데, 영상 쪽은 못 챙긴다.**
같은 값을 두 곳이 서로 다른 방식으로 조회하고 있다.

---

## 부록 — 좌표와 원문 (코드 이름·경로)

<details>
<summary>펼치기</summary>

### 해석 결과 덩어리 정의 — `src/lib/style-anchor.ts:52` `ResolvedStyleAnchor`

```ts
export interface ResolvedStyleAnchor {
  key: string
  imageUrl: string
  medium?: string | null
  styleClause?: string | null
  usePreviewRef?: boolean
  previewUrl?: string | null
  anchorKind?: string | null
}
```

올린 그림 경로 — `src/lib/style-anchor.ts:188` `resolveStyleAnchor(project)`:

```ts
  const custom = parseCustomStyleAnchor(project.custom_style_anchor)
  if (custom) {
    return { key: project.style_anchor_key ?? 'custom', imageUrl: custom.url }
  }
```

`parseCustomStyleAnchor` (`:164`) 는 `{ url, label, medium }` 셋을 파싱해 돌려주는데,
`resolveStyleAnchor` 가 `medium` 을 옮겨 담지 않는다.

카드 경로 — `src/lib/style-anchor.ts:201` `resolveStyleAnchorByKey(key)` 는
`style_anchors` 에서 `key, image_url, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind`
를 읽어 7개를 전부 채운다(`:226-234`).

### 소비 자리 12곳 좌표

| # | 파일 | 줄 | 원문 |
|---|---|---|---|
| 1 | `src/lib/style-anchor.ts` | 114 | `const twoRef = !!(anchor.usePreviewRef && anchor.previewUrl && mode !== 'turnaround')` |
| 2 | `src/lib/style-anchor.ts` | 124 | `const styleClauseLine = anchor.styleClause?.trim() ? \`\n${anchor.styleClause.trim()}\` : ''` |
| 3 | `src/lib/style-anchor.ts` | 133 | `...(twoRef ? [anchor.previewUrl as string] : [])` |
| 4 | `src/app/api/director/generate-storyboard/route.ts` | 139 | `styleClause: anchor?.styleClause ?? null,` |
| 5 | 〃 | 140 | `anchorKeepsGrade: anchor?.anchorKind === 'sublook',` |
| 6 | 〃 | 141 | `styleRefCount: anchor?.usePreviewRef && anchor.previewUrl ? 2 : 1,` |
| 7 | 〃 | 150 | `...(anchor?.usePreviewRef && anchor.previewUrl ? [anchor.previewUrl] : []),` |
| 8 | `src/app/api/director/generate-storyboard-batch/route.ts` | 146 | `const anchorTwoRef = !!(anchor?.usePreviewRef && anchor.previewUrl)` |
| 9 | 〃 | 153 | `styleClause: anchor?.styleClause ?? null,` |
| 10 | 〃 | 154 | `anchorKeepsGrade: anchor?.anchorKind === 'sublook',` |
| 11 | 〃 | 161 | `...(anchorTwoRef ? [anchor!.previewUrl as string] : []),` |
| 12 | `src/app/api/director/generate-video/route.ts` | 498 | `const suppressGear = !!(videoAnchor?.medium && videoAnchor.medium !== 'live_action')` |

1·2·3 이 사전 조사(9곳)가 놓친 자리다.
화면 표시용 제외: `src/features/producer/style-anchor-picker.tsx:44·47·63·65`,
`src/stores/producer-store.ts:157-158·564·581` (클라 픽커가 `style_anchors` 를 직접 읽어 목록을 만든다).

보정 문구가 실제로 빠지는 지점(4·9 의 하류): `src/lib/director/storyboard-strip.ts:196`, `:284`
— 둘 다 `...(hasStyleRef && styleClause ? [\`- ${styleClause}\`] : [])`.

### 영상 경로 — 두 겹 단절 원문

```ts
// src/app/api/director/generate-video/route.ts:411
supabaseAdmin.from('projects').select('workspace_id, style_anchor_key').eq('id', projectId).maybeSingle(),
```
→ `custom_style_anchor` 미포함.

```ts
// src/app/api/director/generate-video/route.ts:495-498
const videoAnchor = await resolveStyleAnchorByKey(
  (project as { style_anchor_key?: string | null }).style_anchor_key ?? null,
).catch(() => null)
const suppressGear = !!(videoAnchor?.medium && videoAnchor.medium !== 'live_action')
```
→ `resolveStyleAnchorByKey` 는 `style_anchors` 를 `key` 로 조회. 업로드 키 `custom_be2890f1-…` 는
그 표에 행이 없다(라이브 확인 `key_exists_in_catalog: false`) → `videoAnchor = null` → `suppressGear = false`
→ `buildVideoPrompt` 에 `cameraPreset` 이 그대로 전달됨(`:503`).

### 매체가 쓰이는 또 다른 자리 — `src/lib/writer/v2/persist.ts:156`

```ts
medium: input.styleAnchor?.medium ?? 'live_action',
```
`input.styleAnchor` 는 `ResolvedStyleAnchor` 가 아니라 `PipelineInput['styleAnchor']`
(`src/lib/writer/types/pipeline.ts:195` — `{ key, label?, medium? }`). 이 값을 채우는 자리는
`src/app/api/writer/start/route.ts:206-216`:

```ts
.select('style_anchor_key, custom_style_anchor')
…
const custom = parseCustomStyleAnchor(proj?.custom_style_anchor);
if (custom) {
  styleAnchor = { key: …, label: custom.label ?? undefined, medium: custom.medium ?? undefined };
}
```
→ 업로드 앵커의 매체를 정상적으로 싣는다. **피해 없음**, 그리고 그림체 해석 결과를 읽는 자리가 아니다.

### 라이브 조회 원문과 결과

```js
// research/experiments/audit-upload-anchor-missing-fields/probe-catalog.mjs
const { data } = await db.from('style_anchors')
  .select('key, label, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind')
  .order('key')
```

```json
{
  "total_rows": 12, "active_rows": 12,
  "medium_null": 0, "medium_live_action": 7, "medium_non_live_action": 5,
  "style_clause_present": 12, "style_clause_absent": 0,
  "use_preview_ref_true": 2, "use_preview_ref_false_or_null": 10,
  "anchor_kind_sublook": 6, "anchor_kind_media_or_null": 6,
  "mediums": ["2d_anime","2d_cartoon","3d","live_action","stop_motion","watercolor"]
}
```

업로드 앵커 프로젝트 확인:

```json
[{ "id": "a003a8c6-82a1-4b6a-95d6-889a1f57ee08", "title": "webtoon_test",
   "style_anchor_key": "custom_be2890f1-cecc-4f50-8e79-562f3e68efd6",
   "key_exists_in_catalog": false,
   "custom_medium": "2d_anime", "custom_label": "선명한 선화 셀 셰이딩 판타지" }]
```

DB 는 select 만 했다. insert/update/delete/upsert 는 한 줄도 없다.

### 옛 좌표 검증

티켓이 얼려 둔 코드 좌표는 **전부 정확했다** — `style-anchor.ts:52·188·201`,
`generate-storyboard/route.ts:139·140·141·150`, `generate-storyboard-batch/route.ts:146·153·154·161`,
`generate-video/route.ts:495·498`, `writer/v2/persist.ts:156`, 카탈로그 12종.
**틀린 것은 좌표가 아니라 전제였다**: "일부 그림체는 보정 문구가 의도적으로 비어 있다"는
라이브에서 거짓(12/12 존재). 사전 조사가 센 소비 자리 9곳도 3곳 누락이었다(적용 함수 내부).

### 산출 파일

- `probe-catalog.mjs` / `raw-catalog.json` — 카탈로그 12행 + 업로드 앵커 프로젝트 대조
- `results.json` — 이 문서의 분류표

</details>
