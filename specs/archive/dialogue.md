# 대화 생성 스펙

> 최종 수정: 2026-01-22 15:15
> 상태: 스펙 정의 완료, 용도 미결정

## 개요

L2 Shot Composer 단계에서 대화 씬의 대사 스크립트를 자동 생성.

---

## 목적

1. **대화 씬 완성도**: 대사가 필요한 샷에 구체적인 대사 제공
2. **캐릭터 일관성**: 캐릭터별 말투/어조 유지
3. **영상 생성 연계**: 대사 내용이 영상에 반영되도록

---

## 현재 상태

### L2 Shot Composer의 기존 기능
- 씬 → 샷 시퀀스 분해
- 샷별 타입, 길이, 액션 정의
- 캐릭터 배치

### 누락된 기능
- 대화 씬에서 **대사 텍스트** 생성
- 대사의 **타이밍/호흡** 정의

---

## 동작 흐름

```
Scene (from L1)
    ↓
[대화 씬 감지]
    - scene.type == "dialogue" 또는
    - scene.has_speaking_characters == true
    ↓
[대사 생성]
    - 씬의 컨텍스트 분석
    - 캐릭터별 대사 작성
    - 대사 순서/호흡 정의
    ↓
Shot (with dialogue)
    - dialogue_lines: List[DialogueLine]
```

---

## 데이터 모델

### DialogueLine

```yaml
DialogueLine:
  character_id: string      # 발화자
  text: string              # 대사 내용
  emotion: string           # 감정 (neutral, angry, sad, excited 등)
  delivery: string          # 전달 방식 (whisper, shout, calm, urgent 등)
  duration_hint: float      # 예상 발화 시간 (초), optional

  # 연기 지시 (optional)
  direction: string         # "카메라를 보며", "고개를 숙인 채" 등
```

### Shot 확장

```yaml
Shot:
  # ... 기존 필드 ...

  # 대화 관련 추가
  has_dialogue: bool
  dialogue_lines: List[DialogueLine]
  dialogue_style: string    # conversation, monologue, narration
```

---

## 대사 생성 규칙

### 1. 원작 대사 보존 (MUST)
- L1에서 전달된 `original_text`에 대사가 있으면 **반드시 보존**
- 예: "이 싸움은 끝나지 않았다" → 그대로 사용

### 2. 캐릭터 일관성 (SHOULD)
```yaml
# CHARACTER_HINTS에서 참조
lutheran:
  speech_style: "단호하고 간결한 어투, 군인다운 말투"
  common_phrases: ["전우여", "승리는..."]

azena:
  speech_style: "시적이고 은유적인 표현, 고대어 사용"
  common_phrases: ["별의 뜻이...", "시간이 말하노니..."]
```

### 3. 씬 분위기 반영 (SHOULD)
- 긴장된 씬 → 짧고 끊어지는 대사
- 감성적 씬 → 여운 있는 대사
- 액션 씬 → 최소한의 대사

### 4. 생성 vs 생략 기준

| 상황 | 대사 생성 여부 |
|------|---------------|
| 원작에 대사 있음 | 반드시 생성 (원작 사용) |
| 대화 씬이지만 대사 없음 | 생성 |
| 액션 씬 중 짧은 외침 | 생성 |
| 순수 액션/분위기 씬 | 생략 |
| 몽타주/타임랩스 | 생략 |

---

## 용도 옵션 (미결정)

### 옵션 A: 프롬프트 포함
- 대사 내용을 Veo 프롬프트에 반영
- 장점: 별도 처리 불필요
- 단점: Veo가 립싱크를 잘 못할 수 있음

```
"Close-up of Lutheran speaking: 'This fight is not over.'
His expression is determined, lips moving to match the dialogue."
```

### 옵션 B: TTS 생성
- 대사를 TTS(Text-to-Speech)로 음성 생성
- 영상과 별도로 생성 후 합성
- 장점: 정확한 음성, 타이밍 제어
- 단점: 추가 파이프라인 필요, 비용

### 옵션 C: 자막 출력
- 영상은 무음, 대사는 자막 파일(SRT)로 출력
- 장점: 구현 단순
- 단점: 몰입감 저하

### 옵션 D: 하이브리드
- 핵심 대사: TTS
- 일반 대사: 자막
- 배경 잡담: 프롬프트 힌트만

---

## 구현 설계

### DialogueGenerator 클래스

```python
class DialogueGenerator:
    def generate(
        self,
        scene: Scene,
        characters: Dict[str, Character],
        preserve_original: bool = True,
    ) -> List[DialogueLine]:
        """
        씬에서 대사 생성

        Args:
            scene: L1에서 생성된 씬
            characters: 캐릭터 정보 (말투 등)
            preserve_original: 원작 대사 보존 여부

        Returns:
            대사 라인 목록
        """
        pass

    def assign_to_shots(
        self,
        dialogue_lines: List[DialogueLine],
        shots: List[Shot],
    ) -> List[Shot]:
        """대사를 적절한 샷에 배치"""
        pass
```

### Shot Composer 통합

```python
class ShotComposer:
    def __init__(self, dialogue_generator: DialogueGenerator = None):
        self.dialogue_generator = dialogue_generator

    def compose(self, scene: Scene, **kwargs) -> List[Shot]:
        shots = self._generate_shots(scene)

        if self.dialogue_generator and scene.has_dialogue:
            dialogue_lines = self.dialogue_generator.generate(scene, **kwargs)
            shots = self.dialogue_generator.assign_to_shots(dialogue_lines, shots)

        return shots
```

---

## 프롬프트 설계 (초안)

```
당신은 영상 대사 작가입니다.
주어진 씬의 컨텍스트를 바탕으로 대사를 작성하세요.

## 씬 정보
- 요약: {scene.narrative_summary}
- 원작 텍스트: {scene.original_text}
- 등장 캐릭터: {character_ids}
- 분위기: {scene.mood}

## 캐릭터 정보
{character_speech_styles}

## 규칙
1. 원작에 대사가 있으면 반드시 그대로 사용
2. 캐릭터의 말투/어조 유지
3. 씬의 분위기에 맞는 대사 길이
4. 영상화를 고려한 간결한 대사 (너무 길지 않게)

## 출력 형식
JSON 형식으로 대사 목록 출력:
[
  {
    "character_id": "lutheran",
    "text": "이 싸움은 끝나지 않았다.",
    "emotion": "determined",
    "delivery": "calm_but_firm"
  }
]
```

---

## 검증 기준

| 항목 | 기준 |
|------|------|
| 원작 대사 보존 | 100% |
| 캐릭터 일관성 | 같은 캐릭터는 같은 말투 |
| 대사 길이 | 한 라인당 1~3문장 |
| 씬당 대사 수 | 대화 씬: 2~10 라인 |

---

## 미해결 사항

- [ ] **용도 결정**: 프롬프트 / TTS / 자막 / 하이브리드
- [ ] TTS 선택 시: API 선정 (ElevenLabs, Google TTS 등)
- [ ] 립싱크 품질 검증 (Veo가 얼마나 잘 하는지)
- [ ] 다국어 지원 여부

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-22 | 스펙 인터뷰 기반 초안 작성 |
