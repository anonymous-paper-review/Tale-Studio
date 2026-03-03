# Style Heuristics Specification

영상 생성 시 스타일별 시각적 특성을 정의하는 휴리스틱.
프롬프트 빌더가 이 휴리스틱을 참조하여 일관된 스타일을 생성.

---

## 구조

```
style_heuristics/
├── game_cinematic/     # 게임 시네마틱 (현재 문서)
├── anime/              # 애니메이션 (예정)
├── live_action/        # 실사 (예정)
└── motion_graphics/    # 모션 그래픽 (예정)
```

---

# Game Cinematic Heuristics

**참조**: Lost Ark, Diablo IV, League of Legends, World of Warcraft 시네마틱
**제작사 스타일**: Digic Pictures, Blur Studio, Blizzard Entertainment

---

## 1. TEXTURE (텍스처/재질)

### 1.1 Metal (금속)

| 속성 | 값 | 프롬프트 키워드 |
|------|-----|-----------------|
| 반사도 | 높음 (0.7-0.9) | `highly reflective metallic surface` |
| 러프니스 | 낮음-중간 | `polished with micro-scratches` |
| 디테일 | 스크래치, 찍힘, 녹 | `battle-worn, dented, weathered metal` |
| 반사 특성 | 환경 반사 + 림라이트 | `catching ambient light, strong specular highlights` |
| 색상 | 은색, 검은 강철, 금색 장식 | `dark steel with gold trim accents` |

```
[METAL_TEXTURE]
- Primary: dark gunmetal steel with subtle blue-gray undertones
- Secondary: gold/brass ornamental details with warm reflections
- Wear: micro-scratches, battle damage, dust accumulation in crevices
- Lighting response: strong specular highlights, environmental reflections
```

### 1.2 Skin (피부)

| 속성 | 값 | 프롬프트 키워드 |
|------|-----|-----------------|
| SSS | 강함 (귀, 코 주변) | `subsurface scattering on ears and nose` |
| 디테일 | 모공, 잔주름, 흉터 | `visible pores, fine wrinkles, battle scars` |
| 오염 | 먼지, 땀, 핏자국 | `dust-covered, sweat beads, dried blood` |
| 톤 | 약간 desaturated | `slightly desaturated skin tones` |

```
[SKIN_TEXTURE]
- Base: realistic skin with visible pores and fine texture
- Subsurface: warm SSS glow at thin areas (ears, fingers, nose)
- Imperfections: scars, dirt, sweat, blood spatters
- Lighting: soft diffuse with strong rim light separation
```

### 1.3 Hair (머리카락)

| 속성 | 값 | 프롬프트 키워드 |
|------|-----|-----------------|
| 가닥 표현 | 개별 가닥 보임 | `individual hair strands visible` |
| 볼륨 | 자연스러운 볼륨 | `natural volume and body` |
| 빛 투과 | 역광시 빛 투과 | `light transmission through hair edges` |
| 움직임 | 바람에 반응 | `wind-swept, flowing naturally` |

```
[HAIR_TEXTURE]
- Strand detail: individual strands visible, not clumpy
- Volume: natural body with flyaway strands
- Light: backlit translucency, rim light glow
- Motion: physics-based movement, wind interaction
```

### 1.4 Fabric (천/의복)

| 속성 | 값 | 프롬프트 키워드 |
|------|-----|-----------------|
| 주름 | 동적 주름 | `dynamic fabric folds and creases` |
| 두께감 | 재질별 다름 | `heavy wool cape, light silk underlayer` |
| 투과 | 얇은 천은 반투명 | `semi-translucent fabric edges` |
| 움직임 | 관성, 지연 | `fabric trailing with momentum` |

```
[FABRIC_TEXTURE]
- Folds: physically accurate creasing and bunching
- Weight: heavy materials drape differently than light
- Edges: fraying, wear patterns, dust accumulation
- Motion: secondary animation with follow-through
```

### 1.5 Magic/Energy (마법/에너지)

| 속성 | 값 | 프롬프트 키워드 |
|------|-----|-----------------|
| 코어 색상 | 순수 백색/청백색 | `bright white-blue energy core` |
| 외곽 색상 | 채도 높은 색상 | `saturated blue/purple energy aura` |
| 발광 | 강한 블룸 | `intense bloom and glow` |
| 파티클 | 주변 떠다니는 입자 | `floating magical particles, energy wisps` |

```
[MAGIC_TEXTURE]
- Core: overexposed white/cyan center
- Aura: saturated blue (#0066FF to #9933FF gradient)
- Emission: strong bloom bleeding into surroundings
- Particles: floating sparks, energy trails, ambient wisps
```

---

## 2. LIGHTING (조명)

### 2.1 Primary Light Setup

```
[LIGHTING_SETUP]
Key Light:
  - Position: 45° above, 30-60° to side
  - Intensity: LOW to MEDIUM (dramatic contrast)
  - Color: cool blue (#A0C4FF) or warm gold (#FFD700)
  - Quality: hard edges with slight diffusion

Fill Light:
  - Intensity: VERY LOW (ratio 8:1 to 16:1)
  - Purpose: prevent pure black, maintain detail
  - Color: complementary to key (if key is blue, fill is warm)

Rim Light:
  - Position: behind subject, 120-150° from camera
  - Intensity: HIGH (stronger than key)
  - Color: cyan (#00FFFF) or white
  - Purpose: separate subject from background, heroic silhouette
```

### 2.2 Atmospheric Lighting

| 효과 | 설명 | 프롬프트 키워드 |
|------|------|-----------------|
| God Rays | 구름 사이로 빛 줄기 | `god rays piercing through clouds` |
| Volumetric Fog | 빛이 안개에 산란 | `volumetric fog catching light beams` |
| Dust Motes | 공기 중 먼지 입자 | `dust particles floating in light shafts` |
| Magic Glow | 마법이 주변 조명 | `magical energy illuminating surroundings` |

```
[ATMOSPHERIC_LIGHTING]
- Volumetric density: medium (not too thick, not invisible)
- Light scatter color: slightly tinted (blue for night, gold for day)
- Particle visibility: dust, ash, magical particles catching light
- Depth: multiple layers of atmosphere (near fog, mid haze, distant fog)
```

### 2.3 Color Temperature Contrast

```
[COLOR_TEMPERATURE]
Hero/Protagonist:
  - Warm accent lighting (gold, amber)
  - Clean rim light (white/cyan)
  - Represents: hope, power, divinity

Villain/Threat:
  - Cool dominant (deep blue, purple)
  - Red/magenta accents
  - Represents: corruption, danger, otherworldly

Environment:
  - Neutral to cool base
  - Punctuated by warm fire/explosion
  - Desaturated except for key light sources
```

---

## 3. COLOR (색감)

### 3.1 Color Palette

```
[COLOR_PALETTE]
Base Tones (70%):
  - Deep blacks (#0A0A0F)
  - Dark grays (#1A1A24)
  - Desaturated blues (#2A3040)

Accent Colors (20%):
  - Magic blue (#0066FF, #3399FF)
  - Royal purple (#6633CC, #9966FF)
  - Warning red (#CC3300, #FF6633)

Highlight Colors (10%):
  - Pure white (#FFFFFF) - light sources only
  - Gold (#FFD700) - hero accents
  - Cyan (#00FFFF) - rim lights
```

### 3.2 Color Grading

```
[COLOR_GRADING]
Shadows:
  - Push toward blue/teal (#001122)
  - Never pure black, always tinted

Midtones:
  - Slightly desaturated (-15% to -25%)
  - Neutral to cool

Highlights:
  - Warm highlights for fire/magic
  - Cool highlights for moonlight/magic
  - Bloomed, slightly overexposed

Contrast:
  - HIGH overall contrast
  - Crushed blacks with lifted blacks in shadows
  - S-curve with steep midtone section
```

---

## 4. CAMERA (카메라/구도)

### 4.1 Shot Types

| 샷 타입 | 용도 | 특징 |
|---------|------|------|
| Extreme Wide | 스케일 표현, 전장 전경 | 캐릭터 작게, 환경 거대하게 |
| Wide | 액션, 다수 캐릭터 | 전신 + 환경 맥락 |
| Medium | 대화, 결정 순간 | 허리 위, 표정 + 바디랭귀지 |
| Close-up | 감정, 디테일 | 얼굴 중심, 얕은 심도 |
| Extreme Close-up | 눈, 손, 디테일 | 매우 얕은 심도, 텍스처 강조 |

### 4.2 Camera Angles

```
[CAMERA_ANGLES]
Low Angle (Hero Shot):
  - Camera below eye level, looking up
  - Purpose: power, dominance, heroism
  - Combined with: rim light from above

High Angle:
  - Camera above, looking down
  - Purpose: vulnerability, scale, overview
  - Combined with: environmental context

Dutch Angle:
  - Tilted horizon (10-25°)
  - Purpose: tension, disorientation, action
  - Use sparingly for impact

Eye Level:
  - Neutral, intimate
  - Purpose: connection, dialogue
  - Combined with: shallow depth of field
```

### 4.3 Camera Movement

```
[CAMERA_MOVEMENT]
Push In:
  - Slow: building tension, realization
  - Fast: impact moment, revelation

Pull Back:
  - Reveal scale, context
  - Often ends wide shot

Orbit:
  - Circle around subject
  - Hero moment, power display

Crane Up/Down:
  - Vertical movement for scale
  - Rise = triumph, Fall = defeat

Tracking:
  - Follow action laterally
  - Dynamic energy, pursuit

Handheld:
  - Subtle shake for tension
  - Documentary feel, chaos
```

### 4.4 Depth of Field

```
[DEPTH_OF_FIELD]
Close-up: f/1.4 - f/2.8
  - Very shallow, background completely blurred
  - Focus on eyes or key detail

Medium: f/4 - f/5.6
  - Subject sharp, background soft
  - Context visible but not distracting

Wide: f/8 - f/11
  - Deep focus for environment shots
  - Everything relatively sharp

Rack Focus:
  - Shift focus between subjects
  - Guide viewer attention
  - Dramatic reveals
```

---

## 5. VFX (시각효과)

### 5.1 Particles

```
[PARTICLES]
Ambient:
  - Dust motes (always present, subtle)
  - Ash/embers (battlefield, destruction)
  - Snow/rain (weather)
  - Magical wisps (fantasy atmosphere)

Action:
  - Debris (impacts, explosions)
  - Sparks (metal clashing)
  - Blood droplets (combat, stylized)
  - Energy trails (magic attacks)

Scale:
  - Foreground: large, blurred (bokeh)
  - Midground: medium, sharp
  - Background: small, numerous
```

### 5.2 Post-Processing

```
[POST_PROCESSING]
Bloom:
  - Intensity: medium-high on light sources
  - Threshold: high (only brightest areas)
  - Color: tinted to match light source

Lens Flare:
  - Subtle, not overwhelming
  - Triggered by bright light sources
  - Anamorphic streaks for epic moments

Chromatic Aberration:
  - Very subtle (1-2 pixels max)
  - Edges only
  - Increases during high action

Vignette:
  - Subtle darkening at edges
  - Draws focus to center
  - Intensity: 10-20%

Motion Blur:
  - Per-object blur for fast movement
  - Camera motion blur for dynamic shots
  - Amount: realistic, not excessive

Film Grain:
  - Very subtle (almost invisible)
  - Adds texture, cinematic feel
  - Intensity: 2-5%
```

---

## 6. MOTION (동작)

### 6.1 Character Motion

```
[CHARACTER_MOTION]
Speed Variation:
  - Normal: 24fps, realistic timing
  - Slow-mo: 120fps source, emotional beats
  - Speed ramp: normal → slow → normal for impacts

Weight:
  - Heavy armor = slower acceleration, longer settling
  - Light characters = quicker, more agile
  - Weapons have momentum and follow-through

Anticipation:
  - Wind-up before major actions
  - Eye movement leads body movement
  - Weight shift before motion

Follow-through:
  - Hair and cloth continue after body stops
  - Weapons settle with secondary motion
  - Breath and micro-movements at rest
```

### 6.2 Environmental Motion

```
[ENVIRONMENTAL_MOTION]
Always Present:
  - Wind: grass, dust, flags, capes
  - Particles: floating debris, embers
  - Atmosphere: drifting fog/smoke

Triggered:
  - Impact: ground cracks, debris spray
  - Magic: energy ripples, light pulses
  - Movement: dust clouds, displaced air
```

---

## 7. COMPOSITION (구도)

### 7.1 Rule of Thirds + Dynamic

```
[COMPOSITION]
Subject Placement:
  - Primary subject at power points (1/3 intersections)
  - Looking room: space in direction of gaze
  - Lead room: space in direction of movement

Depth Layers:
  - Foreground: framing elements, particles
  - Midground: main action, subjects
  - Background: environment, context, threats

Visual Weight:
  - Bright areas draw attention
  - Contrast creates hierarchy
  - Isolation emphasizes importance
```

### 7.2 Scale Contrast

```
[SCALE_CONTRAST]
Hero vs Threat:
  - Show threat as massive, overwhelming
  - Hero small but determined
  - Creates stakes, tension

Environment Scale:
  - Architecture impossibly large
  - Natural formations dwarf characters
  - Sky fills 40-60% of frame in wide shots
```

---

## 8. PROMPT TEMPLATE

### 8.1 Complete Prompt Structure

```
[SCENE_DESCRIPTION]
{shot_type} of {subject} in {environment}.

[TEXTURE_BLOCK]
{metal_texture}
{skin_texture}
{fabric_texture}
{magic_texture}

[LIGHTING_BLOCK]
{key_light_setup}
{rim_light_setup}
{atmospheric_lighting}
{color_temperature}

[COLOR_BLOCK]
Color palette: {base_tones}, accented with {accent_colors}.
Color grading: {shadow_color} shadows, {highlight_color} highlights.
Overall: {saturation_level} saturation, {contrast_level} contrast.

[CAMERA_BLOCK]
Camera: {angle}, {movement}.
Depth of field: {dof_setting}, focus on {focus_subject}.
Lens: {focal_length}mm equivalent.

[VFX_BLOCK]
Particles: {ambient_particles}, {action_particles}.
Atmosphere: {volumetric_effects}.
Post-processing: {bloom}, {motion_blur}.

[MOTION_BLOCK]
Character motion: {speed}, {weight_description}.
Environmental motion: {wind}, {particles}, {atmosphere}.

[STYLE_BLOCK]
Style: Game cinematic, Unreal Engine 5 quality, Digic Pictures aesthetic.
Reference: Lost Ark, Diablo IV cinematics.
Quality: Photorealistic rendering, 24fps cinematic motion blur.
```

---

## Usage Example

```python
from style_heuristics import GameCinematicHeuristics

heuristics = GameCinematicHeuristics()

prompt = heuristics.build_prompt(
    shot_type="low_angle_hero",
    subject="armored knight with glowing sword",
    environment="war-torn battlefield at dusk",
    mood="determination",
    action="slowly raises sword overhead"
)
```

---

## Version History

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 0.1 | 2026-01-17 | 초안 작성, Lost Ark 분석 기반 |
