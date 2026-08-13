# 실사 서브 룩 앵커 프롬프트 6종 (실험, 2026-07-21)

> 목적: 실사(live_action) 매체 **하위의 톤/장르 룩 6종**을 스타일 앵커 이미지로 실체화하는 실험.
> 부모: `docs/style-anchor-prompts.md` (v2 매체 앵커 라이브러리 — **2026-08-05 대청소로 삭제됨**, git 히스토리·`~/tale-studio-backup-2026-08-05.tar.gz`에서 복구 가능). 생성: higgsfield CLI `gpt_image_2` (GPT Image 2), 1:1 정본(1차만 16:9), 2k/high, 장당 7크레딧.

## v2 원칙과의 관계 (분류 위치)

v2 문서 기준으로 이 6종은 **매체 버킷이 아니다** — 전부 매체=실사 고정이고, v2가 "버킷 금지, modifier로 후행 주입"이라 했던 **톤 층(§6)을 텍스트가 아니라 이미지 앵커로 굽는 실험**이다. v1(12 네임드 룩)이 기각된 이유(매체×톤 혼합)와 같은 축이지만, 차이는:

- v1은 축 구분 없이 룩을 열거했고, 여기는 **매체(실사) 상수 × 톤 facet 변수**로 구조화됨 — facet 표가 파라미터 공간을 명시.
- v2의 "톤을 앵커에 구우면 못 벗김" 경고는 그대로 유효 — 이 6종은 매체 앵커의 *대체*가 아니라, 실사 프로젝트용 **프리셋 서브 카탈로그** 후보. 채택 시 피커 계층(매체 → 서브 룩)이 필요할 수 있음.

## 스켈레톤 변형 (v2 대비 2가지 완화)

1. **정물 문장 일반화**: v2의 `a glossy metal cup / a ripe piece of fruit / a small leafy potted plant`에서 상태 형용사(glossy/ripe/leafy)를 제거 — 톤이 재질 *상태*를 바꾸므로(썩은 사과, 변색된 은) 프롬프트 내 자기모순을 피하기 위함. 구성 7요소(구·천·금속컵·유리잔·과일·화분·창가 방코너)는 6종 100% 동일 고정:
   `a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window`
2. **공간·재질 상태가 톤을 따라 변주**: v2는 "plain ordinary room"까지 상수였지만, 여기서는 facet의 공간(사막 석조/궁정 등)·재질 상태(낡음/먼지/광택)가 변수. **변주는 전부 facet 블록에만** — 블록 순서 고정: 조명·대비·그림자 → 팔레트 → 재질 5종(금속→유리→천→과일→식물) → 공간 → 후처리 → 감정.

**리스크 (관찰 포인트)**: ① 썩은 과일·물얼룩·야경 스카이라인 등은 "재질 렌더"보다 **내용(WHAT)에 가까워** downstream으로 소품/배경이 샐 수 있음 — 앵커 절("Do NOT reproduce its subject")이 막아주는지 실전 검증 필요. ② 채택 시 v2 §5 위생 규칙대로 **각 룩 4~6장 생성 후 1장 수동 선별**이 정석 — 본 실험은 1장씩만 뽑은 1차 탐색.

## Facet 표 (설계 입력, 사용자 제공)

| Facet | 일본 멜로 | 심리 공포 | 하이테크 SF | 사막 판타지 | 도심 히어로 | 유럽 역사극 |
| ----- | ---------- | --------- | ---------- | -------- | --------- | ---------- |
| 채도 | 낮음~중저 | 매우 낮음 | 제한적 고채도 | 낮음 | 높음 | 낮음 |
| 대비 | 낮음 | 높음 | 매우 높음 | 중고 | 중고 | 중저 |
| 주 색온도 | 5000K 전후 | 혼합광 | 7000K 전후 | 5000K 전후 | 혼합광 | 3000K 전후 |
| 그림자 | 부드럽고 밝음 | 깊고 불안함 | 깨끗하고 날카로움 | 뜨겁고 무거움 | 정보가 풍부함 | 회화적이고 부드러움 |
| 금속 | 부드러운 스테인리스 | 낡고 오염됨 | 고광택 크롬 | 먼지 낀 황동 | 다색 고광택 | 변색된 은·황동 |
| 유리 | 깨끗하고 따뜻함 | 차갑고 얼룩짐 | 정밀하고 발광 | 두껍고 먼지 낌 | 밝고 선명함 | 오래된 크리스털 |
| 천 | 연분홍 코튼 | 축축한 회색 천 | 기술 섬유 | 거친 린넨 | 선명한 망토 직물 | 레이스·브로케이드 |
| 과일 | 복숭아빛 사과 | 썩은 검붉은 사과 | 검푸른 미래적 과일 | 건조한 배 | 채도 높은 오렌지 | 낮은 채도의 석류 |
| 식물 | 밝고 여림 | 어둡고 축 처짐 | 날카로운 엣지광 | 먼지 낀 올리브 | 선명한 녹색 | 어두운 올리브 |
| 공간 | 봄날의 밝은 방 | 낡고 습한 방 | 미래 도시 실내 | 사막 석조 공간 | 현대 대도시 | 궁정 또는 고택 |
| 후처리 | 블룸·필름 | 그레인·비네팅 | 샤프·글로우 | 먼지·필름 | 선명도·HDR | 필름·회화성 |
| 감정 | 설렘 | 불안 | 통제·미래 | 장엄함 | 영웅적 | 품위·고독 |

## 프롬프트 6종 (복붙용 완성본)

### 1. 일본 멜로 — `real_jp_melo`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Soft neutral spring daylight around 5000K pouring through sheer white curtains, low contrast, with soft, bright, gently lifted shadows. A muted low-to-medium saturation pastel palette. The metal cup is softly brushed stainless steel with smooth diffuse highlights; the glass is clean and warm-toned; the cloth fold is pale blush-pink cotton; the fruit is a peach-blushed apple; the plant is a bright, tender young sprout. The room corner is a bright, airy apartment room on a spring morning. Delicate romantic bloom and halation on the highlights with fine soft film grain. Mood: the quiet flutter of a gentle Japanese romance film. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

### 2. 심리 공포 — `real_psy_horror`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Mixed clashing light sources — a cold dim bluish window glow against a sickly warm bare practical bulb — high contrast with deep, unstable, uneasy shadows. A very low saturation, drained, ashen palette. The metal cup is aged, tarnished and grimy; the glass is cold, smudged and streaked; the cloth fold is a damp grey rag; the fruit is a dark blackish-red apple beginning to rot; the potted plant is dark, limp and wilting. The room corner is an old damp room with peeling wallpaper and water stains. Heavy film grain and a strong dark vignette. Mood: creeping psychological dread. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

### 3. 하이테크 SF — `real_hitech_sf`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Cool clinical lighting around 7000K, very high contrast, with clean, sharp-edged, precise shadows. A restrained cool near-monochrome palette with only a few controlled high-saturation electric cyan accents. The metal cup is flawless high-polish chrome; the glass is precision-cut with a faint luminous edge-lit glow; the cloth fold is a fine woven technical performance fabric; the fruit is a sleek dark blue-black futuristic hybrid; the plant catches a razor-sharp rim of edge light. The room corner is a sleek minimalist future-city interior with a night skyline outside the window. Ultra-sharp detail with a subtle glow on emissive edges. Mood: control and the future. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

### 4. 사막 판타지 — `real_desert_fantasy`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Hard desert sun around 5000K raking through a narrow window, medium-high contrast, with hot, heavy shadows. A low saturation sun-bleached palette of sand, ochre and bone tones. The metal cup is dust-covered antique brass; the glass is thick, hand-blown and filmed with dust; the cloth fold is coarse rough-woven linen; the fruit is a dry, wrinkled pear; the potted plant is a dusty olive sapling. The room corner is a monumental sandstone-block desert chamber. Fine airborne dust in the light shafts and a filmic grade. Mood: solemn desert grandeur. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

### 5. 도심 히어로 — `real_urban_hero`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Mixed metropolitan light — bright daylight bouncing off glass towers blended with colorful city practicals — medium-high contrast with open, information-rich shadows full of bounced detail. A bold, high-saturation blockbuster palette. The metal cup is high-gloss multi-tone enameled metal; the glass is bright and crystal clear; the cloth fold is a vivid cape-like woven fabric; the fruit is a super-saturated orange; the plant is vivid healthy green. The room corner is a modern metropolis high-rise interior with a floor-to-ceiling window over the skyline. Punchy clarity and crisp HDR-like micro-contrast. Mood: heroic. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

### 6. 유럽 역사극 — `real_euro_period`
```
Still-life style reference board. A simple material study on a plain tabletop: a matte sphere, a draped cloth fold, a metal cup, a drinking glass, a piece of fruit, and a small potted plant, set in front of a plain room corner with a window. No people, no figures, no characters, no faces. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, shallow depth of field, true-to-life material response. Warm candlelight around 3000K mixed with a soft window glow, low-to-medium contrast, with soft painterly shadows falling off like an old-master oil painting. A muted low-saturation palette of aged gold, umber and deep green. The metal cup is tarnished silver and old brass; the glass is antique cut crystal; the cloth fold is fine lace over rich brocade; the fruit is a muted deep-red pomegranate; the potted plant is dark olive-green. The room corner is a stately European palace room with aged wood paneling and a tall window. Gentle film grain and a painterly period-drama grade. Mood: dignity and solitude. Clearly show how each material — matte, metal, glass, organic, fabric and foliage — renders in this look. Plain uncluttered composition. No text, no letters, no logo, no watermark. 1:1.
```

## 생성 기록

> **비율 정정 (2026-07-21)**: 프로덕션이 1:1 해상도를 쓰므로 **정본은 1:1** — 프롬프트 끝 토큰도 `16:9.` → `1:1.` 로 교체됨(위 §프롬프트 6종은 1:1 반영본). 1차 16:9 산출물은 `16x9/` 폴더로 이동(보관).
> *(2026-08-13 정리 검증: 위 블록 6종에 `16:9.` 토큰이 잔존해 있던 것을 발견해 `1:1.`로 일괄 정정 — 2차 잡 자체는 `--aspect_ratio 1:1`로 제출되어 산출물은 전부 2048×2048.)*

### 2차 — 1:1 (정본, 각 1장)

| key | higgsfield job id | 파일 |
|---|---|---|
| real_jp_melo | 107a1162-7e2f-413f-8043-bcfeb0a9c27d | `real_jp_melo.png` |
| real_psy_horror | 71dceff5-f769-4ee9-99cd-de9f8ff693cd | `real_psy_horror.png` |
| real_hitech_sf | 3225d8f6-1616-451a-bda2-09fa0b830320 | `real_hitech_sf.png` |
| real_desert_fantasy | cbbb31cf-e0f9-4a2d-931d-aaf990eaaeed | `real_desert_fantasy.png` |
| real_urban_hero | 3ce45f1d-3973-4ef0-967b-0fb57315129f | `real_urban_hero.png` |
| real_euro_period | e79b15af-ed65-4bdf-a219-2d0d504e4422 | `real_euro_period.png` |

6장 컨택트 시트(3×2 이어붙임): `old/real_substyles_6up.png` (2026-08-13 정리 시 `old/`로 이동)

### 1차 — 16:9 (보관, `16x9/`)

| key | higgsfield job id |
|---|---|
| real_jp_melo | a2e62410-b1ee-4f84-9f33-f8a1d5b1a109 |
| real_psy_horror | df5eaa6e-b617-465a-b861-b4b7559a99eb |
| real_hitech_sf | ce525fc2-34c5-4e9e-b27c-107ae448075c |
| real_desert_fantasy | 9fc509b6-8d73-4d70-b754-8c632dd73379 |
| real_urban_hero | 31b530be-9ce6-4452-b4b6-b0310aed0c44 |
| real_euro_period | f0ef92b6-775f-4495-b6eb-0b84e94c5620 |

재현: `higgsfield generate create gpt_image_2 --prompt "<위 프롬프트>" --aspect_ratio 1:1` (quality high / resolution 2k 기본값).

## 1차 검수 결과 (2026-07-21, vision 6/6)

루브릭: ① 실사 매체 유지 ② 정물 7요소 + facet 반영 ③ 인물/텍스트/워터마크 없음.

| key | ① | ② | ③ | 관찰 |
|---|---|---|---|---|
| real_jp_melo | Y | Y | Y | 시어 커튼 확산광·파스텔·복숭아빛 사과 — facet 전항 일치 |
| real_psy_horror | Y | Y | Y | 냉창광 vs 병약한 백열등 혼합광 재현. 금속컵이 낡은 깡통형으로 해석됨(톤 정합) |
| real_hitech_sf | Y | Y | Y | 크롬·엣지발광·시안 액센트 정확. 단 6종 중 가장 CG스러움 — `real_3d` 경계 관찰 필요 |
| real_desert_fantasy | Y | Y | Y | 사암 챔버·광선 먼지·건조 배 — 장엄함 재현 최상 |
| real_urban_hero | Y | Y | Y | 청·적·주황 히어로 삼색, HDR 클래리티. 금속컵이 손잡이 머그로 나옴(무해) |
| real_euro_period | Y | Y | Y | 회화적 감쇠·레이스/브로케이드 충실. "은·황동"이 컵 2개로 분리 + 촛대 추가(정물 상수 미세 이탈) |

공통: 16:9(2688×1520) ✓, 구도 비교 가능성(테이블+창가 코너) 유지 ✓. 총 42크레딧 소모(잔액 5,380).

## 2차 검수 결과 (1:1 정본, 2026-07-21, vision 6/6)

전항 통과 (실사 유지 / 정물 7요소+facet / 인물·텍스트 없음). 전부 2048×2048.

- 16:9 대비 개선: euro_period 금속이 은컵 1개로 정리(황동은 촛대가 자연 흡수) — 정물 상수 회복.
- jp_melo 유리잔에 물이 담김(무해 변주). psy_horror 백열등이 파이프 고정형으로 해석(톤 정합).
- hitech_sf 는 여전히 6종 중 가장 CG 인접 — 전이 검증 시 매체 드리프트 관찰 대상(1차와 동일 소견).

## 쇼케이스(프리뷰) 이미지 6종 — 공개용 (2026-07-21)

> **역할 분리**: 정물 앵커(`real_<key>.png`) = 실제 I2I 파이프라인용, **비공개**. 프리뷰(`previews/real_<key>.png`) = 사람들에게 보여줄 전시용 — `style_anchors`의 `image_url` vs `preview_url` 분리 관행과 동일. **프리뷰는 절대 I2I 레퍼런스로 배선 금지**(인물·내용이 포함되어 downstream 누수됨).

**설계 규칙**: 각 톤에서 대중적으로 각인된 유명 작품의 **구도 아키타입**만 차용(구도·조명·스케일은 저작권 대상 아님), 인물·의상·로고는 전부 오리지널로 교체 + "no real actor / no existing character" 네거티브 명시. 그레이딩 언어는 정물 앵커의 facet 블록을 그대로 재사용해 앵커↔프리뷰 톤 일치 보장.

| key | 차용 아키타입 | 인물 처리 |
|---|---|---|
| real_jp_melo | 벚꽃 가로수길+자전거, 역광 (4월 이야기 계열) | 오리지널 캐릭터 |
| real_psy_horror | 1점 투시 낡은 복도 끝 실루엣 (샤이닝/주온 계열) | 뒷모습, 얼굴 없음 |
| real_hitech_sf | 야경 통유리+홀로그램 UI (마이너리티 리포트/오블리비언 계열) | 뒷모습, 추상 글리프만 |
| real_desert_fantasy | 사구 능선 위 점 크기 로브 행렬 (듄/로렌스 계열) | 초원경, 식별 불가 |
| real_urban_hero | 마천루 옥상 망토 히어로 (장르 아키타입) | 호박금 망토+슬레이트블루 슈트 오리지널, 엠블럼 없음 |
| real_euro_period | 촛대 단일광 카드 테이블 귀족 (배리 린든 계열) | 오리지널 캐릭터 |

### 프리뷰 프롬프트 원문 (복붙용)

**real_jp_melo**
```
Cinematic still frame from a gentle Japanese romance film. A quiet residential street lined with cherry trees in full bloom on a bright spring morning, drifting petals filling the air. A young woman — an entirely original character with a short dark bob, a cream cardigan and a long ivory skirt — stands beside her bicycle with a basket of books, glancing back over her shoulder, softly backlit by the morning sun. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 50mm lens, shallow depth of field. Soft neutral spring daylight around 5000K, low contrast, with soft, bright, gently lifted shadows. A muted low-to-medium saturation pastel palette. Delicate romantic bloom and halation on the highlights with fine soft film grain. Mood: the quiet flutter of first love. An entirely original scene and character — do not depict any real actor, celebrity or existing film character. No logos, no text, no letters, no watermark. 1:1.
```

**real_psy_horror**
```
Cinematic still frame from a psychological horror film. A long, narrow, decaying apartment corridor in strict one-point perspective, peeling wallpaper and water-stained walls. At the far end a single figure — an entirely original character, an ordinary person in a damp grey cardigan — stands motionless, facing away from the camera. A cold dim bluish glow seeps from a window at the far end while a sickly warm bare bulb flickers overhead, the two light sources clashing. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens, deep focus. High contrast with deep, unstable, uneasy shadows. A very low saturation, drained, ashen palette. Heavy film grain and a strong dark vignette. Mood: creeping psychological dread. An entirely original scene and character — do not depict any real actor, celebrity or existing film character. No logos, no text, no letters, no watermark. 1:1.
```

**real_hitech_sf**
```
Cinematic still frame from a high-tech science-fiction film. A vast minimalist command room high above a night megacity. A lone figure — an entirely original character in a sleek matte grey-white technical suit — stands with their back to the camera before a floor-to-ceiling window, one hand raised toward translucent holographic interface panels made of purely abstract geometric glyphs and diagrams (no real characters or letters). The night skyline glitters far below. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens. Cool clinical lighting around 7000K, very high contrast, with clean, sharp-edged, precise shadows. A restrained cool near-monochrome palette with only a few controlled high-saturation electric cyan accents from the holograms and window edge lighting. Ultra-sharp detail with a subtle glow on emissive edges. Mood: control and the future. An entirely original scene and character — do not depict any real actor, celebrity or existing film character. No logos, no readable text, no letters, no watermark. 1:1.
```

**real_desert_fantasy**
```
Cinematic still frame from an epic desert fantasy film. A vast ocean of towering sand dunes under a harsh midday sun. Along the razor-sharp ridge of the tallest dune, two tiny robed figures walk in single file, their long sand-colored travel robes and head wraps rippling in the hot wind — entirely original costumes and characters, seen from very far away, faces not visible. Extreme wide shot, monumental scale, heat shimmer on the horizon. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 24mm lens, deep focus. Hard desert sun around 5000K, medium-high contrast, with hot, heavy shadows. A low saturation sun-bleached palette of sand, ochre and bone tones. Fine airborne dust in the air and a filmic grade. Mood: solemn desert grandeur. An entirely original scene and characters — do not depict any real actor, celebrity or existing film character. No logos, no text, no letters, no watermark. 1:1.
```

**real_urban_hero — v2 (정본, 2026-07-21 교체)**

> v1(옥상 고독 컷)이 유저 무드보드(`ChatGPT Image …03_55_11.png` 5번 칸: 팀·액션·폭발·원색)와 달라 교체. 보드 칸에는 실제 어벤져스가 그려져 있어 **픽셀 레퍼런스로는 미사용**(IP 복제 위험) — 구도 DNA만 텍스트로 이식, 5인 전원 오리지널 디자인 + 시그니처 요소 배제 목록 명시. **함정**: 네거티브 절에라도 "Avengers" 단어가 들어가면 higgsfield가 `nsfw`로 거부(1차 잡 647987eb 실측) — IP 고유명사는 부정문에서도 금지, 일반명사 배제 목록만 사용.

```
Cinematic still frame from a superhero blockbuster film. A team of five entirely original superheroes advances toward the camera in a loose V-formation down a battle-damaged downtown avenue, mid-action: at the center a woman in sleek cobalt-and-silver powered armor strides forward with her raised gauntlet glowing cyan; beside her a towering granite-skinned stone colossus with cracked rocky shoulders; a young speedster in a matte amber-and-white aerodynamic suit trailing streaks of light; a swordswoman in emerald scale armor swinging a glowing teal blade; and a hovering telekinetic man in a violet longcoat with rippling energy distortion around his hands. Explosions and orange fireballs erupt behind them, sparks and debris fill the air, cars overturned along the bright city street. Low wide-angle heroic camera, dynamic frozen action. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 24mm lens. Mixed metropolitan light — bright daylight over the downtown blended with fire glow and colorful city practicals — medium-high contrast with open, information-rich shadows full of bounced detail. A bold, high-saturation blockbuster palette of varied vivid primary colors. Punchy clarity and crisp HDR-like micro-contrast. Mood: heroic. An entirely original team, scene and costumes — do not depict any existing superhero, comic-book character or film franchise; no red-and-gold armor, no circular glowing chest device, no round shield, no star emblem, no war hammer, no green-skinned giant. No logos, no emblems, no readable text, no letters, no watermark. 1:1.
```

잡 ID: v2 = `6128ab46-7596-405a-9485-028311997605` (1차 `647987eb…`는 nsfw 거부). v1(옥상) = `2cd3d7c9…`, 파일 `old/real_urban_hero_v1_rooftop.png`.

<details><summary>v1 프롬프트 (보관)</summary>

```
Cinematic still frame from a superhero blockbuster film. A caped hero — an entirely original hero design with a slate-blue armored suit and a billowing amber-gold cape, plain chest with no emblem and no logo — stands on the ledge of a skyscraper rooftop, seen from behind at a three-quarter back angle, overlooking a sunlit modern metropolis. Glass towers below catch bright bouncing daylight while colorful city lights glow in the open shadows. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a 35mm lens. Mixed metropolitan light — bright daylight bounced between glass towers blended with colorful city practicals — medium-high contrast with open, information-rich shadows full of bounced detail. A bold, high-saturation blockbuster palette. Punchy clarity and crisp HDR-like micro-contrast. Mood: heroic. An entirely original scene, costume and character — do not depict any real actor, celebrity or existing superhero, and do not resemble any existing comic-book costume. No logos, no emblems, no text, no letters, no watermark. 1:1.
```

</details>

**real_euro_period**
```
Cinematic still frame from an 18th-century European period drama. In a stately palace salon panelled with aged wood, an aristocratic lady — an entirely original character in an ivory brocade gown with lace sleeves, powdered hair pinned high — sits alone at a small card table lit only by a branched brass candelabra, gazing pensively toward a tall window. Warm candlelight around 3000K mixed with a faint cool glow from the window, low-to-medium contrast, with soft painterly shadows falling off like an old-master oil painting. A muted low-saturation palette of aged gold, umber and deep green. Rendered in photorealistic live-action cinematography, shot on an ARRI Alexa with a fast vintage prime lens at f/1.2, candlelight only. Gentle film grain and a painterly period-drama grade. Mood: dignity and solitude. An entirely original scene and character — do not depict any real actor, celebrity or existing film character. No logos, no text, no letters, no watermark. 1:1.
```

| key | higgsfield job id (1:1) |
|---|---|
| real_jp_melo | e028450e-835e-4956-a026-f4e6a6aeb711 |
| real_psy_horror | c5ab10e7-2fa2-431d-928a-708a5db98bf9 |
| real_hitech_sf | 93e2bea6-2e59-4cdd-a9b7-ae4ff06323f1 |
| real_desert_fantasy | d147c870-f60e-4c18-8db6-0bd5d97e0db9 |
| real_urban_hero | 2cd3d7c9-bcc6-4a1d-9c3d-66e1e8db705c |
| real_euro_period | 7afcf97e-aece-4c80-ad40-b2de36b59e66 |

### 프리뷰 검수 결과 (2026-07-21, vision 6/6 통과)

루브릭: ① 톤 일치(앵커 facet 재현) ② 아키타입 전달력 ③ 실존 배우/기존 캐릭터 비유사·로고/판독 가능 텍스트 없음.

| key | 판정 | 관찰 |
|---|---|---|
| real_jp_melo | ✅ | 벚꽃길 역광+블룸 완벽. 오리지널 캐릭터(특정 배우 비유사) |
| real_psy_horror | ✅ | 1점 투시 복도+냉온 혼합광. 뒷모습이라 얼굴 없음 |
| real_hitech_sf | ✅ | 홀로그램 = 추상 글리프만(판독 가능 문자 없음). 뒷모습 |
| real_desert_fantasy | ✅ | 사구 능선 초원경 2인 — 스틸수트 등 특정 IP 요소 없음 |
| real_urban_hero | ✅ **v2로 교체** | v1(옥상 고독 뒷모습)은 유저 무드보드와 불일치 → v2 = 오리지널 5인 팀 시가전 전진(보드 5번 칸 구도 이식). v1은 `old/real_urban_hero_v1_rooftop.png` 보관 |
| real_euro_period | ✅ | 촛대 단일광 카드 테이블 — 회화적 감쇠. 오리지널 캐릭터 |

공유용 시트: `old/previews_6up.png` (3×2 — 2026-08-13 정리 시 `old/`로 이동).

## 채택 시 다음 단계 (미실행)

1. 룩당 4~6장 재생성 → 1장 수동 선별 (v2 §5)
2. Supabase storage `media/style-anchors/` 업로드 + `style_anchors` 행 추가 (key/label/medium/image_url/preview_url/sort_order) — medium은 전부 `live_action`이므로 서브 룩 구분 컬럼 또는 key 규약(`real_*`) 결정 필요
3. 피커 UI 계층(매체 → 서브 룩) 여부 결정
4. 앵커 절("Do NOT reproduce its subject")이 내용성 요소(썩은 과일·스카이라인)를 실제로 막는지 캐릭터 시트 1건으로 전이 검증
