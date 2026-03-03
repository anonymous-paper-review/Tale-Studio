# L2: Shot Composer

> 씬 → 샷 시퀀스 + 대화 생성

## 역할

L1이 생성한 씬을 샷 시퀀스로 분해하고, 대화 씬에서는 대사를 생성한다.

```
Scene Manifest → [Shot Composer] → Shot Sequences (+ Dialogue)
                                         ↓
                                   [Image Generation] → Shot Images
```

**UX 매핑**: P4 The Set — Shot Node Grid에서 샷 시퀀스 관리 (`specs/ux_pages.md` P4)

---

## 입력

| 항목 | 소스 |
|------|------|
| Scene | L1 출력 (narrative, location, characters, mood) |
| Character Sheet | L1 출력 (Fixed Prompt, 레퍼런스 이미지) |
| 촬영기법 추천 | L3 Knowledge DB에서 조회 |

## 출력

| 출력물 | 내용 |
|--------|------|
| Shot Sequence | 샷 리스트 (타입, 길이, 액션, 카메라, T2V/I2V 결정) |
| Dialogue Lines | 대화 씬의 대사 목록 (있는 경우) |
| Shot Images | 샷별 이미지 (I2V 입력용) |

---

## 샷 구성

### Shot Type 레퍼런스

| 약어 | 영문 | 용도 |
|------|------|------|
| ECU | Extreme Close-Up | 감정 강조, 디테일 |
| CU | Close-Up | 감정 표현, 대화 |
| MCU | Medium Close-Up | 인터뷰, 대화 |
| MS | Medium Shot | 대화, 액션, 일반 |
| MFS | Medium Full Shot | 제스처 포함 대화 |
| FS | Full Shot | 캐릭터 소개, 의상 |
| WS | Wide Shot | 장소 설정, 관계 |
| EWS | Extreme Wide Shot | 스케일, 에픽 |
| OTS | Over-the-Shoulder | 대화, 시점 공유 |
| POV | Point of View | 몰입, 서스펜스 |
| TRACK | Tracking Shot | 동적 장면, 추격 |
| 2S | Two Shot | 관계, 대화 |

### 자동 추천 요소

UX에서 샷 생성 시 자동 추천:
- 촬영기법 (camera_language에서 mood/shot_type 기반 조회)
- Start Frame / End Frame
- Only Start / Only End
- Add Characters

### 생성 방식 결정

| 조건 | 방식 |
|------|------|
| 캐릭터 포함 | I2V (이미지 → 영상) |
| 배경/분위기 | T2V (텍스트 → 영상) |

---

## 대화 생성

### 동작 흐름

```
Scene (from L1)
    ↓
[대화 씬 감지] → scene.type == "dialogue" or has_speaking_characters
    ↓
[대사 생성] → 컨텍스트 분석 + 캐릭터별 작성
    ↓
Shot (with dialogue_lines)
```

### DialogueLine 모델

```yaml
DialogueLine:
  character_id: string      # 발화자
  text: string              # 대사 내용
  emotion: string           # neutral, angry, sad, excited 등
  delivery: string          # whisper, shout, calm, urgent 등
  duration_hint: float      # 예상 발화 시간 (초)
  direction: string         # 연기 지시 ("카메라를 보며" 등)
```

### 대사 생성 규칙

1. **원작 대사 보존** (MUST): `original_text`에 대사 있으면 원문 그대로
2. **캐릭터 일관성** (SHOULD): CHARACTER_HINTS의 speech_style 참조
3. **씬 분위기 반영**: 긴장→짧은 대사, 감성→여운 있는 대사, 액션→최소 대사

### 생성 vs 생략

| 상황 | 대사 생성 |
|------|----------|
| 원작에 대사 있음 | O (원작 사용) |
| 대화 씬, 대사 없음 | O (생성) |
| 액션 씬 중 짧은 외침 | O |
| 순수 액션/분위기 씬 | X |
| 몽타주/타임랩스 | X |

### 대사 용도 (미결정)

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 프롬프트 포함 | 별도 처리 불필요 | 립싱크 품질 불확실 |
| B. TTS 생성 | 정확한 음성 | 추가 파이프라인, 비용 |
| C. 자막 출력 | 구현 단순 | 몰입감 저하 |
| D. 하이브리드 | 유연성 | 복잡도 증가 |

> 결정 조건: 영상 API 립싱크 품질 테스트 후

---

## 인터페이스 (개념)

> 아래는 입출력 계약 정의. 구현은 Next.js 기반으로 새로 작성 예정.

- **ShotComposer**: Scene → Shot Sequence 생성. 대화 씬이면 DialogueLine도 생성하여 샷에 할당
- **DialogueGenerator**: Scene + Characters → DialogueLine 목록 생성 → 샷에 할당

---

## 결정 사항

- L2는 스토리 요소(대사, 액션, 감정) 담당, 연출 테크닉은 L3
- LLM 우선 접근 (템플릿 없이 LLM이 직접 샷 구성)
- 대사 용도: 미결정 (립싱크 테스트 후)

> 결정 근거 상세: `specs/decisions.md` #1, #4
