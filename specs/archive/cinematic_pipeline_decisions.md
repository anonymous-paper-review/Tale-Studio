# Cinematic Pipeline 의사결정 기록

**날짜**: 2026-01-17
**목표**: 게임 시네마틱 수준의 영상 생성 파이프라인 구축

---

## 1. 초기 문제

### 1.1 원본 시도
- **입력**: 루테란 일러스트 (나무위키) + Veo2 I2V
- **결과**: 캐릭터가 생각한 이미지와 완전히 다름
- **원인**: 2D 일러스트를 그대로 I2V에 넣으면 스타일 유지하면서 움직임 → 시네마틱 아님

### 1.2 Veo 3.1 전환
- Veo 3.1 API 접근 방법 조사
- `veo-3.1-generate-preview` 모델 사용
- I2V에 mimeType 필수 → 코드 수정

---

## 2. 휴리스틱 분석

### 2.1 분석 대상
| 시네마틱 | 프레임 수 | 특징 |
|----------|-----------|------|
| Lost Ark | 78 | 푸른 마법, 한국 판타지, 스케일감 |
| Diablo IV Announcement | 187 | 극단적 어둠, 호러, 실사급 피부 |
| Diablo IV Lilith | 41 | 광활한 스케일, 위협적 분위기 |
| WoW War Within | 90 | 화려한 색감, 보라/금색, 마법 강조 |

### 2.2 핵심 발견
**Diablo 4 실사 스타일**:
- 모공 하나하나 보이는 피부 텍스처
- 극단적으로 어두운 조명 (80% 그림자)
- Desaturated 색감 (거의 모노톤)
- 먼지, 땀, 피 등 결점

**한국 게임 캐릭터 스타일**:
- 서양 미남의 이목구비 + 동양인 특유의 어린 느낌
- "미소년", "꽃미남", "비쇼넨"
- K-pop 아이돌 같은 느낌

---

## 3. 실패한 시도들

### 3.1 원본 일러스트 직접 I2V
```
❌ 문제: 2D 일러스트 스타일 유지 → 시네마틱 아님
```

### 3.2 휴리스틱 v1 프롬프트 (과부하)
```
❌ 문제: 2,284자 상세 프롬프트 → Veo가 소화 못함
❌ 문제: VFX 지시 (particles, bloom) → 저품질 이펙트, 싸구려
```

### 3.3 T2I → I2V (첫 시도)
```
❌ 문제: 디즈니/픽사 스타일 나옴
❌ 원인: "photorealistic"만으로 부족
```

### 3.4 동양인 얼굴 시도
```
❌ 문제: 전형적인 동양인 얼굴 나옴
❌ 원인: 루테란은 "한국 게임 미소년" 스타일 (서양 이목구비 + 동양 어린 느낌)
```

---

## 4. 성공한 접근

### 4.1 캐릭터 이미지 생성 (T2I)

**핵심 프롬프트 요소**:
```
FACE TYPE:
- Korean game character pretty boy aesthetic
- Western-style sharp features (high nose, defined jaw)
- BUT with youthful East Asian softness
- Bishonen, flower boy warrior
- Like K-pop idol playing a warrior

GRITTY ELEMENTS:
- Visible pores, cuts, dirt, sweat
- Dark moody lighting (85% shadow)
- Desaturated near monochrome
- NOT smooth, NOT plastic, NOT Disney
```

**결과**: `generated_videos/final_test/luterra_final_20260117_201315.png`

### 4.2 영상 생성 (I2V)

**핵심**: 프롬프트 최소화 (341자)
```
A young warrior prince stands on a battlefield at dusk.

He slowly lifts his gaze from the ground, revealing determined eyes.
A subtle breath. The weight of decision on his face.
Wind gently moves his hair and cape.

The camera slowly pushes in on his face.
Shallow depth of field. Cinematic.

Natural subtle movements only.
24fps film look.
```

**제거한 것들**:
- ❌ VFX 지시 (particles, bloom, dust)
- ❌ 색감 지시 (color palette, grading)
- ❌ 상세 텍스처 지시
- ❌ 과도한 카메라 움직임

**추가한 것들**:
- ✓ 씬의 맥락 (전장, 결정의 순간)
- ✓ 자연스러운 미세 움직임 (시선, 숨, 바람)
- ✓ 단순한 카메라 (push-in)

---

## 5. 최종 파이프라인

```
[유저 레퍼런스 일러스트]
        ↓
[T2I: 시네마틱 스타일 변환]
  - 한국 게임 미소년 얼굴형
  - Diablo 4급 그리티 실사
  - 어두운 조명, desaturated
        ↓
[I2V: 영상화]
  - 프롬프트 최소화 (300~400자)
  - VFX 지시 제거
  - 자연스러운 모션만
  - 씬의 맥락 부여
        ↓
[시네마틱 영상]
```

---

## 6. 핵심 교훈

### 6.1 프롬프트
| 잘못된 접근 | 올바른 접근 |
|-------------|-------------|
| 상세할수록 좋다 | **최소화**가 핵심 |
| VFX 지시 추가 | VFX 지시 **제거** |
| 기술적 용어 나열 | **씬의 맥락** 부여 |
| "이미지가 움직이게" | **영화 장면**처럼 |

### 6.2 캐릭터
| 잘못된 접근 | 올바른 접근 |
|-------------|-------------|
| "Asian features" | 한국 게임 **미소년** |
| "photorealistic" | **Diablo 4 스타일** 명시 |
| 일러스트 직접 사용 | T2I로 **스타일 변환** |

### 6.3 휴리스틱
- 분석은 깊게 하되, 프롬프트에는 **핵심만**
- 휴리스틱 문서는 참고용, 프롬프트에 다 넣으면 역효과

---

## 7. 생성된 파일

### 레퍼런스 분석
- `reference_videos/frames/` - Lost Ark 프레임
- `reference_videos/blizzard/` - Diablo 4, WoW 프레임

### 스펙 문서
- `specs/style_heuristics.md` - v1 휴리스틱
- `specs/style_heuristics_v2.md` - v2 상세 휴리스틱

### 테스트 결과
- `generated_videos/gritty_test/` - 그리티 실사 테스트
- `generated_videos/prettyboy_test/` - 미소년 스타일 테스트
- `generated_videos/final_test/` - 최종 T2I 결과
- `generated_videos/cinematic_scene/` - 최종 I2V 결과

---

## 8. 다음 단계 (TODO)

- [ ] 영상 결과 확인 및 품질 평가
- [ ] 다른 씬 타입 테스트 (액션, 대화 등)
- [ ] 파이프라인 코드화 (T2I → I2V 자동화)
- [ ] 캐릭터 일관성 테스트 (같은 캐릭터 여러 씬)

---

## Version History

| 날짜 | 변경 |
|------|------|
| 2026-01-17 | 초안 작성 |
