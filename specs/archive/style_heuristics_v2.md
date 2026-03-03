# Game Cinematic Style Heuristics v2

**분석 소스**:
- Lost Ark (Smilegate, 한국)
- Diablo IV (Blizzard, 미국)
- World of Warcraft: The War Within (Blizzard, 미국)

**분석 방식**: 프레임 단위 시각적 요소 추출

---

## 1. SKIN TEXTURE (피부 텍스처)

### 1.1 Surface Detail Levels

| 레벨 | 설명 | 예시 | 프롬프트 키워드 |
|------|------|------|-----------------|
| L1 | 모공 | 코, 볼, 이마에 미세한 구멍 | `visible pores on nose and cheeks` |
| L2 | 주름/라인 | 눈가 잔주름, 이마 주름, 미간 | `fine wrinkles around eyes, forehead lines` |
| L3 | 상처/흉터 | 베인 자국, 화상, 타박 | `battle scars, healed cuts, bruising` |
| L4 | 표면 오염 | 먼지, 땀, 피, 재 | `dirt-covered, sweat droplets, blood splatter, ash` |
| L5 | 피하 디테일 | 혈관, 멍, 부종 | `visible veins, bruise discoloration, swelling` |

### 1.2 Subsurface Scattering (SSS)

```
[SSS_SPEC]
강도: 얇은 부위에서 강함
적용 부위:
  - 귀 (backlit 시 붉은 빛 투과)
  - 코끝 (측면 조명 시)
  - 손가락 (역광 시)
  - 입술 가장자리

색상: 따뜻한 붉은색/오렌지색 (blood red undertone)
조건: 강한 역광 또는 측면광 필요

프롬프트:
"warm subsurface scattering glow on ears and fingertips,
blood-red translucency when backlit,
organic light transmission through thin skin areas"
```

### 1.3 Skin Lighting Response

```
[SKIN_LIGHTING]
Specular:
  - 이마, 코, 광대뼈에 하이라이트
  - 땀이 있으면 강도 증가
  - 오일리한 질감 = 더 강한 스펙큘러

Diffuse:
  - 부드러운 그라데이션
  - 그림자 경계가 부드러움 (soft falloff)

Rim:
  - 피부 윤곽을 따라 밝은 테두리
  - 턱선, 코, 귀 외곽 강조

프롬프트:
"oily skin with strong specular highlights on forehead and nose,
soft shadow gradients on cheeks,
bright rim light tracing jaw and ear contours"
```

---

## 2. METAL TEXTURE (금속 텍스처)

### 2.1 Metal Types

| 타입 | 반사도 | 러프니스 | 색상 | 프롬프트 |
|------|--------|----------|------|----------|
| 광택 강철 | 0.9 | 0.1 | 밝은 은색 | `polished steel mirror-like reflection` |
| 무광 강철 | 0.6 | 0.4 | 어두운 회색 | `brushed steel matte finish` |
| 다크 건메탈 | 0.5 | 0.3 | 청회색 | `dark gunmetal with blue-gray undertone` |
| 금도금 | 0.85 | 0.15 | 금색 | `ornate gold plating warm reflections` |
| 부식된 금속 | 0.3 | 0.7 | 갈색/녹색 | `corroded metal, rust patches, verdigris` |
| 검은 철 | 0.4 | 0.5 | 거의 검정 | `blackened iron, forge-darkened steel` |

### 2.2 Wear and Damage

```
[METAL_WEAR]
레벨 1 - 사용감:
  - 미세한 스크래치 (hairline scratches)
  - 가장자리 마모 (edge wear)
  - 지문/기름 자국

레벨 2 - 전투 손상:
  - 찍힘 (dents)
  - 깊은 긁힘 (deep gouges)
  - 칼자국 (blade marks)

레벨 3 - 심한 손상:
  - 금 (cracks)
  - 부분 파손
  - 녹/부식

환경 축적:
  - 홈에 먼지 축적 (dust accumulation in crevices)
  - 피/오물 자국
  - 그을음 (soot)

프롬프트:
"battle-worn armor with deep gouges and dents,
dust accumulated in ornamental crevices,
blade marks across breastplate,
dried blood in the grooves"
```

### 2.3 Ornamental Detail

```
[ORNAMENTS]
종류:
  - 각인 (engravings): 문양, 룬, 문자
  - 보석 (gems): 빛나는 포인트
  - 에나멜 (enamel): 색상 장식
  - 체인 (chainmail): 미세한 금속 고리
  - 가죽 스트랩 (leather straps): 다른 재질 조합

빛 반응:
  - 보석: 내부 발광 + 표면 반사
  - 각인: 그림자로 입체감
  - 체인: 수많은 작은 하이라이트

프롬프트:
"intricate gold filigree engravings on shoulder pauldrons,
glowing ruby gems embedded in breastplate,
fine chainmail visible at joints,
worn leather straps with brass buckles"
```

---

## 3. LIGHTING (조명)

### 3.1 Key Light Setups by Mood

| 분위기 | 키 라이트 | 필 라이트 | 림 라이트 | 색온도 |
|--------|-----------|-----------|-----------|--------|
| 영웅적 | 45° 상단, 중간 | 1:8 | 강함, 청백색 | 따뜻한 금색 |
| 암울한 | 90° 측면, 약함 | 거의 없음 | 약함 | 차가운 청색 |
| 신성한 | 직상방, 강함 | 균일 | 후광 | 순백색/금색 |
| 사악한 | 아래에서, 약함 | 붉은색 | 강함, 붉은색 | 붉은/보라색 |
| 미스터리 | 후면, 강함 | 없음 | 아주 강함 | 청록색 |

### 3.2 Dramatic Lighting Techniques

```
[LIGHTING_TECHNIQUES]
렘브란트 조명 (Rembrandt):
  - 45° 각도
  - 반대쪽 볼에 삼각형 하이라이트
  - 깊은 그림자
  → "Rembrandt lighting with triangle highlight on cheek"

스플릿 조명 (Split):
  - 90° 측면
  - 얼굴 절반만 조명
  - 극단적 드라마
  → "split lighting, half face in shadow"

역광 실루엣 (Silhouette):
  - 후면 100%, 전면 0%
  - 윤곽만 보임
  - 신비로움/위협
  → "complete silhouette with bright backlight"

림 라이트 강조 (Rim Emphasis):
  - 120-150° 후측면
  - 테두리만 밝음
  - 분리감/영웅적
  → "strong rim light outlining figure against dark background"
```

### 3.3 Volumetric Lighting

```
[VOLUMETRICS]
God Rays (빛 줄기):
  - 구름 사이, 창문, 균열에서
  - 먼지 입자로 가시화
  - 평행 또는 방사형
  → "god rays streaming through parting clouds,
     dust particles visible in light shafts"

Fog Interaction (안개와 빛):
  - 저지대에 얇은 안개
  - 빛이 안개에 산란
  - 깊이감 증가
  → "low-lying fog catching warm light,
     volumetric haze adding depth"

Light Bloom (빛 번짐):
  - 밝은 광원 주변 글로우
  - 마법/신성한 효과에 강하게
  → "intense bloom around light sources,
     magical energy with excessive glow"
```

---

## 4. COLOR (색감)

### 4.1 Color Palettes by Style

**Diablo 4 (어둠/공포)**:
```
Base: #0A0A0A (순수 검정에 가까움)
Shadow: #1A1A1A (아주 어두운 회색)
Midtone: #3A3A3A (어두운 회색)
Accent Warm: #CC4400 (피, 불)
Accent Cool: #4488AA (죽음, 차가움)
Highlight: #FFAA66 (따뜻한 하이라이트)
```

**Lost Ark (하이 판타지)**:
```
Base: #0A0A1F (어두운 청색)
Shadow: #1A1A2F (청색 틴트 그림자)
Midtone: #3A4050 (중간 청회색)
Magic Blue: #0066FF (주요 마법)
Magic Purple: #9933FF (보조 마법)
Gold: #FFD700 (영웅적 하이라이트)
Cyan: #00FFFF (림 라이트)
```

**WoW (화려한 판타지)**:
```
Base: #151525 (보라색 틴트)
Shadow: #2A2040 (딥 퍼플)
Midtone: #4A4060 (보라/파랑)
Arcane: #AA66FF (마법 보라)
Holy: #FFD700 (신성 금색)
Fel: #66FF00 (악마 녹색)
Void: #6600AA (공허 보라)
```

### 4.2 Color Grading Curve

```
[COLOR_GRADING]
Shadows:
  - 절대 순수 검정 없음
  - 항상 색상 틴트 (blue/teal 또는 purple)
  - 살짝 lifted (RGB 5-15)

Midtones:
  - Desaturation: -20% to -30%
  - 채도 낮추되 완전 회색은 아님
  - 색조 유지하되 muted

Highlights:
  - 과노출 허용 (bloom)
  - 색상 유지 또는 white로 washout
  - 가장 밝은 부분만 순백

Contrast:
  - S-curve 강하게
  - 어두운 부분 더 어둡게
  - 밝은 부분 더 밝게
  - 중간 톤 압축

LUT 스타일:
  - "Teal and Orange" 기본
  - 피부톤 보호
  - 하늘/배경 청색 강조
```

---

## 5. CAMERA (카메라)

### 5.1 Shot Composition Patterns

```
[COMPOSITION_PATTERNS]
패턴 1: 압도적 스케일
  - 프레임 80% 이상을 위협/환경이 차지
  - 캐릭터는 작게
  - 로우 앵글에서 올려다봄
  → "tiny figure dwarfed by massive threat,
     overwhelming scale, low angle looking up"

패턴 2: 영웅적 클로즈업
  - 얼굴이 프레임 60-80%
  - 약간 로우앵글
  - 배경 완전 블러
  → "heroic close-up, face filling frame,
     slightly low angle, bokeh background"

패턴 3: 대치 구도
  - 화면 양쪽에 대립하는 요소
  - 중앙 비움 또는 충돌점
  - 긴장감
  → "confrontation composition,
     opposing forces on each side,
     tension in the center"

패턴 4: 신성한 하강광
  - 위에서 빛이 내려옴
  - 캐릭터 중앙, 빛 아래
  - 후광 효과
  → "divine light descending from above,
     character bathed in heavenly glow,
     halo effect"
```

### 5.2 Camera Movement Vocabulary

```
[CAMERA_MOVES]
Creep (기어가기):
  - 매우 느린 푸시인
  - 긴장 고조
  - 0.5-1% zoom/second
  → "imperceptibly slow creep toward face"

Boom Up (상승):
  - 수직 상승
  - reveal 또는 승리감
  → "boom up revealing vast battlefield below"

Orbit (궤도):
  - 피사체 주위 회전
  - 영웅적 순간
  - 보통 120-180° arc
  → "slow orbit around hero, showcasing determination"

Whip Pan (휩 팬):
  - 급격한 좌우 이동
  - 액션 연결
  - 모션 블러 강함
  → "whip pan to new action, motion blur streak"

Dolly Zoom (돌리 줌):
  - 줌 인 + 카메라 후진 (또는 반대)
  - 불안감, vertigo
  → "dolly zoom creating disorienting vertigo effect"
```

### 5.3 Depth of Field by Shot Type

```
[DOF_SETTINGS]
Extreme Close-up (눈, 손):
  - f/1.2 - f/1.8
  - 밀리미터 단위 포커스
  - 속눈썹에 포커스, 홍채 블러 가능

Close-up (얼굴):
  - f/1.8 - f/2.8
  - 두 눈 모두 포커스
  - 귀 약간 소프트

Medium (상반신):
  - f/2.8 - f/4
  - 전신 포커스
  - 배경 부드럽게 블러

Wide (전경):
  - f/5.6 - f/8
  - 대부분 포커스
  - 극원거리만 소프트

Deep Focus (모든 것 선명):
  - f/11+
  - 스케일 강조 시
  - 모든 요소 동등하게 중요할 때
```

---

## 6. VFX (시각 효과)

### 6.1 Particle Systems

```
[PARTICLES_AMBIENT]
항상 존재 (Always Present):
  먼지 (Dust Motes):
    - 크기: 0.5-3mm appearing
    - 밀도: 평방미터당 5-20개
    - 움직임: 천천히 떠다님, 공기 흐름 따름
    - 빛 반응: 역광 시 빛남
    → "floating dust particles catching backlight"

  재/잔해 (Ash/Embers):
    - 크기: 1-5mm
    - 색상: 회색(재) 또는 주황(불씨)
    - 움직임: 상승 (열기류)
    → "glowing embers rising in heat currents"

  마법 입자 (Magic Wisps):
    - 크기: 2-10mm
    - 색상: 마법 색상 (푸른색, 보라색)
    - 움직임: 불규칙, 캐릭터 주변 궤도
    - 발광: 자체 발광 + 블룸
    → "ethereal blue wisps orbiting around hands,
       self-illuminated magical particles"

[PARTICLES_ACTION]
충격 시 (On Impact):
  파편 (Debris):
    - 돌, 나무, 금속 조각
    - 물리 기반 궤적
    - 크기 다양 (먼지~큰 조각)
    → "explosion of stone debris,
       chunks flying with realistic physics"

  스파크 (Sparks):
    - 금속 충돌 시
    - 밝은 주황/흰색
    - 짧은 꼬리
    → "shower of bright sparks from clashing blades"

  피/액체 (Blood/Liquid):
    - 양식화된 처리
    - 검은색 또는 진한 빨강
    - 슬로모션에서 강조
    → "stylized blood droplets in slow motion"
```

### 6.2 Magic/Energy Effects

```
[MAGIC_EFFECTS]
구조 (Structure):
  Core (핵심):
    - 가장 밝음 (오버익스포저)
    - 색상: 흰색 또는 아주 연한 색
    - 형태: 집중된 점 또는 선

  Inner Glow (내부 글로우):
    - 코어 주변
    - 주 색상의 밝은 버전
    - 부드러운 경계

  Outer Aura (외부 오라):
    - 가장 넓은 영역
    - 주 색상
    - 페이드 아웃

  Particles (입자):
    - 오라 주변 떠다님
    - 작은 발광 점
    - 불규칙한 움직임

색상 매핑 (Color Mapping):
  신성/빛: 금색 (#FFD700) → 흰색
  비전/마법: 보라색 (#9933FF) → 청백색
  화염: 주황색 (#FF6600) → 노란색 → 흰색
  얼음: 청색 (#66CCFF) → 흰색
  어둠: 보라색 (#6600AA) → 검정 (역발광)
  자연: 녹색 (#66FF66) → 흰색

프롬프트 예시:
"arcane energy with overexposed white-blue core,
 purple inner glow fading to violet outer aura,
 tiny magical sparks orbiting the effect,
 intense bloom bleeding into surroundings"
```

### 6.3 Post-Processing Stack

```
[POST_PROCESSING]
순서 (Order):
1. Color Grading (LUT 적용)
2. Bloom (밝은 영역 번짐)
3. Lens Flare (렌즈 플레어)
4. Chromatic Aberration (색수차)
5. Vignette (비네팅)
6. Film Grain (필름 그레인)
7. Motion Blur (모션 블러)

세부 설정:
Bloom:
  - Threshold: 0.8-0.9 (밝은 것만)
  - Intensity: 0.3-0.6
  - Color: 광원 색상 유지
  → "bloom on light sources, preserving color tint"

Chromatic Aberration:
  - Intensity: 0.1-0.3%
  - 프레임 가장자리에만
  - 빠른 동작 시 증가
  → "subtle chromatic aberration at frame edges"

Vignette:
  - Intensity: 10-25%
  - Feather: 부드럽게
  - 중앙 주목도 향상
  → "gentle vignette darkening corners"

Film Grain:
  - Intensity: 2-5%
  - Size: 작게
  - 밝은 영역에서 더 보임
  → "subtle film grain adding texture"

Motion Blur:
  - Shutter Angle: 180°
  - 빠른 동작에만
  - 카메라 움직임에도 적용
  → "cinematic motion blur on fast movements"
```

---

## 7. MOTION (동작)

### 7.1 Character Animation Principles

```
[ANIMATION_PRINCIPLES]
무게감 (Weight):
  - 무거운 갑옷: 시작/정지 느림, 관성 큼
  - 가벼운 천: 빠른 반응, 오버슈트
  - 무기: 휘두를 때 몸 전체가 따라감
  → "heavy armor with slow acceleration,
     weapon swing pulling entire body"

예비 동작 (Anticipation):
  - 큰 동작 전 반대 방향으로 움츠림
  - 눈이 먼저 이동
  - 무게 중심 이동
  → "wind-up before strike,
     eyes leading body movement,
     weight shift telegraphing action"

팔로우 스루 (Follow-through):
  - 몸이 멈춰도 말단부 계속 이동
  - 머리카락, 옷, 장식품
  - 점점 감속하며 정착
  → "hair and cape continuing after body stops,
     gradual settling of secondary elements"

스피드 램프 (Speed Ramp):
  - 중요 순간에 슬로모션
  - 충격 직전/직후
  - 평상시 → 슬로모션 → 평상시
  → "impact moment in slow motion,
     ramping from normal to 120fps and back"
```

### 7.2 Environmental Animation

```
[ENVIRONMENT_MOTION]
항상 동작 (Constant):
  바람:
    - 깃발, 망토, 머리카락
    - 풀, 나뭇잎
    - 먼지, 연기
    - 방향 일관성 유지

  호흡:
    - 캐릭터 가슴/어깨 미세 움직임
    - 정적 순간에도 생동감

  대기:
    - 안개 천천히 이동
    - 먼지 부유
    - 불꽃 떨림

이벤트 트리거 (Triggered):
  충격:
    - 지면 균열
    - 파편 스프레이
    - 충격파 링

  마법:
    - 에너지 파동
    - 빛 펄스
    - 주변 물체 반응
```

---

## 8. COMPOSITION (구도)

### 8.1 Frame Division

```
[FRAME_DIVISION]
황금 비율 (Golden Ratio):
  - 1:1.618 분할점에 주요 요소
  - 자연스러운 시선 흐름

삼등분 (Rule of Thirds):
  - 교차점에 눈, 얼굴, 주요 포인트
  - 수평선은 1/3 또는 2/3 위치

대각선 (Diagonals):
  - 동적 에너지
  - 검, 시선, 움직임 방향

프레임 내 프레임 (Frame within Frame):
  - 문, 창, 아치로 프레이밍
  - 깊이감과 집중
```

### 8.2 Visual Hierarchy

```
[VISUAL_HIERARCHY]
1순위 - 밝기 (Brightness):
  - 가장 밝은 곳에 시선
  - 주인공 얼굴에 하이라이트
  - 배경은 어둡게

2순위 - 대비 (Contrast):
  - 고대비 영역으로 시선
  - 주요 요소만 선명하게

3순위 - 색상 (Color):
  - 채도 높은 색 = 주목
  - 마법 효과, 눈 등

4순위 - 포커스 (Focus):
  - 선명한 영역 = 중요
  - 블러 영역 = 배경

5순위 - 크기 (Size):
  - 큰 것이 더 주목
  - 스케일 대비 활용
```

---

## 9. PROMPT TEMPLATES

### 9.1 Hero Shot Template

```
[SHOT_TYPE: Hero Shot]

SCENE:
{angle} shot of {character} {action}.
{environment_context}.

TEXTURE:
Skin: {skin_detail_level}, {skin_imperfections}.
Metal: {metal_type}, {metal_wear}, {ornaments}.
Fabric: {fabric_type}, {fabric_motion}.

LIGHTING:
Key: {key_position}, {key_color}, {key_intensity}.
Rim: {rim_position}, {rim_color}, strong separation.
Atmosphere: {volumetric_type}, {atmospheric_particles}.

COLOR:
Palette: {base_color} base, {accent_color} accents.
Grading: {shadow_tint} shadows, {highlight_treatment} highlights.
Saturation: {saturation_level}.
Contrast: {contrast_level}.

CAMERA:
Angle: {camera_angle}, emphasizing {emphasis}.
Movement: {camera_movement}.
DOF: {aperture}, focus on {focus_point}.
Lens: {focal_length}mm equivalent.

VFX:
Particles: {ambient_particles}, {action_particles}.
Magic: {magic_effect_description}.
Post: {post_processing_effects}.

MOTION:
Character: {motion_speed}, {weight_description}.
Secondary: {secondary_animation}.
Environment: {environmental_motion}.

STYLE:
Quality: {rendering_quality}.
Reference: {reference_works}.
Avoid: {negative_elements}.
```

### 9.2 Example: Luterra Hero Shot

```
SCENE:
Low angle hero shot of King Luterra raising his legendary sword.
War-torn battlefield at dusk, ruins and debris surrounding him.

TEXTURE:
Skin: visible pores and fine wrinkles, dirt and dried sweat, subtle SSS on ears.
Metal: polished silver armor with gold trim, battle-worn with scratches and dents, intricate lion engravings on pauldrons.
Fabric: heavy royal blue cape, dramatic billowing in wind, frayed edges.

LIGHTING:
Key: 45° front-right, warm gold (#FFD700), medium intensity.
Rim: 150° back-left, cyan (#00FFFF), strong separation.
Atmosphere: god rays through parting storm clouds, dust motes in light shafts.

COLOR:
Palette: deep blue-black (#0A0A1F) base, gold and cyan accents.
Grading: blue-tinted (#001122) shadows, warm golden highlights.
Saturation: -20% overall, magic effects full saturation.
Contrast: high, crushed blacks, blown highlights on sword.

CAMERA:
Angle: 15° below eye level, emphasizing heroic stature.
Movement: slow push-in (creep), 0.5% per second.
DOF: f/2.0, focus on eyes and sword.
Lens: 85mm equivalent.

VFX:
Particles: floating ash and embers, dust motes catching light.
Magic: sword glowing with overexposed gold-white core, warm bloom bleeding outward, energy wisps orbiting blade.
Post: medium bloom, subtle vignette, film grain 3%.

MOTION:
Character: slow deliberate movement, heavy armor weight, sword rising ceremonially.
Secondary: hair and cape billowing, armor ornaments swaying.
Environment: constant wind, drifting smoke, settling debris.

STYLE:
Quality: Unreal Engine 5 photorealistic, Blur Studio cinematic quality.
Reference: Lost Ark, Diablo IV cinematics.
Avoid: anime style, fast jerky motion, oversaturation, modern elements.
```

---

## Version History

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0 | 2026-01-17 | 초안 (Lost Ark 분석) |
| 2.0 | 2026-01-17 | Diablo IV, WoW 추가 분석, 상세화 |
