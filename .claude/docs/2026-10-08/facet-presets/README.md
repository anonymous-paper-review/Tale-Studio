# 스타일 프리셋 facet 인계 — 12종 고성능 추출 결과와 제품 배선 안내 (2026-10-08)

> 누가 읽나: 제품을 고치는 **다른 세션**(facet을 제품에 넣는 일)과 오너. 이 폴더는 추출 세션의 산출물과 그 산출물을 제품이 쓰는 방법을 적은 인계 패키지다. 추출 세션은 제품 코드(`src/`)를 건드리지 않았다.
>
> 한 줄 요약: 제품이 제공하는 스타일 12종(`style_anchors` 활성 행 12개) 전부에 대해 **고성능 판 facet**(리프 309, VLM = gpt-6-astra)을 뽑아 `presets/<key>/`에 두었고, 같은 콘텐츠로 **현행 제품 프롬프트 · facet 프롬프트 · 둘을 합친 프롬프트**를 생성 비교한 페이지를 발행했다(https://claude.ai/artifact/3ASfQfpBFkAi6SoKpSdsra). 1차 기계 판정의 결론: **facet 조각은 현행 손글씨 절을 대체하지 못하고 보강한다 — 캐릭터는 '둘 다'가 최선(4.25 vs 현행 4.0 vs facet 3.4)**, 액션은 현행이 8/12로 더 가까웠다. **오너 결정: 제품은 '둘 다'로 간다.** 12종 전부 인물 보조 보드를 만들어 다시 뽑았다(v2 — 둘 다가 캐릭터 최선 10/12 · 액션 7/12; §7.1). 제품은 v2 산출물을 쓴다. 유저가 올린 이미지는 **경량 판**(Sonnet 직접 호출, 추출 1.5분 + 생성 2분)으로 같은 조각을 만들 수 있고 참조 구현은 `lite/facet_lite_extract.py`다(같은 12장으로 검증).

## 0. 읽는 순서

1. §1 두 모드가 무엇인지 → 2. §3 산출물 형식 → 3. §4 조립 규칙(제품이 구현할 것) → 4. §5 저장 제안 → 5. §6 경량 모드 절차 → 6. §8 결정이 필요한 것.
결과 페이지(그림 포함): §7의 링크. 로컬 실험 폴더(`dev/Image_Style/facet_presets/`, git 밖)에는 원본 Codex 통신 기록·검사 보고·생성 로그가 전부 남아 있다.

## 1. 두 모드

| | 고성능 판 (이 폴더 `presets/`) | 경량 판 (이 폴더 `lite/`) |
|---|---|---|
| 서식 | `scaffolds/facet-template-v1.2.jsonc` (리프 309, 수치 측정) | `scaffolds/facet-template-lite-v0.1.jsonc` (리프 96, 수치 대신 등급) |
| 언제 | 프리셋 12종 — **미리** 뽑아 DB에 넣는다(이번에 완료) | 유저가 올린 이미지 — **동의가 있을 때 그때** 뽑는다 |
| 모델 | 채움 gpt-6-astra high(Codex, 그림 첨부) · 컴파일 gpt-5.6-sol high · 우선순위 줄 gpt-5.6-sol medium | Claude Sonnet 5.5 API 직접 호출 2번(채움 + 컴파일, 우선순위 줄은 컴파일에 포함) |
| 시간 | 스타일당 추출 25~42분, 평균 32분(채움 11~17 + 컴파일 8~24 + 우선순위 1) | 채움 52~76초 + 컴파일 25~35초 = **약 1.5분**, 생성 2분을 더해 끝까지 3~4분 |
| 비용 | Codex 구독(크레딧 0) | 토큰 — 채움 입력 1.4만·출력 0.5~1만, 컴파일 입력 0.7만·출력 0.1~0.5만 (이미지당 합계 약 2.2만 입력 · 1~1.5만 출력) |
| 산출 | `filled.json` + `prompts.md`(CAPSULE·NEGATIVE·SCENE·PROBE_ANCHORS·COVERAGE·FIGURE) + `priority.md`(PRIORITY + 방향어 FIGURE) | `filled.json` + `prompts.md`(PROBE_ANCHORS·FIGURE·PRIORITY·NEGATIVE·SCENE) + `fragments.json` |
| 인물 표본이 없을 때 | 인물 가지 `[해당 없음]` → 컴파일 FIGURE = `none`(인물 절 없음) | `[EXTRAPOLATED]` 외삽 문단(관찰된 선·채움 문법만, 41~104단어) + `figure_extrapolated: true` |

두 판 모두 제품이 실제로 쓰는 것은 **조각 4개**다: `probe_anchors`(앵커 이미지가 못 나르는 값만 담은 압축 캡슐), `figure`(이 스타일이 인물을 그리는 법, 방향어 포함), `priority`(Core 순서의 우선순위 한 줄), `negative`(Avoid 한 문장). 확정 레시피(R1c, 2026-10-02 오너 확정)는 **앵커 이미지 참조 + 이 조각들**이다. 템플릿만으로 재생성하는 길(T 장면)은 폐지됐으므로 CAPSULE·SCENE은 제품에 싣지 않는다(기록용).

근거 문서(정본, 커밋됨): `.claude/skills/artist-style-anchor/SKILL.md` 단계 5(레시피) · `scaffolds/facet-template-v1.2.guide.md` §6(컴파일 규칙, 36항) · `scaffolds/facet-compile-priority.md`(우선순위 줄) · `scaffolds/facet-template-lite-v0.1.guide.md`(경량 판 규칙·스펙 부록 A/B·실행 메모 C) · `scaffolds/CHANGELOG.md`.

## 2. 이 폴더

```
README.md                      ← 이 문서
presets/index.json             ← 12종 한 파일: key → assembly('both') + facets(v2 = 인물 보드 판: 조각 4개·단어 수·인물 출처·시간·모델) + facets_v1 + style_clause_current + lite (제품 시드용)
presets/<key>/filled.json      ← 고성능 facet 전문(리프 309, 한국어 값 + 신뢰도 태그)
presets/<key>/scene_summary.md ← 앵커 그림의 내용 요약(스타일 아님, 기록용)
presets/<key>/prompts.md       ← 컴파일 산출(CAPSULE / NEGATIVE / SCENE / PROBE_ANCHORS / COVERAGE / FIGURE)
presets/<key>/priority.md      ← PRIORITY 줄 + 방향어를 붙인 FIGURE (제품은 prompts.md의 FIGURE 대신 이것을 쓴다)
presets/<key>/assembled/{facet_character,facet_action,both_character,prod_character,prod_action}.txt ← 생성 테스트에 실제로 보낸 프롬프트 전문(both = 현행 절 + facet 조각)
presets/<key>/lite/{filled.json,prompts.md,fragments.json} ← 같은 앵커를 경량 판으로 뽑은 것(비교용)
presets/<key>/board.jpg · board_prompt.txt · v1/ ← (12종 전부) 인물 보조 보드(1024px 축소본, 원본은 로컬 2048px) · 보드를 만든 제품 경로 프롬프트 · 보드 없이 뽑은 첫 결과
lite/facet_lite_extract.py     ← 경량 판 참조 구현(Python, API 직접 호출). 제품(TS)으로 옮길 때 프롬프트 구성·파싱·검증을 그대로 따른다
lite/README.md                 ← 경량 판 호출 계약(입출력·검증·실패 처리) 요약
```

`<key>`는 `style_anchors.key` 그대로: jp_anime · real · real_3d · real_desert_fantasy · real_euro_period · real_hitech_sf · real_jp_melo · real_psy_horror · real_urban_hero · stop_motion · us_cartoon · watercolor.

## 3. 산출물 형식

### 3.1 `filled.json` (고성능)

최상위 키 `입력 · 그림체 · 사진성 · 공간 · 재질 · 인물 · 장식 · 디테일 · 분위기 · 분류 · 생성 규칙`. 값은 한국어 문자열이고 첫 토큰이 신뢰도 태그 `[실측] [추정] [보정] [외삽] [해당 없음]`다. 제품이 직접 읽을 필요는 없다 — 조각은 컴파일이 만든다. 보관하는 이유: 재컴파일(컴파일 규칙이 바뀔 때 그림을 다시 보지 않고 프롬프트만 다시 만든다)과 감사.

주의할 리프: `분류.Core`(없으면 그 그림체로 안 보이는 것, 중요한 순서 — 우선순위 줄의 재료), `생성 규칙.부정 절`(6항: 인접 계열·아티팩트·충돌 기본값·장면 종속·정교화·텍스트/로고 — Avoid 문장의 재료), `입력.표본`(인물 수 — 0이면 고성능 컴파일은 인물 절을 내지 않는다; 경량 판은 외삽 문단을 낸다).

### 3.2 `prompts.md` / `priority.md` → 조각

| 조각 | 출처 | 단어 상한 | 역할 |
|---|---|---|---|
| `probe_anchors` | prompts.md `## PROBE_ANCHORS` | 등급별 70~150 | "Style anchors: …" 로 앵커 이미지 바로 뒤에 싣는 압축 캡슐. 이미지가 못 나르는 값만(투영·선 굵기와 색·채움/그림자·키·팔레트 역할·지면 문법·장식 개수·묘사 예산) |
| `figure` | **priority.md** `## FIGURE` | 상한 없음(고성능) / 150(경량) | "Figure rules: …" — 계열·비례(수치 + 방향어)·눈 절·손/신발/헤어·포즈 경향·표정·피부. 인물이 있는 장면에만 |
| `priority` | priority.md `## PRIORITY` | 35 | "Priority order: a → b → c" 한 줄, 부정 절 바로 앞 |
| `negative` | filled.json `생성 규칙.부정 절` 6항을 하네스가 합친 것(`assembled/*.txt`의 "Avoid …" 줄) | 55 | 인접 계열 → 아티팩트 → 충돌 기본값 → 장면 종속 → 정교화 → 텍스트/로고 순 |

`presets/index.json`에 네 조각이 이미 조립된 문자열로 들어 있다(`figure`가 빈 문자열이면 인물 절 없음 — 12종 중 real_3d만 667단어의 인물 절이 있다; 경량 판 조각은 `lite` 아래, `[EXTRAPOLATED]` 토큰은 뺐고 `figure_extrapolated`로 표시). `style_clause_current`에 현행 손글씨 절을 함께 넣었다.

## 4. 조립 규칙 — 제품이 구현할 것

현행 `applyStyleAnchor`(`src/lib/style-anchor.ts`)는 `역할 문장(STYLE_ANCHOR_CLAUSE) + style_clause + 매체어를 걷어낸 본문`에 참조 `[앵커(, 프리뷰)]`를 붙인다. facet 조각이 있는 앵커는 아래 순서로 조립한다(사이클 5~10과 이번 테스트에서 실제로 보낸 형태, `presets/<key>/assembled/facet_*.txt`가 실행례).

```
1  STYLE REFERENCE — the reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subjects, characters, faces, hairstyles, costumes, logos, text, layout or any identifiable motif.
1b {style_clause — 현행 손글씨 절, 있으면 그대로 (오너 결정 "둘 다")}
2  Style anchors: {probe_anchors}
3  {본문 — 장면·인물 콘텐츠. 매체어 스크럽은 지금처럼}
4  Plain, fully specified surfaces: flat ground and backdrop as described, no borrowed patterns; accessories, footwear and sky or backdrop marks only as described.
5  Figure rules: {figure} These eye traits describe the relaxed face; when the scene calls for an expression, the expression sets the lid opening and corner angle and takes priority over these defaults, while the iris rendering, the single catchlight (kept even when the eye is narrowed or angry) and the outline colour stay as described.
6  {priority}
7  {negative}
8  No text, no letters, no logo, no watermark. {비율}
```

- 5·6은 **인물이 있는 장면에만**(캐릭터 시트·인물 컷). 배경·사물만 있는 장면은 1·1b·2·3·4·7·8. 1b는 현행 `style_clause`가 있는 스타일(12종 중 10종)에만 들어간다. 사이클 실측: 무인물 장면에 인물 절을 넣어도 인물이 소환되진 않지만 효과도 없다.
- 5의 표정 우선 문장은 조각 `figure`에 이미 "expression … priority" 문장이 들어 있으면 붙이지 않는다(중복 금지).
- 1의 역할 문장은 현행 `STYLE_ANCHOR_CLAUSE`보다 금지 목록이 길다("faces, hairstyles, costumes, logos, text, layout or any identifiable motif"). 이번 테스트는 이 문장으로 돌렸다. 현행 문장을 유지할지, 이 문장으로 바꿀지는 §8 ③.
- 2-ref 앵커(`use_preview_ref`: watercolor·real_psy_horror)는 현행대로 프리뷰를 두 번째 참조로 두고 1을 2-ref 변형으로 바꾼다. 이번 facet 조건은 앵커 1장만 참조했다(확정 레시피 R1 = 원작 1장). 어느 쪽이 나은지는 페이지의 두 스타일에서 오너가 본다.
- `style_clause`(현행 손글씨 절)와 facet 조각을 **함께** 실을지 **대체**할지는 §8 ①. 이번 테스트는 세 조건을 다 돌렸다 — 현행(style_clause만) · facet(조각만) · 둘 다(역할 문장 바로 뒤에 style_clause, 그다음 `Style anchors: …`; `presets/<key>/assembled/both_character.txt`). 1차 판정은 둘 다를 권한다.
- 턴어라운드 시트(2번째 참조 = 레이아웃 템플릿)에서는 2-ref 변형을 쓰지 않는 현행 규칙이 그대로다. facet 조각은 텍스트라 템플릿 참조와 충돌하지 않는다.
- 매체어: 조각 안의 매체어("photographic", "live-action")는 앵커 쪽 진실이므로 `scrubMediaWords` 대상이 아니다(현행 `style_clause`와 같은 취급). 본문 스크럽은 그대로.

## 5. 저장 제안 (혼자 정한 것 — 되돌리기 쉬움, 다른 세션이 바꿔도 된다)

`style_anchors`에 jsonb 한 칸을 더하는 쪽이 가장 작다:

```sql
alter table public.style_anchors add column if not exists facets jsonb;
-- facets = { "version": "hp-v1.2.3", "extracted_at": "...", "models": {...},
--            "probe_anchors": "...", "figure": "...", "figure_extrapolated": true|false, "priority": "...", "negative": "...",
--            "filled": {...filled.json 전문...} }
```

- 조각 4개는 **문자열로 평탄하게**(런타임이 JSON 깊이를 타지 않도록), `filled`는 재컴파일용 보관.
- `projects.custom_style_anchor`(유저 앵커, jsonb `{url,label,medium}`)에는 같은 모양의 `facets`를 **같은 객체 안에** 넣는다(`version: "lite-v0.1"`). 별도 표를 만들지 않는 이유: 앵커의 정체성이 이미 `style_anchor_key`/`custom_style_anchor` 한 곳에 있어서다(라우트 주석 참고).
- `ResolvedStyleAnchor`에 `facets?: {...}`를 얹고 `applyStyleAnchor`가 있으면 §4, 없으면 현행 경로. 캐시 TTL 5분은 그대로.
- 마이그레이션 → `pnpm db:types` → 시드는 `presets/index.json`에서(개발 DB 먼저, live는 main 배포 뒤 — CLAUDE.md 개발환경 절).

## 6. 경량 모드 — 유저가 올린 이미지

전제: 제품은 이미 외부 이미지를 받고(`isOwnMediaUrl` 화이트리스트, `POST /api/produce/style-anchor`가 `custom_style_anchor`를 쓴다) 업로드 권리 동의 대화상자(`src/components/upload/image-upload-consent.tsx`)가 있다. facet 추출은 **그 이미지를 분석 모델에 보내는 일**이므로 별도 동의가 필요하다 — 문구와 저장 방식(동의 시각·버전)은 §8 ④.

절차(참조 구현 `lite/facet_lite_extract.py`, 실측 2026-10-08):

1. 동의 확인 → 앵커 확정 라우트에서 **비동기 작업**으로 추출을 띄운다(요청 2번, 1.5~2분 — 요청 응답 안에서 기다리지 않는다). 추출 전에는 현행 경로(앵커 이미지 + 역할 문장)로 생성한다.
2. 채움 호출: `claude-sonnet-5-5`, 메시지 = [이미지(base64), 텍스트(부록 A 스펙을 "코드블록 두 개로 답하라"로 바꾼 것 + 가이드 §1 + `facet-template-lite-v0.1.jsonc` 전문)], `max_tokens 16000`, 생각 기본(adaptive). 응답의 ```json 블록 → `filled.json`, ```md 블록 → `scene_summary.md`.
3. 컴파일 호출: 텍스트만 = 부록 B 스펙 + 가이드 §2 + filled.json + scene_summary.md, `max_tokens 6000`(4000이면 생각이 다 먹어 본문이 빈다), 생각 기본. 응답 = `## PROBE_ANCHORS / FIGURE / PRIORITY / NEGATIVE / SCENE` 다섯 문단.
4. 검증(기계): 리프 96개 · 값의 첫 토큰이 태그 4종 중 하나 · 헤더 5개 존재 · 단어 상한(110/150/30/40/40) · PRIORITY가 "Priority order:"로 시작 · 고유명사(작가·작품·브랜드) 없음은 모델 규칙에 맡기되 로그로 남긴다. 실패하면 **1회 재시도**, 그래도 실패하면 facets 없이 저장하고 현행 경로로 생성(기능 저하이지 오류 아님).
5. 저장: §5의 `facets` 객체(`version: "lite-v0.1"`, 모델·시각·토큰 사용량 포함).
6. 이후 그 프로젝트의 생성은 §4 조립. 인물 표본이 없는 이미지는 `figure_extrapolated: true`이고 인물 절이 "관찰된 선·채움 문법만 적용하라"는 외삽 문단이다 — 약한 근거이므로 빼는 쪽을 권한다(고성능 판은 같은 경우 인물 절을 내지 않는다, §8 ②). 유저 앵커에는 손글씨 style_clause가 없으므로 인물 처리는 앵커 이미지와 외삽 문단에만 기댄다 — 인물이 든 이미지를 올리도록 안내 문구로 유도할 수 있다.

API 함정(실측): `thinking.type: "disabled"`는 이 모델이 거부한다 — 끄려면 `{"type": "between_tools"}`. 생각을 끄면 7~8초로 빨라지지만 컴파일이 단어 상한을 넘기므로(앵커 151·인물 170) 기본(adaptive)을 권한다.

## 7. 이번 추출·테스트 결과 요약

결과 페이지(그림 60장 + 프롬프트 조각 + 1차 판정): https://claude.ai/artifact/3ASfQfpBFkAi6SoKpSdsra

| 스타일 | 채움 | 컴파일 | 우선순위 | 추출 합계 | 등급 | 앵커 캡슐 단어 | 인물 절 | 1차 판정 충실도 캐릭터 현행/facet/둘 다 · 액션 현행/facet | 캐릭터 최선 |
|---|---|---|---|---|---|---|---|---|---|
| jp_anime | 14.9분 | 12.6분 | 1.2분 | 29분 | 2 | 118 | 없음 | 4/4/4 · 3/4 | facet |
| real | 16.1 | 15.6 | 1.1 | 33 | 2 | 159 | 없음 | 3/3/4 · 2/3 | 둘 다 |
| real_3d | 16.6 | 24.2 | 1.6 | 42 | 3 | 140 | 667단어 | 4/3/4 · 4/3 | 현행 |
| real_desert_fantasy | 12.9 | 13.0 | 1.5 | 27 | 5 | 150 | 없음 | 4/4/5 · 4/3 | 둘 다 |
| real_euro_period | 15.7 | 14.6 | 1.0 | 31 | 3 | 178 | 없음 | 5/3/5 · 5/3 | 현행 |
| real_hitech_sf | 10.9 | 22.8 | 1.3 | 35 | 5 | 160 | 없음 | 3/4/4 · 5/4 | 둘 다 |
| real_jp_melo | 15.5 | 8.4 | 0.8 | 25 | 1 | 159 | 없음 | 4/3/4 · 3/4 | 둘 다 |
| real_psy_horror | 12.0 | 21.1 | 1.0 | 34 | 5 | 149 | 없음 | 4/5/4 · 4/4 | facet |
| real_urban_hero | 11.0 | 16.1 | 1.1 | 28 | 3 | 140 | 없음 | 5/3/4 · 5/4 | 현행 |
| stop_motion | 12.1 | 22.0 | 0.9 | 35 | 2 | 119 | 없음 | 5/2/5 · 4/2 | 둘 다 |
| us_cartoon | 12.5 | 16.2 | 1.1 | 30 | 1 | 120 | 없음 | 4/3/5 · 4/3 | 둘 다 |
| watercolor | 11.5 | 17.1 | 1.0 | 30 | 3 | 149 | 없음 | 3/4/3 · 4/3 | facet |
| **평균** | 13.5 | 17.0 | 1.1 | 32 | | | | **4.0 / 3.4 / 4.25 · 3.9 / 3.3** | 둘 다 6 · facet 3 · 현행 3 |

- 검사(`check_fill.py`, 추측 허용 규약) 위반 0/12 — astra 채움은 재채움 없이 통과. 생성 60장(GPT Image 2 2k, 390크레딧), 장당 중앙값 2.3분. 1차 판정 = Codex gpt-5.6-sol high, 장당 2~4분. 누출 뚜렷 0 · 경미 11/60.
- **핵심 관찰**: ① 11종의 앵커가 정물 보드라 고성능 채움은 인물 가지를 `[해당 없음]`으로 적었고 컴파일은 인물 절을 내지 않았다 → facet 단독 캐릭터는 매체의 인물 처리(스톱모션 인형·TV 카툰 비례)를 잃었다(stop_motion 2, us_cartoon 3). 현행 style_clause가 그 자리를 메워 둘 다가 5·5. ② 인물 표본이 있는 real_3d는 반대로 667단어 수치 인물 절이 큰 눈·큰 머리를 과장해 현행보다 낮았다. ③ facet이 보탠 것은 앵커 이미지가 못 나르는 조명·명암·팔레트 역할, 대가는 12종 중 9종에서 과장(짙은 암부·스포트라이트·비와 젖은 노면·강한 청색 야경)과 요청에 없던 요소(장갑·배달 상자·복장 변경). ④ 앵커 캡슐의 환경색 역할 문장이 콘텐츠의 배경 지정을 이긴 경미 누출 1건(us_cartoon 둘 다) → 컴파일 규칙 후보(환경 팔레트 문장에 "unless the scene specifies its own backdrop"). ⑤ 컴파일이 앵커 캡슐 상한을 5/12에서 넘김(최대 178단어) → 절대 상한(등급 상한+40) 복귀 후보. ⑥ 판정 반복 오차(사이클 9 실측 평균 6.5%p)를 감안하면 0.5점 안의 차이는 잡음이다 — 방향만 읽는다.

### 7.1 v2 — 인물 보조 보드 12종 (오너 결정 뒤, 같은 날 저녁 — 먼저 그림 계열 4종, 이어서 나머지 8종)

보드 = 제품 경로(현행 문장)로 만든 원작 인물 2명 전신 정면·중립 표정·무지 배경(후보 2장 중 얼굴이 큰 쪽 선택; `presets/<key>/board.jpg`, 프롬프트 `board_prompt.txt`). 고성능 채움에 앵커 ①과 보드 ② **2장을 함께 첨부**(`spec/spec-fill-v2.md`): 렌더링 가지는 ①, `인물` 가지·인물 묘사 밀도·오버라이드·인접 계열은 ②에서 측정, `분류.Core`는 ① 렌더링 Core 뒤에 ② 인물 Core. 다중 입력은 이번이 첫 실행 — 검사 위반 0/12, 8개 동시 실행도 Codex 오류 없음. 그다음 같은 컴파일·우선순위 → facet v2 · 둘 다 v2 × 캐릭터·액션 48장 → 8장(앵커 · 현행 2 · facet v2 2 · 둘 다 v2 2 · 보드)을 붙인 1차 판정.

**판정자가 둘이다**: 그림 계열 4종은 Codex gpt-5.6-sol, 나머지 8종은 Claude Opus 5.5 — 8종의 우선순위 단계에서 Codex 워크스페이스 **지출 한도(spend cap)**에 걸려 우선순위 줄은 Claude Sonnet 5.5(`bin/run_priority_claude.py`, 수치 불변 검사 8/8 통과), 판정은 Claude Opus 5.5(`bin/run_judge_v2_claude.py`)로 돌렸다. 두 판정자의 눈금이 다르므로(Opus가 전반적으로 1점 낮음) **행 안에서 현행/facet/둘 다만 비교**하고 행 사이의 절대값은 비교하지 않는다. v1 열(인물 절 없음)은 전부 Codex 판정이다.

| 스타일 | 채움(2장) | 컴파일 | 추출 합계 | 인물 절 | v1 캐릭터 현행/facet/둘 다 | v2 캐릭터 현행/facet/둘 다 | v2 액션 현행/facet/둘 다 | v2 최선 (캐릭터·액션) | 인물 방언 facet/둘 다 (보드 대비) | 판정자 | 누출 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jp_anime | 15.8분 | 21.4분 | 40분 | 663단어 | 4/4/4 | 5/4/4 | 5/4/4 | 현행·현행 | 부분·부분 | 5.6-sol | 0뚜렷 0경미 |
| real | 15.0분 | 13.5분 | 29분 | 745단어 | 3/3/4 | 2/3/3 | 2/3/3 | 둘 다·facet | 맞음·맞음 | opus-5-5 | 0뚜렷 1경미 |
| real_3d | 17.7분 | 10.3분 | 28분 | 691단어 | 4/3/4 | 4/4/5 | 3/4/4 | 둘 다·facet | 맞음 · 부분 | opus-5-5 | 0뚜렷 4경미 |
| real_desert_fantasy | 16.8분 | 11.0분 | 28분 | 589단어 | 4/4/5 | 4/3/4 | 4/2/5 | 둘 다·현행 | 맞음·맞음 | opus-5-5 | 1뚜렷 0경미 |
| real_euro_period | 15.9분 | 12.1분 | 28분 | 596단어 | 5/3/5 | 4/3/5 | 4/3/4 | 둘 다·둘 다 | 부분·맞음 | opus-5-5 | 0뚜렷 1경미 |
| real_hitech_sf | 21.9분 | 6.5분 | 29분 | 646단어 | 3/4/4 | 3/2/3 | 4/4/4 | 둘 다·둘 다 | 부분·부분 | opus-5-5 | 0뚜렷 2경미 |
| real_jp_melo | 16.6분 | 11.2분 | 28분 | 656단어 | 4/3/4 | 3/2/3 | 3/2/4 | 둘 다·둘 다 | 부분 · 맞음 | opus-5-5 | 0뚜렷 0경미 |
| real_psy_horror | 20.4분 | 8.4분 | 29분 | 620단어 | 4/5/4 | 4/4/4 | 5/4/4 | facet·현행 | 부분·부분 | opus-5-5 | 0뚜렷 1경미 |
| real_urban_hero | 16.2분 | 11.6분 | 28분 | 623단어 | 5/3/4 | 4/2/4 | 4/3/4 | 둘 다·둘 다 | 맞음 · 맞음 | opus-5-5 | 0뚜렷 1경미 |
| stop_motion | 19.7분 | 19.8분 | 43분 | 487단어 | 5/2/5 | 4/4/5 | 4/4/5 | 둘 다·둘 다 | 부분·맞음 | 5.6-sol | 0뚜렷 0경미 |
| us_cartoon | 18.4분 | 13.2분 | 33분 | 522단어 | 4/3/5 | 4/4/5 | 4/4/5 | 둘 다·둘 다 | 맞음/맞음 | 5.6-sol | 0뚜렷 0경미 |
| watercolor | 19.2분 | 15.0분 | 37분 | 688단어 | 3/4/3 | 4/4/5 | 4/4/5 | 둘 다·둘 다 | 맞음·맞음 | 5.6-sol | 0뚜렷 0경미 |
| **평균(12종)** | 17.8 | 12.8 | 32 | | 4.00 / 3.42 / 4.25 | **3.75 / 3.25 / 4.17** | **3.83 / 3.42 / 4.25** | 둘 다 10·7 / 현행 1·3 / facet 1·2 | 맞음 14/24 | | 뚜렷 1 경미 10 |

- **둘 다가 캐릭터 최선 10/12, 액션 최선 7/12.** 보드에서 잰 인물 절이 보탠 것: 그림 계열은 매체의 인물 처리(스톱모션 구슬눈·섬유 채움, 카툰 5~6등신·원형 눈), 실사 계열은 자연 비례(늘어난 하퇴·화보식 자세 교정), 사진형 피부·머리칼 질감, 정면 직립, 작은 실사 눈. 실사 서브룩 7종에서 facet 단독은 **룩을 잃는다**(웜 하이키 그레이드, 시안 악센트, 색광 대비, 사막 먼지광) — 그 룩은 현행 style_clause가 나르므로 둘 다에서만 인물 방언과 룩이 함께 유지된다. 인물 방언 '맞음' 14/24, 뚜렷 누출 1/72(real_desert_fantasy 둘 다 액션이 앵커의 석재·리넨 장면으로 대체됨 — 캡슐의 재질 절 때문).
- **v2의 대가 세 가지**: ① 보드의 중립 표정이 인물 절에 들어가 캐릭터의 "자신감 있는 표정"이 약해졌다(real_desert_fantasy · real_jp_melo · watercolor) — 표정 우선 문장은 눈 항목만 다루므로 **표정 기본값은 싣지 않거나 표정 절에도 '장면의 표정이 이긴다'**를 붙이는 컴파일 규칙 후보 ② 요청에 없는 요소(장갑·부츠·헨리넥 이너·회색 운동화)와 부정 절에도 남는 젖은 노면·보케(real · real_euro_period · real_psy_horror) ③ 방향어 과장(jp_anime 눈·신발·하퇴, stop_motion 머리 덩어리)과 앵커 배경이 콘텐츠의 어두운 스튜디오를 밀어낸 경우(real_3d).
- 비용·시간: 보드 24장 156 + 생성 48장 312 = 468크레딧(누계 858). 2장 첨부 채움 15~22분, 컴파일 6.5~21분(인물 절 487~745단어), 우선순위 Codex 1~3분 / Claude 15~25초, 판정 Opus 55~67초. 8종 동시 추출 28~29분/장.
- **제품은 12종 모두 v2 산출물을 쓴다**(`presets/<key>/` 루트 = v2, `index.json`의 `facets.version = "hp-v1.2.3+figure-board"`, `figure_source = "figure_board"`, `assembly = "both"`). v1은 `v1/`·`facets_v1`로 남겼다.

## 8. 같이 정한 것 / 혼자 정한 것 / 결정이 필요한 것

**같이 정한 것(오너 지시, 2026-10-08)**: 12종 프리셋은 고성능 판으로 미리 추출한다 · VLM은 astra(gpt-6-astra) · 추출 뒤 생성 테스트를 아티팩트로 · 유저 이미지는 동의가 있을 때 경량 판으로 추출해 이후 생성에 쓴다 · 제품 수정은 다른 세션.

**혼자 정한 것**:

| 동작 | 왜 | 버린 선택지 | 되돌리기 |
|---|---|---|---|
| 컴파일·우선순위 줄은 gpt-5.6-sol high/medium로(astra는 채움만) | 확정 레시피(사이클 9)의 컴파일 모델이라 결과를 지난 사이클과 비교할 수 있다. 오너 지시는 "VLM"(그림 보는 단계)에 astra였다 | astra로 전부 | 쉬움 — 재컴파일 20분/장, 크레딧 0 |
| 추출 입력은 `style_anchors.image_url`(제품이 참조로 보내는 그 그림) 1장 | 제품이 생성 때 참조하는 이미지와 facet의 출처를 같게 해야 "앵커 + facet"이 한 그림을 말한다 | 프리뷰(인물 있는 쇼케이스)까지 2장 | 쉬움 — 추출 재실행 |
| 생성 비교는 현행 제품 프롬프트 · facet 프롬프트 · 둘 다 × 캐릭터(+ 현행·facet 액션) = 스타일당 5장, 60장 390크레딧 | 제품에 넣을지 판단하려면 현행과 같은 조건의 비교가 있어야 하고, 제품에 들어갈 가장 유력한 구성('둘 다')도 같이 봐야 한다 | facet만 2장 | 쉬움 |
| facet 조건은 style_clause 없이, 앵커 1장 참조 | 순수 비교. 2-ref 스타일 2종도 facet·둘 다 조건은 1장 | 2-ref 그대로 | 쉬움 |
| 1차 기계 판정을 Codex 1명으로 | 오너의 눈이 최종이므로 선별용 1차만. 두 판정자 교차는 지난 사이클 방식이나 시간이 2배 | Claude 판정 추가 | 쉬움 — `bin/run_judge.sh` 재실행 |
| 경량 판 참조 구현은 Python으로 이 폴더에 | 제품(TS)은 다른 세션이 쓴다. 호출 계약만 정확히 넘기면 된다 | TS 스크립트를 `scripts/`에 | 쉬움 |
| 저장 제안 = `style_anchors.facets` jsonb + `custom_style_anchor.facets` | 가장 작은 변경, 앵커 정체성 한 곳 유지 | 새 표 `style_anchor_facets` | 쉬움(제안일 뿐) |
| v2 보드는 제품 경로(현행 문장)로 만들고, 채움은 앵커 + 보드 2장을 한 번에(인물 가지는 보드에서) | 보드가 제품이 지금 그리는 인물의 진실이고, 2장 동시 채움이 두 파일을 기계로 합치는 것보다 일관된다 | 보드만 따로 채워 인물 가지만 붙여넣기 | 쉬움 — 재채움 20분 |
| 보드 후보 2장 중 얼굴이 큰 쪽을 내가 골랐다 | 눈 판독(눈 폭 px)에 유리. 둘 다 결함(눈 감음·잘림·문자) 없음 | 오너 선택 | 쉬움 — 다른 후보로 재채움 |

**오너가 정한 것(2026-10-08 저녁, 1차 결과를 본 뒤)**:

1. **style_clause와 facet 조각은 "둘 다"** — 역할 문장 바로 뒤에 현행 `style_clause`, 그다음 `Style anchors: …` 이하 facet 조각(§4의 조립에 2번 앞에 style_clause 한 줄이 들어간다; 실행례 `presets/<key>/assembled/both_*.txt`). 제품은 이 구성으로 간다.
2. **인물 보조 보드를 만들어 다시 추출 — 12종 전부**(먼저 그림 계열 4종, 이어서 나머지 8종). 보드 = 제품 경로(현행 문장)로 만든 원작 인물 2명 전신 정면(§7.1), 고성능 채움에 앵커 ①과 보드 ② 2장을 함께 첨부해 인물 가지를 ②에서 측정(다중 입력 첫 실행). 결과는 §7.1, 산출물은 `presets/<key>/`(v2가 정본, v1은 `v1/`).

**아직 결정이 필요한 것(오너)**:

1. **역할 문장**: 현행 `STYLE_ANCHOR_CLAUSE` 유지 vs facet 테스트의 긴 금지 목록 문장. 누출 차이는 없었다(뚜렷 1/132, 문장과 무관). 정하지 않으면 현행 유지.
2. **유저 이미지 동의 문구·범위**: "이 이미지를 스타일 분석에 쓴다(외부 모델에 전송)"를 업로드 권리 동의 대화상자에 합칠지 따로 둘지, 동의 시각·버전을 프로젝트에 어떻게 남길지.
3. **경량 판 실패 시 동작**: 재시도 1회 뒤 facets 없이 진행(제안) vs 유저에게 알림.
4. **재컴파일 여부**: 앵커 캡슐 절대 상한(등급 상한+40) · 환경 팔레트 조건문 · 표정 기본값 처리(§7.1 대가 ①)를 컴파일 규칙에 넣고 12종을 다시 컴파일할지(크레딧 0, 장당 7~21분, 그림은 다시 보지 않는다).
5. **과장 상한**: 방향어가 보드보다 큰 눈·신발을 만드는 경우(jp_anime)에 우선순위·방향어의 'slightly' 상한 변형(사이클 9부터 미검증)을 시험할지.
6. **Codex 지출 한도**: 워크스페이스 spend cap에 걸려 8종의 우선순위·판정을 Claude로 돌렸다. 다음 사이클에 Codex를 쓰려면 한도를 올려야 한다(대체 경로는 스크립트로 남아 있다).

## 9. 참고

- 결과 페이지(아티팩트): https://claude.ai/artifact/3ASfQfpBFkAi6SoKpSdsra (비공개 — 오너 계정; 다른 사람에게는 공유 메뉴로 열어야 보인다)
- 로컬 실험 폴더(git 밖): `dev/Image_Style/facet_presets/` — `bin/pipeline.sh`(v1 추출 사슬) · `bin/pipeline_v2.sh`(앵커 + 보드 2장 채움) · `bin/make_board.py` + `bin/gen_board.sh`(보드) · `bin/run_priority_claude.py` · `bin/run_judge_v2_claude.py`(Codex 한도 대체) · `bin/post_chain.sh`(조립 → 생성 → 판정) · `bin/build_prompts.py` · `bin/gen.sh` · `bin/run_judge.sh` + `spec/spec-judge.md` · `bin/summarize.py` · `build_report.py` · `bin/export_handoff.py`(이 폴더로 내보내기) · `<key>/fill/comms/transcript.md`(Codex 통신 원문) · `<key>/gen/*.png`(원본 2048px) · `judge/<key>.md`(1차 판정 전문)
- 지난 사이클: `dev/Image_Style/facet_cycle_9/`(R1c 확정 근거) · `facet_cycle_10/`(경량 판 검증, Sonnet 직접 호출 시간)
- 메모리: `~/.claude/projects/-home-user-Downloads-Tale-Studio/memory/facet-template-program.md`
