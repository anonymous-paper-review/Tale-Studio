# 유저가 올린 그림이 정말 모든 그림 주문에 실렸는가 — 조사 결과

- 티켓: `audit-upload-anchor-order-coverage`
- 실행: 2026-08-16 밤 (읽기 전용 조사 — 그림·영상 생성 0건, 모델 호출 0건, 지출 0원)
- 대상 프로젝트: `webtoon_test` (사용자가 직접 올린 그림을 기준 그림으로 쓴 유일한 프로젝트 —
  라이브 조회로 재확인, 전체 프로젝트 중 1건)

## 한 줄 판정

**가설 성립.** 기준 그림이 이미 존재하던 시점 이후에 나간 그림 주문 **12건**이 기준 그림 없이 나갔다.
발동한 판정선 원문:

> **판정선**: 경계선 이후에 만들어졌고, 제출 코드가 기준 그림 적용 함수를 부르는 종류인데,
> 참조 배열에 기준 그림 주소가 없는 주문이 **1건이라도** 있으면 가설 성립

12건은 1건 이상이므로 성립한다.

## 숫자

주문 기록 전체를 뽑았다. **20건 중 4건**에만 기준 그림이 실려 있었고 **16건**은 실리지 않았다.
전부 완료 상태다.

| 주문 종류 | 전체 | 기준 그림 실림 | 안 실림 | 경계선 이후 · 안 실림 |
|---|---|---|---|---|
| 인물 그림 | 8 | 1 | 7 | **6** |
| 배경 그림 | 9 | 3 | 6 | **6** |
| 배치용 밑그림 | 3 | 0 | 3 | 0 (경계선 이전 + 원래 안 붙이는 종류) |
| 합계 | 20 | 4 | 16 | **12** |

경계선은 기준 그림을 실은 주문 중 가장 이른 것의 시각으로 잡았다 —
**2026-08-13 07:43:31.615** (인물 그림). 이 시각에는 기준 그림이 이미 존재했음이 기록으로 확정된다.

### 종류별로 "붙여야 하는 종류"인지 코드로 판별한 결과

| 종류 | 제출하는 코드가 기준 그림 적용 함수를 부르는가 | 판정 |
|---|---|---|
| 인물 그림 | 부른다 (버튼 경로·자동 초안 경로 둘 다) | 붙여야 함 |
| 배경 그림 | 부른다 (제출 함수 안에서) | 붙여야 함 |
| 배치용 밑그림 | **부르지 않는다** — 그 경로 전체에 기준 그림을 언급하는 줄이 한 줄도 없다 | 안 붙이는 종류 |

배치용 밑그림 3건은 두 겹으로 제외된다: 경계선보다 이르고, 애초에 기준 그림을 안 붙이는 종류다.
티켓이 깔았던 전제("배치용 밑그림은 원래 안 붙이는 설계일 수 있다")가 코드로 확인됐다.

또 하나: 경계선보다 **0.28초 앞선** 인물 그림 1건도 기준 그림 없이 나갔지만, 경계선 규칙에 따라
세지 않았다(그 시점에 기준 그림이 있었다고 기록으로 단정할 수 없으므로).

## 안 실린 12건이 정확히 무엇인가

**인물 그림 6건 — 2026-08-14 09:27, 전부 자동 파이프라인이 낸 주문**
참조 그림이 딱 하나(인물 시트 서식)뿐이고 기준 그림은 없다. 주문 기록에 남은 기준 그림 이름표도 비어 있다.

**배경 그림 6건 — 2026-08-13 07:45~07:52, 전부 화면 조작으로 낸 주문**
참조 그림이 아예 0개다. 흥미로운 점: 같은 장소에 대해 기준 그림을 실은 주문과 안 실은 주문이
몇 초~몇십 초 간격으로 나란히 있고, **머리말을 걷어낸 프롬프트 본문이 글자 단위로 동일**하다
(장소 3곳 모두 확인). 같은 문장을 같은 조립기가 만들었는데 한쪽에만 기준 그림이 붙은 것이다.

## 어디서 흘렸는가

**흘린 지점은 특정됐다.** 기준 그림을 찾는 함수가 두 종류인데, 그중 **카탈로그만 뒤지는 쪽**이
문제다. 사용자가 올린 그림의 이름표는 `custom_` 으로 시작하는 임시 이름인데, 이 이름은
그림체 카탈로그 표에 **행이 없다**(라이브 조회로 확인 — 카탈로그 12행 어디에도 없음).
그래서 카탈로그만 뒤지는 함수는 아무것도 못 찾고 "기준 그림 없음"을 돌려주고,
그 뒤 기준 그림 적용 함수는 아예 불리지 않는다. 주문 기록의 기준 그림 이름표가
12건 전부 비어 있는 것이 그 흔적이다.

**언제 흘렸는지도 기록으로 잡힌다.** 인물 그림 6건이 참조로 쓴 서식 그림 주소가
앱 주소 형태(`…vercel.app/character-template.png`)다. 지금 코드는 이 서식을 스토리지에서
가져오고(주소 형태가 다르다), 앱 주소로 가져오던 것은 **옛 코드**다. 기준 그림을 실은 인물 그림
1건은 반대로 스토리지 주소를 쓴다. 즉 **기준 그림이 빠진 주문과 옛 코드가 정확히 같은 편**에 있다.

**지금 코드는 어떤가.** 그림 주문을 내는 네 통로(인물 버튼·인물 자동초안·배경 버튼·배경 자동초안)는
현재 전부 **프로젝트 행을 먼저 보는 쪽** 함수를 쓰고, 프로젝트 조회에 올린 그림 칸도 포함한다.
이 전환은 2026-08-15 12:37 커밋에서 일어났고, **기록에 남은 20건은 전부 그 이전**이다.
따라서 이 12건을 만든 그 구멍은 지금 코드에서는 막혀 있는 것으로 읽힌다.

**확인 못 함 (추측하지 않고 남기는 것)**
- 배경 그림 6건이 왜 같은 분 안에서 다른 결과를 냈는지는 기록만으로 못 정한다.
  같은 시간대에 두 벌의 코드가 동시에 살아 있었던 것으로 보이지만, 배경 그림 쪽에는
  인물 그림의 서식 주소 같은 판별 표식이 없다.
- **수리 이후 실제로 실리는지는 이 조사가 확인하지 않았다.** 올린 그림을 쓰는 프로젝트가
  하나뿐인데 그 프로젝트의 마지막 주문이 2026-08-14 이고, 수리는 2026-08-15 이다.
  즉 **수리 이후의 주문 기록이 0건**이라 기록으로 검산할 대상이 아직 없다.
- 코드는 읽기만 했다. 고치지 않았고 실행해 보지도 않았다.

## 옆으로 새지 않게 기록해 두는 것

기준 그림을 찾는 함수 중 **카탈로그만 뒤지는 쪽을 아직 쓰는 자리가 한 곳 남아 있다** —
영상 주문 경로다. 이건 그림 주문이 아니라 형제 티켓(`audit-upload-anchor-missing-fields`)이
다루는 자리이므로 여기서는 세지 않고 넘긴다.

---

## 부록 — 좌표와 원문 (코드 이름·경로)

<details>
<summary>펼치기</summary>

### 조회 원문

```js
// research/experiments/audit-upload-anchor-order-coverage/probe.mjs
const { data: proj } = await db.from('projects')
  .select('id, title, style_anchor_key, custom_style_anchor')
  .eq('id', 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08').maybeSingle()
const anchorUrl = proj.custom_style_anchor.url

const { data: jobs } = await db.from('generation_jobs')
  .select('id, kind, status, created_at, model, provider, input_snapshot, target, actor')
  .eq('project_id', 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08')
  .order('created_at', { ascending: true })

// 실림 판정: input_snapshot.reference_image_urls 배열이 anchorUrl 을 원소로 포함하는가
```

DB 는 select 만 했다. insert/update/delete/upsert 는 한 줄도 없다.

### 프로젝트 행 원문

```json
{
  "id": "a003a8c6-82a1-4b6a-95d6-889a1f57ee08",
  "title": "webtoon_test",
  "style_anchor_key": "custom_be2890f1-cecc-4f50-8e79-562f3e68efd6",
  "custom_style_anchor": {
    "url": "https://qnjnrihfpqkdhjuzvepy.supabase.co/storage/v1/object/public/media/ce053575-…/a003a8c6-…/uploads/v1-272b261b…/s009.jpg",
    "label": "선명한 선화 셀 셰이딩 판타지",
    "medium": "2d_anime"
  }
}
```

### 안 실린 12건 좌표

| 시각 (UTC) | kind | actor | refs | input_snapshot.style_anchor_key |
|---|---|---|---|---|
| 2026-08-13T07:45:40.668 | world_shot | ui | 0 | null |
| 2026-08-13T07:45:46.814 | world_shot | ui | 0 | null |
| 2026-08-13T07:49:12.874 | world_shot | ui | 0 | null |
| 2026-08-13T07:49:15.829 | world_shot | ui | 0 | null |
| 2026-08-13T07:52:25.062 | world_shot | ui | 0 | null |
| 2026-08-13T07:52:30.782 | world_shot | ui | 0 | null |
| 2026-08-14T09:27:50.819 | character_view | writer | 1 | null |
| 2026-08-14T09:27:53.056 | character_view | writer | 1 | null |
| 2026-08-14T09:27:54.101 | character_view | writer | 1 | null |
| 2026-08-14T09:27:55.066 | character_view | writer | 1 | null |
| 2026-08-14T09:27:55.201 | character_view | writer | 1 | null |
| 2026-08-14T09:27:55.639 | character_view | writer | 1 | null |

경계선 = `2026-08-13T07:43:31.615707+00:00` (character_view, `style_anchor_key = custom_be2890f1-…`).
경계선 직전 제외분 = `2026-08-13T07:43:31.335862+00:00` (character_view, anchor 없음).

### 흘린 통로 — 원문

옛 코드(커밋 `e9997a2` 이전, 2026-08-15 12:37 이전):

```ts
// src/app/api/artist/generate-world/route.ts
-      .select('workspace_id, style_anchor_key')
-    const anchor = await resolveStyleAnchorByKey(project.style_anchor_key)
```

```ts
// src/lib/artist/draft-trigger.ts (인물·배경 자동 초안 둘 다)
-        .select('design_tokens, workspace_id, style_anchor_key')
-    const anchor = await resolveStyleAnchorByKey(project?.style_anchor_key)
-        const base = resolveWebhookBaseUrl()
-        const templateUrl = isPerson && base ? `${base}/character-template.png` : null
```

`resolveStyleAnchorByKey` 는 `src/lib/style-anchor.ts:201` — `style_anchors` 표를 `key` 로 조회한다.
업로드 앵커 키(`custom_<uuid>`)는 그 표에 행이 없다 → `maybeSingle()` 이 null → 함수가 null 반환 →
`applyStyleAnchor` 미호출 → `reference_image_urls` 에 앵커 URL 없음 + `style_anchor_key: null`.

현재 HEAD (커밋 `e9997a2` 이후) — 그림 주문 4통로 전부 전환됨:

| 통로 | 파일·줄 | 현재 호출 |
|---|---|---|
| 인물 버튼 | `src/app/api/artist/generate-sheet/route.ts:128, :140, :227-228` | `resolveStyleAnchor(project)` + `custom_style_anchor` select |
| 인물 자동초안 | `src/lib/artist/draft-trigger.ts:85, :101, :148-149` | 〃 |
| 배경 버튼 | `src/app/api/artist/generate-world/route.ts:76, :80` → `src/lib/artist/world-submit.ts:26` | 〃 |
| 배경 자동초안 | `src/lib/artist/draft-trigger.ts:223, :229, :248` → `world-submit.ts:26` | 〃 |

배치용 밑그림 제출 경로: `src/app/api/writer/rough-storyboard/route.ts:461`
(`grep -n "styleAnchor\|style_anchor\|anchor" ` 결과 0줄 — 앵커를 전혀 참조하지 않는다).

남은 카탈로그 전용 조회 1곳(형제 티켓 소관): `src/app/api/director/generate-video/route.ts:411, :495`.

### 옛 좌표 검증

티켓에 얼려 둔 좌표 중 **틀린 것은 없었다**. 심볼로 다시 찾은 결과 전부 그 줄에 그대로 있었다:
`style-anchor.ts:188` · `generate-sheet/route.ts:227·228` · `world-submit.ts:26` ·
`draft-trigger.ts:148·149` · `generate-storyboard/route.ts:160`.
한 가지 미세한 어긋남: 티켓이 "배치 경로가 참조 배열을 손으로 조립한다"며 적은
`generate-storyboard-batch/route.ts:161` 은 배열 리터럴의 마지막 줄이고, 앵커 이미지가 들어가는
줄은 `:160` 이다(같은 배열 안이라 실용상 무해).

### 산출 파일

- `probe.mjs` / `raw.json` — 주문 20건 전수 + 프로젝트 행
- `probe-targets.mjs` / `raw-targets.json` — 주문별 target · 스냅샷 키 목록
- `probe-prompt-diff.mjs` / `raw-prompt-diff.json` — 같은 대상끼리 프롬프트 본문 대조
- `results.json` — 이 문서의 숫자

</details>
