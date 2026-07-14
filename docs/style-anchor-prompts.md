# 스타일 앵커 프롬프트 — 화풍 일관성 라이브러리 (v2 · 매체 기준)

> 2026-07-13. 목적: 그림체(화풍) 일관성을 위한 **공유 스타일 앵커** 프리빌드 라이브러리. **7개 매체**를 버킷으로 두고, 각 매체의 **인물 없는 재질 스틸라이프** 앵커를 생성하는 프롬프트를 기록한다.
>
> **배경**: Director 단계 이미지 일관성 문제의 최대 원인 = Artist 에셋의 화풍 미통일(foundation-in-foundation-out — 샷·영상이 전부 캐릭터/장소 이미지에 I2I로 물려 위를 상속). 현재 스타일 주입은 `projects.design_tokens`를 텍스트로만 각 에셋에 따로 넣어 편차가 큼. → **하나의 스타일 앵커 이미지**로 모든 생성이 같은 화풍 참조를 물게 한다.
>
> **v1→v2 변경**: v1은 "12개 네임드 룩(누아르·사이버펑크 등)"으로 나눴으나 이는 **매체(그림체)와 톤/장르(내용)를 섞은 오류**였다. v2는 열거 가능한 유일 축인 **매체 7개**만 버킷으로 두고, 톤·팔레트·조명은 별도 modifier(§6)로 분리. 앵커에서 **인물 제거** — 화풍은 조명·질감·색이 나르며 인물은 정체성 누수만 부름.
>
> **관련 코드**: `src/app/api/artist/generate-sheet/route.ts`(캐릭터 시트) · `src/app/api/director/generate-storyboard/route.ts`(샷 정지그림) · `src/lib/artist/draft-trigger.ts`(핸드오프 초안) · `src/lib/image-provenance.ts`(design_tokens 룩 지문).
>
> **자매 문서**: `docs/character-template-restyle-prompts.md` — 잘못된 스타일 앵커(여우 마스코트 템플릿) **제거**. 본 문서는 올바른 앵커 **추가**(대칭).

---

## 1. 설계 원리

**스타일 정의:** 그림체 = *피사체를 갈아끼워도 남는 묘사 불변량*. "무엇을 그렸나(WHAT)"가 아니라 "어떻게 그렸나(HOW)".

**분류 구조 (이게 핵심):** 스타일 관련 변수 중 **열거 가능한 축은 매체 하나뿐**이다. 나머지는 열거하면 폭발한다.

| 계층 | 항목 | 다루는 법 |
|---|---|---|
| **매체 (본 문서)** | 실사 / 2D 드로운(→ 애니풍·카툰풍 **방언**) / 3D / 스톱모션 / 그래픽노블 / 수채 | ✅ 거의 완전열거 → **버킷**(앵커 라이브러리) |
| **톤·modifier** (§6) | 조명 · 색감/색온도 · 텍스쳐·그레인 · 추상도 | 연속적 → **파라미터/소수 프리셋** (버킷 금지) |
| **장르 모티프** | 드래곤·네온사인·메가코프·왕도… | 내용·무한조합 → **스토리/프로듀서 층**(로케이션·소품). 앵커 아님 |
| **나머지 전부** | 프리셋으로 못 잡는 화풍 | **유저 레퍼런스 이미지**(오픈 입력) |

**앵커 형상 (인물 제거):** 특정 인물은 정체성 누수만 부르므로 뺀다. 대신 **재질 스틸라이프 + 환경 코너**(룩데브 차트) — 무광 구·금속·유리·천·과일(유기물)·잎을 한 상에 놓고 매체별로 렌더. 조명·질감·색이 최대로 드러나되 "누구"는 없다. 피사체를 **7개 전부 동일 스틸라이프로 고정** → 오직 매체만 변수(재질 비교의 크롬볼 원리).

**주입 지점(권장):** 매 샷이 아니라 **파운데이션 에셋(캐릭터 시트 + 장소 이미지) 생성 시 1회** 레퍼런스로 물려 화풍을 굽고, 샷은 그 스타일된 에셋을 I2I로 상속 → 비용↓·전파 자동.

**저장 위치(권장):** 선택된 매체 = 프로젝트 레벨 필드("비주얼 매체", `genre`의 형제)로 저장 후 모든 이미지 생성 경로에 주입.

---

## 2. 프롬프트 원소 표 — 무엇이 있고, 왜 넣었나

각 원소는 **세 조건 동시 충족** 시에만 채택: ① **내용 독립**(피사체 바꿔도 유지) ② **지각적 현저성**(화풍을 즉시 분류하는 단서) ③ **모델 조건화**(캡션 어휘라 실제로 화풍이 걸림).

### 통제층 (상수 — 스타일이 아니라 스타일을 드러내는 조건)

| 요소 | 프롬프트 표현 | 왜 넣었나 |
|---|---|---|
| 재질 스틸라이프 | `matte sphere, draped cloth, glossy metal, glass, fruit, leafy plant` | 다양한 재질(무광·금속·유리·유기물·천·잎)에 매체가 어떻게 반응하나를 한 프레임에 노출. **7개 전부 동일 상수** → 매체만 변수 |
| 환경 코너 | `a plain ordinary room corner with soft window light` | 공간·색·조명의 게슈탈트 슬라이스(특정 장소 아님) |
| 재질 렌더 지시 | `clearly show how each material renders in this medium` | 화풍 핵심 단서(재질별 렌더)를 반드시 드러내게 강제 |
| 인물 배제 | `no people, no figures, no characters, no faces` | 정체성 누수 차단 — 인물은 downstream 캐릭터로 새어들어감 |
| 위생 | `no text, no letters, no logo, no watermark` | 글자/로고 삽입 방지(레퍼런스 오염). 실측: 미기입 시 모델이 라벨 텍스트 삽입 |
| 고정 레이아웃·비율 | `16:9` | 7개 앵커 비교·교체 가능하게 규격 통일 |

### 스타일층 (변수 — 실제 그림체 결정)

| 요소 | 정의 | 프롬프트 표현 예시 | 왜 스타일 대표 원소인가 |
|---|---|---|---|
| **① 매체/기법** (주축) | 물리적 제작 방식 | `photoreal` / `2D cel` / `3D render` / `stop-motion` / `ink` / `watercolor` | **뿌리.** 한 단어가 선·음영·질감·팔레트를 한꺼번에 끌고 옴 = 최고 레버리지. 유일하게 열거 가능 |
| ② 선 처리 | 경계 긋는 방식 | `clean linework` / `bold outlines` / `cross-hatching` / (실사=선 없음) | 눈이 "사진/그림/카툰"을 가장 먼저 가르는 축 |
| ③ 음영 모델 | 빛→그림자 전환 | `flat hard-edged`(셀) / `soft GI`(3D) / `washes`(수채) | 모든 형태가 음영짐 → 내용 독립. "입체감의 느낌" 규정 |
| ④ 질감/표면 | 표면 재질 서명 | `felt·clay seams` / `paper texture` / `film grain` | "무엇으로 만들었나". 스톱모션은 질감만으로 식별됨 |
| ⑤ 팔레트/색조 | 색 관계·채도·대비 | `naturalistic` / `clean saturated flats` / `muted washes` | 전역 적용(내용 독립) + 즉시 식별 |
| ⑥ 조명 미학 | 빛의 서명 | `soft daylight` / `even anime light` / `practical set lights` | 게슈탈트를 강하게 나름. 여기선 **톤 중립**으로 유지(§6 modifier가 나중에 얹음) |
| ⑦ 추상도 | 현실 단순화 정도 | `exaggerated shapes`(카툰) / `true-to-life`(실사) | "사실적↔양식화" 축 |

> **주의:** 본 v2 앵커는 매체별 **톤 중립**으로 뽑는다(조명·팔레트를 그 매체의 기본값으로). 누아르·네온 같은 톤은 §6 modifier에서 별도로 얹는다 — 매체 앵커에 톤을 미리 구우면 나중에 못 벗김.

---

## 3. 공용 스켈레톤 (인물 없는 재질 스틸라이프)

`{MEDIUM}` / `{LIGHTING}` / `{PALETTE}` 세 조각만 교체. **스틸라이프 문장(앞부분)은 7개 전부 100% 동일 고정** — 이게 "피사체 상수, 매체만 변수"의 핵심.

```
Still-life style reference board. A simple material study on a plain tabletop:
a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe
piece of fruit, and a small leafy potted plant, set in front of a plain ordinary
room corner with a window. No people, no figures, no characters, no faces.
Rendered in {MEDIUM}. {LIGHTING}. {PALETTE}. Clearly show how each material —
matte, metal, glass, organic, fabric and foliage — renders in this medium.
Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

---

## 4. 7가지 매체 앵커 프롬프트

각 항목: 매체명 + 복붙용 완성 프롬프트(톤 중립).

### 1. 실사 (Photoreal Live-Action)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Soft neutral daylight with a gentle key. Naturalistic, balanced, accurate color. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 2. 2D 드로운 · 일본 애니풍 (Japanese Anime, cel)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered in a 2D hand-drawn Japanese-anime cel style with fine varied ink linework, two-tone hard-edged cel shading (a base tone plus one crisp shadow tone), and a lushly painted semi-realistic background (Kyoto-Animation / Makoto-Shinkai-like). Soft natural anime lighting. Clean, slightly naturalistic saturated color. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 3. 3D 애니메이션 (Stylized 3D)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered in a stylized 3D animated feature render with appealing rounded forms, subsurface scattering and soft global illumination, Pixar-like. Soft studio global illumination with a gentle rim light. Warm, clean, gently saturated color. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 4. 2D 드로운 · 미국 카툰풍 (US TV Cartoon — 심슨류 플랫)
> 웨스턴 카툰은 한 스타일이 아니라 패밀리 — 여기선 **심슨/패밀리가이류 플랫**에 고정. 러버호스(루니툰·와일 E. 코요테)·누들(어드벤처타임)은 별도 하위선택 → 레퍼런스 이미지로 지정 권장.
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered in a flat modern American TV cartoon in the Simpsons / Family Guy family, with bold uniform outlines, fully flat cel fills and no rendered shading, boldly simplified and exaggerated shapes, and a simplified flat background. Flat even bright lighting with no cast shadows. Bright, primary-leaning colors. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 5. 스톱모션 (Stop-Motion)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered as a stop-motion miniature with tactile handmade materials, visible clay, felt, wood and fabric texture with fingerprints and seams, a real miniature set. Small practical set lights, real macro depth of field. Warm handcrafted, slightly muted tones. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 6. 그래픽노블 (Ink Graphic Novel)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered as a graphic-novel ink illustration with heavy black ink, cross-hatching and bold spot blacks, a comic-panel feel. High-contrast graphic light and shadow. A limited two-to-three color palette, muted flats. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

### 7. 수채 회화 (Watercolor)
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a glossy metal cup, a clear glass, a ripe piece of fruit, and a small leafy potted plant, set in front of a plain ordinary room corner with a window. No people, no figures, no characters, no faces. Rendered as a watercolor painterly illustration with visible brush strokes, pigment washes, soft bleeding edges and paper texture. Soft diffuse light. Translucent layered washes, muted. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this medium. Plain uncluttered composition. No text, no letters, no logo, no watermark. 16:9.
```

> **⚠️ 2D 드로운 방언 한계:** 애니 vs 미국 카툰의 최대 차이(눈·비율·과장)는 **캐릭터에서** 나온다. 인물 없는 정물 앵커는 이 둘을 **선·음영(2톤 vs 무음영)·색·배경(회화 vs 평면)**으로만 약하게 구분한다 → 2D 방언은 (a) 앵커에 양식화 피규어를 넣거나 (b) **유저 레퍼런스 이미지**로 지정하는 게 신뢰도 높다. 실사·3D·스톱모션·수채·잉크는 재질 렌더로 갈려 정물로 충분.

> **추가 매체(백로그):** 로토스코프(실사 트레이스 — 실사와 2D 사이), 픽셀아트, 콜라주 등은 수요 확인 후 같은 스켈레톤으로 확장.

---

## 5. 프롬프트 위생

1. **`no people, no faces` + `no text, no watermark` 필수** — 인물/글자 삽입은 앵커를 오염시킴(레퍼런스로 쓸 때 downstream에 새어들어감).
2. **스틸라이프 문장을 7개 전부 동일하게 고정** — 피사체가 상수여야 "매체만 변한다"가 성립(재질 비교의 크롬볼).
3. **톤 중립 유지** — 매체 앵커엔 누아르·네온 같은 톤을 굽지 않는다. 톤은 §6 modifier가 나중에 얹음(미리 구우면 못 벗김).
4. **레이아웃·비율 통일(16:9)** — 앵커 간 비교·교체 가능.
5. **매체당 4~6장 뽑아 손으로 1장 선별** — 품질 변수를 죽여 고정(프리빌드의 최대 이점).

---

## 6. 참고 / 다음 단계

- **이 문서 범위 = 매체 버킷 7개(§4)뿐.** 톤·모티프·레퍼런스는 아래 별도 레이어로, 앵커 라이브러리와 분리해서 붙인다.
  - **톤 modifier**: 조명·색온도·텍스쳐·추상도 — 슬라이더 또는 소수 프리셋으로 매체 위에 얹음(예: `실사 + 어두운 조명 + 차가운 색온도` = "누아르 실사"). 이건 프롬프트 텍스트로 후행 주입.
  - **장르 모티프**(드래곤·네온사인 등): 앵커가 아니라 스토리/프로듀서 층(로케이션·소품)에서 렌더. 스타일을 통과할 뿐.
  - **유저 레퍼런스 이미지**: 프리셋으로 못 잡는 화풍은 유저가 이미지 한 장 제공 → 그대로 앵커로 사용(오픈 입력). "모두의 기대"를 만족시키는 tail 흡수.
- **리스크(선검증 필요)**: ① `gpt-image-2/edit`에 다중 레퍼런스(템플릿+앵커) 시 **가중치 희석** 가능 → 앵커 주입이 실제로 화풍을 움직이는지 A/B 프로토타입 필수. ② I2I는 화풍을 **밀어주는** 것이지 **잠그는** 게 아님(통일감 향상 ≠ 보장).
- **v1 스펙 종료 트리거**: 타겟 유저가 첫 화면에서 고를 매체 N개(7 전부일 필요 없음)가 정해지면 라이브러리 스펙 종료.
