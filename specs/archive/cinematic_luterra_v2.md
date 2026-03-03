# Cinematic Plan: 루테란의 결정 v2

> I2V 방식 (Imagen → Veo 3.0) 상세 스펙

## 제작 설정

| 항목 | 값 |
|------|-----|
| 방식 | I2V (이미지 → 영상) |
| Imagen 모델 | imagen-4.0-generate-001 |
| Veo 모델 | veo-3.0-generate-001 |
| Aspect Ratio | 16:9 |
| Duration | 8초/씬 |
| 총 씬 수 | 10개 |

---

## 글로벌 스타일 프리셋

```yaml
style_base: |
  Lost Ark game cinematic style,
  Korean MMO dark fantasy aesthetic,
  Unreal Engine 5 quality rendering,
  volumetric lighting with god rays,
  cinematic color grading (desaturated blues and oranges),
  film grain subtle,
  16:9 aspect ratio

lighting_war: |
  dramatic rim lighting,
  red-orange sunset through smoke,
  volumetric fog,
  fire glow from burning debris

armor_detail: |
  intricate fantasy armor with engravings,
  metallic reflections,
  battle-worn scratches and dents,
  glowing magical runes
```

---

## 캐릭터 고정 프롬프트

### 루테란 (Luterra)
```yaml
imagen_base: |
  A majestic middle-aged male king warrior,
  ornate golden plate armor with royal blue cape,
  shoulder pauldrons with lion motifs,
  holding a legendary glowing greatsword with golden hilt,
  short dark hair with grey streaks,
  weathered face with determined eyes,
  slight beard stubble,
  Lost Ark game character design,
  Unreal Engine 5 rendering

emotion_variants:
  neutral: stoic and regal expression, calm authority
  burdened: heavy expression, slight frown, weight of decision
  resolved: fierce determination, eyes glowing with conviction
```

### 아제나 (Azena)
```yaml
imagen_base: |
  A fierce female warrior in her 30s,
  crimson and black layered armor with sharp angular design,
  long dark hair flowing,
  dual blades sheathed on back,
  pale skin with subtle battle scars,
  intense eyes with faint red glow,
  Lost Ark game character design,
  Unreal Engine 5 rendering

emotion_variants:
  rage: teeth clenched, veins visible on neck, tears of anger
  grief: pained expression, trembling lips
  shock: wide eyes, mouth slightly open
```

### 카단 (Kadan)
```yaml
imagen_base: |
  A noble male paladin warrior,
  silver-white ornate armor with holy symbols,
  large tower shield strapped to back,
  short silver hair slicked back,
  calm wise eyes with soft golden glow,
  clean-shaven angular face,
  Lost Ark game character design,
  Unreal Engine 5 rendering

emotion_variants:
  observing: neutral watchful expression
  trusting: subtle nod, slight smile
```

---

## Scene 1: 전쟁터 폐허 (Establishing)

### 목적
- 세계관 설정
- 전쟁의 참상과 긴박함 전달

### Imagen 프롬프트 (키프레임)
```
Wide aerial view of a devastated fantasy battlefield at dusk,

Foreground:
- broken siege weapons and shattered catapults
- scattered weapons (swords, shields, spears) embedded in ground
- tattered war banners fluttering (blue and gold colors)
- small fires burning among debris

Midground:
- ruined stone fortress walls, partially collapsed
- silhouettes of fallen soldiers (not graphic, just shapes)
- overturned war wagons

Background:
- massive demonic fortress on distant mountain, glowing red
- sky filled with dark smoke and crimson sunset
- ominous storm clouds gathering

Atmosphere:
- volumetric fog rolling across ground
- god rays breaking through smoke
- ember particles floating in air

Lost Ark game cinematic style, Unreal Engine 5 quality,
epic fantasy dark atmosphere, 16:9 cinematic composition
```

### Veo 프롬프트 (동작)
```
Slow cinematic drone shot pushing forward over battlefield,
camera starts high, gradually descending,
subtle parallax as camera moves past debris in foreground,
wind blowing smoke and embers across frame,
distant fires flickering,
banners swaying gently,
8 seconds duration, smooth steady movement
```

### 기술 노트
- 카메라: 드론 푸시인, 높은곳 → 중간높이
- 속도: 느림 (장엄함)
- 동작: 환경만 (연기, 불, 깃발)

---

## Scene 2: 에스더들의 모임 (Group)

### 목적
- 주요 캐릭터 소개
- 회의 분위기 설정

### Imagen 프롬프트 (키프레임)
```
Medium wide shot of fantasy war council,

Center:
- Luterra standing tall in golden armor,
  holding sword point-down before him,
  stoic expression with weight of leadership

Left side:
- Azena in crimson armor, arms crossed,
  tense aggressive stance, looking at Luterra

Right side:
- Kadan in silver armor, calm observing pose,
  hands clasped behind back

Background:
- ruined stone amphitheater with broken columns
- torches providing warm flickering light
- other armored warriors (4-5) standing in semicircle, blurred
- dark stormy sky visible above

Lighting:
- warm torchlight from sides
- cold blue ambient from sky
- dramatic rim lighting on main characters

Lost Ark game cinematic style, Unreal Engine 5 quality,
tense war council atmosphere, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Static medium shot with subtle camera drift,
torchlight flickering creating moving shadows,
Luterra's cape swaying slightly in wind,
characters breathing subtly visible,
tension in stillness,
distant thunder rumble atmosphere,
8 seconds duration
```

### 기술 노트
- 카메라: 정적 + 미세 흔들림
- 동작: 최소 (호흡, 옷자락)
- 초점: 그룹 전체

---

## Scene 3: 아제나의 분노 (Close-up)

### 목적
- 갈등의 시작
- 아제나의 트라우마와 분노 표현

### Imagen 프롬프트 (키프레임)
```
Close-up portrait of Azena,

Face:
- intense rage expression, teeth slightly clenched
- eyes with faint red glow, tears welling up
- veins visible on temples from tension
- pale skin flushed with emotion

Pose:
- fist raised and clenched at chest level
- shoulders tensed, leaning forward aggressively
- mouth open as if shouting

Details:
- strands of dark hair across face
- sweat beads on forehead
- crimson armor collar visible at bottom

Lighting:
- dramatic rim light from behind (red-orange)
- face lit by warm firelight from front
- high contrast, cinematic

Background:
- blurred dark figures and torch flames
- shallow depth of field

Lost Ark game cinematic style, Unreal Engine 5 quality,
emotional intensity, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Azena screaming with rage, fist trembling,
tears streaming down one cheek,
slight camera shake matching emotional intensity,
hair and loose strands moving with her motion,
shallow breathing visible in chest,
background torch flames flickering,
camera very slowly pushing in,
8 seconds duration
```

### 기술 노트
- 카메라: 느린 푸시인 + 감정적 흔들림
- 동작: 떨림, 눈물, 외침
- 음향 상상: 분노의 외침

---

## Scene 4: 루테란의 경청 (Reaction)

### 목적
- 루테란의 무게감 표현
- 리더의 고뇌

### Imagen 프롬프트 (키프레임)
```
Medium close-up of Luterra listening,

Face:
- heavy burdened expression
- eyes cast slightly downward
- deep frown lines visible
- jaw tight with restraint

Pose:
- head tilted slightly down
- both hands gripping sword hilt tightly
- knuckles white from tension
- shoulders heavy, not squared

Details:
- golden armor reflecting warm firelight
- blue cape draped behind
- battle damage visible on armor

Lighting:
- soft front lighting showing age lines
- rim light from torches behind
- shadows emphasizing gravity

Background:
- out of focus, dark with warm torch spots

Lost Ark game cinematic style, Unreal Engine 5 quality,
weight of leadership, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Luterra standing still, absorbing words,
slow heavy exhale visible,
grip tightening on sword hilt,
eyes slowly close then open,
subtle head shake of internal conflict,
cape barely moving,
steady camera, no movement,
8 seconds duration
```

### 기술 노트
- 카메라: 완전 정적
- 동작: 미세함 (호흡, 손 조임)
- 표현: 억제된 감정

---

## Scene 5: 대립 (Two-Shot)

### 목적
- 갈등의 정점
- 두 입장의 충돌

### Imagen 프롬프트 (키프레임)
```
Two-shot over-the-shoulder from behind Luterra,

Foreground (Luterra's back):
- golden armor shoulder and cape visible
- back of head with short dark hair
- occupying left 1/3 of frame

Facing camera (Azena):
- full face visible, aggressive stance
- leaning forward toward Luterra
- hand pointing accusingly
- eyes blazing with frustration

Between them:
- visible tension in the space
- torch flame between them

Background:
- other Esther warriors watching, concerned
- Kadan visible in distance, observing
- ruined amphitheater setting

Lighting:
- Azena lit dramatically
- Luterra in silhouette from this angle
- high contrast confrontation

Lost Ark game cinematic style, Unreal Engine 5 quality,
confrontation composition, 16:9 aspect ratio
```

### Veo 프롬프트 (동작)
```
Azena gesturing angrily, pointing at Luterra,
Luterra slowly raising his head to meet her gaze,
tension between them palpable,
other warriors shifting uncomfortably in background,
torch flames dancing with the confrontation energy,
camera slowly orbiting to reveal both faces,
8 seconds duration
```

### 기술 노트
- 카메라: 느린 궤도 이동
- 동작: 아제나 제스처, 루테란 고개 들기
- 클라이맥스 빌드업

---

## Scene 6: 카단의 시선 (Cutaway)

### 목적
- 제3자 관점 제공
- 루테란에 대한 신뢰 암시

### Imagen 프롬프트 (키프레임)
```
Medium shot of Kadan observing,

Pose:
- standing apart from the argument
- arms folded across chest calmly
- weight on one leg, relaxed but alert

Face:
- calm knowing expression
- slight upward tilt of chin
- eyes focused on Luterra (off-screen)
- hint of a supportive subtle smile

Details:
- silver-white armor gleaming
- holy symbols catching light
- tower shield visible on back

Background:
- the confrontation happening in soft focus
- warm torch glow
- other warriors in middle distance

Lighting:
- even lighting on Kadan
- he appears as island of calm
- soft golden ambient

Lost Ark game cinematic style, Unreal Engine 5 quality,
wise observer, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Kadan watching calmly, slight nod of understanding,
eyes tracking something off-screen (the argument),
one eyebrow raising slightly,
breathing steady and calm,
background figures moving slightly,
static camera, observational,
4 seconds duration (shorter cutaway)
```

### 기술 노트
- 카메라: 정적
- 동작: 미세한 끄덕임
- 시간: 4초 (짧은 컷어웨이)

---

## Scene 7: 루테란의 결심 (Hero Shot)

### 목적
- 전환점
- 영웅적 순간

### Imagen 프롬프트 (키프레임)
```
Low angle hero shot of Luterra,

Pose:
- standing tall, chin raised
- sword held before him vertically
- blade catching light, glowing faintly
- cape billowing behind

Face:
- transformed from burden to resolve
- eyes sharp and clear
- jaw set with determination
- slight heroic squint

Composition:
- Luterra filling center frame
- shot from below eye level (heroic angle)
- sky visible behind him

Background:
- dramatic clouds parting slightly
- rim of light breaking through
- smoke and embers rising

Lighting:
- strong backlight creating silhouette edge
- face lit by sword glow and fire
- lens flare from light behind
- god rays streaming

Lost Ark game cinematic style, Unreal Engine 5 quality,
epic hero moment, 16:9 cinematic composition
```

### Veo 프롬프트 (동작)
```
Luterra slowly raising sword before him,
blade beginning to glow with golden light,
cape caught by sudden wind, billowing dramatically,
eyes opening with newfound conviction,
light breaking through clouds behind him,
camera slowly rising from low angle,
particles and embers swirling around,
8 seconds duration, climactic moment
```

### 기술 노트
- 카메라: 로우앵글에서 천천히 상승
- 동작: 검 들어올림, 망토 휘날림
- 절정: 빛이 터지는 순간

---

## Scene 8: 에스더들의 반응 (Group Reaction)

### 목적
- 결정에 대한 다양한 반응
- 분열과 통합 암시

### Imagen 프롬프트 (키프레임)
```
Wide shot of Esther warriors reacting,

Layout (left to right):
1. Azena - shocked, hand dropping, mouth open
2. Unknown warrior - conflicted, looking down
3. Unknown warrior - accepting, hand on heart
4. Kadan - nodding with closed eyes, peaceful
5. Unknown warrior - uncertain, looking at others

Luterra:
- back to camera in foreground
- sword held up, light emanating

Expressions:
- range from shock to acceptance
- no one hostile, but processing

Environment:
- torch flames seem calmer now
- light from Luterra's direction

Lighting:
- golden light washing over group
- faces illuminated by sword glow
- dramatic but hopeful

Lost Ark game cinematic style, Unreal Engine 5 quality,
group reaction shot, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Camera panning across faces of warriors,
each showing their reaction - shock, acceptance, conflict,
Azena's expression shifting from rage to stunned silence,
Kadan giving subtle approving nod,
Luterra's sword light pulsing gently,
slow deliberate pan left to right,
6 seconds duration
```

### 기술 노트
- 카메라: 좌→우 패닝
- 동작: 각 캐릭터 리액션
- 시간: 6초

---

## Scene 9: 루테란의 선언 (Declaration)

### 목적
- 결정의 공식 선포
- 역사적 순간

### Imagen 프롬프트 (키프레임)
```
Extreme close-up on Luterra's eyes,

Eyes:
- intense determined gaze
- reflecting golden sword light
- slight moisture (emotion, not tears)
- pupils sharp and focused
- subtle glow in iris

Surrounding:
- bridge of nose visible
- eyebrows set with resolve
- subtle crow's feet showing age and wisdom
- skin texture detailed

Lighting:
- golden light reflecting in eyes
- dramatic rim light on cheekbones
- intimate close framing

Composition:
- eyes in upper third (rule of thirds)
- slight asymmetry for tension
- shallow depth of field

Lost Ark game cinematic style, Unreal Engine 5 quality,
intimate epic moment, 16:9 composition
```

### Veo 프롬프트 (동작)
```
Extreme close-up on Luterra's eyes,
camera very slowly pulling back to reveal face,
then continues to medium shot,
Luterra driving sword point into ground,
blade sinking into stone with magical impact,
golden energy rippling outward from impact point,
declaration moment with weight and finality,
8 seconds duration
```

### 기술 노트
- 카메라: 눈 클로즈업 → 풀백
- 동작: 검을 땅에 꽂음
- 효과: 마법적 충격파

---

## Scene 10: 엔딩 (Wide Closing)

### 목적
- 결정 후의 고요
- 희망의 암시

### Imagen 프롬프트 (키프레임)
```
Epic wide shot of the gathering,

Center:
- Luterra with sword planted in ground
- golden light emanating from sword
- Esther warriors gathered around him

Formation:
- warriors moving closer, unified
- Azena standing apart but not leaving
- Kadan at Luterra's right side

Background:
- demonic fortress on distant mountain
- but clouds above it beginning to part
- first rays of dawn light breaking through
- stars fading as light grows

Foreground:
- battlefield debris, but somehow more peaceful
- fires dying down
- mist beginning to lift

Atmosphere:
- transition from despair to hope
- golden dawn light mixing with blue night
- sense of a new chapter beginning

Lost Ark game cinematic style, Unreal Engine 5 quality,
epic conclusion, 16:9 cinematic composition
```

### Veo 프롬프트 (동작)
```
Wide establishing shot slowly pulling back,
revealing the full scope of the gathering,
warriors slowly approaching Luterra's position,
dawn light growing stronger in background,
sword's golden glow pulsing like a heartbeat,
mist slowly rolling away,
camera continues pulling back to extreme wide,
gradual fade to white as light grows,
10 seconds duration, contemplative ending
```

### 기술 노트
- 카메라: 천천히 풀백 (갈수록 멀어짐)
- 동작: 전사들 모임, 빛 증가
- 시간: 10초 (엔딩)
- 종료: 화이트 페이드

---

## 제작 체크리스트

### Phase 1: 캐릭터 이미지 (Imagen)
- [ ] 루테란 기본 포즈 테스트
- [ ] 아제나 기본 포즈 테스트
- [ ] 카단 기본 포즈 테스트
- [ ] 스타일 일관성 확인

### Phase 2: 핵심 씬 (Scene 3, 7, 9)
- [ ] Scene 7 키프레임 생성
- [ ] Scene 7 I2V 변환
- [ ] Scene 3 키프레임 생성
- [ ] Scene 3 I2V 변환
- [ ] Scene 9 키프레임 생성
- [ ] Scene 9 I2V 변환

### Phase 3: 나머지 씬
- [ ] Scene 1 (Establishing)
- [ ] Scene 2 (Group)
- [ ] Scene 4 (Reaction)
- [ ] Scene 5 (Two-Shot)
- [ ] Scene 6 (Cutaway)
- [ ] Scene 8 (Group Reaction)
- [ ] Scene 10 (Ending)

### Phase 4: 후처리
- [ ] 순서 편집
- [ ] 음악 추가 (별도)
- [ ] 최종 검토

---

## API 예상 사용량

| 항목 | 수량 |
|------|------|
| Imagen 호출 | 10회 (씬당 1회) |
| Veo 호출 | 10회 (씬당 1회) |
| 총 API 호출 | 20회 |
| 예상 시간 | 50-60분 |
| API 키 필요 | 1개 (일일 한도 충분) |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-17 | v2 상세 스펙 작성 (I2V 방식) |
