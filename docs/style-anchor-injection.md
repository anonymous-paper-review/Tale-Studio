# 스타일 앵커 주입 — 백엔드 입력 프롬프트 제안 (검증용)

> 2026-07-13 · 상태: **백엔드 구현·검증 완료** (ralplan→ultragoal; §8). UI 피커(비목표) 미도입 → dormant. A/B: Q1/Q4 ✅, Q3 ❌(art_style 약화 후속 — anchor-picker GA 전 필수).
> 2026-07-13 리비전: 코드 실측 리뷰 반영 — §1 비율 고정 규칙, §2 템플릿절, §3 실제 분기 정정(방향뷰/러프 제외 + 주입 위치 규약), §5 Q2 해소·Q5 추가, §6 체크 2항 추가.
>
> **목적**: 프로젝트가 고른 스타일 앵커를 다운스트림 이미지 생성(캐릭터·배경·샷)에 **공유 I2I 레퍼런스**로 물릴 때의 **입력 프롬프트**를 제안한다. UI/배선 구현 전에 프롬프트 설계를 먼저 확정·검증하기 위함.
>
> **근거(실험 검증 완료)**: 프로젝트 `c4e478e6` "[anchor-exp]" (DW_Test 클론)에서 앵커를 `image_urls[0]` + 스타일 지시절로 물려 캐릭터·장소·샷 전 계층 **화풍 통일 + 캐릭터 정체성 유지** 확인. 재현 스크립트: `scripts/_anchor-exp*.mjs`.
>
> **선행 데이터(적용 완료)**: `style_anchors` 테이블(6 매체) + `projects.style_anchor_key` — 마이그레이션 `databases/migrations/030_style_anchors.sql`. 앵커 라이브러리 프롬프트: `docs/style-anchor-prompts.md`.
>
> **관계**: `docs/design-tokens-look-lineage.md` §6-#4(배경 art_style 텍스트 주입)와 **직교** — §4 참조.

---

## 1. 메커니즘

- 이미지 모델: fal **`openai/gpt-image-2/edit`**, input = `{ prompt, image_urls[], image_size }` (`src/lib/writer/llm/fal.ts`).
- **레퍼런스 순서 규약**: `image_urls[0]` = **스타일 앵커** / `image_urls[1..]` = **정체성·내용**(캐릭터 초상화, 장소 이미지).
- 프롬프트가 **위치로 역할을 명시** → 다중 레퍼런스 희석 방지(§5 Q4).
- **발동 조건**: `projects.style_anchor_key != null` → `style_anchors.image_url` 조회 → 앵커 URL을 `image_urls[0]`에 prepend + 아래 지시절 prepend. **`null`이면 기존 동작 그대로(무변경).**
- **비율 고정 규칙 (필수)**: `aspect_ratio` 미지정 시 edit 모델은 `image_size='auto'` → **첫 레퍼런스 비율**을 따른다(`fal.ts:arToImageSize`). 앵커 prepend는 첫 레퍼런스를 앵커로 바꾸므로, 비율을 암묵 상속하던 호출부(턴어라운드 `[template]`)는 **앵커 주입 시 기존 암묵 비율을 명시적 `aspect_ratio`로 고정**해야 한다. 안 하면 시트 레이아웃/출력 비율이 앵커 이미지 비율로 조용히 바뀐다.

---

## 2. 프롬프트 절 (verbatim — 이대로 쓸 것)

### 스타일 앵커 지시절 — 앵커 있을 때 프롬프트 맨 앞에 prepend
```
STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its
art medium, rendering technique, linework, shading, lighting mood and color grade
exactly. Do NOT reproduce its subject or objects.
```

### 멀티레퍼런스 절 — 정체성 레퍼런스가 추가로 있을 때(샷) 위 절 뒤에 한 줄 더
```
The remaining reference images are the character(s) and the location: keep their
identity, design and outfit; only re-render them in the style reference's look.
```

### 템플릿 절 — 턴어라운드(`[anchor, template]`)일 때 앵커절 뒤에
```
The SECOND reference image is a layout template: keep its section boxes, dividers,
labels and headings exactly in place. It is NOT a style reference — take the visual
style ONLY from the first image.
```

> 기존 턴어라운드 빌더(`buildCharacterTurnaroundPrompt`)는 템플릿을 `"Fill in this character reference-sheet template"`로 **무위치 지칭**한다. 앵커가 `[0]`에 들어오면 모델이 앵커를 템플릿로 오독할 수 있어 이 절로 위치를 못 박는다. Q1의 A/B는 이 절 포함판으로 수행.

> 실험에서 검증된 실제 문구(`scripts/_anchor-exp2.mjs`의 `styleRef`)의 정제판이다. 실험판은 `"Use the provided image ONLY as a style, lighting and color-grade reference; create a COMPLETELY NEW image (do not copy its objects)."` — 동작 확인됨. 위 절은 위치("FIRST")를 명시해 다중 레퍼런스에서 더 견고.

---

## 3. 생성 지점별 통합 (기존 빌더는 안 건드리고 앞에 절만 붙임)

| 생성 | 파일 · 빌더 | `image_urls` | 프롬프트 |
|---|---|---|---|
| 캐릭터 main — 사람(=턴어라운드 시트) | `api/artist/generate-sheet/route.ts` → `lib/artist/turnaround.ts` (`buildCharacterTurnaroundPrompt`) | `[anchor, template]` (Q1) | `앵커절 + 템플릿절 + 기존 빌더 출력` |
| 캐릭터 main — 사물·템플릿 폴백(`buildCharacterMainPrompt`) | 〃 | `[anchor]` (T2I→edit 자동 전환, `resolveImageModel`) | `앵커절 + 기존 빌더 출력` |
| 캐릭터 방향 뷰 (back/sideLeft/sideRight) | 〃 (`buildCharacterViewPrompt`) | **앵커 미주입** — 기존 `[view_main]` 유지 | **무변경.** main이 이미 앵커 화풍을 입어 전이 상속되고, 프롬프트가 `"the reference image"` 단수 지칭이라 앵커 삽입 시 지칭이 깨짐 |
| 배경 | `stores/artist-store.ts:buildWorldShotPromptForLocation` → `api/artist/generate-world/route.ts` | `[anchor]` (T2I→edit 전환 — §5 Q2 해소) | `앵커절 + 기존 빌더 출력` |
| 샷(콘티) | `stores/director-store.ts` (`resolveShotAssetImages`) → `api/director/generate-storyboard/route.ts` | `[anchor, ...charViewMains, locWide]` | `앵커절 + 멀티레퍼런스절 + 기존 샷 프롬프트` |
| 러프 스토리보드(previz) | `api/writer/rough-storyboard/route.ts` (flux klein, 흑백 스케치) | **앵커 미주입 (명시적 제외)** | 무변경 |

**조립 규칙:** `finalPrompt = (anchorKey ? styleAnchorClause + (isTurnaround ? templateClause : hasIdentityRefs ? multiRefClause : '') + '\n' : '') + existingPrompt`
그리고 `imageUrls = anchorKey ? [anchorUrl, ...existingRefs] : existingRefs`.

**주입 위치 (구현 규약)**: 세 주입 대상 모두 projectId를 가진 **서버 라우트**를 통과한다(generate-sheet / generate-world / generate-storyboard). 앵커 조회+prepend는 **서버 공용 헬퍼 1곳**(예: `withStyleAnchor(projectId, prompt, refs, aspectRatio)`)으로 통일한다.
- 클라이언트 store 주입 금지 — 앵커 URL 조회가 클라로 새고 3벌 드리프트.
- `falImageSubmit` 레벨 전역 주입 금지 — 러프 previz(flux klein)가 같은 함수를 타므로 오염됨.

### 조립 예시 (캐릭터 main — 사물/템플릿 폴백 경로, 앵커=`real`)
```
STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subject or objects.
Character reference portrait of 김 부장. antagonist. Male boss in his 50s with an irritable expression, receding hairline, dark corporate suit. art style: <l1.art_style>. palette: <primary,secondary,accent>. full body, single character, front view, neutral grey background, even studio lighting, clean composition, no text, no logo
```
→ `image_urls = [ <style_anchors.image_url where key='real'> ]`

### 조립 예시 (샷, 앵커=`real` + 등장 캐릭터/장소)
```
STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: ... Do NOT reproduce its subject or objects.
The remaining reference images are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style reference's look.
Cinematic storyboard frame, MCU shot. 김 부장이 원고 뭉치를 주인공에게 집어던진다. No text.
```
→ `image_urls = [ anchorUrl, boss_kim.view_main, char.view_main, location.wide_shot ]`

---

## 4. design_tokens #4(배경 art_style)와의 관계 — 직교

| | 주입 슬롯 | 성질 |
|---|---|---|
| design_tokens #4 | 프롬프트 **본문 텍스트**(`look.artStyle`) | 항상, 싸다, writer 데이터 |
| 앵커(본 문서) | **`image_urls` 배열** + 지시절 | 옵션, 강하다(이미지>텍스트), 유저 선택 |

- 서로 다른 슬롯 → **공존**. #4 스펙 그대로 진행해도 앵커와 정합. 오히려 #4의 `look` 파라미터가 앵커를 얹기 좋은 seam.
- **충돌 규칙(구현 시)**: 유저가 앵커를 골랐는데 `art_style` 텍스트와 매체가 어긋나면(예: watercolor 앵커 vs art_style="photoreal") **이미지 앵커가 authority.** 앵커 있을 때 `art_style` 텍스트를 앵커 매체로 정합시키거나 보조로 약화(구현 세션 결정, §5 Q3).

---

## 5. 열린 질문 (검증 세션이 결정)

- **Q1 캐릭터 턴어라운드 레퍼런스**: `[anchor, template]` + 템플릿절(§2) vs 앵커 단독 `[anchor]`(레이아웃은 프롬프트로만). 2-레퍼런스 역할 충돌이 템플릿절로 해소되는지 A/B 필요 — 템플릿 레이아웃 유지와 앵커 화풍이 동시에 성립하는지가 관건.
- ~~Q2~~ **해소(코드 실측, 2026-07-13)**: 배경 wide_shot은 현재 레퍼런스 없는 T2I — `generate-world/route.ts`가 `reference_image_urls`를 아예 안 넘긴다. 앵커 추가 = 라우트가 레퍼런스를 받도록 수정 + edit 모델 자동 전환(`resolveImageModel`). `aspect_ratio: '16:9'` 명시돼 있어 비율은 안전.
- **Q3 앵커 vs art_style 텍스트 충돌 authority** (§4).
- **Q4 다중 레퍼런스 희석**: `gpt-image-2/edit`에 `[anchor + 캐릭터 N + 장소]`를 넣을 때 앵커 스타일 가중치가 유지되는지, 레퍼런스 개수 상한 — 실측(실험은 최대 4장까지 OK 확인).
- **Q5 앵커 변경 staleness**: `generate-sheet`의 `computeLookFingerprint(dt, costume)`에 `style_anchor_key`가 없어 **앵커 선택/변경이 기존 생성물을 stale로 못 만든다.** 캐릭터 생성 후 앵커를 고르는 흐름(producer 선택이라 흔함)에서 화풍 불일치가 조용히 잔존 — lookFingerprint에 앵커 키 포함 여부 결정 필요.

---

## 6. 검증 체크리스트 (다른 세션)

- [ ] **화풍 이동**: 앵커 유/무 A/B — 앵커 물리면 출력이 앵커 매체/톤을 실제로 채택하나.
- [ ] **정체성 유지**: 샷에서 `[anchor + 캐릭터 초상화]` 동시 물렸을 때 캐릭터 얼굴/디자인이 초상화와 일치하나.
- [ ] **무변경 보장**: `style_anchor_key = null`이면 프롬프트·`image_urls`가 기존과 바이트 동일.
- [ ] **매체 전환**: anime/watercolor/stop_motion 앵커에서 화풍이 실제로 바뀌나(실사→실사는 톤만이라 약함, 이질 매체로 강검증).
- [ ] **다중 레퍼런스**: 앵커 스타일이 캐릭터/장소 레퍼런스에 안 먹히는(희석) 케이스 없나.
- [ ] **턴어라운드 비율/레이아웃**: `[anchor, template]`에서 시트가 템플릿 레이아웃·비율(≈16:9)을 유지하나 — §1 비율 고정 규칙(명시적 `aspect_ratio`) 적용 확인.
- [ ] **러프 previz 무변경**: `api/writer/rough-storyboard` 경로는 앵커 유무와 무관하게 프롬프트·입력 바이트 동일.
- 재현: `scripts/_anchor-exp*.mjs` (DW_Test 클론 → 앵커 물려 재생성). 결과 프로젝트 `c4e478e6`.

---

## 7. 참조

- 생성 지점: `src/app/api/artist/generate-sheet/route.ts` · `src/lib/artist/turnaround.ts` · `src/stores/artist-store.ts`(`buildWorldShotPromptForLocation`) · `src/lib/prompts.ts` · `src/stores/director-store.ts` · `src/app/api/director/generate-storyboard/route.ts`
- 이미지 submit: `src/lib/writer/llm/fal.ts` (`openai/gpt-image-2/edit`, `image_urls`)
- 데이터: `style_anchors` 테이블 · `projects.style_anchor_key` (마이그레이션 030)
- 앵커 라이브러리 생성 프롬프트: `docs/style-anchor-prompts.md`
- 계보/정합성: `docs/design-tokens-look-lineage.md` (§6-#4 = 앵커의 텍스트 짝)
- 실험 스크립트: `scripts/_anchor-exp.mjs`(클론+생성) · `scripts/_anchor-exp2.mjs`(재개) · `scripts/_anchor-exp3.mjs`(Q1/Q3/Q4 A/B, 프로덕션 절)

---

## 8. Q1/Q3/Q4 검증 결과 (기록 완료, 2026-07-13 실행 — `scripts/_anchor-exp3.mjs`)

> 실행: `node scripts/_anchor-exp3.mjs [cloneProjectId]` (실 fal 과금 · 사람이 눈으로 판정). 프로덕션 절(§2) 사용. **실행: 2026-07-13, 클론 `c4e478e6` (DW_Test), `openai/gpt-image-2/edit`. 코드-확정 PASS 조건(Q1-A jp_anime · Q4-5ref)은 n=2 확증, 잔여 조건 n=1(≥2 전량 재실행은 GA 전 권장).**
> 루브릭(각 조건, Y/N): ① 매체 전이(medium transfer) ② 레이아웃/정체성 유지 ③ 아티팩트 없음.
> 시드 앵커: 6개(`real`, `jp_anime`, `real_3d`, `us_cartoon`, `stop_motion`, `watercolor`) — 7매체 중 `ink`(그래픽노블) 미시드(스크립트가 실행 시 활성 개수 재확인).

### Q1 — 턴어라운드 `[anchor, template]`+템플릿절 vs `[anchor]` 단독
| 앵커 | 조건 | ①매체 | ②레이아웃 | ③아티팩트 | 판정 |
|---|---|---|---|---|---|
| jp_anime | A `[anchor,template]` | Y | Y | Y | ✅ 통과 (n=2) |
| jp_anime | B `[anchor]` | Y | N(템플릿 구조 상실) | Y | 참고(B) |
| real | A `[anchor,template]` | Y | Y | Y | ✅ 통과 |
| real | B `[anchor]` | (미실행 — A 통과로 결론) |  |  | — |

**Q1 결론: ✅ A 통과 → shipped design A 확정, 코드 변경 없음.** A(`[anchor,template]`+템플릿절)가 템플릿 레이아웃(CHARACTER CONCEPT·COLOR PALETTE·SIZE GUIDE·TURN AROUND·DETAIL·SKETCH·FACE EXPRESSION 전 섹션·라벨) 유지 **와** 앵커 매체(anime / photoreal) 채택을 **동시** 성립 — 이질(jp_anime)·동질(real) 앵커 모두. 템플릿절이 앵커(스타일) vs 템플릿(레이아웃)을 성공적으로 분리(모델이 앵커를 템플릿로 오독 안 함). B는 매체는 먹으나 템플릿 구조를 잃음. ⇒ generate-sheet 2.1 + draft-trigger 3.1 person/template 게이트 해소, `applyStyleAnchor('turnaround')` refs `[anchor, template]` 유지. (URL: A `…0aa21b4b…`+n2 `…0aa21bff…`, B `…0aa21b57…`, real-A `…0aa21b65…`. jp_anime A는 n=2 확증. **주의**: 본 Q1 프롬프트엔 art_style 텍스트 없음 → Q3(텍스트 충돌 시 앵커 패배)와 **직교 축**. art_style 충돌 프로젝트에선 Q3 후속이 선행돼야 앵커 화풍이 성립한다.)

### Q3 — 앵커(watercolor) vs `art_style`(photoreal) 텍스트 authority
| 조건 | ①수채 채택 | ②머싱 없음 | 판정 |
|---|---|---|---|
| watercolor 앵커 + photoreal 텍스트 | N (실사 출력) | — | ❌ 실패 |

**Q3 결론: ❌ 실패 → §4 후속결정 필요(검증 전용·현 백엔드 범위 밖, 단 anchor-picker GA 전 필수).** watercolor 앵커 + 명시 `art style: photorealistic live-action` 텍스트가 충돌하면 **텍스트가 이긴다**(출력=실사, 수채 아님; URL `…0aa21ba7…`). 즉 앵커가 art_style 텍스트 충돌에서 authority를 못 가진다 — Q1이 art_style 텍스트 없이 앵커가 깨끗이 전이된 것과 정합. **⚠️ 프로덕션 영향(architect)**: `src/lib/artist/turnaround.ts`(:67 `art style: <artStyle>`, :137 "follow the declared art style exactly")가 이미 그 충돌 텍스트를 넣으므로, `design_tokens.l1.art_style` ≠ 앵커 매체인 프로젝트는 캐릭터 main/턴어라운드가 앵커 화풍을 못 입을 수 있다. **후속(별도 결정, GA 전)**: 앵커 존재 시 art_style 텍스트 약화·제거 서버 seam(helper가 style 토큰 strip) — docs §4. **현 shipped 백엔드는 무변경**(Q3은 계획상 verification-only). (1-gen — ≥2·타 표면(world/shot) 재확인 권장.)

### Q4 — 다중 레퍼런스 희석/상한 (watercolor)
| refs | ①앵커 매체 유지 | ②정체성 일치 | 판정 |
|---|---|---|---|
| 3 `[anchor+1char+loc]` | (미실행) |  | — |
| 4 `[anchor+2char+loc]` | (미실행 — 선행 실험서 OK 확인) |  | 선행 OK |
| 5 `[anchor+3char+loc]` | Y | Y | ✅ 통과 (n=2) |

**Q4 결론: ✅ 5-ref 통과 → 상한 불요, `STYLE_ANCHOR_MAX_REFS` 델타 없음.** 최대 fan-in(앵커+3캐릭터+장소)에서 watercolor 매체(붓터치·번짐·종이질감) 유지 + 캐릭터 정체성(김 부장 M자탈모 얼굴) 일치, 희석 없음(URL `…0aa21bbd…` + n2 `…0aa21c0b…`, n=2 확증). 선행 실험이 4-ref OK, 본 패스가 5-ref OK 확정 ⇒ 현 shot fan-in 에서 `applyStyleAnchor('multiref')` truncation 불필요.

### 백엔드 구현 상태 (2026-07-13, ralplan → ultragoal)
- **완료·검증(코드)**: 헬퍼 `src/lib/style-anchor.ts`(순수 `applyStyleAnchor` + fail-soft `resolveStyleAnchorByKey`) + 4 주입 지점(generate-sheet main / draft-trigger / generate-world / generate-storyboard) + Q5 앵커-지문(`computeLookFingerprint` 3-site atomic). 전 스위트 439/439 그린 + `typecheck` 0. 단계별 architect + QA red-team 게이트 통과(no-op 바이트동일·ratio-lock·fail-soft·false-stale 가드 실측).
- **A/B 판정(§8, 2026-07-13 실행)**: Q1 ✅통과(shipped design 확정, 델타 없음) · Q4 ✅통과(상한 불요, 델타 없음) · Q3 ❌실패(텍스트 재료어가 앵커 override → 재료어 억제 **후속** 필요, verification-only·현 범위 밖). `projects.style_anchor_key` 는 UI 피커(비목표) 전까지 미설정이라 백엔드는 dormant(무해). **후속 1건 = 별도 제안 문서**: `docs/style-anchor-art-style-authority.md` (진짜 범인은 `texture_philosophy` 텍스트 — 실 조합 A/B + 최소 억제 제안, 다음 세션용).
