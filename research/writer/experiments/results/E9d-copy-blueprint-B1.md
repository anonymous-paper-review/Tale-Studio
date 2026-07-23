# E9d-copy 설계도 Ⓑ1 — 시작 + 끝 프레임 쌍

> **한 줄**: 샷마다 **시작 프레임과 끝 프레임 2장을 그림으로 먼저 확정**하고, 영상 모델에게는 "이 두
> 그림 사이를 메워라"만 시킨다. 카메라·동작의 도착점이 그림으로 못박히므로 **AI가 임의로 카메라를
> 움직일 자유 자체가 사라진다** — 이 실험의 유력 승자 후보.
>
> 오너 시나리오 2의 핵심 분리판 · 콘티는 ⓪ 문서와 동일 · 검토 후 승인 시에만 생성 실행.

## 1. 파이프라인

```
[샷마다 반복 ×6]
  캐릭터 정본 + 원본 구도 지시 ──편집 모델──▶ 시작 프레임
  시작 프레임 + "동작이 끝난 순간" 지시 ──편집 모델──▶ 끝 프레임   ← 도착점을 그림으로
  (시작, 끝) 2장 + 짧은 동작 텍스트 ──[시작·끝 지원 I2V]──▶ 클립 (두 그림 사이 보간)
```

전제: 선행 스크리닝에서 **시작+끝 프레임을 동시에 받는 영상 모델**을 확정해야 한다 (지금 제품 배선
3종엔 없음 — 개선 목록 I8).

## 2. 샷별 입력 명세

끝 프레임 지시문은 "시작 프레임과 같은 장면·같은 카메라, 동작만 끝 상태"를 강제한다(카메라 이동
여지 제거). 시작 프레임 지시문은 Ⓐ와 동일 — 차이는 오른쪽 두 열이다.

| # | 끝 프레임 지시문 (편집 모델에 — 시작 프레임을 참조로 주고) | 영상 모델에 넘기는 것 |
|---|---|---|
| 1 | Same scene, same locked camera as the start frame. End state: the gloss wand touches her lips, her chin tilted slightly up, lips freshly glossed. | 시작+끝 2장 + "She applies the gloss from start pose to end pose. 5.5s" |
| 2 | Same profile framing. End state: wand lowered a few centimeters from her lips, her eyes checking the mirror. | 시작+끝 2장 + "She finishes the stroke and lowers the wand slightly. 3.4s" |
| 3 | Same wide master framing. End state: nearly identical, her weight shifted to the other leg. | 시작+끝 2장 + "She stands almost still. 1.4s" |
| 4 | Same over-the-shoulder framing. End state: her head turned a few degrees, eyes meeting her own reflection. | 시작+끝 2장 + "Her head turns slightly toward the mirror. 3.3s" |
| 5 | Same top-down sink POV. End state: her face a little closer to the rim, gaze fixed downward. | 시작+끝 2장 + "She leans in slowly over the sink. 3.6s" |
| 6 | Same macro framing of the drain, unchanged (static insert). | 시작+끝 2장 + "Static shot, faint shimmer. 1.6s" |

## 3. 생성 규모

시작 6 + 끝 6 = 이미지 12콜 · 클립 6콜

## 4. 가설과 리스크 (검토 포인트)

- **가설**: 시제품의 문제 ①(임의 무브)·④(도착점 없음)를 구조적으로 차단. 컨시스턴시도 두 그림이
  같은 장면임을 강제하므로 ②까지 개선.
- **리스크 1**: 시작·끝이 그림으로 고정돼도 **그 사이 경로**(중간 움직임)는 여전히 모델 재량 — 이상한
  중간 프레임(모핑)이 나오는지가 관찰 지점.
- **리스크 2**: 끝 프레임을 편집 모델이 "같은 카메라"로 안 그려주면(미세하게 다른 앵글) 영상 모델이
  그 차이를 카메라 이동으로 해석해 원치 않는 무브가 생긴다 — 끝 프레임 생성의 품질 관문이 존재.
- **비교 관전 포인트**: Ⓐ 대비 "Camera locked" 텍스트 의존이 사라진 효과의 크기.
